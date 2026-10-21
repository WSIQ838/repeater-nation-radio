import { useEffect, useMemo, useState } from 'react';
import { Waves, Loader2, Search } from 'lucide-react';
import ToolConsole, { TABLE, THEAD, TH, TR, TD } from '@/components/tools/ToolConsole';
import { Panel, EmptyPanel } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';

const BAND_ORDER = ['160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m'];

export default function RbnTool() {
  const [callsign, setCallsign] = useState('');
  const [role, setRole] = useState('dx');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    base44.auth.me().then((u) => { if (u?.callsign) setCallsign((c) => c || String(u.callsign).toUpperCase()); }).catch(() => {});
  }, []);

  const lookup = async () => {
    if (!callsign.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await base44.functions.invoke('rbn-spots', { callsign, role });
      const d = res?.data || res;
      if (!d?.ok) throw new Error(d?.error || 'Lookup failed');
      setResult(d);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    if (!result?.rows?.length) return null;
    const other = (r) => (result.role === 'dx' ? r.skimmer : r.dx);
    const bands = new Map();
    for (const r of result.rows) {
      const b = bands.get(r.band) || { band: r.band, spots: 0, best: -Infinity, stations: new Set() };
      b.spots += 1; b.best = Math.max(b.best, r.snr); b.stations.add(other(r));
      bands.set(r.band, b);
    }
    const byStation = new Map();
    for (const r of result.rows) {
      const k = other(r);
      const s = byStation.get(k) || { call: k, continent: result.role === 'dx' ? r.skimmerContinent : r.dxContinent, spots: 0, best: -Infinity };
      s.spots += 1; s.best = Math.max(s.best, r.snr);
      byStation.set(k, s);
    }
    return {
      bands: [...bands.values()].sort((a, b) => BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band)),
      stations: [...byStation.values()].sort((a, b) => b.best - a.best).slice(0, 25),
      uniqueStations: byStation.size,
      best: Math.max(...result.rows.map((r) => r.snr)),
      continents: [...new Set(result.rows.map((r) => (result.role === 'dx' ? r.skimmerContinent : r.dxContinent)).filter(Boolean))].sort(),
    };
  }, [result]);

  const heardBy = result?.role === 'dx';

  return (
    <ToolConsole
      icon={Waves}
      title="Reverse Beacon Network"
      subtitle="Who heard your CW, RTTY and FT8 signals"
      status={result ? `${result.day} UTC` : undefined}
      statusTone="muted"
      statusPulse={false}
      kpis={[
        { label: 'Spots', value: summary ? result.total.toLocaleString() : '—' },
        { label: heardBy || !result ? 'Skimmers heard you' : 'Stations heard', value: summary ? summary.uniqueStations : '—' },
        { label: 'Best SNR', value: summary ? `${summary.best} dB` : '—', tone: 'primary' },
        { label: 'Continents', value: summary ? (summary.continents.join(' ') || '—') : '—' },
      ]}
      footnote="From the Reverse Beacon Network's daily raw data (reversebeacon.net). RBN publishes each UTC day once it ends, so results cover the most recent full day. The first search of the day can take a few seconds while the day's archive loads."
    >
      <Panel title="Lookup" accent="muted" meta={result ? `${result.callsign} · ${result.day}${result.total > result.rows.length ? ` · first ${result.rows.length} of ${result.total}` : ''}` : undefined}>
        <div className="p-3 flex flex-wrap items-center gap-2">
          <Input id="rbn-call" aria-label="Callsign" value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && lookup()} placeholder="Callsign, e.g. W1AW" className="h-8 text-xs w-48 font-mono" />
          <select aria-label="Search" value={role} onChange={(e) => setRole(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="dx">Who heard this station</option>
            <option value="skimmer">What this skimmer heard</option>
          </select>
          <Button size="sm" className="h-8 text-xs" onClick={lookup} disabled={loading || !callsign.trim()}>{loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1.5" />} Look up</Button>
        </div>
        {error && <p className="px-3.5 pb-3 text-sm text-destructive">{error}</p>}
      </Panel>

      {!result && !error && (
        <Panel title="Spots"><EmptyPanel icon={Waves} title="Look up a callsign" text="Enter a callsign above to see which skimmers heard it on the most recent full UTC day." /></Panel>
      )}
      {result && !result.rows.length && (
        <Panel title="Spots"><EmptyPanel icon={Waves} title={`No RBN spots for ${result.callsign}`} text={`Nothing on ${result.day} (UTC). RBN skimmers only decode CW, RTTY and some digital modes — calling CQ in one of those is what gets you spotted.`} /></Panel>
      )}

      {summary && (
        <>
          <div className="grid xl:grid-cols-2 gap-3 items-start">
            <Panel title="By band" meta={`${summary.bands.length} bands`}>
              <table className={TABLE}>
                <thead className={THEAD}><tr><th className={TH}>Band</th><th className={TH}>Spots</th><th className={TH}>{heardBy ? 'Skimmers' : 'Stations'}</th><th className={TH}>Best SNR</th></tr></thead>
                <tbody>{summary.bands.map((b) => <tr key={b.band} className={TR}><td className={`${TD} font-mono text-[12px]`}>{b.band}</td><td className={TD}>{b.spots}</td><td className={TD}>{b.stations.size}</td><td className={`${TD} font-mono text-[12px]`}>{b.best} dB</td></tr>)}</tbody>
              </table>
            </Panel>
            <Panel title={heardBy ? 'Strongest skimmers' : 'Strongest stations'} accent="success" meta={`top ${summary.stations.length}`}>
              <div className="max-h-[360px] overflow-y-auto scrollbar-thin">
                <table className={TABLE}>
                  <thead className={`${THEAD} sticky top-0`}><tr><th className={TH}>Call</th><th className={TH}>Continent</th><th className={TH}>Spots</th><th className={TH}>Best SNR</th></tr></thead>
                  <tbody>{summary.stations.map((s) => <tr key={s.call} className={TR}><td className={`${TD} font-mono text-primary`}>{s.call}</td><td className={TD}>{s.continent}</td><td className={TD}>{s.spots}</td><td className={`${TD} font-mono text-[12px]`}>{s.best} dB</td></tr>)}</tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Panel title="All spots" meta={`${result.rows.length} rows`}>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto scrollbar-thin">
              <table className={TABLE}>
                <thead className={`${THEAD} sticky top-0`}><tr><th className={TH}>Time (UTC)</th><th className={TH}>{heardBy ? 'Skimmer' : 'Station'}</th><th className={TH}>kHz</th><th className={TH}>Band</th><th className={TH}>Mode</th><th className={TH}>SNR</th><th className={TH}>Speed</th></tr></thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} className={TR}>
                      <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>{r.time ? r.time.slice(11, 16) : ''}</td>
                      <td className={`${TD} font-mono`}>{heardBy ? r.skimmer : r.dx}</td>
                      <td className={`${TD} font-mono text-[12px]`}>{r.frequencyKhz}</td>
                      <td className={`${TD} font-mono text-[12px]`}>{r.band}</td>
                      <td className={TD}>{r.mode}</td>
                      <td className={`${TD} font-mono text-[12px]`}>{r.snr} dB</td>
                      <td className={`${TD} text-[12px]`}>{r.speed ? `${r.speed} ${r.mode === 'CW' ? 'WPM' : 'BPS'}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </ToolConsole>
  );
}
