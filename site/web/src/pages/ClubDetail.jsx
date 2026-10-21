import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users, MapPin, DollarSign, Plus, FileText, CalendarDays, ArrowLeft, Check, Lock, Trash2, Loader2, Crown, LogOut,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ClubCalendar from '@/components/clubs/ClubCalendar';
import ClubEventDialog from '@/components/clubs/ClubEventDialog';
import ClubPageDialog from '@/components/clubs/ClubPageDialog';
import ClubDiscussion from '@/components/clubs/ClubDiscussion';
import JoinClubDialog from '@/components/clubs/JoinClubDialog';
import ClubLeaderboard from '@/components/clubs/ClubLeaderboard';
import RadioServiceBadges from '@/components/clubs/RadioServiceBadges';
import ClubNets from '@/components/clubs/ClubNets';
import ClubPotaActivations from '@/components/pota/ClubPotaActivations';
import GamificationSettings from '@/components/clubs/GamificationSettings';
import StripeConnectButton from '@/components/clubs/StripeConnectButton';
import { formatOnlineStatus } from '@/lib/onlineStatus';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';
import ShareButton from '@/components/shared/ShareButton';
import { toast } from '@/components/ui/use-toast';

const BUILTIN_TABS = ['Overview', 'Calendar', 'Nets', 'POTA', 'Discussion', 'Members', 'Leaderboard'];

