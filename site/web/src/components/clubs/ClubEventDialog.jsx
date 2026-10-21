import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

const TYPES = ['Weekly Net', 'Meetup', 'Gathering', 'Public Service', 'Training', 'Swap Meet'];

function toLocalInput(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ClubEventDialog({ open, onClose, club, user, onCreated }) {
  const [form, setForm] = useState({ title: '', type: 'Meetup', date: toLocalInput(), location: '', description: '' });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    if (!form.date) { toast({ title: 'Date required', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      let lat = null, lng = null;
      if (form.location?.trim()) {
        try {
          const geo = await base44.functions.invoke('geocode-location', { query: form.location.trim() });
          if (geo?.lat != null) { lat = geo.lat; lng = geo.lng; }
        } catch (err) { console.error('Geocode failed:', err); }
      }
      await base44.entities.Event.create({
        title: form.title.trim(),
        type: form.type,
        date: new Date(form.date).toISOString(),
        location: form.location,
        description: form.description,
        club_id: club.id,
        organizer: user?.callsign || user?.full_name || '',
        club_owner_id: club.created_by_id || null,
        lat, lng,
      });
      toast({ title: 'Event created' });
      onCreated?.();
      onClose();
    } catch (err) {
      toast({ title: 'Could not create event', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!club) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New event for {club.name}</DialogTitle>
          <DialogDescription>Add a club event to the calendar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Title</Label>
            <Input id="ev-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Weekly Net" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-type">Type</Label>
              <select id="ev-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-date">Date &amp; time</Label>
              <Input id="ev-date" type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-loc">Location</Label>
            <Input id="ev-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Repeater site / address" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Description</Label>
            <textarea id="ev-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" placeholder="Details…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>{loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</> : 'Create event'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}