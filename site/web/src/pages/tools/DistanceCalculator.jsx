import { useState } from 'react';
import { MapPin } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

function haversineMi(lat1, lng1, lat2, lng2) {
  const R = 3958.7613; // miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function PointInput({ label, value, onChange, result }) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true); setErr('');
    try {
      const res = await base44.functions.invoke('geocode-location', { query: q });
      const d = res?.data || res || {};
      if (d.error) { setErr(d.error); }
      else onChange({ lat: d.lat, lng: d.lng, label: d.label });
    } catch (e) { setErr('Could not find location'); }
    setLoading(false);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Address, ZIP, or city" onKeyDown={(e) => e.key === 'Enter' && search()} />
        <Button type="button" variant="secondary" onClick={search} disabled={loading}>{loading ? '…' : 'Find'}</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" step="any" placeholder="Latitude" value={value.lat} onChange={(e) => onChange({ ...value, lat: e.target.value, label: '' })} />
        <Input type="number" step="any" placeholder="Longitude" value={value.lng} onChange={(e) => onChange({ ...value, lng: e.target.value, label: '' })} />
      </div>
      {result && <p className="text-xs text-muted-foreground truncate">{result}</p>}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

export default function DistanceCalculator() {
  const [a, setA] = useState({ lat: '', lng: '', label: '' });
  const [b, setB] = useState({ lat: '', lng: '', label: '' });

  const latA = parseFloat(a.lat), lngA = parseFloat(a.lng), latB = parseFloat(b.lat), lngB = parseFloat(b.lng);
  const valid = [latA, lngA, latB, lngB].every((n) => !isNaN(n));
  const mi = valid ? haversineMi(latA, lngA, latB, lngB) : null;
  const km = mi != null ? mi * 1.60934 : null;

  return (
    <ToolShell title="Distance Calculator" description="Measure the distance between two locations by address, ZIP, city, or coordinates." icon={MapPin}>
      <Card className="p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-5">
          <PointInput label="Point A" value={a} onChange={setA} result={a.label} />
          <PointInput label="Point B" value={b} onChange={setB} result={b.label} />
        </div>
        <div className="rounded-xl bg-muted p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Distance</div>
          <div className="text-3xl font-heading font-bold mt-1">{mi != null ? `${mi.toFixed(1)} mi` : '—'}</div>
          <div className="text-sm text-muted-foreground mt-1">{mi != null ? `${(mi * 5280).toFixed(0)} ft` : 'Enter two valid points'}</div>
        </div>
        <p className="text-xs text-muted-foreground">Great-circle distance is computed using the haversine formula. Address and ZIP lookups use a free geocoding service.</p>
      </Card>
    </ToolShell>
  );
}