export default function ClubDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [pages, setPages] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Overview');
  const [showEvent, setShowEvent] = useState(false);
  const [showPage, setShowPage] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [callsignMap, setCallsignMap] = useState({});
  const [presence, setPresence] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [c, u] = await Promise.all([
        base44.entities.Club.get(id).catch(() => null),
        base44.auth.me().catch(() => null),
      ]);
      setClub(c); setUser(u);
      if (c) {
        const [mems, evs, pgs] = await Promise.all([
          base44.entities.Membership.filter({ club_id: id }).catch(() => []),
          base44.entities.Event.filter({ club_id: id }, 'date', 200).catch(() => []),
          base44.entities.ClubPage.filter({ club_id: id }, '-created_date', 100).catch(() => []),
        ]);
        setMembers(mems || []);
        setEvents(evs || []);
        setPages(pgs || []);
        const profiles = await base44.entities.Profile.list('-updated_date', 300).catch(() => []);
        const map = {};
        (profiles || []).forEach((p) => { if (p.callsign) map[p.callsign.toUpperCase()] = p.created_by_id; });
        setCallsignMap(map);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (tab.startsWith('page-') && !pages.some((p) => `page-${p.id}` === tab)) {
      setTab('Overview');
    }
  }, [tab, pages]);

  useEffect(() => {
    const ids = members.map((m) => m.member_callsign ? callsignMap[m.member_callsign.toUpperCase()] : null).filter(Boolean);
    if (!ids.length || !user) { setPresence({}); return; }
    let active = true;
    const fetchPresence = async () => {
      if (document.hidden) return; // don't poll from a background tab
      try {
        const r = await base44.functions.invoke('getFriendsPresence', { user_ids: ids, requester_id: user.id });
        const list = r?.data?.users || r?.users || [];
        if (!active) return;
        const map = {};
        list.forEach((u) => { map[u.id] = u; });
        setPresence(map);
      } catch (e) { console.error(e); }
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [members, callsignMap, user]);

  const isMember = !!user?.callsign && members.some((m) => m.member_callsign === user.callsign);
  const isCreator = !!user?.callsign && club?.creator_callsign === user.callsign;
  const isAdmin = user?.role === 'admin';
  const canAccess = isMember || isCreator || isAdmin;
  const fee = Number(club?.membership_fee || 0);

  const leaveClub = async () => {
    if (!isMember || isCreator) return;
    const myMembership = members.find((m) => m.member_callsign === user.callsign);
    if (!myMembership) return;
    if (!window.confirm(`Leave ${club.name}? You'll lose access to club pages, calendar, and the member roster.`)) return;
    setLeaving(true);
    try {
      await base44.functions.invoke('club-member-remove', { membershipId: myMembership.id, self: true });
      toast({ title: `You left ${club.name}` });
      await load();
    } catch (e) {
      toast({ title: e?.response?.data?.error || 'Could not leave club', variant: 'destructive' });
    }
    setLeaving(false);
  };

  const deleteClub = async () => {
    if (!isCreator) return;
    setDeleting(true);
    try {
      const threads = await base44.entities.ClubThread.filter({ club_id: id }).catch(() => []);
      await Promise.all([
        base44.entities.Membership.deleteMany({ club_id: id }).catch(() => {}),
        base44.entities.Event.deleteMany({ club_id: id }).catch(() => {}),
        base44.entities.ClubPage.deleteMany({ club_id: id }).catch(() => {}),
        ...(threads || []).map((t) => base44.entities.ClubThreadReply.deleteMany({ thread_id: t.id }).catch(() => {})),
        base44.entities.ClubThread.deleteMany({ club_id: id }).catch(() => {}),
      ]);
      await base44.entities.Club.delete(id);
      navigate('/clubs');
    } catch (e) {
      console.error(e);
      setDeleting(false);
    }
  };

  const deletePage = async (p) => {
    if (!p?.id) return;
    try { await base44.entities.ClubPage.delete(p.id); setPages((ps) => ps.filter((x) => x.id !== p.id)); } catch (e) { console.error(e); }
  };

  const canModerate = user?.role === 'admin' || user?.role === 'moderator' || user?.role === 'editor';

  if (loading) return <div className="p-8 max-w-6xl mx-auto"><div className="h-64 rounded-xl bg-muted animate-pulse" /></div>;
  if (!club) return (
    <div className="p-8 max-w-5xl mx-auto text-center text-muted-foreground">
      <p>Club not found.</p>
      <Link to="/clubs"><Button variant="outline" className="mt-4">Back to clubs</Button></Link>
    </div>
  );

  const upcoming = events
    .filter((e) => e.date && new Date(e.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto space-y-6">
      <Link to="/clubs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> All clubs</Link>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-5 sm:items-start justify-between">
          <div className="flex gap-4 min-w-0">
            {club.photo_url ? (
              <img src={club.photo_url} alt="" className="w-14 h-14 rounded-2xl object-cover shrink-0" />
            ) : (
              <div className="grid place-items-center w-14 h-14 rounded-2xl bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400 shrink-0"><Users className="w-7 h-7" /></div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-heading font-bold">{club.name}</h1>
                <RadioServiceBadges services={club.radio_services} />
              </div>
              {club.callsign && <div className="text-sm font-mono text-muted-foreground">{club.callsign}</div>}
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
                {club.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {club.location}</span>}
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {club.members_count || 0} members</span>
                <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> {fee === 0 ? 'Free' : `$${fee.toFixed(2)}`}{fee > 0 && ` / ${String(club.fee_period || 'One-time').toLowerCase()}`}</span>
              </div>
              {club.description && <p className="text-sm text-muted-foreground mt-3 max-w-2xl"><Linkify text={club.description} /></p>}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <ShareButton url={`${window.location.origin}/clubs/${club.id}`} title={club.name} text={club.description?.slice(0, 140)} />
            {isCreator && fee > 0 && (
              <StripeConnectButton club={club} user={user} onChanged={load} />
            )}
            {isCreator && (
              <Button variant="outline" size="sm" onClick={deleteClub} disabled={deleting} className="text-destructive hover:text-destructive">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4 mr-1.5" /> Delete club</>}
              </Button>
            )}
            {isCreator ? (
              <Badge className="bg-primary/15 text-primary hover:bg-primary/15"><Crown className="w-3.5 h-3.5 mr-1" /> Owner</Badge>
            ) : isMember ? (
              <>
                <Badge className="bg-success/15 text-success hover:bg-success/15"><Check className="w-3.5 h-3.5 mr-1" /> Member</Badge>
                <Button variant="outline" size="sm" onClick={leaveClub} disabled={leaving} className="text-destructive hover:text-destructive">
                  {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LogOut className="w-4 h-4 mr-1.5" /> Leave</>}
                </Button>
              </>
            ) : (
              <Button onClick={() => setJoinOpen(true)}>Join club</Button>
            )}
          </div>
        </div>
      </Card>

      {canAccess ? (
      <>
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-thin items-center">
        {BUILTIN_TABS.slice(0, 3).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t}</button>
        ))}
        {pages.map((p) => {
          const key = `page-${p.id}`;
          return (
            <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap max-w-[180px] ${tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{p.title}</span>
            </button>
          );
        })}
        {canAccess && (
          <button onClick={() => setShowPage(true)} className="px-3 py-2 text-sm border-b-2 -mb-px border-transparent text-muted-foreground hover:text-primary flex items-center gap-1 whitespace-nowrap" title="Add a page">
            <Plus className="w-4 h-4" />
          </button>
        )}
        {BUILTIN_TABS.slice(3).filter((t) => t !== 'Leaderboard' || club?.leaderboard_enabled).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t}</button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <h3 className="font-heading font-semibold mb-3">About</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{club.description || 'No description yet.'}</p>
            {club.officers && <div className="mt-4 text-sm"><span className="text-muted-foreground">Officers: </span>{club.officers}</div>}
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-semibold">Upcoming events</h3>
              <Button variant="ghost" size="sm" onClick={() => setTab('Calendar')}>Calendar</Button>
            </div>
            {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming events.</p> : (
              <div className="space-y-2">
                {upcoming.map((e) => (
                  <div key={e.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0"><CalendarDays className="w-4 h-4" /></div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{e.title}</div>
                      <div className="text-xs text-muted-foreground">{e.date ? format(new Date(e.date), 'EEE, MMM d · h:mm a') : ''}{e.location ? ` · ${e.location}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-semibold">Newest members</h3>
            <Button variant="ghost" size="sm" onClick={() => setTab('Members')}>All members</Button>
          </div>
          {members.length === 0 ? <p className="text-sm text-muted-foreground">No members yet.</p> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[...members]
                .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))
                .slice(0, 6)
                .map((m) => {
                  const uid = m.member_callsign ? callsignMap[m.member_callsign.toUpperCase()] : null;
                  const inner = (
                    <>
                      <div className="w-9 h-9 rounded-full bg-navy text-white grid place-items-center text-xs font-bold shrink-0">{(m.member_callsign || '?').slice(0, 3)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm font-mono flex items-center gap-1.5 min-w-0"><span className="truncate">{m.member_callsign || '—'}</span><StaffTag callsign={m.member_callsign} /></div>
                        <div className="text-xs text-muted-foreground truncate">{m.member_name || ''}</div>
                      </div>
                    </>
                  );
                  return uid ? (
                    <Link key={m.id} to={`/members/${uid}`} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary/50 transition-all">{inner}</Link>
                  ) : (
                    <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">{inner}</div>
                  );
                })}
            </div>
          )}
        </Card>
        {isCreator && (
          <GamificationSettings club={club} onSaved={load} />
        )}
        </>
      )}

      {tab === 'Calendar' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold">Club calendar</h3>
            {canAccess && <Button size="sm" onClick={() => setShowEvent(true)}><Plus className="w-4 h-4 mr-1.5" /> Add event</Button>}
          </div>
          <ClubCalendar events={events} />
        </Card>
      )}

      {tab.startsWith('page-') && (() => {
        const p = pages.find((x) => `page-${x.id}` === tab);
        if (!p) return null;
        const canDelete = p.created_by_id === user?.id || p.author_callsign === user?.callsign || canModerate;
        return (
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3 mb-4 pb-4 border-b border-border">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-semibold text-xl truncate">{p.title}</h3>
                  {p.page_type && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">{p.page_type}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">by {p.author_callsign || p.author_name || '—'}<StaffTag userId={p.created_by_id} callsign={p.created_by_id ? undefined : p.author_callsign} /></div>
              </div>
              {canDelete && (
                <button onClick={() => { deletePage(p); setTab('Overview'); }} className="p-2 text-muted-foreground hover:text-destructive shrink-0" title="Delete page"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ node, ...props }) => <h1 className="text-2xl font-heading font-bold mt-4 mb-2" {...props} />,
                  h2: ({ node, ...props }) => <h2 className="text-xl font-heading font-semibold mt-4 mb-2" {...props} />,
                  h3: ({ node, ...props }) => <h3 className="text-lg font-heading font-semibold mt-3 mb-1.5" {...props} />,
                  p: ({ node, ...props }) => <p className="text-sm leading-relaxed mb-3" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc pl-5 text-sm mb-3 space-y-1" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal pl-5 text-sm mb-3 space-y-1" {...props} />,
                  a: ({ node, ...props }) => <a className="text-primary underline break-words" {...props} target="_blank" rel="noopener noreferrer nofollow ugc" />,
                  code: ({ node, ...props }) => <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono" {...props} />,
                  blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-primary pl-4 italic text-muted-foreground my-3" {...props} />,
                }}
              >
                {p.body || ''}
              </ReactMarkdown>
            </div>
          </Card>
        );
      })()}

      {tab === 'Nets' && (
        <ClubNets clubId={id} canManage={isCreator || canModerate} />
      )}

      {tab === 'POTA' && (
        <ClubPotaActivations clubId={id} canManage={isCreator || canModerate} />
      )}

      {tab === 'Discussion' && (
        <ClubDiscussion club={club} user={user} canModerate={canModerate} />
      )}

      {tab === 'Members' && (() => {
        const ownerInMembers = members.some((m) => m.member_callsign === club.creator_callsign);
        const ownerEntry = ownerInMembers ? null : { id: '__owner__', member_callsign: club.creator_callsign, member_name: '', __owner: true };
        const allMembers = ownerEntry ? [ownerEntry, ...members] : members.map((m) => m.member_callsign === club.creator_callsign ? { ...m, __owner: true } : m);
        return (
        <Card className="p-5">
          <h3 className="font-heading font-semibold mb-3">{allMembers.length} members</h3>
          {allMembers.length === 0 ? <p className="text-sm text-muted-foreground">No members yet.</p> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {allMembers.map((m) => {
                const userId = m.member_callsign ? callsignMap[m.member_callsign.toUpperCase()] : null;
                const inner = (
                  <>
                    <div className={`w-9 h-9 rounded-full grid place-items-center text-xs font-bold ${m.__owner ? 'bg-primary text-primary-foreground' : 'bg-navy text-white'}`}>{(m.member_callsign || '?').slice(0, 3)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm font-mono flex items-center gap-1.5 min-w-0"><span className="truncate">{m.member_callsign || '—'}</span><StaffTag callsign={m.member_callsign} /></div>
                      <div className="text-xs text-muted-foreground truncate">{m.member_name || ''}</div>
                      {(() => {
                        const uid = m.member_callsign ? callsignMap[m.member_callsign.toUpperCase()] : null;
                        const la = uid ? presence[uid]?.last_active : null;
                        if (!la) return null;
                        const st = formatOnlineStatus(la);
                        return <div className={`text-[11px] mt-0.5 ${st.online ? 'text-success font-medium' : 'text-muted-foreground'}`}>{st.online ? '🟢 Online' : st.text}</div>;
                      })()}
                    </div>
                    {m.__owner ? (
                      <Badge className="bg-primary/15 text-primary hover:bg-primary/15 shrink-0"><Crown className="w-3 h-3 mr-1" />Owner</Badge>
                    ) : (m.role === 'Officer' || m.role === 'Admin') ? (
                      <Badge className={`shrink-0 ${m.role === 'Admin' ? 'bg-primary/15 text-primary hover:bg-primary/15' : 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400'}`}>{m.role}</Badge>
                    ) : null}
                  </>
                );
                return userId ? (
                  <Link key={m.id} to={`/members/${userId}`} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary/50 hover:shadow-sm transition-all">{inner}</Link>
                ) : (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">{inner}</div>
                );
              })}
            </div>
          )}
        </Card>
        );
      })()}
      {tab === 'Leaderboard' && club?.leaderboard_enabled && (
        <ClubLeaderboard clubId={id} />
      )}
      </>
      ) : (
        <Card className="p-8 text-center">
          <div className="grid place-items-center w-12 h-12 rounded-2xl bg-muted text-muted-foreground mx-auto mb-4"><Lock className="w-6 h-6" /></div>
          <h3 className="font-heading font-semibold text-lg">Join {club.name} to see more</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">Members get access to the club calendar, club pages, and the member roster.</p>
          <Button className="mt-5" onClick={() => setJoinOpen(true)}>
            {fee === 0 ? 'Join for free' : `Join · $${fee.toFixed(2)} / ${String(club.fee_period || 'one-time').toLowerCase()}`}
          </Button>
        </Card>
      )}

      <ClubEventDialog open={showEvent} onClose={() => setShowEvent(false)} club={club} user={user} onCreated={load} />
      <ClubPageDialog open={showPage} onClose={() => setShowPage(false)} club={club} user={user} onCreated={load} />
      <JoinClubDialog open={joinOpen} onClose={() => setJoinOpen(false)} club={club} user={user} onJoined={load} />
    </div>
  );
}