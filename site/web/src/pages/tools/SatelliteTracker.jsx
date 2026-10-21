import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Satellite, LocateFixed } from 'lucide-react';
import * as sat from 'satellite.js';
import ToolConsole, { PanelLoading, TABLE, THEAD, TH, TR, TD } from '@/components/tools/ToolConsole';
import { Panel, DataRow, EmptyPanel } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { gridToLatLng } from '@/lib/adif';

// All orbit math runs in the browser with satellite.js (SGP4) from orbital
// elements the radio-data function caches for 6 hours, so tracking costs
// the app one cached request per page load.
const PASS_HOURS = 24;
const PASS_STEP_S = 30;
const MIN_ELEVATION = 0;
const LOCATION_KEY = 'rn.sat.location';

function positionAt(satrec, date) {
  const pv = sat.propagate(satrec, date);
  if (!pv?.position) return null;
  const gd = sat.eciToGeodetic(pv.position, sat.gstime(date));
  return { lat: sat.degreesLat(gd.latitude), lng: sat.degreesLong(gd.longitude), altKm: gd.height };
}

function lookAt(satrec, date, observer) {
  const pv = sat.propagate(satrec, date);
  if (!pv?.position) return null;
  const ecf = sat.eciToEcf(pv.position, sat.gstime(date));
  const la = sat.ecfToLookAngles(observer, ecf);
  return { el: sat.radiansToDegrees(la.elevation), az: (sat.radiansToDegrees(la.azimuth) + 360) % 360, rangeKm: la.rangeSat };
}

function findPasses(satrec, observer, from = new Date()) {
  const passes = [];
  let current = null;
  const steps = (PASS_HOURS * 3600) / PASS_STEP_S;
  for (let i = 0; i <= steps; i += 1) {
    const t = new Date(from.getTime() + i * PASS_STEP_S * 1000);
    const l = lookAt(satrec, t, observer);
    if (!l) continue;
    if (l.el > MIN_ELEVATION) {
      if (!current) current = { aos: t, aosAz: l.az, maxEl: l.el, maxAt: t, maxAz: l.az };
      if (l.el > current.maxEl) Object.assign(current, { maxEl: l.el, maxAt: t, maxAz: l.az });
    } else if (current) {
      passes.push({ ...current, los: t, losAz: l.az });
      current = null;
      if (passes.length >= 12) break;
    }
  }
  return passes;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (az) => COMPASS[Math.round(az / 22.5) % 16];
const fmtTime = (d) => d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

// Splits a ground track where it crosses the antimeridian so the map does
// not draw a line straight across the world.
function splitTrack(points) {
  const segs = [[]];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const prev = points[i - 1];
    if (prev && Math.abs(p.lng - prev.lng) > 180) segs.push([]);
    segs[segs.length - 1].push([p.lat, p.lng]);
  }
  return segs.filter((s) => s.length > 1);
}

