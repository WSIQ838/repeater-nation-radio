import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Loader2, Download, Undo2, AlertTriangle } from 'lucide-react';
import ToolConsole, { PanelLoading, TABLE, THEAD, TH, TR, TD } from '@/components/tools/ToolConsole';
import { Panel, EmptyPanel } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { loadAllContacts } from '@/lib/myContacts';
import { bandForFrequency, isGmrsFrequency } from '@/lib/adif';

const SETUP_KEY = 'rn.contest.setup';
const CONTESTS = [
  'ARRL-FD', 'WFD', 'ARRL-SS-SSB', 'ARRL-SS-CW', 'ARRL-DX-SSB', 'ARRL-DX-CW', 'ARRL-10', 'ARRL-VHF-JAN', 'ARRL-VHF-JUN', 'ARRL-VHF-SEP',
  'CQ-WW-SSB', 'CQ-WW-CW', 'CQ-WPX-SSB', 'CQ-WPX-CW', 'NAQP-SSB', 'NAQP-CW', 'IARU-HF', 'STATE-QSO-PARTY',
];
const MODES = ['SSB', 'CW', 'FM', 'FT8', 'RTTY'];
const CABRILLO_MODE = { SSB: 'PH', FM: 'FM', CW: 'CW', FT8: 'DG', RTTY: 'RY' };

const defaultSetup = { contest: 'ARRL-FD', myCall: '', exchange: '1D CT', useSerial: false, nextSerial: 1, frequency: '14.250', mode: 'SSB' };

function loadSetup() {
  try { return { ...defaultSetup, ...JSON.parse(localStorage.getItem(SETUP_KEY) || '{}') }; } catch { return defaultSetup; }
}

const modeOf = (c) => String(c.notes || '').match(/^Mode:\s*([^\n/]+)/m)?.[1]?.trim().toUpperCase() || 'SSB';

function cabrillo(setup, qsos) {
  const pad = (s, n) => String(s ?? '').padEnd(n);
  const lines = [
    'START-OF-LOG: 3.0',
    `CONTEST: ${setup.contest}`,
    `CALLSIGN: ${setup.myCall}`,
    'CATEGORY-OPERATOR: SINGLE-OP',
    'CREATED-BY: Repeater Nation Contest Logger',
    ...qsos.slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).map((c) => {
      const d = new Date(c.date);
      const date = d.toISOString().slice(0, 10);
      const time = d.toISOString().slice(11, 16).replace(':', '');
      const khz = c.frequency ? Math.round(Number(c.frequency) * 1000) : '';
      return `QSO: ${pad(khz, 5)} ${CABRILLO_MODE[modeOf(c)] || 'PH'} ${date} ${time} ${pad(c.callsign_used || setup.myCall, 13)} ${pad(c.contest_exchange_sent, 14)} ${pad(c.callsign, 13)} ${c.contest_exchange_rcvd || ''}`.trimEnd();
    }),
    'END-OF-LOG:',
  ];
  return `${lines.join('\n')}\n`;
}

