import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Loader2, Upload, Download, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import ToolConsole from '@/components/tools/ToolConsole';
import { Panel, StatusChip } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { contactsToAdif, parseAdif, adifRecordToContact } from '@/lib/adif';
import { loadAllContacts, importContactsGently, isDuplicateContact, MAX_IMPORT } from '@/lib/myContacts';

const KEY_STORAGE = 'rn.qrz.logbookKey';
const MAX_UPLOAD = 100;
const UPLOAD_PAUSE_MS = 1200;
const MAX_DOWNLOAD = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function qrz(body) {
  const res = await base44.functions.invoke('qrz-logbook', body);
  return res?.data || res;
}

// One QSO as a bare ADIF record (QRZ's INSERT takes a single record, no header).
function oneRecord(contact, myCall) {
  const text = contactsToAdif([{ ...contact, callsign_used: contact.callsign_used || myCall }]);
  return text.slice(text.search(/<EOH>/i) + 5).trim();
}

const canUpload = (c) => (c.radio_service || '').toUpperCase() === 'HAM' && c.band && !c.qrz_logid;

export default function QrzLogbook() {
  const [me, setMe] = useState(null);
  const [key, setKey] = useState(() => { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; } });
  const [remember, setRemember] = useState(() => { try { return !!localStorage.getItem(KEY_STORAGE); } catch { return false; } });
  const [status, setStatus] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [busy, setBusy] = useState(null); // { label, done, total }
  const [message, setMessage] = useState(null); // { tone, text }
  const [download, setDownload] = useState(null); // { ready, duplicates, truncated }
  const cancelRef = useRef(false);

  useEffect(() => {
    base44.auth.me().then((u) => { setMe(u); return loadAllContacts(u.id); }).then(setContacts)
      .catch((e) => setMessage({ tone: 'error', text: e?.message || 'Could not load your logbook.' }));
  }, []);

  useEffect(() => {
    try { if (remember && key) localStorage.setItem(KEY_STORAGE, key); else localStorage.removeItem(KEY_STORAGE); } catch { /* optional */ }
  }, [key, remember]);

  const pending = useMemo(() => (contacts || []).filter(canUpload), [contacts]);
  const keyOk = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/i.test(key.trim());
  const myCall = String(me?.callsign || '').toUpperCase();

  const check = async () => {
    setMessage(null); setStatus(null);
    setBusy({ label: 'Checking key…' });
    try {
      const d = await qrz({ action: 'status', key });
      if (d?.ok) setStatus(d.status);
      else setMessage({ tone: 'warn', text: `${d?.error || 'QRZ rejected the key.'} Uploading still works without a QRZ subscription; status and download need one.` });
    } catch (e) { setMessage({ tone: 'error', text: e?.response?.data?.error || e?.message }); }
    setBusy(null);
  };

  const upload = async () => {
    const list = pending.slice(0, MAX_UPLOAD);
    if (!list.length) return;
    cancelRef.current = false; setMessage(null);
    let sent = 0; let dupes = 0; const failures = [];
    for (let i = 0; i < list.length; i += 1) {
      if (cancelRef.current) break;
      setBusy({ label: 'Uploading to QRZ…', done: i, total: list.length });
      const c = list[i];
      try {
        const d = await qrz({ action: 'insert', key, adif: oneRecord(c, myCall) });
        const logId = d?.ok ? String(d.logId || 'uploaded') : d?.duplicate ? 'duplicate' : null;
        if (logId) {
          await base44.entities.ContactLog.update(c.id, { qrz_logid: logId });
          setContacts((all) => all.map((x) => (x.id === c.id ? { ...x, qrz_logid: logId } : x)));
          if (d.ok) sent += 1; else dupes += 1;
        } else {
          failures.push(`${c.callsign}: ${d?.error || 'rejected'}`);
          if (/invalid api key|auth/i.test(d?.error || '')) break;
        }
      } catch (e) { failures.push(`${c.callsign}: ${e?.response?.data?.error || e?.message}`); }
      await sleep(UPLOAD_PAUSE_MS);
    }
    setBusy(null);
    setMessage({
      tone: failures.length ? 'warn' : 'ok',
      text: `Uploaded ${sent}${dupes ? `, ${dupes} already in QRZ` : ''}${failures.length ? `, ${failures.length} failed (${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '…' : ''})` : ''}.`,
    });
  };

  const fetchFromQrz = async () => {
    cancelRef.current = false; setMessage(null); setDownload(null);
    const records = [];
    let after = 0;
    try {
      while (records.length < MAX_DOWNLOAD && !cancelRef.current) {
        setBusy({ label: `Downloading from QRZ… ${records.length} so far` });
        const d = await qrz({ action: 'fetch', key, afterLogId: after });
        if (!d?.ok) throw new Error(d?.error || 'QRZ rejected the request.');
        const page = parseAdif(d.adif).records;
        records.push(...page);
        if (page.length < 250) break;
        after = Math.max(...page.map((r) => Number(r.app_qrzlog_logid) || 0)) + 1;
        await sleep(1000);
      }
      const ready = []; const duplicates = [];
      for (const rec of records) {
        const { contact } = adifRecordToContact(rec);
        if (!contact) continue;
        if (isDuplicateContact(contact, contacts || []) || isDuplicateContact(contact, ready)) duplicates.push(contact);
        else ready.push(contact);
      }
      setDownload({ total: records.length, ready: ready.slice(0, MAX_IMPORT), duplicates, truncated: Math.max(0, ready.length - MAX_IMPORT) });
    } catch (e) {
      setMessage({ tone: 'warn', text: `${e?.response?.data?.error || e?.message} Downloading from QRZ needs a QRZ Logbook subscription.` });
    }
    setBusy(null);
  };

  const importDownload = async () => {
    if (!download?.ready?.length) return;
    cancelRef.current = false;
    const res = await importContactsGently(download.ready, {
      onProgress: (done, total) => setBusy({ label: 'Adding contacts to your logbook…', done, total }),
      isCancelled: () => cancelRef.current,
    });
    setBusy(null); setDownload(null);
    setMessage({ tone: res.failed ? 'warn' : 'ok', text: `Imported ${res.created} contact${res.created === 1 ? '' : 's'} from QRZ${res.failed ? `, ${res.failed} failed` : ''}.` });
    if (me) loadAllContacts(me.id).then(setContacts).catch(() => {});
  };

  const inQrz = (contacts || []).filter((c) => c.qrz_logid).length;

  return (
    <ToolConsole
      icon={BookOpen}
      title="QRZ Logbook Sync"
      subtitle="Two-way sync with your QRZ Logbook"
      status={status ? 'Connected' : keyOk ? 'Key entered' : 'No key'}
      statusTone={status ? 'success' : keyOk ? 'primary' : 'muted'}
      statusPulse={!!status}
      actions={(
        <>
          <Button variant="outline" size="sm" onClick={fetchFromQrz} disabled={!keyOk || !!busy || contacts === null}><Download className="w-4 h-4 mr-1.5" /> Download</Button>
          <Button size="sm" onClick={upload} disabled={!keyOk || !pending.length || !!busy}><Upload className="w-4 h-4 mr-1.5" /> Upload {Math.min(pending.length, MAX_UPLOAD)}</Button>
        </>
      )}
      kpis={[
        { label: 'Logbook contacts', value: contacts ? contacts.length : '—' },
        { label: 'Waiting to upload', value: contacts ? pending.length : '—', tone: 'primary' },
        { label: 'Already in QRZ', value: contacts ? inQrz : '—', tone: 'success' },
        { label: 'QRZ count', value: status?.COUNT ?? '—' },
      ]}
      footnote="GMRS contacts aren't sent — QRZ logbooks are for amateur radio. Uploading is free for every QRZ member; downloading needs a QRZ Logbook subscription."
    >
      <Panel title="QRZ Logbook API key" accent="muted" actions={status ? <StatusChip tone="success">Verified</StatusChip> : null}>
        <div className="p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="w-4 h-4 text-muted-foreground" />
            <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" className="h-8 text-xs w-56 font-mono" aria-label="QRZ Logbook API key" />
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={check} disabled={!keyOk || !!busy}>Check key</Button>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember in this browser</label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Find it on qrz.com under <span className="font-medium">Logbook → Settings → API Access Key</span>. Your key is kept in this browser only
            (if you choose to remember it) and is passed straight through to QRZ — Repeater Nation never stores it.
          </p>
        </div>
        {status && (
          <div className="grid grid-cols-2 sm:grid-cols-4 bg-border gap-px border-t border-border">
            {Object.entries(status).filter(([, v]) => v !== '').slice(0, 8).map(([k, v]) => (
              <div key={k} className="bg-card px-3.5 py-2 min-w-0"><div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold truncate">{k.replace(/_/g, ' ').toLowerCase()}</div><div className="font-mono font-semibold truncate">{v}</div></div>
            ))}
          </div>
        )}
      </Panel>

      {busy && (
        <Panel title={busy.label} meta={busy.total ? `${busy.done} / ${busy.total}` : undefined}>
          <div className="p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Working…</div>
            {busy.total ? <Progress value={(busy.done / busy.total) * 100} /> : null}
            <Button variant="outline" size="sm" onClick={() => { cancelRef.current = true; }}>Stop</Button>
          </div>
        </Panel>
      )}
      {message && (
        <Panel title={message.tone === 'ok' ? 'Done' : 'Heads up'} accent={message.tone === 'ok' ? 'success' : message.tone === 'error' ? 'danger' : 'primary'}>
          <div className={`p-3.5 text-sm flex gap-2 ${message.tone === 'error' ? 'text-destructive' : ''}`}>
            {message.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />} {message.text}
          </div>
        </Panel>
      )}

      <div className="grid xl:grid-cols-2 gap-3 items-start">
        <Panel title="Upload to QRZ" meta={`up to ${MAX_UPLOAD} per run`}>
          <div className="p-3.5 space-y-3">
            <p className="text-sm text-muted-foreground">
              {contacts === null ? 'Loading your logbook…' : `${pending.length} HAM contact${pending.length === 1 ? '' : 's'} not yet in QRZ.`}
            </p>
            <Button size="sm" onClick={upload} disabled={!keyOk || !pending.length || !!busy}><Upload className="w-4 h-4 mr-1.5" /> Upload {Math.min(pending.length, MAX_UPLOAD)} contact{Math.min(pending.length, MAX_UPLOAD) === 1 ? '' : 's'}</Button>
          </div>
        </Panel>
        <Panel title="Download from QRZ" accent="success" meta="subscription required">
          <div className="p-3.5 space-y-3">
            <p className="text-sm text-muted-foreground">Bring contacts from your QRZ logbook into your <Link to="/logbook" className="text-primary hover:underline">logbook</Link>. Contacts you already have are skipped.</p>
            <Button size="sm" variant="outline" onClick={fetchFromQrz} disabled={!keyOk || !!busy || contacts === null}><Download className="w-4 h-4 mr-1.5" /> Check QRZ for contacts</Button>
            {download && (
              <div className="space-y-2 text-sm">
                <div>{download.total} in QRZ · <span className="font-semibold">{download.ready.length} new</span> · {download.duplicates.length} already here{download.truncated ? ` · ${download.truncated} over the ${MAX_IMPORT} limit (run again afterwards)` : ''}</div>
                {download.ready.length > 0 && <Button size="sm" onClick={importDownload} disabled={!!busy}>Add {download.ready.length} to my logbook</Button>}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </ToolConsole>
  );
}
