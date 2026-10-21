import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import WhatsNewBanner from '@/components/dashboard/WhatsNewBanner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  RadioTower, Cpu, CalendarDays, MapPin, Clock, BookOpen, Users, Star, Info, Trophy,
  BadgeCheck, AlertTriangle, ShieldCheck, Lock, Check, X, Mail,
} from 'lucide-react';
import { formatOnlineStatus } from '@/lib/onlineStatus';
import InstallButton from '@/components/InstallButton';
import ProfilePostComposer from '@/components/dashboard/ProfilePostComposer';
import ProfileFeed from '@/components/dashboard/ProfileFeed';
import LeaderboardWidget from '@/components/dashboard/LeaderboardWidget';
import AnnouncementPopup from '@/components/AnnouncementPopup';
import StaffTag from '@/components/shared/StaffTag';

// The Repeaters page keeps favorites per service (gmrs_fav_repeaters,
// ham_fav_repeaters); show both here.
const FAV_KEYS = ['gmrs_fav_repeaters', 'ham_fav_repeaters'];
const getFavs = () => {
  const ids = [];
  for (const key of FAV_KEYS) {
    try { ids.push(...JSON.parse(localStorage.getItem(key) || '[]')); } catch { /* ignore a corrupt list */ }
  }
  return [...new Set(ids.filter(Boolean).map(String))];
};
// Load exactly the favorited repeaters (one bulk read) instead of scanning
// the top-rated few hundred, which missed most favorites. Keeps the order
// they were starred in.
const loadFavRepeaters = async (favIds) => {
  if (!favIds.length) return [];
  const rows = await base44.entities.Repeater.filter({ id: { $in: favIds.slice(0, 200) } }, undefined, 200).catch(() => []);
  const byId = new Map((rows || []).map((r) => [String(r.id), r]));
  return favIds.map((id) => byId.get(id)).filter(Boolean);
};
const daysUntil = (date) => { if (!date) return null; return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000); };

function StatMini({ icon: Icon, label, value, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1 rounded-lg p-2.5 hover:bg-accent transition-colors">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <div className="text-lg font-heading font-bold leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </button>
  );
}