export default function ContestLogger() {
  const [setup, setSetup] = useState(loadSetup);
  const [allContacts, setAllContacts] = useState(null);
  const [call, setCall] = useState('');
  const [rcvd, setRcvd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const callRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setSetup((s) => (s.myCall ? s : { ...s, myCall: String(u?.callsign || '').toUpperCase() }));
      return loadAllContacts(u.id);
    }).then(setAllContacts).catch((e) => setError(e?.message || 'Could not load your logbook.'));
  }, []);

  useEffect(() => { try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch { /* optional */ } }, [setup]);

  const update = (patch) => setSetup((s) => ({ ...s, ...patch }));
  const band = bandForFrequency(setup.frequency) || (isGmrsFrequency(setup.frequency) ? 'GMRS' : '?');

  const contestQsos = useMemo(
    () => (allContacts || []).filter((c) => c.contest_name === setup.contest),
    [allContacts, setup.contest],
  );
  const upperCall = call.trim().toUpperCase();
  const dupe = upperCall && contestQsos.find((c) => String(c.callsign).toUpperCase() === upperCall && (c.band || bandForFrequency(c.frequency)) === band);
  const lastHour = contestQsos.filter((c) => Date.now() - Date.parse(c.date) < 3600_000).length;
  const sentExchange = setup.useSerial ? `${String(setup.nextSerial).padStart(3, '0')} ${setup.exchange}`.trim() : setup.exchange.trim();

  const log = async (e) => {
    e?.preventDefault();
    if (!upperCall || !/^[A-Z0-9/]{3,15}$/.test(upperCall)) { setError('Enter a valid callsign.'); return; }
    if (!rcvd.trim()) { setError('Enter the exchange you received.'); return; }
    setSaving(true); setError('');
    const freq = Number(setup.frequency);
    const payload = {
      date: new Date().toISOString(),
      callsign: upperCall,
      radio_service: isGmrsFrequency(freq) ? 'GMRS' : 'HAM',
      mode: 'Simplex',
      ...(Number.isFinite(freq) ? { frequency: freq } : {}),
      ...(band && band !== '?' && band !== 'GMRS' ? { band } : {}),
      ...(setup.myCall ? { callsign_used: setup.myCall.toUpperCase() } : {}),
      contest_name: setup.contest,
      contest_exchange_sent: sentExchange,
      contest_exchange_rcvd: rcvd.trim().toUpperCase(),
      notes: `Mode: ${setup.mode}`,
    };
    try {
      const created = await base44.entities.ContactLog.create(payload);
      setAllContacts((list) => [{ ...payload, ...created }, ...(list || [])]);
      if (setup.useSerial) update({ nextSerial: setup.nextSerial + 1 });
      setCall(''); setRcvd('');
      callRef.current?.focus();
    } catch (err) {
      setError(err?.message || 'Could not save the contact.');
    } finally {
      setSaving(false);
    }
  };

  const undoLast = async () => {
    const last = contestQsos[0];
    if (!last?.id || !window.confirm(`Delete the last contact (${last.callsign})?`)) return;
    try {
      await base44.entities.ContactLog.delete(last.id);
      setAllContacts((list) => list.filter((c) => c.id !== last.id));
      if (setup.useSerial && setup.nextSerial > 1) update({ nextSerial: setup.nextSerial - 1 });
    } catch (err) { setError(err?.message || 'Could not delete that contact.'); }
  };

  const exportCabrillo = () => {
    const blob = new Blob([cabrillo(setup, contestQsos)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${setup.contest}-${setup.myCall || 'log'}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const LBL = 'text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold';
  const INPUT = 'h-8 text-xs';
  const uniqueCalls = new Set(contestQsos.map((c) => c.callsign)).size;

  return (
    <ToolConsole
      icon={ClipboardList}
      title="Contest Logging"
      subtitle={`${setup.contest || 'Contest'} · ${band} ${setup.mode}`}
      status={lastHour ? 'Running' : undefined}
      actions={(
        <>
          <Button variant="outline" size="sm" onClick={undoLast} disabled={!contestQsos.length}><Undo2 className="w-4 h-4 mr-1.5" /> Delete last</Button>
          <Button size="sm" onClick={exportCabrillo} disabled={!contestQsos.length || !setup.myCall}><Download className="w-4 h-4 mr-1.5" /> Cabrillo</Button>
        </>
      )}
      kpis={[
        { label: 'Contacts', value: contestQsos.length },
        { label: 'Last 60 min', value: lastHour, tone: 'primary' },
        { label: 'Unique calls', value: uniqueCalls },
        { label: 'Next serial', value: setup.useSerial ? setup.nextSerial : '—' },
      ]}
      footnote="Contest contacts are saved to your logbook like any other contact. Check each contest's rules for its exact exchange and Cabrillo category before submitting."
    >
      {allContacts === null && !error ? (
        <Panel title="Contest log"><PanelLoading text="Loading your logbook…" /></Panel>
      ) : (
        <>
          <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 items-start">
            <Panel title="Setup" accent="muted" meta={`band ${band}`}>
              <div className="p-3 grid grid-cols-2 gap-2">
                <div>
                  <label className={LBL} htmlFor="ct-name">Contest</label>
                  <Input id="ct-name" list="ct-list" className={`${INPUT} font-mono`} value={setup.contest} onChange={(e) => update({ contest: e.target.value.toUpperCase() })} />
                  <datalist id="ct-list">{CONTESTS.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className={LBL} htmlFor="ct-call">My callsign</label>
                  <Input id="ct-call" className={`${INPUT} font-mono`} value={setup.myCall} onChange={(e) => update({ myCall: e.target.value.toUpperCase() })} />
                </div>
                <div>
                  <label className={LBL} htmlFor="ct-exch">My exchange</label>
                  <Input id="ct-exch" className={`${INPUT} font-mono`} value={setup.exchange} onChange={(e) => update({ exchange: e.target.value.toUpperCase() })} placeholder="e.g. 1D CT or 59 CT" />
                </div>
                <div>
                  <label className={LBL}>Serial numbers</label>
                  <div className="flex items-center gap-2 h-8">
                    <input type="checkbox" aria-label="Use serial numbers" checked={setup.useSerial} onChange={(e) => update({ useSerial: e.target.checked })} />
                    {setup.useSerial && <Input aria-label="Next serial" type="number" min={1} value={setup.nextSerial} onChange={(e) => update({ nextSerial: Math.max(1, Number(e.target.value) || 1) })} className={`${INPUT} w-20`} />}
                  </div>
                </div>
                <div>
                  <label className={LBL} htmlFor="ct-freq">Frequency (MHz)</label>
                  <Input id="ct-freq" className={`${INPUT} font-mono`} value={setup.frequency} onChange={(e) => update({ frequency: e.target.value })} />
                </div>
                <div>
                  <label className={LBL} htmlFor="ct-mode">Mode</label>
                  <select id="ct-mode" value={setup.mode} onChange={(e) => update({ mode: e.target.value })} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {MODES.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </Panel>

            <Panel title="Log a contact" accent={dupe ? 'danger' : 'primary'} meta={<>sending <span className="text-foreground">{sentExchange || '—'}</span></>}>
              <form onSubmit={log} className="p-3 grid grid-cols-2 gap-2 items-end">
                <div>
                  <label className={LBL} htmlFor="ct-their">Their callsign</label>
                  <Input id="ct-their" ref={callRef} autoFocus value={call} onChange={(e) => setCall(e.target.value.toUpperCase())} className={`h-10 font-mono text-lg ${dupe ? 'border-destructive' : ''}`} autoComplete="off" />
                </div>
                <div>
                  <label className={LBL} htmlFor="ct-rcvd">Exchange received</label>
                  <Input id="ct-rcvd" value={rcvd} onChange={(e) => setRcvd(e.target.value.toUpperCase())} className="h-10 font-mono text-lg" autoComplete="off" />
                </div>
                <div className="col-span-2"><Button type="submit" size="sm" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Log (Enter)'}</Button></div>
              </form>
              {dupe && <div className="px-3.5 pb-3 text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Dupe: {upperCall} already worked on {band} in this contest ({String(dupe.date).slice(11, 16)} UTC). You can still log it.</div>}
              {error && <div className="px-3.5 pb-3 text-sm text-destructive">{error}</div>}
            </Panel>
          </div>

          <Panel title={`${setup.contest} log`} accent="success" meta={`${contestQsos.length} QSOs`}>
            {!contestQsos.length ? <EmptyPanel icon={ClipboardList} title="No contacts yet" text={`No contacts logged for ${setup.contest} yet. Type a callsign above and press Enter.`} /> : (
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto scrollbar-thin">
                <table className={TABLE}>
                  <thead className={`${THEAD} sticky top-0`}><tr><th className={TH}>UTC</th><th className={TH}>Call</th><th className={TH}>Band</th><th className={TH}>Mode</th><th className={TH}>Sent</th><th className={TH}>Rcvd</th></tr></thead>
                  <tbody>
                    {contestQsos.slice(0, 200).map((c) => (
                      <tr key={c.id || c.date} className={TR}>
                        <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>{String(c.date).slice(5, 16).replace('T', ' ')}</td>
                        <td className={`${TD} font-mono font-semibold text-primary`}>{c.callsign}</td>
                        <td className={`${TD} font-mono text-[12px]`}>{c.band || bandForFrequency(c.frequency) || c.radio_service}</td>
                        <td className={TD}>{modeOf(c)}</td>
                        <td className={`${TD} font-mono text-[12px]`}>{c.contest_exchange_sent}</td>
                        <td className={`${TD} font-mono text-[12px]`}>{c.contest_exchange_rcvd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </ToolConsole>
  );
}
