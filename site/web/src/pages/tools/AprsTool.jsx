import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Radio, Loader2, Search, Info } from 'lucide-react';
import ToolConsole, { KpiGrid, TABLE, THEAD, TH, TR, TD } from '@/components/tools/ToolConsole';
import { Panel, EmptyPanel } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';

function ago(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

export default function AprsTool() {
  const [names, setNames] = useState('');
  const [what, setWhat] = useState('loc');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => { if (u?.callsign) setNames((n) => n || String(u.callsign).toUpperCase()); }).catch(() => {});
  }, []);

  const lookup = async () => {
    if (!names.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await base44.functions.invoke('aprs', { names, what });
      const d = res?.data || res;
      if (d?.notConfigured) { setNotConfigured(true); return; }
      if (!d?.ok) throw new Error(d?.error || 'Lookup failed');
      setResult(d);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const points = (result?.what === 'loc' ? result.entries : []).filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng));

  const entries = result?.entries || [];
  const newest = entries.reduce((m, e) => (e.time && (!m || e.time > m) ? e.time : m), null);

  return (
    <ToolConsole
      icon={Radio}
      title="APRS"
      subtitle="Latest position and weather reports"
      status={notConfigured ? 'Setup needed' : 'Live'}
      statusTone={notConfigured ? 'muted' : 'success'}
      statusPulse={!notConfigured}
      kpis={[
        { label: 'Stations', value: result ? result.names.length : '—' },
        { label: 'Reporting', value: result ? entries.length : '—', tone: 'success' },
        { label: 'Mapped', value: result ? points.length : '—' },
        { label: 'Newest report', value: newest ? ago(newest) : '—', tone: 'primary' },
      ]}
      footnote="Data from aprs.fi. Include the SSID your station beacons with (for example -9 for a car, -7 for a handheld)."
    >
      {notConfigured ? (
        <Panel title="Setup" accent="muted">
          <div className="p-3.5 flex gap-3 text-sm">
            <Info className="w-5 h-5 text-primary shrink-0" />
            <div className="space-y-1">
              <div className="font-semibold">APRS lookups aren't switched on yet</div>
              <p className="text-muted-foreground">An administrator needs to add an aprs.fi API key: create a free account at aprs.fi, copy the API key from "My account", and save it as the <span className="font-mono">APRS_FI_API_KEY</span> secret in Base44.</p>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="Lookup" accent="muted" meta="up to 20 callsigns">
            <div className="p-3 flex flex-wrap items-center gap-2">
              <Input id="aprs-names" aria-label="Callsigns with SSID" value={names} onChange={(e) => setNames(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && lookup()} placeholder="W1AW-9, K1ABC-7" className="h-8 text-xs font-mono flex-1 min-w-[14rem]" />
              <select aria-label="Report type" value={what} onChange={(e) => setWhat(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="loc">Position</option><option value="wx">Weather station</option>
              </select>
              <Button size="sm" className="h-8 text-xs" onClick={lookup} disabled={loading || !names.trim()}>{loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1.5" />} Look up</Button>
            </div>
            {error && <p className="px-3.5 pb-3 text-sm text-destructive">{error}</p>}
          </Panel>

          {!result && !error && <Panel title="Stations"><EmptyPanel icon={Radio} title="Look up a station" text="Enter one or more callsigns with their SSID to see where they last beaconed from." /></Panel>}
          {result && !entries.length && <Panel title="Stations"><EmptyPanel icon={Radio} title="Nothing heard recently" text={`No recent ${result.what === 'wx' ? 'weather reports' : 'positions'} for ${result.names.join(', ')}.`} /></Panel>}

          {(points.length > 0 || (entries.length > 0 && result.what === 'loc')) && (
            <div className="grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 items-start">
              {entries.length > 0 && result.what === 'loc' && (
                <Panel title="Positions" meta={`${entries.length} stations`}>
                  <div className="overflow-x-auto">
                    <table className={TABLE}>
                      <thead className={THEAD}><tr><th className={TH}>Station</th><th className={TH}>Last heard</th><th className={TH}>Position</th><th className={TH}>Speed / course</th><th className={TH}>Comment</th><th className={TH} /></tr></thead>
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.name} className={TR}>
                            <td className={`${TD} font-mono font-semibold text-primary`}>{e.name}</td>
                            <td className={`${TD} whitespace-nowrap text-[12px]`} title={e.time || ''}>{ago(e.time)}</td>
                            <td className={`${TD} font-mono text-[12px]`}>{Number.isFinite(e.lat) ? `${e.lat.toFixed(4)}, ${e.lng.toFixed(4)}` : ''}</td>
                            <td className={`${TD} text-[12px]`}>{e.speed != null ? `${Math.round(e.speed)} km/h` : ''}{e.course != null ? ` · ${e.course}°` : ''}</td>
                            <td className={`${TD} text-muted-foreground text-[12px]`}>{e.comment || e.status}</td>
                            <td className={TD}><a href={`https://aprs.fi/#!call=a%2F${encodeURIComponent(e.name)}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">aprs.fi</a></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}
              {points.length > 0 && (
                <Panel title="Station map" accent="success" meta={`${points.length} mapped`}>
                  <div className="h-[420px]">
                    <MapContainer center={[points[0].lat, points[0].lng]} zoom={points.length === 1 ? 10 : 4} className="h-full w-full" scrollWheelZoom={false}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" maxZoom={19} />
                      {points.map((p) => (
                        <CircleMarker key={p.name} center={[p.lat, p.lng]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#f97316', fillOpacity: 1 }}>
                          <Tooltip permanent direction="top">{p.name}</Tooltip>
                        </CircleMarker>
                      ))}
                    </MapContainer>
                  </div>
                </Panel>
              )}
            </div>
          )}

          {entries.length > 0 && result.what === 'wx' && (
            <div className="grid xl:grid-cols-2 gap-3">
              {entries.map((e) => (
                <Panel key={e.name} title={e.name} accent="success" meta={ago(e.time)}>
                  <KpiGrid className="md:grid-cols-3" items={[
                    { label: 'Temp', value: e.temp != null ? e.temp : null, unit: '°C' },
                    { label: 'Humidity', value: e.humidity != null ? e.humidity : null, unit: '%' },
                    { label: 'Pressure', value: e.pressure != null ? e.pressure : null, unit: 'mbar' },
                    { label: 'Wind', value: e.windSpeed != null ? e.windSpeed : null, unit: 'm/s', hint: e.windDirection != null ? `from ${e.windDirection}°` : undefined },
                    { label: 'Gust', value: e.windGust != null ? e.windGust : null, unit: 'm/s' },
                    { label: 'Rain (1 h)', value: e.rain1h != null ? e.rain1h : null, unit: 'mm' },
                  ]} />
                </Panel>
              ))}
            </div>
          )}
        </>
      )}
    </ToolConsole>
  );
}
