import { useEffect, useMemo, useRef, useState } from 'react';
import { Mountain, Loader2, Download, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { loadAllContacts } from '@/lib/myContacts';
import { bandForFrequency } from '@/lib/adif';
import { Panel, DataRow, EmptyPanel } from '@/components/console/Console';
import { PanelLoading } from '@/components/tools/ToolConsole';
import { MODES, SUMMIT_RE, cleanRef, modeOf, downloadCsv } from '@/lib/sota';

const SETUP_KEY = 'rn.sota.chase';
const LBL = 'text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold';
const INPUT = 'h-8 text-xs';

// Chasing: log stations that are on a summit (from home or anywhere) and
// export the chaser SOTA CSV. Activations have their own pages.
export default function SotaChases({ user, onCount }) {
  const [contacts, setContacts] = useState(null);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(() => {
    try { return { frequency: '14.285', txMode: 'SSB', ...JSON.parse(localStorage.getItem(SETUP_KEY) || '{}') }; }
    catch { return { frequency: '14.285', txMode: 'SSB' }; }
  });
  const [call, setCall] = useState('');
  const [theirSummit, setTheirSummit] = useState('');
  const [report, setReport] = useState('');
  const [timeOverride, setTimeOverride] = useState('');
  const [saving, setSaving] = useState(false);
  const callRef = useRef(null);
  const myCall = String(user?.callsign || '').toUpperCase();

  useEffect(() => {
    if (!user?.id) return;
    loadAllContacts(user.id).then(setContacts).catch((e) => setError(e?.message || 'Could not load your logbook.'));
  }, [user?.id]);
  useEffect(() => { try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch { /* optional */ } }, [setup]);

  const chases = useMemo(() => (contacts || []).filter((c) => c.sota_ref && !c.my_sota_ref), [contacts]);
  useEffect(() => { if (contacts) onCount?.(chases.length); }, [contacts, chases.length, onCount]);
  const band = bandForFrequency(setup.frequency);

  const log = async (e) => {
    e?.preventDefault();
    setError('');
    const theirCall = call.trim().toUpperCase();
    const theirRef = cleanRef(theirSummit);
    if (!/^[A-Z0-9/]{3,15}$/.test(theirCall)) { setError('Enter a valid callsign.'); return; }
    if (!SUMMIT_RE.test(theirRef)) { setError("Enter the summit they're on, like W7W/KG-001."); return; }
    let when = new Date();
    if (timeOverride) {
      const [h, m] = timeOverride.split(':').map(Number);
      when = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate(), h, m));
    }
    const freq = Number(setup.frequency);
    const payload = {
      date: when.toISOString(),
      callsign: theirCall,
      radio_service: 'HAM',
      mode: 'Simplex',
      ...(Number.isFinite(freq) ? { frequency: freq } : {}),
      ...(band ? { band } : {}),
      ...(myCall ? { callsign_used: myCall } : {}),
      sota_ref: theirRef,
      ...(report.trim() ? { signal_report: report.trim() } : {}),
      notes: `Mode: ${setup.txMode}`,
    };
    setSaving(true);
    try {
      const created = await base44.entities.ContactLog.create(payload);
      setContacts((list) => [{ ...payload, ...created }, ...(list || [])]);
      setCall(''); setTheirSummit(''); setReport(''); setTimeOverride('');
      callRef.current?.focus();
    } catch (err) {
      setError(err?.message || 'Could not save the contact.');
    } finally {
      setSaving(false);
    }
  };

  const undoLast = async () => {
    const last = chases[0];
    if (!last?.id || !window.confirm(`Delete the last chase (${last.callsign} on ${last.sota_ref})?`)) return;
    try {
      await base44.entities.ContactLog.delete(last.id);
      setContacts((list) => list.filter((c) => c.id !== last.id));
    } catch (err) { setError(err?.message || 'Could not delete that contact.'); }
  };

  if (!user) {
    return <Panel title="Chases" accent="muted"><EmptyPanel icon={Mountain} title="Sign in to log chases" text="Chases are saved to your logbook and exported as the SOTA chaser CSV." /></Panel>;
  }

  return (
    <div className="space-y-3">
      <Panel title="Log a chase" meta={`band ${band || '—'}`}>
        <form onSubmit={log} className="p-3 grid grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_0.8fr_0.7fr_0.7fr_0.7fr_auto] gap-2 items-end">
          <div>
            <label className={LBL} htmlFor="chase-call">Their callsign</label>
            <Input id="chase-call" ref={callRef} value={call} onChange={(e) => setCall(e.target.value.toUpperCase())} className="h-8 font-mono" autoComplete="off" />
          </div>
          <div>
            <label className={LBL} htmlFor="chase-summit">Their summit</label>
            <Input id="chase-summit" value={theirSummit} onChange={(e) => setTheirSummit(e.target.value.toUpperCase())} placeholder="W7W/KG-001" className={`${INPUT} font-mono`} autoComplete="off" />
          </div>
          <div>
            <label className={LBL} htmlFor="chase-freq">MHz</label>
            <Input id="chase-freq" className={`${INPUT} font-mono`} value={setup.frequency} onChange={(e) => setSetup((s) => ({ ...s, frequency: e.target.value }))} />
          </div>
          <div>
            <label className={LBL} htmlFor="chase-mode">Mode</label>
            <select id="chase-mode" value={setup.txMode} onChange={(e) => setSetup((s) => ({ ...s, txMode: e.target.value }))} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
              {MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL} htmlFor="chase-rst">Report</label>
            <Input id="chase-rst" className={INPUT} value={report} onChange={(e) => setReport(e.target.value)} placeholder="59 / 57" />
          </div>
          <div>
            <label className={LBL} htmlFor="chase-time">Time UTC</label>
            <Input id="chase-time" className={INPUT} type="time" value={timeOverride} onChange={(e) => setTimeOverride(e.target.value)} title="Leave empty to use the current time" />
          </div>
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" className="h-8" disabled={saving || contacts === null}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Log'}</Button>
            <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={undoLast} disabled={!chases.length} title="Delete the last chase"><Undo2 className="w-4 h-4" /></Button>
          </div>
        </form>
        {error && <div className="px-3.5 pb-3 text-sm text-destructive">{error}</div>}
      </Panel>

      <Panel
        title="My chases"
        accent="success"
        meta={`${chases.length} total`}
        actions={<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => downloadCsv(`sota-chases-${new Date().toISOString().slice(0, 10)}.csv`, chases, myCall)} disabled={!chases.length}><Download className="w-3.5 h-3.5 mr-1" /> SOTA CSV</Button>}
      >
        {contacts === null ? <PanelLoading text="Loading your logbook…" /> : chases.length ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-thin">
            {chases.slice(0, 300).map((c) => (
              <DataRow key={c.id || c.date} className="grid-cols-[minmax(0,1fr)_auto]">
                <span className="truncate"><span className="font-mono font-semibold">{c.callsign}</span> on <span className="font-mono text-primary">{c.sota_ref}</span></span>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap font-mono">{String(c.date).slice(0, 16).replace('T', ' ')} · {c.band || ''} {modeOf(c)}</span>
              </DataRow>
            ))}
          </div>
        ) : <EmptyPanel icon={Mountain} title="No chases yet" text="Log stations you work on summits — find them on SOTAwatch." />}
      </Panel>
    </div>
  );
}
