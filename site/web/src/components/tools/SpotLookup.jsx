import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, Search } from 'lucide-react';
import ToolConsole, { TABLE, THEAD, TH, TR, TD } from '@/components/tools/ToolConsole';
import { Panel, EmptyPanel } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { gridToLatLng } from '@/lib/adif';

// Shared by the WSPR and PSK Reporter tools: look up one callsign, show a
// summary, a map of where it was heard (or what it heard), and a table.
// `rows` returned by `normalize` are { time, other, otherLoc, myLoc,
// frequencyHz, snr, mode, extra }.
export default function SpotLookup({ icon, title, subtitle, action, normalize, options, renderOptions, sourceNote, emptyHint }) {
  const [callsign, setCallsign] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    base44.auth.me().then((u) => { if (u?.callsign) setCallsign((c) => c || String(u.callsign).toUpperCase()); }).catch(() => {});
  }, []);

  const lookup = async () => {
    const call = callsign.trim().toUpperCase();
    if (!call) return;
    setLoading(true); setError('');
    try {
      const res = await base44.functions.invoke('radio-data', { action, callsign: call, ...options });
      const d = res?.data || res;
      if (!d?.ok) throw new Error(d?.error || 'Lookup failed');
      setResult({ call, rows: normalize(d, call) });
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const rows = result?.rows || [];
  const mapped = useMemo(() => rows.map((r) => ({ ...r, otherPos: gridToLatLng(r.otherLoc), myPos: gridToLatLng(r.myLoc) })), [rows]);
  const home = mapped.find((r) => r.myPos)?.myPos;
  const withPos = mapped.filter((r) => r.otherPos);
  const farthest = mapped.reduce((best, r) => (r.distanceKm != null && r.distanceKm > (best?.distanceKm ?? -1) ? r : best), null);
  const uniqueOthers = new Set(rows.map((r) => r.other)).size;

  const bestSnr = rows.some((r) => Number.isFinite(r.snr)) ? Math.max(...rows.filter((r) => Number.isFinite(r.snr)).map((r) => r.snr)) : null;

  return (
    <ToolConsole
      icon={icon}
      title={title}
      subtitle={subtitle}
      status={result ? result.call : undefined}
      statusTone="muted"
      statusPulse={false}
      kpis={[
        { label: 'Reports', value: result ? rows.length : '—' },
        { label: 'Unique stations', value: result ? uniqueOthers : '—' },
        { label: 'Farthest', value: farthest?.distanceKm != null ? `${Math.round(farthest.distanceKm).toLocaleString()} km` : '—', tone: 'primary', title: farthest ? farthest.other : undefined },
        { label: 'Best SNR', value: bestSnr != null ? `${bestSnr} dB` : '—', tone: 'success' },
      ]}
      footnote={sourceNote}
    >
      <Panel title="Lookup" accent="muted">
        <div className="p-3 flex flex-wrap items-center gap-2">
          <Input id="spot-call" aria-label="Callsign" value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && lookup()} placeholder="Callsign, e.g. K1ABC" className="h-8 text-xs w-48 font-mono" />
          {renderOptions}
          <Button size="sm" className="h-8 text-xs" onClick={lookup} disabled={loading || !callsign.trim()}>
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1.5" />} Look up
          </Button>
        </div>
        {error && <p className="px-3.5 pb-3 text-sm text-destructive">{error}</p>}
      </Panel>

      {!result && !error && <Panel title="Reports"><EmptyPanel icon={icon} title="Look up a callsign" text="Enter a callsign above to see where it was heard and what it heard." /></Panel>}
      {result && !rows.length && <Panel title="Reports"><EmptyPanel icon={icon} title={`No reports for ${result.call}`} text={emptyHint} /></Panel>}

      {rows.length > 0 && (
        <div className={withPos.length ? 'grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3 items-start' : ''}>
          <Panel title="Reports" meta={`${rows.length} rows`}>
            <div className="overflow-x-auto max-h-[62vh] overflow-y-auto scrollbar-thin">
              <table className={TABLE}>
                <thead className={`${THEAD} sticky top-0`}>
                  <tr><th className={TH}>Time (UTC)</th><th className={TH}>Station</th><th className={TH}>Locator</th><th className={TH}>MHz</th><th className={TH}>SNR</th><th className={TH}>Distance</th><th className={TH}>Mode / info</th></tr>
                </thead>
                <tbody>
                  {mapped.map((r, i) => (
                    <tr key={i} className={TR}>
                      <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>{r.time ? r.time.slice(0, 16).replace('T', ' ') : ''}</td>
                      <td className={`${TD} font-mono text-primary`}>{r.other}</td>
                      <td className={`${TD} font-mono text-[12px] text-muted-foreground`}>{r.otherLoc || ''}</td>
                      <td className={`${TD} font-mono text-[12px]`}>{r.frequencyHz ? (r.frequencyHz / 1e6).toFixed(4) : ''}</td>
                      <td className={`${TD} font-mono text-[12px]`}>{Number.isFinite(r.snr) ? `${r.snr} dB` : ''}</td>
                      <td className={`${TD} text-[12px] whitespace-nowrap`}>{r.distanceKm != null ? `${Math.round(r.distanceKm).toLocaleString()} km` : ''}</td>
                      <td className={`${TD} text-muted-foreground text-[12px]`}>{r.extra || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {withPos.length > 0 && (
            <Panel title="Propagation map" accent="success" meta={`${withPos.length} located`}>
              <div className="h-[62vh] min-h-[420px]">
                <MapContainer center={home ? [home.lat, home.lng] : [withPos[0].otherPos.lat, withPos[0].otherPos.lng]} zoom={2} minZoom={1} className="h-full w-full" scrollWheelZoom={false} worldCopyJump>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" maxZoom={19} />
                  {home && withPos.map((r, i) => (
                    <Polyline key={`l${i}`} positions={[[home.lat, home.lng], [r.otherPos.lat, r.otherPos.lng]]} pathOptions={{ color: '#f97316', weight: 1, opacity: 0.35 }} />
                  ))}
                  {withPos.map((r, i) => (
                    <CircleMarker key={`m${i}`} center={[r.otherPos.lat, r.otherPos.lng]} radius={5} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#f97316', fillOpacity: 0.9 }}>
                      <Tooltip>{r.other} · {r.otherLoc}{Number.isFinite(r.snr) ? ` · ${r.snr} dB` : ''}{r.distanceKm != null ? ` · ${Math.round(r.distanceKm)} km` : ''}</Tooltip>
                    </CircleMarker>
                  ))}
                  {home && (
                    <CircleMarker center={[home.lat, home.lng]} radius={8} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}>
                      <Tooltip permanent direction="top">{result.call}</Tooltip>
                    </CircleMarker>
                  )}
                </MapContainer>
              </div>
            </Panel>
          )}
        </div>
      )}
    </ToolConsole>
  );
}

// Great-circle distance in km between two Maidenhead locators.
export function locatorDistanceKm(a, b) {
  const p = gridToLatLng(a); const q = gridToLatLng(b);
  if (!p || !q) return null;
  const rad = Math.PI / 180;
  const dLat = (q.lat - p.lat) * rad; const dLng = (q.lng - p.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
