import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { MapPin, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { base44 } from '@/api/base44Client';
import { PageHeader, Loading, ErrorState, EmptyState, Badge } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useUserLocation } from '@/hooks/useUserLocation';
import FlyToUser from '@/components/map/FlyToUser';

import { errMsg } from '@/lib/utils';
const US_BOUNDS = { latMin: 24, latMax: 50, lngMin: -125, lngMax: -66 };
const colorFor = { Verified: '#16a34a', Pending: '#f59e0b', 'Needs Review': '#ef4444', Rejected: '#94a3b8' };

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 10, { duration: 0.8 });
  }, [target, map]);
  return null;
}

export default function AdminMap() {
  const { toast } = useToast();
  const [repeaters, setRepeaters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flyTarget, setFlyTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const { location: userLoc } = useUserLocation();

  useEffect(() => {
    adminApi('repeaters:list', { hidden: 'all', limit: 500 })
      .then((d) => setRepeaters(d.repeaters || []))
      .catch((e) => setError(errMsg(e) || 'Could not load repeaters'))
      .finally(() => setLoading(false));
  }, []);

  // Live updates: reflect repeater creates/updates/deletes without a page refresh
  useEffect(() => {
    const unsubscribe = base44.entities.Repeater.subscribe((event) => {
      if (event.type === 'create') {
        setRepeaters((rs) => rs.some((x) => x.id === event.data.id) ? rs : [...rs, event.data]);
      } else if (event.type === 'update') {
        setRepeaters((rs) => rs.map((x) => (x.id === event.data.id ? { ...x, ...event.data } : x)));
      } else if (event.type === 'delete') {
        setRepeaters((rs) => rs.filter((x) => x.id !== event.data.id));
      }
    });
    return unsubscribe;
  }, []);

  const problems = useMemo(() => repeaters.filter((r) => {
    if (r.lat == null || r.lng == null) return true;
    if (r.lat < US_BOUNDS.latMin || r.lat > US_BOUNDS.latMax) return true;
    if (r.lng < US_BOUNDS.lngMin || r.lng > US_BOUNDS.lngMax) return true;
    return false;
  }), [repeaters]);

  const mapped = useMemo(() => repeaters.filter((r) => r.lat != null && r.lng != null), [repeaters]);

  const saveCoords = async () => {
    if (!editTarget) return;
    setBusy(true);
    try {
      await adminApi('repeaters:update', { id: editTarget.id, fields: { lat: editTarget.lat, lng: editTarget.lng } });
      setRepeaters((rs) => rs.map((x) => (x.id === editTarget.id ? { ...x, lat: editTarget.lat, lng: editTarget.lng } : x)));
      toast({ title: 'Coordinates updated' });
      setEditTarget(null);
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    try {
      await adminApi('repeaters:delete', { id: removeTarget.id });
      setRepeaters((rs) => rs.filter((x) => x.id !== removeTarget.id));
      toast({ title: 'Repeater deleted' });
      setRemoveTarget(null);
    } catch (e) { toast({ title: errMsg(e) || 'Failed to delete', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Map Management" subtitle={`${mapped.length} mapped repeaters · ${problems.length} flagged for review`} />

      {loading ? <Loading /> : error ? <ErrorState message={error} /> : (
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 overflow-hidden p-0">
            <div className="h-[400px] lg:h-[520px] w-full">
              <MapContainer center={[39.5, -98.35]} zoom={4} className="h-full w-full" scrollWheelZoom>
                <FlyTo target={flyTarget} />
                <FlyToUser location={userLoc} />
                <TileLayer attribution="&copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
                {mapped.map((r) => (
                  <CircleMarker key={r.id} center={[r.lat, r.lng]} radius={6} pathOptions={{ color: colorFor[r.verification] || '#f59e0b', fillColor: colorFor[r.verification] || '#f59e0b', fillOpacity: 0.8 }}>
                    <Popup>
                      <div className="text-sm">
                        <div className="font-semibold">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.callsign} · {r.frequency} MHz</div>
                        <div className="mt-1"><Badge tone="muted">{r.verification}</Badge></div>
                        <button className="text-xs text-primary mt-2" onClick={() => setEditTarget({ id: r.id, name: r.name, lat: r.lat, lng: r.lng })}>Edit coordinates</button>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h2 className="font-semibold">Potential location problems</h2>
            </div>
            {problems.length === 0 ? <EmptyState title="All clear" description="No repeaters with missing or out-of-range coordinates." /> : (
              <ul className="space-y-2 max-h-[400px] lg:max-h-[460px] overflow-y-auto scrollbar-thin">
                {problems.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.callsign} · {r.lat == null ? 'No coordinates' : `${Number(r.lat).toFixed(3)}, ${Number(r.lng).toFixed(3)}`}</div>
                      </div>
                      <Badge tone={r.lat == null ? 'destructive' : 'warn'}>{r.lat == null ? 'Missing' : 'Out of range'}</Badge>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {r.lat != null && <Button size="sm" variant="outline" onClick={() => setFlyTarget(r)}><MapPin className="w-3.5 h-3.5" /> View</Button>}
                      <Button size="sm" variant="outline" onClick={() => setEditTarget({ id: r.id, name: r.name, lat: r.lat ?? null, lng: r.lng ?? null })}><Pencil className="w-3.5 h-3.5" /> Correct</Button>
                      <Button size="sm" variant="destructive" className="ml-auto" onClick={() => setRemoveTarget(r)}><Trash2 className="w-3.5 h-3.5" /> Remove</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Correct coordinates — {editTarget?.name}</DialogTitle></DialogHeader>
          {editTarget && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
              <div className="space-y-1.5">
                <Label>Latitude</Label>
                <Input type="number" step="any" value={editTarget.lat ?? ''} onChange={(e) => setEditTarget({ ...editTarget, lat: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Longitude</Label>
                <Input type="number" step="any" value={editTarget.lng ?? ''} onChange={(e) => setEditTarget({ ...editTarget, lng: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={saveCoords} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove repeater?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete <span className="font-medium text-foreground">{removeTarget?.name}</span> ({removeTarget?.callsign}) from the system. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}