export default function SatelliteTracker({ defaultSatellite = 'ISS' }) {
  const [sats, setSats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [filter, setFilter] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [location, setLocation] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null'); } catch { return null; }
  });
  const [gridInput, setGridInput] = useState('');
  const [locError, setLocError] = useState('');

  useEffect(() => {
    base44.functions.invoke('radio-data', { action: 'tle' }).then((res) => {
      const d = res?.data || res;
      if (!d?.ok) throw new Error(d?.error);
      const parsed = (d.satellites || []).map((s) => {
        try { return { ...s, satrec: sat.twoline2satrec(s.line1, s.line2) }; } catch { return null; }
      }).filter(Boolean);
      setSats(parsed);
      const def = parsed.find((s) => s.name.toUpperCase().includes(defaultSatellite.toUpperCase())) || parsed[0];
      if (def) setSelectedName(def.name);
    }).catch((e) => setError(e?.response?.data?.error || e?.message || 'Satellite data is unavailable right now.'))
      .finally(() => setLoading(false));
  }, [defaultSatellite]);

  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) setNow(new Date()); }, 2000);
    return () => clearInterval(id);
  }, []);

  const saveLocation = (loc) => {
    setLocation(loc);
    setLocError('');
    try { localStorage.setItem(LOCATION_KEY, JSON.stringify(loc)); } catch { /* optional */ }
  };
  const locateMe = () => {
    if (!navigator.geolocation) { setLocError('Location is not available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => saveLocation({ lat: Math.round(p.coords.latitude * 1000) / 1000, lng: Math.round(p.coords.longitude * 1000) / 1000, altKm: (p.coords.altitude || 0) / 1000 }),
      () => setLocError('Could not get your location. Enter a grid square instead.'),
      { timeout: 10000 },
    );
  };
  const applyGrid = () => {
    const p = gridToLatLng(gridInput);
    if (!p) { setLocError('Enter a 4- or 6-character grid square, like FN42 or FN42hn.'); return; }
    saveLocation({ ...p, altKm: 0, grid: gridInput.toUpperCase() });
  };

  const selected = sats.find((s) => s.name === selectedName);
  const observer = useMemo(() => (location ? {
    latitude: sat.degreesToRadians(location.lat), longitude: sat.degreesToRadians(location.lng), height: location.altKm || 0,
  } : null), [location]);

  const pos = selected ? positionAt(selected.satrec, now) : null;
  const look = selected && observer ? lookAt(selected.satrec, now, observer) : null;

  // Ground track: 45 minutes either side, recomputed once a minute.
  const minute = Math.floor(now.getTime() / 60000);
  const track = useMemo(() => {
    if (!selected) return [];
    const pts = [];
    for (let m = -45; m <= 45; m += 1) {
      const p = positionAt(selected.satrec, new Date(minute * 60000 + m * 60000));
      if (p) pts.push(p);
    }
    return splitTrack(pts);
  }, [selected, minute]);

  // Passes: recomputed every 10 minutes or when the satellite/location changes.
  const tenMin = Math.floor(now.getTime() / 600000);
  const passes = useMemo(
    () => (selected && observer ? findPasses(selected.satrec, observer, new Date(tenMin * 600000)) : []),
    [selected, observer, tenMin],
  );

  // Recompute every ~30 s rather than on every 2 s tick.
  const halfMinute = Math.floor(now.getTime() / 30000);
  const overhead = useMemo(() => {
    if (!observer) return [];
    const at = new Date(halfMinute * 30000);
    return sats.map((s) => ({ name: s.name, look: lookAt(s.satrec, at, observer) }))
      .filter((s) => s.look && s.look.el > 0)
      .sort((a, b) => b.look.el - a.look.el);
  }, [sats, observer, halfMinute]);

  const listed = sats.filter((s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()));

  const SEL = 'h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <ToolConsole
      icon={Satellite}
      title="Satellite Tracker"
      subtitle={selected ? `Tracking ${selected.name}` : 'ISS and amateur satellites'}
      status={look ? (look.el > 0 ? 'Overhead' : 'Below horizon') : pos ? 'Tracking' : undefined}
      statusTone={look && look.el > 0 ? 'success' : look ? 'muted' : 'success'}
      statusPulse={!look || look.el > 0}
      kpis={[
        { label: 'Position', value: pos ? `${pos.lat.toFixed(1)}°, ${pos.lng.toFixed(1)}°` : '—' },
        { label: 'Altitude', value: pos ? `${Math.round(pos.altKm).toLocaleString()} km` : '—' },
        { label: 'From you', value: look ? `${look.el.toFixed(0)}° el · ${compass(look.az)}` : '—', tone: look && look.el > 0 ? 'success' : undefined, title: look ? (look.el > 0 ? 'Above your horizon now' : 'Below your horizon') : 'Set a location to see where it is from you.' },
        { label: 'Next pass', value: passes[0] ? fmtTime(passes[0].aos) : '—', tone: 'primary' },
      ]}
      footnote="Orbital elements from CelesTrak. Ground track shown 45 minutes back and ahead. Pass times are approximate (±1 minute)."
    >
      {loading ? (
        <Panel title="Satellites"><PanelLoading text="Loading orbital data…" /></Panel>
      ) : error ? (
        <Panel title="Satellites" accent="danger"><p className="p-3.5 text-sm text-destructive">{error}</p></Panel>
      ) : (
        <>
          <Panel title="Satellite & observer" accent="muted" meta={location ? `observer ${location.grid || `${location.lat}, ${location.lng}`}` : 'no location set'}>
            <div className="p-3 flex flex-wrap items-center gap-2">
              <select id="sat-pick" aria-label="Satellite" value={selectedName} onChange={(e) => setSelectedName(e.target.value)} className={`${SEL} min-w-[14rem] flex-1 max-w-sm`}>
                {listed.map((s) => <option key={s.name + s.line1.slice(2, 7)} value={s.name}>{s.name}</option>)}
              </select>
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search satellites" className="h-8 text-xs w-40" aria-label="Search satellites" />
              <span className="w-px h-6 bg-border mx-1 hidden sm:block" />
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={locateMe}><LocateFixed className="w-3.5 h-3.5 mr-1.5" /> Use my location</Button>
              <Input value={gridInput} onChange={(e) => setGridInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyGrid()} placeholder="Grid, e.g. FN42hn" className="h-8 text-xs w-32 font-mono" aria-label="Grid square" />
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={applyGrid}>Set</Button>
            </div>
            {locError && <p className="px-3.5 pb-3 text-xs text-destructive">{locError}</p>}
          </Panel>

          <div className="grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 items-start">
            {selected && pos && (
              <Panel title="Ground track" accent="success" meta={selected.name}>
                <div className="h-[62vh] min-h-[420px]">
                  <MapContainer center={[20, 0]} zoom={1} minZoom={1} className="h-full w-full" scrollWheelZoom={false} worldCopyJump>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" maxZoom={19} />
                    {track.map((seg, i) => <Polyline key={i} positions={seg} pathOptions={{ color: '#f97316', weight: 2, opacity: 0.8 }} />)}
                    <CircleMarker center={[pos.lat, pos.lng]} radius={8} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#f97316', fillOpacity: 1 }}>
                      <Tooltip permanent direction="top">{selected.name}</Tooltip>
                    </CircleMarker>
                    {location && (
                      <CircleMarker center={[location.lat, location.lng]} radius={6} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}>
                        <Tooltip>You</Tooltip>
                      </CircleMarker>
                    )}
                  </MapContainer>
                </div>
              </Panel>
            )}

            <div className="space-y-3">
              <Panel title="Next passes" meta={`next ${PASS_HOURS} h`}>
                {!location ? (
                  <EmptyPanel icon={LocateFixed} title="Set your location" text="Use your location or enter a grid square to predict passes over you." />
                ) : passes.length ? (
                  <>
                    <table className={TABLE}>
                      <thead className={THEAD}><tr><th className={TH}>Rise</th><th className={TH}>Max el</th><th className={TH}>Set</th><th className={TH}>Dur</th></tr></thead>
                      <tbody>
                        {passes.map((p) => (
                          <tr key={p.aos.getTime()} className={TR}>
                            <td className={`${TD} text-[12px] whitespace-nowrap`}>{fmtTime(p.aos)} <span className="text-muted-foreground">{compass(p.aosAz)}</span></td>
                            <td className={`${TD} text-[12px] whitespace-nowrap`}><span className={`font-mono ${p.maxEl >= 30 ? 'font-semibold text-success' : ''}`}>{p.maxEl.toFixed(0)}°</span> <span className="text-muted-foreground">{compass(p.maxAz)}</span></td>
                            <td className={`${TD} text-[12px] whitespace-nowrap`}>{fmtTime(p.los)} <span className="text-muted-foreground">{compass(p.losAz)}</span></td>
                            <td className={`${TD} font-mono text-[12px]`}>{Math.round((p.los - p.aos) / 60000)}m</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="px-3.5 py-2 text-[11px] text-muted-foreground border-t border-border bg-muted/30">Passes above 30° are easiest to work with a handheld and a small directional antenna.</p>
                  </>
                ) : <p className="p-3.5 text-sm text-muted-foreground">No passes above the horizon in the next {PASS_HOURS} hours.</p>}
              </Panel>

              {location && (
                <Panel title="Above your horizon now" accent="success" meta={`${overhead.length} visible`}>
                  {overhead.length ? overhead.map((s) => (
                    <DataRow key={s.name} className="grid-cols-[minmax(0,1fr)_auto]">
                      <button type="button" className="text-left hover:text-primary truncate" onClick={() => setSelectedName(s.name)}>{s.name}</button>
                      <span className="text-muted-foreground whitespace-nowrap font-mono text-[12px]">{s.look.el.toFixed(0)}° · {compass(s.look.az)}</span>
                    </DataRow>
                  )) : <p className="p-3.5 text-sm text-muted-foreground">No tracked satellites are above your horizon at the moment.</p>}
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </ToolConsole>
  );
}
