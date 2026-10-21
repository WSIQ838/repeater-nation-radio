import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, MessageSquare, Loader2, FileUp, CheckCircle2, AlertTriangle } from 'lucide-react';
import ToolConsole from '@/components/tools/ToolConsole';
import { Panel } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { parseAdif, bandForFrequency } from '@/lib/adif';
import { loadAllContacts, updateContactsGently } from '@/lib/myContacts';

// LoTW and eQSL both let members download their confirmations as an ADIF
// file. Matching that file against the logbook needs no password or API
// access: same callsign, same band, within 30 minutes (LoTW's own match
// window). Matched contacts are marked QSL received via "Electronic", which
// the Awards Tracker counts as confirmed.
const MATCH_WINDOW_MS = 30 * 60 * 1000;
const MAX_MARK = 200;

const SERVICES = {
  lotw: {
    title: 'LoTW Confirmations',
    name: 'Logbook of The World',
    icon: Trophy,
    description: 'Mark contacts confirmed in ARRL Logbook of The World.',
    download: 'On lotw.arrl.org, open "Your QSOs" → "Download Report", choose "Confirmed QSOs only" (with or without QSL details), and save the .adi file.',
    upload: 'To send your contacts to LoTW, export them as ADIF and sign the file with ARRL\'s TQSL program, which uploads it for you.',
    dateField: ['qslrdate', 'lotw_qslrdate'],
  },
  eqsl: {
    title: 'eQSL Confirmations',
    name: 'eQSL.cc',
    icon: MessageSquare,
    description: 'Mark contacts confirmed by electronic QSL cards on eQSL.cc.',
    download: 'On eqsl.cc, open your Inbox and use "Download Inbox" (ADIF format), then save the .adi or .txt file.',
    upload: 'To send your contacts to eQSL, export them as ADIF and use "Upload ADIF" on eqsl.cc.',
    dateField: ['eqsl_qslrdate', 'qslrdate'],
  },
};

