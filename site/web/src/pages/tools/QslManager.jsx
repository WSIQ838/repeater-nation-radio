import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, CheckCircle2 } from 'lucide-react';
import ToolConsole, { PanelLoading, TABLE, THEAD, TH, TR, TD } from '@/components/tools/ToolConsole';
import { Panel, ConsoleTabs, EmptyPanel } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { loadAllContacts, updateContactsGently } from '@/lib/myContacts';

const VIAS = ['Bureau', 'Direct', 'Electronic', 'Manager'];
const MAX_BULK = 100;

const VIEWS = {
  all: { label: 'All', test: () => true },
  to_send: { label: 'Need to send', test: (c) => !c.qsl_sent || c.qsl_sent === 'No' },
  queued: { label: 'Queued', test: (c) => c.qsl_sent === 'Queued' },
  awaiting: { label: 'Sent, awaiting reply', test: (c) => c.qsl_sent === 'Sent' && c.qsl_received !== 'Received' },
  confirmed: { label: 'Confirmed', test: (c) => c.qsl_received === 'Received' },
};

const today = () => new Date().toISOString().slice(0, 10);

function Status({ c }) {
  const sent = c.qsl_sent || 'No';
  const rcvd = c.qsl_received || 'No';
  return (
    <div className="text-xs leading-5">
      <div>Sent: <span className={sent === 'Sent' ? 'font-semibold' : 'text-muted-foreground'}>{sent}</span>{c.qsl_sent_via ? ` · ${c.qsl_sent_via}` : ''}{c.qsl_sent_date ? ` · ${String(c.qsl_sent_date).slice(0, 10)}` : ''}</div>
      <div>Rcvd: <span className={rcvd === 'Received' ? 'font-semibold text-success' : 'text-muted-foreground'}>{rcvd}</span>{c.qsl_received_via ? ` · ${c.qsl_received_via}` : ''}{c.qsl_received_date ? ` · ${String(c.qsl_received_date).slice(0, 10)}` : ''}</div>
    </div>
  );
}

