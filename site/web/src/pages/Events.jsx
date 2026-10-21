import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import {
  Plus, CalendarDays, MapPin, Clock, Users, Trash2, ChevronDown, ChevronLeft, ChevronRight,
  ImagePlus, X, Loader2, Download, Radio, Trees, Activity,
} from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';
import LinkPreviews from '@/components/shared/LinkPreviews';
import ShareButton from '@/components/shared/ShareButton';

const DEFAULT_TYPES = [
  { name: 'Weekly Net', color: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400', display_order: 0 },
  { name: 'Meetup', color: 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400', display_order: 1 },
  { name: 'Gathering', color: 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400', display_order: 2 },
  { name: 'Public Service', color: 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400', display_order: 3 },
  { name: 'Training', color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400', display_order: 4 },
  { name: 'Swap Meet', color: 'bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-400', display_order: 5 },
];
const EMPTY = { title: '', type: 'Meetup', date: '', location: '', description: '', club_id: '', image_url: '' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateOnly(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dateKey(d) { return dateOnly(d).getTime(); }

function toICSDate(d) {
  return new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function downloadICS(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Repeater Nation//Events//EN'];
  events.forEach((ev) => {
    const start = new Date(ev.date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@repeaternation`,
      `DTSTAMP:${toICSDate(new Date())}`,
      `DTSTART:${toICSDate(start)}`,
      `DTEND:${toICSDate(end)}`,
      `SUMMARY:${(ev.title || 'Event').replace(/\n/g, ' ')}`,
      ev.location ? `LOCATION:${ev.location.replace(/\n/g, ' ')}` : null,
      ev.description ? `DESCRIPTION:${ev.description.replace(/\n/g, ' ')}` : null,
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.filter(Boolean).join('\r\n')], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'events.ics';
  a.click();
  URL.revokeObjectURL(url);
}

export default function Events() {
  const [events, setEvents] = useState([]);
  const [eventTypes, setEventTypes] = useState(DEFAULT_TYPES);
  const [myClubs, setMyClubs] = useState([]);
  const [eventClubs, setEventClubs] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [view, setView] = useState('list');
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [detailEvent, setDetailEvent] = useState(null);
  const [liveNets, setLiveNets] = useState([]);
  const [livePota, setLivePota] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [searchParams, setSearchParams] = useSearchParams();

  const load = async () => {
    setLoading(true);
    try {
      // Events are public, so the Events page should show every event created
      // by an individual or a club, not only events tied to clubs the viewer
      // belongs to. Fetch in pages so older events are not silently capped.
      const EVENT_PAGE_SIZE = 200;
      const [u, configuredTypes, activeNets, activePota] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.EventType.list('display_order', 200).catch(() => []),
        base44.entities.NetControlSession.filter({ status: 'active' }, '-updated_date', 100).catch(() => []),
        base44.entities.PotaActivation.filter({ status: 'Active' }, '-updated_date', 100).catch(() => []),
      ]);
      setEventTypes(configuredTypes?.length ? configuredTypes : DEFAULT_TYPES);
      setUser(u);

      const allEvents = [];
      for (let offset = 0; ; offset += EVENT_PAGE_SIZE) {
        const page = await base44.entities.Event.list('-date', EVENT_PAGE_SIZE, offset).catch(() => []);
        if (!page?.length) break;
        allEvents.push(...page);
        if (page.length < EVENT_PAGE_SIZE) break;
      }

      // Membership/ownership checks are only used for the Host selector when
      // creating an event. They no longer control which events are displayed.
      let joinedIds = [];
      let ownedIds = [];
      if (u?.callsign || u?.id) {
        const [mems, owned] = await Promise.all([
          u?.callsign
            ? base44.entities.Membership.filter({ member_callsign: u.callsign }).catch(() => [])
            : Promise.resolve([]),
          u?.id
            ? base44.entities.Club.filter({ created_by_id: u.id }).catch(() => [])
            : Promise.resolve([]),
        ]);
        joinedIds = (mems || []).map((m) => m.club_id).filter(Boolean);
        ownedIds = (owned || []).map((c) => c.id).filter(Boolean);
      }

      const visibleClubIds = new Set([...joinedIds, ...ownedIds]);
      // Load the viewer's clubs and the clubs referenced by all public events
      // (so the page can show the group name even to non-members) in one bulk
      // read instead of one Club.get per club.
      const eventClubIds = [...new Set((allEvents || []).map((ev) => ev.club_id).filter(Boolean))];
      const clubIds = [...new Set([...visibleClubIds, ...eventClubIds])];
      const clubs = clubIds.length
        ? await base44.entities.Club.filter({ id: { $in: clubIds } }, undefined, clubIds.length).catch(() => [])
        : [];
      const clubById = new Map((clubs || []).map((c) => [c.id, c]));
      setMyClubs([...visibleClubIds].map((id) => clubById.get(id)).filter(Boolean));
      setEventClubs(eventClubIds.map((id) => clubById.get(id)).filter(Boolean));
      setEvents(allEvents);
      setLiveNets(activeNets || []);
      setLivePota(activePota || []);
    } catch (e) {
      console.error(e);
      setEvents([]);
      setEventClubs([]);
    } finally {
      setLoading(false);
    }
  };
  // Only the live nets and POTA activations change minute to minute, so the
  // timer refreshes just those (never from a hidden tab). A full reload
  // happens when the tab comes back after a long time away.
  const refreshLive = async () => {
    const [activeNets, activePota] = await Promise.all([
      base44.entities.NetControlSession.filter({ status: 'active' }, '-updated_date', 100).catch(() => null),
      base44.entities.PotaActivation.filter({ status: 'Active' }, '-updated_date', 100).catch(() => null),
    ]);
    if (activeNets) setLiveNets(activeNets);
    if (activePota) setLivePota(activePota);
  };
  // Open the deep-linked event (from a shared ?event=<id> URL) once loaded.
  useEffect(() => {
    const evId = searchParams.get('event');
    if (evId && !detailEvent && events.length) {
      const found = events.find((x) => x.id === evId);
      if (found) setDetailEvent(found);
    }
  }, [searchParams, events, detailEvent]);
  useEffect(() => {
    load();
    let lastFull = Date.now();
    const refresh = setInterval(() => {
      if (document.hidden) return;
      setNow(new Date());
      refreshLive();
    }, 60000);
    const onVisible = () => {
      if (document.hidden) return;
      if (Date.now() - lastFull > 10 * 60 * 1000) { lastFull = Date.now(); load(); } else refreshLive();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(refresh); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  const clubName = (id) => eventClubs.find((c) => c.id === id)?.name || myClubs.find((c) => c.id === id)?.name;
  const typeColorFor = (type) => eventTypes.find((t) => t.name === type)?.color || 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400';

  const deleteEvent = async (ev) => {
    if (!ev?.id) return;
    try {
      await base44.entities.Event.delete(ev.id);
      setEvents((es) => es.filter((x) => x.id !== ev.id));
      setDetailEvent((d) => (d?.id === ev.id ? null : d));
    } catch (e) { console.error(e); }
  };

  // Matches Event's update/delete RLS (creator, club owner, or these roles).
  const canModerate = ['admin', 'super_admin', 'moderator'].includes(user?.role);

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      setForm((f) => ({ ...f, image_url: res.file_url }));
    } catch (err) { console.error(err); }
    setUploading(false);
    e.target.value = '';
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.date) return;
    setSaving(true);
    try {
      let lat = null, lng = null;
      if (form.location?.trim()) {
        try {
          const geo = await base44.functions.invoke('geocode-location', { query: form.location.trim() });
          if (geo?.lat != null) { lat = geo.lat; lng = geo.lng; }
        } catch (err) { console.error('Geocode failed:', err); }      }
      await base44.entities.Event.create({
        ...form,
        club_id: form.club_id || undefined,
        date: new Date(form.date).toISOString(),
        lat, lng,
      });
      setForm(EMPTY);
      setOpen(false);
      load();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const { upcoming, byDay } = useMemo(() => {
    const now = new Date();
    const q = search.trim().toLowerCase();
    const matches = (ev) => {
      if (typeFilter !== 'All' && ev.type !== typeFilter) return false;
      if (!q) return true;
      return ev.title?.toLowerCase().includes(q) || ev.location?.toLowerCase().includes(q);
    };
    const filtered = events.filter(matches);
    const up = filtered.filter((ev) => new Date(ev.date) >= now).sort((a, b) => new Date(a.date) - new Date(b.date));
    const dayMap = new Map();
    filtered.forEach((ev) => {
      const key = dateKey(ev.date);
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key).push(ev);
    });
    return { upcoming: up, byDay: dayMap };
  }, [events, search, typeFilter]);

  const liveEvents = useMemo(() => {
    return events
      .filter((ev) => {
        const start = new Date(ev.date);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        return start <= now && now < end;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [events, now]);

  const thisWeek = useMemo(() => {
    const now = dateOnly(new Date());
    const weekOut = new Date(now.getTime() + 7 * 86400000);
    const inWeek = upcoming.filter((ev) => dateOnly(ev.date) < weekOut);
    const map = new Map();
    inWeek.forEach((ev) => {
      const label = new Date(ev.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(ev);
    });
    return [...map.entries()];
  }, [upcoming]);

  const calendarDays = useMemo(() => {
    const first = new Date(calMonth);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [calMonth]);

  const shiftMonth = (delta) => {
    setCalMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() + delta); return d; });
  };

  const openDetail = (ev) => {
    setDetailEvent(ev);
    if (ev) {
      setSearchParams((p) => { p.set('event', ev.id); return p; }, { replace: true });
    } else {
      setSearchParams((p) => { p.delete('event'); return p; }, { replace: true });
    }
  };

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto space-y-5">
      <Card className="overflow-hidden border-2 border-primary/20 shadow-sm">
        <div className="bg-primary/5 px-5 py-4 border-b border-primary/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <h2 className="font-heading font-bold text-lg">What&apos;s Happening Right Now</h2>
                {(liveEvents.length + liveNets.length + livePota.length) > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 px-2 py-0.5 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Live POTA activations, nets, and events across Repeater Nation.</p>
            </div>
            <span className="hidden sm:block text-xs text-muted-foreground">Updates automatically</span>
          </div>
        </div>
        {livePota.length + liveNets.length + liveEvents.length === 0 ? (
          <div className="px-5 py-8 text-center text-muted-foreground">
            <Radio className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">Nothing is live right now.</p>
            <p className="text-xs mt-1">Live activity will appear here automatically when a POTA activation, net, or event is underway.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3"><Trees className="w-4 h-4 text-green-600" /><h3 className="font-semibold text-sm">Live POTA</h3><span className="text-xs text-muted-foreground">({livePota.length})</span></div>
              {livePota.length === 0 ? <p className="text-xs text-muted-foreground">No active POTA activations.</p> : (
                <div className="space-y-2">
                  {livePota.slice(0, 4).map((a) => (
                    <Link key={a.id} to={`/tools/pota/${a.id}`} className="block rounded-lg border border-border p-3 hover:bg-accent transition-colors">
                      <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mt-1.5 shrink-0" /><div className="min-w-0">
                        <div className="font-medium text-sm truncate">{a.park_name || 'POTA Activation'}</div>
                        <div className="text-xs text-muted-foreground truncate">{a.park_number || 'POTA'}{a.operator_callsign ? ` · ${a.operator_callsign}` : ''}{a.operator_callsign && <StaffTag callsign={a.operator_callsign} compact className="ml-1" />}</div>
                        {a.frequency && <div className="text-xs text-muted-foreground mt-1">{a.frequency} MHz{a.channel ? ` · Ch ${a.channel}` : ''}</div>}
                      </div></div>
                    </Link>
                  ))}
                  {livePota.length > 4 && <p className="text-xs text-muted-foreground">+{livePota.length - 4} more live activations</p>}
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3"><Radio className="w-4 h-4 text-primary" /><h3 className="font-semibold text-sm">Live Nets</h3><span className="text-xs text-muted-foreground">({liveNets.length})</span></div>
              {liveNets.length === 0 ? <p className="text-xs text-muted-foreground">No active nets.</p> : (
                <div className="space-y-2">
                  {liveNets.slice(0, 4).map((net) => (
                    <Link key={net.id} to="/tools/net-control" className="block rounded-lg border border-border p-3 hover:bg-accent transition-colors">
                      <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mt-1.5 shrink-0" /><div className="min-w-0">
                        <div className="font-medium text-sm truncate">{net.name || 'Live Net'}</div>
                        <div className="text-xs text-muted-foreground truncate">{net.net_type || 'Net'}{net.club_name ? ` · ${net.club_name}` : ''}</div>
                        {net.frequency && <div className="text-xs text-muted-foreground mt-1">{net.frequency} MHz{net.channel ? ` · Ch ${net.channel}` : ''}</div>}
                      </div></div>
                    </Link>
                  ))}
                  {liveNets.length > 4 && <p className="text-xs text-muted-foreground">+{liveNets.length - 4} more live nets</p>}
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3"><CalendarDays className="w-4 h-4 text-orange-600" /><h3 className="font-semibold text-sm">Live Events</h3><span className="text-xs text-muted-foreground">({liveEvents.length})</span></div>
              {liveEvents.length === 0 ? <p className="text-xs text-muted-foreground">No events are happening right now.</p> : (
                <div className="space-y-2">
                  {liveEvents.slice(0, 4).map((ev) => (
                    <button key={ev.id} onClick={() => openDetail(ev)} className="block w-full text-left rounded-lg border border-border p-3 hover:bg-accent transition-colors">
                      <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mt-1.5 shrink-0" /><div className="min-w-0">
                        <div className="font-medium text-sm truncate">{ev.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{ev.type || 'Event'}{ev.location ? ` · ${ev.location}` : ''}</div>
                        <div className="text-xs text-muted-foreground mt-1">Started {new Date(ev.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
                      </div></div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center w-11 h-11 rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400 shrink-0">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold">Events</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">{upcoming.length} upcoming event{upcoming.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> Create Event</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Event</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label>Cover image (optional)</Label>
                {form.image_url ? (
                  <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border mt-1.5">
                    <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setForm((f) => ({ ...f, image_url: '' }))} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <label className="mt-1.5 flex items-center justify-center gap-2 h-20 rounded-lg border border-dashed border-input text-sm text-muted-foreground cursor-pointer hover:bg-accent">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                    {uploading ? 'Uploading…' : 'Add a cover image'}
                    <input type="file" accept="image/*" className="hidden" onChange={uploadImage} disabled={uploading} />
                  </label>
                )}
              </div>
              <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
              <div>
                <Label>Host (optional)</Label>
                <select value={form.club_id} onChange={(e) => setForm({ ...form, club_id: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm">
                  <option value="">Community Event (no club)</option>
                  {myClubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm">
{eventTypes.filter((t) => t.enabled !== false).map((t) => <option key={t.id || t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
                <div><Label>Date & Time *</Label><Input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
              </div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label>Description</Label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary/40 outline-none" /></div>
              <DialogFooter><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Event'}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <button onClick={() => setView('list')} className={`px-4 h-9 rounded-md text-sm font-semibold transition-colors ${view === 'list' ? 'bg-navy text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>List</button>
          <button onClick={() => setView('calendar')} className={`px-4 h-9 rounded-md text-sm font-semibold transition-colors ${view === 'calendar' ? 'bg-navy text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Calendar</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {view === 'list' && (
            <div className="relative w-full sm:w-64">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events…" className="h-9" />
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0">{typeFilter === 'All' ? 'Filter' : typeFilter} <ChevronDown className="w-3.5 h-3.5 ml-1.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Event Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={typeFilter} onValueChange={setTypeFilter}>
                <DropdownMenuRadioItem value="All">All Types</DropdownMenuRadioItem>
                {eventTypes.map((t) => <DropdownMenuRadioItem key={t.id || t.name} value={t.name}>{t.name}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={() => downloadICS(upcoming)} disabled={upcoming.length === 0} className="text-muted-foreground shrink-0">
            <Download className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {view === 'calendar' ? (
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="font-heading font-semibold text-lg">{calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
            <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {WEEKDAYS.map((d) => (
              <div key={d} className="bg-muted text-center py-2 text-[10px] sm:text-xs font-semibold text-muted-foreground">
                <span className="sm:hidden">{d.slice(0, 1)}</span>
                <span className="hidden sm:inline">{d}</span>
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const inMonth = day.getMonth() === calMonth.getMonth();
              const dayEvents = byDay.get(dateKey(day)) || [];
              const isToday = dateKey(day) === dateKey(new Date());
              return (
                <div key={i} className={`bg-card min-h-[52px] sm:min-h-[92px] p-1 sm:p-1.5 ${!inMonth ? 'opacity-40' : ''}`}>
                  <div className={`text-right text-[10px] sm:text-xs font-medium mb-1 ${isToday ? 'inline-flex float-right items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-primary text-primary-foreground' : ''}`}>{day.getDate()}</div>
                  <div className="clear-both space-y-0.5">
                    {dayEvents.length > 0 && (
                      <div className="sm:hidden flex justify-center gap-0.5 flex-wrap">
                        {dayEvents.slice(0, 4).map((ev) => (
                          <button key={ev.id} onClick={() => openDetail(ev)} title={ev.title} className={`w-1.5 h-1.5 rounded-full ${typeColorFor(ev.type)}`} />
                        ))}
                      </div>
                    )}
                    <div className="hidden sm:block space-y-0.5">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <button key={ev.id} onClick={() => openDetail(ev)} className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate ${typeColorFor(ev.type)}`}>{ev.title}</button>
                      ))}
                      {dayEvents.length > 2 && <div className="text-[10px] text-muted-foreground px-1.5">+{dayEvents.length - 2} more</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (        <div className="grid lg:grid-cols-[1fr_300px] gap-8 items-start">
          <div>
            {loading ? (
              <div className="space-y-5">{[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}</div>
            ) : upcoming.length === 0 ? (
              <div className="text-center text-muted-foreground py-16">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-40" />
                No upcoming events match your filters.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {upcoming.map((ev) => {
                  const d = new Date(ev.date);
                  return (
                    <div
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openDetail(ev)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(ev); } }}
                      className="flex gap-4 sm:gap-5 py-5 first:pt-0 cursor-pointer hover:bg-accent/40 -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <div className={`w-28 h-24 sm:w-52 sm:h-32 rounded-lg overflow-hidden shrink-0 grid place-items-center ${typeColorFor(ev.type)}`}>
                        {ev.image_url ? <img src={ev.image_url} alt="" className="w-full h-full object-cover" /> : <CalendarDays className="w-7 h-7 opacity-60" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-heading font-semibold text-primary">{ev.title}</div>
                          {(ev.created_by_id === user?.id || canModerate) && (
                            <button onClick={(e) => { e.stopPropagation(); deleteEvent(ev); }} className="p-1 -m-1 text-muted-foreground hover:text-destructive shrink-0" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                        <div className="text-sm font-medium mt-1">{d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
                        {ev.club_id ? (
                          <Link to={`/clubs/${ev.club_id}`} onClick={(e) => e.stopPropagation()} className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1 mt-0.5"><Users className="w-3 h-3" /> {clubName(ev.club_id) || 'Club event'}</Link>
                        ) : ev.location ? (
                          <div className="text-sm font-medium flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {ev.location}</div>
                        ) : null}
                        {ev.description && <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2"><Linkify text={ev.description} /></p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-muted/60 rounded-xl p-5 lg:sticky lg:top-4">
            <h3 className="font-heading font-semibold pb-3 mb-3 border-b border-border">This Week's Events</h3>
            {thisWeek.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events this week.</p>
            ) : (
              <div className="space-y-4">
                {thisWeek.map(([label, items]) => (
                  <div key={label}>
                    <div className="font-semibold text-sm mb-1.5">{label}</div>
                    <div className="space-y-2">
                      {items.map((ev) => (
                        <button key={ev.id} onClick={() => openDetail(ev)} className="flex items-baseline justify-between gap-2 w-full text-left">
                          <span className="text-sm text-primary hover:underline truncate">{ev.title}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{new Date(ev.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!detailEvent} onOpenChange={(o) => !o && openDetail(null)}>
        <DialogContent className="max-w-lg">
          {detailEvent && (
            <>
              {detailEvent.image_url && (
                <div className="w-full h-40 rounded-lg overflow-hidden -mt-2">
                  <img src={detailEvent.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <DialogHeader>
                <DialogTitle>{detailEvent.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground"><Clock className="w-4 h-4" /> {new Date(detailEvent.date).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                {detailEvent.club_id ? (
                  <Link to={`/clubs/${detailEvent.club_id}`} className="flex items-center gap-2 text-primary hover:underline w-fit"><Users className="w-4 h-4" /> {clubName(detailEvent.club_id) || 'Club event'}</Link>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground"><Users className="w-4 h-4" /> Community Event</div>
                )}
                {detailEvent.location && <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="w-4 h-4" /> {detailEvent.location}</div>}
                <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${typeColorFor(detailEvent.type)}`}>{detailEvent.type}</span>
                {detailEvent.description && <p className="text-foreground/90 whitespace-pre-wrap pt-2 leading-relaxed break-words"><Linkify text={detailEvent.description} /></p>}{detailEvent.description && <LinkPreviews text={detailEvent.description} />}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}