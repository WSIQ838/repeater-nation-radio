import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, Search } from 'lucide-react';
import ToolConsole, { PanelLoading, TABLE, THEAD, TH, TR, TD } from '@/components/tools/ToolConsole';
import { Panel, ConsoleTabs, EmptyPanel } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';

const REFRESH_MS = 60_000;
const BAND_ORDER = ['160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m', '2m', '70cm'];

function ago(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return mins < 1 ? 'now' : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
}

export default function DxCluster() {
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [band, setBand] = useState('all');
  const [query, setQuery] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('radio-data', { action: 'dx' });
      const d = res?.data || res;
      if (!d?.ok) throw new Error(d?.error);
      setSpots(d.spots || []);
      setUpdatedAt(new Date());
      setError('');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'DX cluster spots are unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const bands = useMemo(() => {
    const present = new Set(spots.map((s) => s.band).filter(Boolean));
    return BAND_ORDER.filter((b) => present.has(b)).concat([...present].filter((b) => !BAND_ORDER.includes(b)));
  }, [spots]);

  const shown = useMemo(() => {
    const q = query.trim().toUpperCase();
    return spots.filter((s) => (band === 'all' || s.band === band)
      && (!q || s.dx.toUpperCase().includes(q) || s.spotter.toUpperCase().includes(q) || s.country.toUpperCase().includes(q)));
  }, [spots, band, query]);

  const countries = new Set(spots.map((s) => s.country).filter(Boolean)).size;
  const latest = spots.reduce((m, s) => (s.time && (!m || s.time > m) ? s.time : m), null);

  return (
    <ToolConsole
      icon={Activity}
      title="DX Cluster"
      subtitle="Live DX spots from around the world"
      status={spots.length ? 'Live' : undefined}
      actions={<Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1.5" /> Refresh</Button>}
      kpis={[
        { label: 'Spots', value: spots.length },
        { label: 'Bands active', value: bands.length },
        { label: 'Countries', value: countries },
        { label: 'Latest spot', value: latest ? ago(latest) : '—', tone: 'primary' },
      ]}
      footnote={`${updatedAt ? `Updated ${updatedAt.toLocaleTimeString()} · refreshes every minute · ` : ''}source: HamQTH DX cluster`}
    >
      <ConsoleTabs
        value={band}
        onChange={setBand}
        tabs={[{ id: 'all', label: 'All bands', count: spots.length }, ...bands.map((b) => ({ id: b, label: b, count: spots.filter((s) => s.band === b).length }))]}
      />

      <Panel
        title="Spots"
        meta={`${shown.length} shown`}
        actions={(
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Callsign or country" className="h-7 text-xs pl-7 w-48" aria-label="Filter by callsign or country" />
          </div>
        )}
      >
        {loading ? (
          <PanelLoading text="Loading spots…" />
        ) : error && !spots.length ? (
          <p className="p-3.5 text-sm text-destructive">{error}</p>
        ) : !shown.length ? (
          <EmptyPanel icon={Activity} title="No spots match" text="Try another band or clear the filter." />
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto scrollbar-thin">
            <table className={TABLE}>
              <thead className={`${THEAD} sticky top-0`}>
                <tr><th className={TH}>Time</th><th className={TH}>DX</th><th className={TH}>Freq (kHz)</th><th className={TH}>Band</th><th className={TH}>Country</th><th className={TH}>Spotter</th><th className={TH}>Comment</th></tr>
              </thead>
              <tbody>
                {shown.map((s, i) => (
                  <tr key={`${s.dx}-${s.time}-${s.frequencyKhz}-${i}`} className={TR}>
                    <td className={`${TD} whitespace-nowrap text-muted-foreground text-[12px]`} title={s.time || ''}>{ago(s.time)}</td>
                    <td className={`${TD} font-mono font-semibold text-primary`}>{s.dx}</td>
                    <td className={`${TD} font-mono text-[12px]`}>{s.frequencyKhz?.toFixed(1) ?? '—'}</td>
                    <td className={`${TD} font-mono text-[12px]`}>{s.band}</td>
                    <td className={TD}>{s.country}{s.continent ? <span className="text-muted-foreground"> · {s.continent}</span> : null}</td>
                    <td className={`${TD} font-mono text-[12px] text-muted-foreground`}>{s.spotter}</td>
                    <td className={`${TD} text-muted-foreground text-[12px]`}>{s.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </ToolConsole>
  );
}
