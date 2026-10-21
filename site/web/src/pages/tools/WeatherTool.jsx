import { useState } from 'react';
import { CloudSun, Search, LocateFixed, AlertTriangle } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { parseDateOnlyLocal } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { wmoText, windDir } from '@/lib/weatherCodes';

const cToF = (c) => c * 9 / 5 + 32;
const kToM = (k) => k * 0.621371;

export default function WeatherTool() {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const fetchWeather = async (lat, lng, label) => {
    setLoading(true); setErr('');
    try {
      const res = await base44.functions.invoke('get-weather', { lat, lng });
      const d = res?.data || res || {};
      if (d.error) { setErr(d.error); setData(null); }
      else setData({ ...d.weather, alerts: d.alerts || [], label });
    } catch (e) { setErr('Could not load weather'); setData(null); }
    setLoading(false);
  };

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true); setErr('');
    try {
      const g = await base44.functions.invoke('geocode-location', { query: q });
      const gd = g?.data || g || {};
      if (gd.error) { setErr(gd.error); setLoading(false); return; }
      await fetchWeather(gd.lat, gd.lng, gd.label);
    } catch (e) { setErr('Location lookup failed'); setLoading(false); }
  };

  const useLocation = () => {
    if (!navigator.geolocation) { setErr('Geolocation not available'); return; }
    setLoading(true); setErr('');
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude, 'Current location'),
      () => { setErr('Location permission denied'); setLoading(false); },
      { timeout: 10000 }
    );
  };

  const c = data?.current;
  const daily = data?.daily;

  return (
    <ToolShell title="Weather" description="Current conditions, 7-day forecast, and weather alerts for your area." icon={CloudSun} disclaimer={false}>
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label>Location</Label>
            <div className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ZIP code or city" onKeyDown={(e) => e.key === 'Enter' && search()} />
              <Button onClick={search} disabled={loading}><Search className="w-4 h-4" /></Button>
            </div>
          </div>
          <Button variant="outline" onClick={useLocation} disabled={loading}><LocateFixed className="w-4 h-4 mr-1.5" /> Use my location</Button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading weather…</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}

        {c && (
          <div className="rounded-xl bg-muted p-5">
            {data.label && <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{data.label}</div>}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-4xl font-heading font-bold">{Math.round(cToF(c.temperature_2m))}°F</div>
              <div>
                <div className="font-medium">{c.weather_text || wmoText(c.weather_code)}</div>
                <div className="text-sm text-muted-foreground">Feels {Math.round(cToF(c.apparent_temperature))}°F · Humidity {c.relative_humidity_2m}%</div>
                <div className="text-sm text-muted-foreground">Wind {Math.round(kToM(c.wind_speed_10m))} mph {windDir(c.wind_direction_10m)}</div>
              </div>
            </div>
          </div>
        )}

        {data?.alerts?.length > 0 && (
          <div className="space-y-2">
            {data.alerts.map((a, i) => (
              <div key={i} className="flex gap-2.5 rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <div className="font-medium">{a.title} {a.severity && <span className="text-xs text-muted-foreground">· {a.severity}</span>}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{a.headline || a.area}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {daily && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {daily.time.map((t, i) => (
              <div key={t} className="rounded-lg border border-input p-3 text-center">
                <div className="text-xs text-muted-foreground">{parseDateOnlyLocal(t).toLocaleDateString(undefined, { weekday: 'short' })}</div>
                <div className="text-sm font-medium mt-1">{daily.weather_text?.[i] || wmoText(daily.weather_code[i])}</div>
                <div className="text-xs text-muted-foreground mt-1">{Math.round(cToF(daily.temperature_2m_max[i]))}° / {Math.round(cToF(daily.temperature_2m_min[i]))}°</div>
                <div className="text-[11px] text-muted-foreground">💧 {daily.precipitation_probability_max[i] ?? 0}%</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </ToolShell>
  );
}