import { useState } from 'react';
import { Sunrise, Search } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { parseDateOnlyLocal } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';

function fmtTime(iso) {
  if (!iso) return '—';
  if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(iso)) return iso;
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

export default function SunriseSunset() {
  const [q, setQ] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true); setErr('');
    try {
      const g = await base44.functions.invoke('geocode-location', { query: q });
      const gd = g?.data || g || {};
      if (gd.error) { setErr(gd.error); setLoading(false); return; }
      const w = await base44.functions.invoke('get-weather', { lat: gd.lat, lng: gd.lng });
      const wd = w?.data || w || {};
      if (wd.error) { setErr(wd.error); setLoading(false); return; }
      const daily = wd.weather?.daily;
      const idx = daily?.time?.indexOf(date);
      const i = idx >= 0 ? idx : 0;
      setData({
        label: gd.label,
        sunrise: daily?.sunrise?.[i], sunset: daily?.sunset?.[i],
        available: idx >= 0,
      });
    } catch (e) { setErr('Could not load data'); }
    setLoading(false);
  };

  return (
    <ToolShell title="Sunrise & Sunset" description="Look up sunrise, sunset, and civil twilight for a location and date." icon={Sunrise} disclaimer={false}>
      <Card className="p-6 space-y-4">
        <div className="grid sm:grid-cols-3 gap-4 items-end">
          <div className="sm:col-span-2">
            <Label>Location</Label>
            <div className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ZIP code, city, or address" onKeyDown={(e) => e.key === 'Enter' && search()} />
              <Button onClick={search} disabled={loading}><Search className="w-4 h-4" /></Button>
            </div>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}

        {data && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{data.label} · {parseDateOnlyLocal(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
            {!data.available && <p className="text-xs text-amber-600">Selected date is outside the 7-day forecast window; showing the nearest available day.</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted p-5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase"><Sunrise className="w-4 h-4" /> Sunrise</div>
                <div className="text-2xl font-heading font-bold mt-1">{fmtTime(data.sunrise)}</div>
              </div>
              <div className="rounded-xl bg-muted p-5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase"><Sunrise className="w-4 h-4 rotate-90" /> Sunset</div>
                <div className="text-2xl font-heading font-bold mt-1">{fmtTime(data.sunset)}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Times are shown in the location's local timezone.</p>
          </div>
        )}
      </Card>
    </ToolShell>
  );
}