export default function QslManager() {
  const [contacts, setContacts] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('to_send');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [via, setVia] = useState('Bureau');
  const [busy, setBusy] = useState(null); // { done, total }
  const [message, setMessage] = useState('');

  useEffect(() => {
    base44.auth.me().then((me) => loadAllContacts(me.id)).then(setContacts)
      .catch((e) => setError(e?.message || 'Could not load your logbook.'));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toUpperCase();
    return (contacts || []).filter((c) => VIEWS[view].test(c) && (!q || String(c.callsign || '').toUpperCase().includes(q)));
  }, [contacts, view, query]);

  const counts = useMemo(() => Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, (contacts || []).filter(v.test).length])), [contacts]);

  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else if (n.size < MAX_BULK) n.add(id);
    return n;
  });
  const selectShown = () => setSelected(new Set(shown.slice(0, MAX_BULK).map((c) => c.id)));

  const apply = async (patch, label) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy({ done: 0, total: ids.length }); setMessage('');
    const { updated, failed } = await updateContactsGently(ids, patch, (done, total) => setBusy({ done, total }));
    const failedSet = new Set(failed);
    setContacts((list) => list.map((c) => (selected.has(c.id) && !failedSet.has(c.id) ? { ...c, ...patch } : c)));
    setSelected(new Set(failed));
    setBusy(null);
    setMessage(`${label}: ${updated} contact${updated === 1 ? '' : 's'} updated${failed.length ? `, ${failed.length} failed (still selected — try again)` : ''}.`);
  };

  const rcvd = (contacts || []).filter((c) => c.qsl_received === 'Received').length;
  const sent = (contacts || []).filter((c) => c.qsl_sent === 'Sent').length;
  const SEL = 'h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <ToolConsole
      icon={MessageSquare}
      title="QSL Management"
      subtitle="Cards and confirmations sent and received"
      kpis={[
        { label: 'Contacts', value: contacts ? contacts.length : '—' },
        { label: 'QSLs sent', value: contacts ? sent : '—' },
        { label: 'QSLs received', value: contacts ? rcvd : '—', tone: 'success' },
        { label: 'Selected', value: selected.size, tone: 'primary' },
      ]}
      footnote="QSL status is included when you export ADIF, and read back when you import a log from LoTW, QRZ or another logger."
    >
      {error ? <Panel title="QSL" accent="danger"><p className="p-3.5 text-sm text-destructive">{error}</p></Panel> : contacts === null ? (
        <Panel title="QSL"><PanelLoading text="Loading your logbook…" /></Panel>
      ) : (
        <>
          <ConsoleTabs
            value={view}
            onChange={(k) => { setView(k); setSelected(new Set()); }}
            tabs={Object.entries(VIEWS).map(([k, v]) => ({ id: k, label: v.label, count: counts[k] }))}
          />

          <Panel title="Bulk update" accent="muted" meta={`${selected.size} selected · up to ${MAX_BULK} at a time`}>
            <div className="p-3 flex flex-wrap items-center gap-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by callsign" className="h-8 text-xs w-40" aria-label="Filter by callsign" />
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={selectShown} disabled={!shown.length}>Select {Math.min(shown.length, MAX_BULK)} shown</Button>
              {selected.size > 0 && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>}
              <span className="w-px h-6 bg-border mx-1 hidden sm:block" />
              <select aria-label="Via" value={via} onChange={(e) => setVia(e.target.value)} className={SEL}>
                {VIAS.map((v) => <option key={v}>{v}</option>)}
              </select>
              <Button size="sm" className="h-8 text-xs" disabled={!selected.size || !!busy} onClick={() => apply({ qsl_sent: 'Queued' }, 'Queued')}>Mark queued</Button>
              <Button size="sm" className="h-8 text-xs" disabled={!selected.size || !!busy} onClick={() => apply({ qsl_sent: 'Sent', qsl_sent_via: via, qsl_sent_date: today() }, 'Marked sent')}>Mark sent</Button>
              <Button size="sm" className="h-8 text-xs" disabled={!selected.size || !!busy} onClick={() => apply({ qsl_received: 'Received', qsl_received_via: via, qsl_received_date: today() }, 'Marked received')}>Mark received</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!selected.size || !!busy} onClick={() => apply({ qsl_received: 'Requested' }, 'Marked requested')}>Mark requested</Button>
            </div>
            {busy && <div className="px-3.5 pb-3 space-y-1"><Progress value={(busy.done / busy.total) * 100} /><div className="text-xs text-muted-foreground">Updating {busy.done} / {busy.total}…</div></div>}
            {message && <div className="px-3.5 pb-3 text-sm flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-success" /> {message}</div>}
          </Panel>

          <Panel title={VIEWS[view].label} meta={`${Math.min(shown.length, 500)} of ${shown.length}`}>
            {!shown.length ? <EmptyPanel icon={MessageSquare} title="No contacts in this view" text={<>Log contacts in your <Link to="/logbook" className="text-primary hover:underline">logbook</Link> or switch views above.</>} /> : (
              <div className="overflow-x-auto max-h-[65vh] overflow-y-auto scrollbar-thin">
                <table className={TABLE}>
                  <thead className={`${THEAD} sticky top-0`}>
                    <tr><th className={`${TH} w-8`}><span className="sr-only">Select</span></th><th className={TH}>Date (UTC)</th><th className={TH}>Callsign</th><th className={TH}>Band / freq</th><th className={TH}>Name</th><th className={TH}>QSL</th></tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, 500).map((c) => (
                      <tr key={c.id} className={`${TR} ${selected.has(c.id) ? 'bg-primary/5' : ''}`}>
                        <td className={TD}><input type="checkbox" aria-label={`Select ${c.callsign}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                        <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>{String(c.date || '').slice(0, 16).replace('T', ' ')}</td>
                        <td className={`${TD} font-mono font-semibold text-primary`}>{c.callsign}</td>
                        <td className={`${TD} text-[12px]`}>{c.band || c.radio_service}{c.frequency ? ` · ${c.frequency}` : ''}</td>
                        <td className={TD}>{c.contact_name || ''}</td>
                        <td className={TD}><Status c={c} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shown.length > 500 && <div className="px-3.5 py-2 text-[11px] text-muted-foreground border-t border-border bg-muted/30 text-center">Showing the newest 500 of {shown.length}. Filter by callsign to find older contacts.</div>}
              </div>
            )}
          </Panel>
        </>
      )}
    </ToolConsole>
  );
}