function recordTime(rec) {
  const d = String(rec.qso_date || '');
  if (!/^\d{8}$/.test(d)) return null;
  const t = String(rec.time_on || '0000').padEnd(6, '0');
  const ms = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`);
  return Number.isNaN(ms) ? null : ms;
}

const toIsoDate = (d) => (/^\d{8}$/.test(String(d || '')) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null);

function matchConfirmations(records, contacts, service) {
  const used = new Set();
  const matches = []; const unmatched = []; let alreadyConfirmed = 0; let notConfirmed = 0;
  for (const rec of records) {
    // A full LoTW report also lists unconfirmed QSOs (QSL_RCVD = N).
    if (String(rec.qsl_rcvd || 'Y').toUpperCase() === 'N') { notConfirmed += 1; continue; }
    const call = String(rec.call || '').trim().toUpperCase();
    const t = recordTime(rec);
    const band = String(rec.band || bandForFrequency(rec.freq) || '').toLowerCase();
    if (!call || t == null) continue;
    const hit = contacts.find((c) => !used.has(c.id)
      && String(c.callsign || '').toUpperCase() === call
      && Math.abs(Date.parse(c.date) - t) <= MATCH_WINDOW_MS
      && (!band || !(c.band || bandForFrequency(c.frequency)) || String(c.band || bandForFrequency(c.frequency)).toLowerCase() === band));
    if (!hit) { unmatched.push(`${call} ${toIsoDate(rec.qso_date)} ${band}`); continue; }
    used.add(hit.id);
    if (hit.qsl_received === 'Received') { alreadyConfirmed += 1; continue; }
    const date = SERVICES[service].dateField.map((f) => toIsoDate(rec[f])).find(Boolean) || new Date().toISOString().slice(0, 10);
    matches.push({ contact: hit, date });
  }
  return { matches, unmatched, alreadyConfirmed, notConfirmed };
}

export default function ConfirmationsImport({ service = 'lotw' }) {
  const svc = SERVICES[service];
  const [contacts, setContacts] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then((u) => loadAllContacts(u.id)).then(setContacts)
      .catch((e) => setMessage({ tone: 'error', text: e?.message || 'Could not load your logbook.' }));
  }, []);

  const onFile = async (file) => {
    setResult(null); setMessage(null);
    if (!file || !contacts) return;
    try {
      const { records } = parseAdif(await file.text());
      if (!records.length) { setMessage({ tone: 'error', text: 'No ADIF records were found in that file.' }); return; }
      setResult({ fileName: file.name, total: records.length, ...matchConfirmations(records, contacts, service) });
    } catch (e) {
      setMessage({ tone: 'error', text: e?.message || 'Could not read that file.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const apply = async () => {
    const list = result.matches.slice(0, MAX_MARK);
    // Group by confirmation date so each group is one patch.
    const byDate = new Map();
    for (const m of list) byDate.set(m.date, [...(byDate.get(m.date) || []), m.contact.id]);
    let updated = 0; let failed = 0; let done = 0;
    for (const [date, ids] of byDate) {
      const res = await updateContactsGently(ids, { qsl_received: 'Received', qsl_received_via: 'Electronic', qsl_received_date: date },
        (n) => setBusy({ done: done + n, total: list.length }));
      done += ids.length; updated += res.updated; failed += res.failed.length;
    }
    setBusy(null); setResult(null);
    setMessage({ tone: failed ? 'warn' : 'ok', text: `Marked ${updated} contact${updated === 1 ? '' : 's'} confirmed via ${svc.name}${failed ? `, ${failed} failed (import the file again to retry)` : ''}.${result.matches.length > MAX_MARK ? ` ${result.matches.length - MAX_MARK} more remain — import the file again.` : ''}` });
    base44.auth.me().then((u) => loadAllContacts(u.id)).then(setContacts).catch(() => {});
  };

  const confirmedNow = (contacts || []).filter((c) => c.qsl_received === 'Received').length;

  return (
    <ToolConsole
      icon={svc.icon}
      title={svc.title}
      subtitle={`Match ${svc.name} confirmations to your logbook`}
      actions={(
        <>
          <input ref={fileRef} type="file" accept=".adi,.adif,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={contacts === null || !!busy}>
            {contacts === null ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileUp className="w-4 h-4 mr-1.5" />} Choose file
          </Button>
        </>
      )}
      kpis={[
        { label: 'Logbook contacts', value: contacts ? contacts.length : '—' },
        { label: 'Confirmed', value: contacts ? confirmedNow : '—', tone: 'success' },
        { label: 'New matches', value: result ? result.matches.length : '—', tone: 'primary' },
        { label: 'Not in logbook', value: result ? result.unmatched.length : '—' },
      ]}
      footnote={svc.description}
    >
      <div className="grid xl:grid-cols-2 gap-3 items-start">
        <Panel title={`1 · Download from ${svc.name}`} accent="muted">
          <p className="p-3.5 text-sm text-muted-foreground">{svc.download}</p>
        </Panel>
        <Panel title="2 · Import the file here">
          <div className="p-3.5 space-y-3">
            <p className="text-sm text-muted-foreground">Each confirmation is matched to a contact in your logbook with the same callsign and band, logged within 30 minutes. No {svc.name} password is needed.</p>
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={contacts === null || !!busy}>
              {contacts === null ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileUp className="w-4 h-4 mr-1.5" />} Choose confirmation file
            </Button>
          </div>
        </Panel>
      </div>

      {message && (
        <Panel title={message.tone === 'ok' ? 'Done' : 'Heads up'} accent={message.tone === 'ok' ? 'success' : message.tone === 'error' ? 'danger' : 'primary'}>
          <div className={`p-3.5 text-sm flex gap-2 ${message.tone === 'error' ? 'text-destructive' : ''}`}>
            {message.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />} {message.text}
          </div>
        </Panel>
      )}

      {result && !busy && (
        <Panel title={result.fileName} accent="success" meta={`${result.matches.length} matched`}>
          <div className="p-3.5 space-y-3">
            <ul className="text-sm space-y-1">
              <li><span className="font-semibold">{result.matches.length}</span> new confirmation{result.matches.length === 1 ? '' : 's'} matched to your logbook</li>
              {result.alreadyConfirmed > 0 && <li className="text-muted-foreground">{result.alreadyConfirmed} already marked confirmed</li>}
              {result.notConfirmed > 0 && <li className="text-muted-foreground">{result.notConfirmed} in the file aren't confirmed yet (skipped)</li>}
              {result.unmatched.length > 0 && <li className="text-muted-foreground">{result.unmatched.length} not found in your logbook — add them with <Link to="/tools/adif" className="text-primary hover:underline">ADIF import</Link> first</li>}
            </ul>
            {result.unmatched.length > 0 && (
              <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Show unmatched</summary><ul className="mt-1 list-disc pl-5">{result.unmatched.slice(0, 50).map((x, i) => <li key={i}>{x}</li>)}</ul></details>
            )}
            {result.matches.length > 0 && <Button size="sm" onClick={apply}>Mark {Math.min(result.matches.length, MAX_MARK)} confirmed</Button>}
          </div>
        </Panel>
      )}

      {busy && (
        <Panel title="Updating" meta={`${busy.done} / ${busy.total}`}>
          <div className="p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Marking contacts confirmed…</div>
            <Progress value={(busy.done / busy.total) * 100} />
          </div>
        </Panel>
      )}

      <Panel title={`Sending contacts to ${svc.name}`} accent="muted">
        <div className="p-3.5 text-sm text-muted-foreground space-y-1.5">
          <p>{svc.upload} <Link to="/tools/adif" className="text-primary hover:underline">Export ADIF</Link></p>
          <p>Confirmed contacts count toward your progress in the <Link to="/tools/awards" className="text-primary hover:underline">Awards Tracker</Link> and show in <Link to="/tools/qsl" className="text-primary hover:underline">QSL Management</Link>.</p>
        </div>
      </Panel>
    </ToolConsole>
  );
}