function Section({ title, icon: Icon, tint, action, children }) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${tint || 'bg-primary/10 text-primary'}`}>
              <Icon className="w-4 h-4" />
            </div>
          )}
          <h3 className="font-heading font-semibold text-base">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [events, setEvents] = useState([]);
  const [favRepeaters, setFavRepeaters] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedRefresh, setFeedRefresh] = useState(0);
  const navigate = useNavigate();


  const loadData = useCallback(async () => {
      setLoading(true);
      try {
        const me = await base44.auth.me();
        setUser(me);
        const favIds = getFavs();
        // last_active is kept by AuthContext's activity heartbeat, which already
        // saved it when this page opened.
        const repeaterPromise = loadFavRepeaters(favIds);
        const [c, eq, ev, allRep, reqs, sentFs, receivedFs, profiles, mems, ownedClubs] = await Promise.all([
          base44.entities.ContactLog.filter({ created_by_id: me.id }, '-date', 20).catch(() => []),
          base44.entities.Equipment.filter({ created_by_id: me.id }, '-updated_date', 100).catch(() => []),
          base44.entities.Event.list('-date', 20).catch(() => []),
          repeaterPromise,
          base44.entities.RepeaterAccessRequest.filter({ owner_id: me.id, status: 'Pending' }, '-created_date', 50).catch(() => []),
          base44.entities.Friendship.filter({ requester_id: me.id, status: 'accepted' }, '-created_date', 200).catch(() => []),
          base44.entities.Friendship.filter({ recipient_id: me.id, status: 'accepted' }, '-created_date', 200).catch(() => []),
          base44.entities.Profile.filter({ created_by_id: me.id }, '-updated_date', 1).catch(() => []),
          base44.entities.Membership.filter({ member_callsign: me.callsign }).catch(() => []),
          base44.entities.Club.filter({ created_by_id: me.id }).catch(() => []),
        ]);
        const visibleClubIds = new Set([
          ...((mems || []).map((m) => m.club_id).filter(Boolean)),
          ...((ownedClubs || []).map((cl) => cl.id)),
        ]);
        const now = new Date();
        const visibleEvents = (ev || [])
          .filter((e) => new Date(e.date) >= now)
          .filter((e) => !e.club_id || visibleClubIds.has(e.club_id) || me.role === 'admin')
          .slice(0, 15);
        if (profiles?.[0]) {
          setUser({ ...me, display_name: profiles[0].display_name, avatar_url: profiles[0].avatar_url });
        }
        setContacts(c);
        setEquipment(eq);
        setEvents(visibleEvents);
        setFavRepeaters(allRep || []);
        setAccessRequests(reqs || []);
        const allFs = [...(sentFs || []), ...(receivedFs || [])];
        const friendIds = allFs.map(f => f.requester_id === me.id ? f.recipient_id : f.requester_id).filter(Boolean);
        if (friendIds.length) {
          try {
            const presRes = await base44.functions.invoke('getFriendsPresence', { user_ids: friendIds, requester_id: me.id });
            const presence = presRes?.data?.users || presRes?.users || [];
            const pmap = {};
            presence.forEach(p => { pmap[p.id] = p; });
            setFriends(allFs.map(f => {
              const fid = f.requester_id === me.id ? f.recipient_id : f.requester_id;
              const p = pmap[fid] || {};
              return {
                id: fid,
                name: (f.requester_id === me.id ? f.recipient_name : f.requester_name) || p.full_name || 'Member',
                callsign: p.callsign || '',
                last_active: p.last_active || null,
              };
            }));
          } catch (e) { console.error(e); }
        }
      } catch (err) { console.error(err); }
      setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const userRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);

  const silentRefresh = useCallback(async () => {
    try {
      const me = userRef.current || await base44.auth.me();
      const favIds = getFavs();
      const repeaterPromise = loadFavRepeaters(favIds);
      const [c, eq, ev, allRep, reqs] = await Promise.all([
        base44.entities.ContactLog.filter({ created_by_id: me.id }, '-date', 20).catch(() => []),
        base44.entities.Equipment.filter({ created_by_id: me.id }, '-updated_date', 100).catch(() => []),
        base44.entities.Event.list('-date', 20).catch(() => []),
        repeaterPromise,
        base44.entities.RepeaterAccessRequest.filter({ owner_id: me.id, status: 'Pending' }, '-created_date', 50).catch(() => []),
      ]);
      const now = new Date();
      const visibleEvents = (ev || []).filter((e) => new Date(e.date) >= now).slice(0, 15);
      setContacts(c);
      setEquipment(eq);
      setEvents(visibleEvents);
      setFavRepeaters(allRep || []);
      setAccessRequests(reqs || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    let timer = null;
    // These tables change site-wide (any member's log, any repeater sync),
    // and each refresh is 5 queries -- so only changes that can show up on
    // this member's dashboard count, bursts are batched, and hidden tabs skip.
    const scheduleReload = () => {
      if (timer || document.hidden) return;
      timer = setTimeout(() => { timer = null; silentRefresh(); }, 3000);
    };
    const myId = () => userRef.current?.id;
    // Which events concern this dashboard. An event without its record (or
    // with one cut down to fit the realtime channel), or one that arrives
    // before the member has loaded, can't be checked, so it counts.
    const concerns = {
      ContactLog: (row) => row.created_by_id === myId(),
      Equipment: (row) => row.created_by_id === myId(),
      RepeaterAccessRequest: (row) => row.owner_id === myId(),
      Repeater: (row) => getFavs().includes(String(row.id)),
      Event: () => true,
    };
    const unsubscribers = Object.entries(concerns).map(([name, test]) =>
      base44.entities[name].subscribe((event) => {
        const row = event?.data;
        if (row && !row._oversize && myId() && !test(row)) return;
        scheduleReload();
      }));
    return () => { unsubscribers.forEach((u) => u && u()); if (timer) clearTimeout(timer); };
  }, [silentRefresh]);

  // Friends' presence was only ever fetched once, on the initial load, so a
  // friend who came online (or went idle/offline) after that stayed frozen
  // at whatever their status was when the page loaded. Poll it separately.
  const friendIdsRef = useRef([]);
  useEffect(() => { friendIdsRef.current = friends.map((f) => f.id); }, [friends]);

  useEffect(() => {
    if (!user?.id) return;
    const refreshPresence = async () => {
      if (document.hidden) return; // don't poll from a background tab
      const ids = friendIdsRef.current;
      if (!ids.length) return;
      try {
        const presRes = await base44.functions.invoke('getFriendsPresence', { user_ids: ids, requester_id: user.id });
        const presence = presRes?.data?.users || presRes?.users || [];
        const pmap = {};
        presence.forEach((p) => { pmap[p.id] = p; });
        setFriends((prev) => prev.map((f) => (pmap[f.id] ? { ...f, last_active: pmap[f.id].last_active ?? null } : f)));
      } catch (e) { console.error(e); }
    };
    const interval = setInterval(refreshPresence, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const handleRequest = async (req, status) => {
    try {
      await base44.entities.RepeaterAccessRequest.update(req.id, { status });
      base44.functions.invoke('notify-access-decision', { request_id: req.id }).catch((err) => {
        console.error('[Dashboard] access decision notification failed:', err);
      });
      setAccessRequests((rs) => rs.filter((r) => r.id !== req.id));
    } catch (err) { console.error(err); }
  };

  const licenseStatus = user?.license_status || 'Unverified';
  const days = daysUntil(user?.license_expiry);
  const licenseWarn = licenseStatus === 'Active' && days !== null && days <= 90;
  const licenseNeedsAttention = licenseStatus !== 'Active' || licenseWarn;
  const displayName = user?.display_name || user?.full_name || user?.email || 'Operator';
  const firstName = displayName.split(' ')[0];
  const callsign = user?.callsign;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <AnnouncementPopup />
      <div className="flex items-center justify-between gap-4 flex-wrap pb-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
            Welcome back, {firstName}
            {callsign && <span className="text-muted-foreground font-mono text-lg ml-2">{callsign}</span>}
          </h1>
          <p className="text-muted-foreground mt-1">Your personal GMRS and HAM command center.</p>
        </div>
        <div className="flex items-center gap-2">
          <InstallButton />
          <Button variant="outline" onClick={() => navigate('/settings')}>
            <BadgeCheck className="w-4 h-4 mr-2" /> Edit Profile
          </Button>
        </div>
      </div>

      <WhatsNewBanner />

      <div className="grid lg:grid-cols-[260px_1fr_300px] gap-5 lg:gap-6 items-start">
        {/* Left rail: identity + quick links */}
        <div className="space-y-5 lg:sticky lg:top-4 order-1">
          <Card className="overflow-hidden shadow-sm">
            <div className="h-14 bg-gradient-to-r from-navy to-navy-light" />
            <div className="px-5 pb-5 -mt-8 text-center">
              <div className="w-16 h-16 rounded-full mx-auto bg-primary text-primary-foreground grid place-items-center font-heading font-bold text-xl overflow-hidden shadow-lg border-4 border-card">
                {user?.avatar_url ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" /> : initial}
              </div>
              <h2 className="font-heading font-semibold mt-2.5 flex items-center justify-center gap-1.5 min-w-0"><span className="truncate">{displayName}</span><StaffTag userId={user?.id} /></h2>
              {callsign && <div className="text-xs font-mono text-muted-foreground mt-0.5">{callsign}</div>}
              <span className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-[11px] font-medium ${licenseStatus === 'Active' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                {licenseStatus === 'Active' ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />} {licenseStatus}
              </span>

              <div className="grid grid-cols-2 gap-1 mt-4 pt-4 border-t border-border">
                <StatMini icon={BookOpen} label="Contacts" value={contacts.length} onClick={() => navigate('/logbook')} />
                <StatMini icon={Cpu} label="Equipment" value={equipment.length} onClick={() => navigate('/equipment')} />
                <StatMini icon={Star} label="Favorites" value={favRepeaters.length} onClick={() => navigate('/repeaters')} />
                <StatMini icon={CalendarDays} label="Events" value={events.length} onClick={() => navigate('/events')} />
              </div>

              {user?.id && (
                <Button variant="outline" size="sm" className="w-full mt-4" onClick={() => navigate(`/members/${user.id}`)}>
                  View public profile
                </Button>
              )}
            </div>
          </Card>

          <Section title="Friends" icon={Users} tint="bg-navy/10 text-navy dark:bg-navy-light/30 dark:text-sidebar-foreground" action={<Button variant="ghost" size="sm" onClick={() => navigate('/directory')}>Find</Button>}>
            {loading ? <Skeleton /> : friends.length === 0 ? <Empty text="No friends yet — add members from the directory" /> : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {friends.map((f) => {
                  const status = formatOnlineStatus(f.last_active);
                  return (
                    <div key={f.id} className="flex items-center gap-3 py-1">
                      <div className="relative w-9 h-9 rounded-full bg-navy text-white grid place-items-center font-bold text-xs shrink-0">
                        {(f.name || f.callsign || '?').slice(0, 2).toUpperCase()}
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${status.online ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm flex items-center gap-1.5 min-w-0"><span className="truncate">{f.name}</span><StaffTag userId={f.id} compact /></div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          {f.callsign && <span className="font-mono">{f.callsign} · </span>}
                          <span className={status.online ? 'text-success font-medium' : ''}>{status.online ? 'Online' : status.text}</span>
                        </div>
                      </div>
                      <button onClick={() => navigate(`/messages?u=${f.id}`)} className="p-1.5 text-muted-foreground hover:text-primary shrink-0" title="Message">
                        <Mail className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="My Recent Contacts" icon={BookOpen} tint="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400" action={<Button variant="ghost" size="sm" onClick={() => navigate('/logbook')}>View all</Button>}>
            {loading ? <Skeleton /> : contacts.length === 0 ? <Empty text="No contacts logged yet" /> : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {contacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 grid place-items-center font-bold text-xs shrink-0">{c.callsign?.slice(0, 4)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{c.callsign}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {c.date ? new Date(c.date).toLocaleString() : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="My Equipment" icon={Cpu} tint="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400" action={<Button variant="ghost" size="sm" onClick={() => navigate('/equipment')}>Manage</Button>}>
            {loading ? <Skeleton /> : equipment.length === 0 ? <Empty text="No equipment tracked yet" /> : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {equipment.map((it) => (
                  <div key={it.id} className="flex items-center gap-3 py-1">
                    <div className="w-9 h-9 rounded-lg bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400 grid place-items-center shrink-0"><Cpu className="w-4 h-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{it.name}</div>
                      <div className="text-xs text-muted-foreground">{it.manufacturer} {it.model}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Main column: alerts, notifications, feed */}
        <div className="space-y-5 order-3 lg:order-2 min-w-0">
          {licenseNeedsAttention && (
            <Card className={`p-4 sm:p-5 ${licenseWarn ? 'border-orange-400/40 bg-orange-50 dark:bg-orange-950/20' : 'border-blue-400/30 bg-blue-50/50 dark:bg-blue-950/20'}`}>
              <div className="flex items-center gap-4 flex-wrap">
                <div className={`grid place-items-center w-11 h-11 rounded-xl shrink-0 ${licenseWarn ? 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400'}`}>
                  {licenseWarn ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-semibold">FCC License</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">{licenseStatus}</span>
                  </div>
                  {user?.license_number
                    ? <div className="text-xs text-muted-foreground font-mono mt-0.5">FRN/License: {user.license_number}</div>
                    : <div className="text-xs text-muted-foreground mt-0.5">No license on file — add it in your profile.</div>}
                </div>
                {days !== null && (
                  <div className="text-right">
                    <div className={`text-2xl font-heading font-bold ${licenseWarn ? 'text-orange-600 dark:text-orange-400' : ''}`}>{days}</div>
                    <div className="text-xs text-muted-foreground">days to expiry</div>
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>{days !== null ? 'Renew license' : 'Add license'}</Button>
              </div>
            </Card>
          )}

          {accessRequests.length > 0 && (
            <Card className="p-5 border-orange-400/40 bg-orange-50/40 dark:bg-orange-950/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="grid place-items-center w-11 h-11 rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-heading font-semibold text-[15px]">Access Requests</h3>
                  <p className="text-xs text-muted-foreground">{accessRequests.length} operator{accessRequests.length === 1 ? '' : 's'} want access to your closed repeaters</p>
                </div>
              </div>
              <div className="space-y-2.5">
                {accessRequests.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border">
                    <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 grid place-items-center shrink-0">
                      <RadioTower className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{req.requester_callsign || req.requester_name || 'Unknown operator'}</div>
                      <div className="text-xs text-muted-foreground truncate">wants access to {req.repeater_name} · {req.repeater_callsign}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="border-success text-success hover:bg-success/10" onClick={() => handleRequest(req, 'Granted')}>
                        <Check className="w-3.5 h-3.5 mr-1" /> Grant
                      </Button>
                      <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleRequest(req, 'Denied')}>
                        <X className="w-3.5 h-3.5 mr-1" /> Deny
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <ProfilePostComposer user={user} avatarUrl={user?.avatar_url} onPosted={() => setFeedRefresh((k) => k + 1)} />
          <ProfileFeed userId={user?.id} refreshKey={feedRefresh} />
        </div>

        {/* Right rail: glanceable widgets */}
        <div className="space-y-5 lg:sticky lg:top-4 order-2 lg:order-3">
          <Section title="Leaderboard" icon={Trophy} tint="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <LeaderboardWidget userId={user?.id} limit={10} scrollable />
          </Section>

          <Section title="Upcoming Events" icon={CalendarDays} tint="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400" action={<Button variant="ghost" size="sm" onClick={() => navigate('/events')}>View all</Button>}>
            {loading ? <Skeleton /> : events.length === 0 ? <Empty text="No events scheduled" /> : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400 grid place-items-center shrink-0"><CalendarDays className="w-4 h-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{ev.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {ev.date ? new Date(ev.date).toLocaleString() : 'TBD'}</div>
                      {ev.location && <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.location}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Favorite Repeaters" icon={RadioTower} tint="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400" action={<Button variant="ghost" size="sm" onClick={() => navigate('/repeaters')}>Browse</Button>}>
            {loading ? <Skeleton /> : favRepeaters.length === 0 ? <Empty text="No favorites yet — star repeaters you use often" /> : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {favRepeaters.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 grid place-items-center shrink-0"><RadioTower className="w-4 h-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.frequency} MHz{r.radio_service === 'HAM' ? ' · HAM' : ''}</div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${r.status === 'Online' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Skeleton() { return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />)}</div>; }
function Empty({ text }) { return <div className="text-sm text-muted-foreground py-6 text-center">{text}</div>; }
