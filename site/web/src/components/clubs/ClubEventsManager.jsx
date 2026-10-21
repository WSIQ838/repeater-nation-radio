import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import ClubEventDialog from '@/components/clubs/ClubEventDialog';
import { toast } from '@/components/ui/use-toast';

export default function ClubEventsManager({ club, user }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const e = await base44.entities.Event.filter({ club_id: club.id }, 'date', 200).catch(() => []);
      setEvents(e || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [club.id]);

  const deleteEvent = async (ev) => {
    if (!window.confirm(`Delete "${ev.title}"?`)) return;
    try {
      await base44.entities.Event.delete(ev.id);
      setEvents((es) => es.filter((x) => x.id !== ev.id));
      toast({ title: 'Event deleted' });
    } catch (err) { toast({ title: 'Delete failed', description: err.message, variant: 'destructive' }); }
  };

  const canDelete = (ev) => ev.created_by_id === user?.id || user?.role === 'admin';
  const sorted = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-lg">Club events ({events.length})</h3>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Add event</Button>
      </div>
      {loading ? (
        <div className="h-32 rounded-xl bg-muted animate-pulse" />
      ) : sorted.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No events yet. Add your first club event.
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((ev) => (
            <Card key={ev.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0"><CalendarDays className="w-4 h-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{ev.title}</div>
                <div className="text-xs text-muted-foreground">{ev.date ? format(new Date(ev.date), 'EEE, MMM d · h:mm a') : ''}{ev.location ? ` · ${ev.location}` : ''}</div>
              </div>
              <Badge variant="secondary" className="shrink-0">{ev.type}</Badge>
              {canDelete(ev) && (
                <button onClick={() => deleteEvent(ev)} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0" title="Delete"><Trash2 className="w-4 h-4" /></button>
              )}
            </Card>
          ))}
        </div>
      )}
      <ClubEventDialog open={open} onClose={() => setOpen(false)} club={club} user={user} onCreated={load} />
    </div>
  );
}