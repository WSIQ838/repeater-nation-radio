import { useEffect, useMemo, useState } from 'react';
import { Antenna, Plus, Radio, ExternalLink, Loader2, Clock, Navigation, MapPin, X } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import SdrMap from '@/components/tools/SdrMap';
import MapPinPicker from '@/components/repeaters/MapPinPicker';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import Linkify from '@/components/shared/Linkify';

// ===== APP-SPECIFIC =====
// A member-submitted directory of software-defined radio (SDR) web
// receivers -- e.g. an OpenWebRX/KiwiSDR instance someone runs themselves.
// We don't host these streams ourselves (that needs real SDR hardware and
// an always-on server); this page just links out to member-run ones.
// Submissions start pending and only appear here once an admin approves
// them (Admin -> SDR Streams), same moderation pattern as POTA park
// community submissions.
// ===== END APP-SPECIFIC =====

const EMPTY_FORM = {
  name: '', stream_url: '', description: '', location: '', city: '', state: '',
  frequency_info: '', radio_service: 'Other', lat: null, lng: null,
};

export default function Sdr() {
  const [me, setMe] = useState(null);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [visibleStreamIds, setVisibleStreamIds] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [user, rows] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.SdrStream.list('-created_date', 500).catch(() => []),
      ]);
      setMe(user);
      setStreams(rows || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const locateMe = () => {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported');
      toast({ title: 'Location unavailable', description: 'This browser does not provide geolocation.', variant: 'destructive' });
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationStatus('ready');
        setVisibleStreamIds(null);
      },
      () => {
        setLocationStatus('denied');
        toast({ title: 'Location permission needed', description: 'Allow location access to find nearby SDR streams.', variant: 'destructive' });
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
    );
  };

  const distanceMiles = (stream) => {
    if (!userLocation || !Number.isFinite(Number(stream.lat)) || !Number.isFinite(Number(stream.lng))) return null;
    const toRad = (v) => v * Math.PI / 180;
    const dLat = toRad(Number(stream.lat) - userLocation.lat);
    const dLng = toRad(Number(stream.lng) - userLocation.lng);
    const lat1 = toRad(userLocation.lat);
    const lat2 = toRad(Number(stream.lat));
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  };

  const approved = useMemo(() => streams.filter((s) => s.verification_status === 'approved'), [streams]);

  const mappedApproved = useMemo(
    () => approved.filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng))),
    [approved]
  );

  const mapList = useMemo(() => {
    if (visibleStreamIds === null) return mappedApproved;
    const ids = new Set(visibleStreamIds);
    return mappedApproved.filter((s) => ids.has(s.id));
  }, [mappedApproved, visibleStreamIds]);

  const nearbyStreams = useMemo(() => {
    const list = mapList.slice();
    if (!userLocation) return list;
    return list.sort((a, b) => (distanceMiles(a) ?? Infinity) - (distanceMiles(b) ?? Infinity));
  }, [mapList, userLocation]);
  const mine = useMemo(
    () => streams.filter((s) => s.created_by_id === me?.id && s.verification_status !== 'approved'),
    [streams, me]
  );

  const openSubmit = () => {
    setForm(EMPTY_FORM);
    setSubmitOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.stream_url.trim()) return;
    setSubmitting(true);
    try {
      await base44.entities.SdrStream.create({
        ...form,
        name: form.name.trim(),
        stream_url: form.stream_url.trim(),
        submitted_by_name: me?.full_name || me?.email || '',
        submitted_at: new Date().toISOString(),
      });
      toast({ title: 'Submitted for review', description: "An admin will review your stream before it's listed here." });
      setSubmitOpen(false);
      load();
    } catch (e) {
      toast({ title: 'Could not submit', description: e?.message || 'Please try again.', variant: 'destructive' });
    }
    setSubmitting(false);
  };

  return (
    <ToolShell
      title="SDR Streams"
      description="Member-run software-defined radio web receivers you can listen to live."
      icon={Antenna}
      disclaimer={false}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-lg">
          Browse SDR receivers other members have shared, or submit your own for others to listen to.
        </p>
        {me && (
          <Button onClick={openSubmit} className="gap-1.5 shrink-0">
            <Plus className="w-4 h-4" /> Submit your stream
          </Button>
        )}
      </div>

      {mine.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-heading font-semibold text-muted-foreground uppercase tracking-wide">Your submissions</h2>
          {mine.map((s) => (
            <Card key={s.id} className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 grid place-items-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.verification_status === 'rejected'
                    ? `Not approved${s.review_notes ? `: ${s.review_notes}` : ''}`
                    : 'Pending review'}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && mappedApproved.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-sm font-heading font-semibold">SDR Receivers Near You</h2>
              <p className="text-xs text-muted-foreground">The list follows the current map view.</p>
            </div>
            <Button size="sm" variant="outline" onClick={locateMe} disabled={locationStatus === 'loading'} className="gap-1.5">
              {locationStatus === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
              {locationStatus === 'ready' ? 'My Location' : 'Find My Location'}
            </Button>
          </div>
          <SdrMap streams={mappedApproved} height="430px" userLocation={userLocation} onVisibleChange={setVisibleStreamIds} />
          <div className="text-xs text-muted-foreground">
            {nearbyStreams.length} SDR receiver{nearbyStreams.length === 1 ? '' : 's'} in the current map area · {mappedApproved.length} mapped total
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : approved.length === 0 ? (
        <Card className="p-10 text-center">
          <Radio className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-heading font-semibold text-lg">No streams yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {me ? 'Be the first to submit a stream for the community.' : 'Sign in to submit your own SDR stream.'}
          </p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {nearbyStreams.map((s) => (
            <Card key={s.id} className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-heading font-semibold truncate">{s.name}</h3>
                {s.radio_service && s.radio_service !== 'Other' && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">{s.radio_service}</span>
                )}
              </div>
              {(s.city || s.state || s.location) && (
                <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{[s.city, s.state].filter(Boolean).join(', ') || s.location}{distanceMiles(s) != null ? ` · ${distanceMiles(s).toFixed(0)} mi away` : ''}</div>
              )}
              {s.frequency_info && <div className="text-xs text-muted-foreground">{s.frequency_info}</div>}
              {s.description && <p className="text-sm text-muted-foreground line-clamp-3"><Linkify text={s.description} /></p>}
              <Button asChild size="sm" variant="outline" className="mt-auto gap-1.5 w-fit">
                <a href={s.stream_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" /> Open stream
                </a>
              </Button>
              {s.source_name && (
                <a href={s.source_url || '#'} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-primary hover:underline">
                  via {s.source_name}
                </a>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={submitOpen} onOpenChange={(open) => !submitting && setSubmitOpen(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit your SDR stream</DialogTitle>
            <p className="text-sm text-muted-foreground">Reviewed by an admin before it's listed publicly.</p>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-sm">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Fullerton HF Receiver" className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Stream URL *</Label>
              <Input value={form.stream_url} onChange={(e) => setForm({ ...form, stream_url: e.target.value })} placeholder="https://your-receiver.example.com" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">State</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Frequency / bands</Label>
                <Input value={form.frequency_info} onChange={(e) => setForm({ ...form, frequency_info: e.target.value })} placeholder="e.g. 0-30 MHz HF" className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Service</Label>
                <Select value={form.radio_service} onValueChange={(v) => setForm({ ...form, radio_service: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GMRS">GMRS</SelectItem>
                    <SelectItem value="HAM">HAM</SelectItem>
                    <SelectItem value="Both">Both</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-sm">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Antenna setup, coverage, anything listeners should know." className="mt-1" rows={3} />
            </div>
            <div>
              <Label className="text-sm">Location (optional, shows on the map)</Label>
              <div className="mt-1">
                <MapPinPicker lat={form.lat} lng={form.lng} onPick={(ll) => setForm({ ...form, lat: Number(ll.lat.toFixed(4)), lng: Number(ll.lng.toFixed(4)) })} />
              </div>
              {form.lat != null && form.lng != null && (
                <p className="text-xs text-muted-foreground font-mono mt-1">{form.lat}, {form.lng}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSubmitOpen(false)} disabled={submitting}>
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={submitting || !form.name.trim() || !form.stream_url.trim()}>
              {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
              {submitting ? 'Submitting…' : 'Submit for review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolShell>
  );
}
