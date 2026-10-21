import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, MapPin, Plus, DollarSign } from 'lucide-react';
import ClubDialog from '@/components/clubs/ClubDialog';
import JoinClubDialog from '@/components/clubs/JoinClubDialog';
import RadioServiceBadges from '@/components/clubs/RadioServiceBadges';
import Linkify from '@/components/shared/Linkify';

const SERVICE_FILTERS = ['All', 'GMRS', 'HAM'];

export default function Clubs() {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [myMemberships, setMyMemberships] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [joinClub, setJoinClub] = useState(null);
  const [serviceFilter, setServiceFilter] = useState('All');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      // These requests do not depend on each other. Start them together so
      // page load is limited by the slowest request instead of their sum.
      const [list, u] = await Promise.all([
        base44.entities.Club.list(),
        base44.auth.me().catch(() => null),
      ]);

      setClubs(list || []);
      setUser(u);
      setLoading(false);

      // Memberships are only needed to change the buttons on the cards, so
      // don't block the initial club directory from rendering.
      if (u?.callsign) {
        base44.entities.Membership.filter({ member_callsign: u.callsign })
          .then((mems) => setMyMemberships(mems || []))
          .catch(() => setMyMemberships([]));
      } else {
        setMyMemberships([]);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const isMember = (clubId) => myMemberships.some((m) => m.club_id === clubId);

  const visibleClubs = serviceFilter === 'All'
    ? clubs
    : clubs.filter((c) => (c.radio_services?.length ? c.radio_services : ['GMRS']).includes(serviceFilter));

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Clubs</h1>
          <p className="text-muted-foreground mt-1">{visibleClubs.length} GMRS &amp; HAM clubs in the community</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Create a club
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        {SERVICE_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setServiceFilter(f)}
            className={`h-8 px-3 rounded-md text-sm font-medium transition-colors ${
              serviceFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted border border-input'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : visibleClubs.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          {clubs.length === 0 ? 'No clubs yet. Be the first to create one.' : `No ${serviceFilter} clubs yet.`}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleClubs.map((c) => {
            const fee = Number(c.membership_fee || 0);
            const member = isMember(c.id);
            return (
              <Card key={c.id} className="p-5 flex flex-col hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/clubs/${c.id}`)}>
                <div className="flex items-center gap-3">
                  <div className="grid place-items-center w-12 h-12 rounded-xl bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.name}</div>
                    {c.callsign && <div className="text-xs text-muted-foreground font-mono">{c.callsign}</div>}
                  </div>
                  <RadioServiceBadges services={c.radio_services} className="ml-auto shrink-0" />
                </div>
                {c.description && <p className="text-sm text-muted-foreground mt-3 line-clamp-2"><Linkify text={c.description} /></p>}
                <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                  {c.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.location}</span>}
                  <span>{c.members_count || 0} members</span>
                </div>
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className={fee > 0 ? 'font-semibold' : 'text-muted-foreground'}>
                      {fee === 0 ? 'Free' : `$${fee.toFixed(2)}`}
                      {fee > 0 && <span className="text-xs text-muted-foreground font-normal"> / {String(c.fee_period || 'One-time').toLowerCase()}</span>}
                    </span>
                  </div>
                  {member ? (
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/clubs/${c.id}`); }}>
                      Go to club
                    </Button>
                  ) : (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); setJoinClub(c); }}>
                      Join
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ClubDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} user={user} />
      <JoinClubDialog open={!!joinClub} onClose={() => setJoinClub(null)} club={joinClub} user={user} onJoined={load} />
    </div>
  );
}