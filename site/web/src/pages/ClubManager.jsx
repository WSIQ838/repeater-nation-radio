import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Settings as SettingsIcon, FileText, CalendarDays, Users, ChevronDown, UserCog, LayoutDashboard, Megaphone, DollarSign } from 'lucide-react';
import ClubDashboardTab from '@/components/clubs/ClubDashboardTab';
import ClubSettingsForm from '@/components/clubs/ClubSettingsForm';
import ClubPagesManager from '@/components/clubs/ClubPagesManager';
import ClubEventsManager from '@/components/clubs/ClubEventsManager';
import ClubMembersManager from '@/components/clubs/ClubMembersManager';
import ClubNetAttendance from '@/components/clubs/ClubNetAttendance';
import ClubFinanceManager from '@/components/clubs/ClubFinanceManager';

const TABS = [
  { key: 'Dashboard', icon: LayoutDashboard },
  { key: 'Settings', icon: SettingsIcon },
  { key: 'Pages', icon: FileText },
  { key: 'Events', icon: CalendarDays },
  { key: 'Members', icon: Users },
  { key: 'Finance', icon: DollarSign },
  { key: 'Net Attendance', icon: Megaphone },
];

export default function ClubManager() {
  const [user, setUser] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [clubRoles, setClubRoles] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Dashboard');

  const loadClubs = async (u) => {
    const all = await base44.entities.Club.list('-created_date', 200).catch(() => []);
    const memberships = u.callsign
      ? await base44.entities.Membership.filter({ member_callsign: u.callsign }, '-created_date', 500).catch(() => [])
      : [];

    // Owners, Admins, and Officers can all get into Club Manager — plain
    // Members cannot.
    const staffRoleByClub = new Map(
      (memberships || [])
        .filter((m) => ['Admin', 'Officer'].includes(m.role) && String(m.status || 'Active') === 'Active')
        .map((m) => [m.club_id, m.role])
    );

    const nextRoles = {};
    const mine = (all || []).filter((c) => {
      const isOwner = c.created_by_id === u.id || (u.callsign && c.creator_callsign === u.callsign);
      const staffRole = staffRoleByClub.get(c.id);

      if (isOwner) nextRoles[c.id] = 'Owner';
      else if (staffRole) nextRoles[c.id] = staffRole;

      return isOwner || !!staffRole;
    });

    setClubRoles(nextRoles);
    setClubs(mine);
    if (mine.length && !selectedId) setSelectedId(mine[0].id);
  };

  useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me().catch(() => null);
        setUser(u);
        if (u) await loadClubs(u);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const club = clubs.find((c) => c.id === selectedId);
  const refreshClubs = async () => { if (user) await loadClubs(user); };

  if (loading) return <div className="p-8 max-w-6xl mx-auto"><div className="h-64 rounded-xl bg-muted animate-pulse" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  if (clubs.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center space-y-4">
        <div className="grid place-items-center w-16 h-16 rounded-2xl bg-muted text-muted-foreground mx-auto"><UserCog className="w-8 h-8" /></div>
        <h1 className="text-2xl font-heading font-bold">Club Manager</h1>
        <p className="text-muted-foreground">You don't own, administer, or serve as an officer for any clubs.</p>
        <Button asChild><Link to="/clubs">Browse clubs</Link></Button>
      </div>
    );
  }

  const managerUser = { ...user, club_manager_role: club ? clubRoles[club.id] : null };

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Club Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your clubs, pages, events, members, finances, and net attendance.</p>
        </div>
        <div className="relative">
          <select
            value={selectedId || ''}
            onChange={(e) => { setSelectedId(e.target.value); setTab('Settings'); }}
            className="appearance-none h-10 pl-4 pr-10 rounded-lg border border-input bg-card text-sm font-medium max-w-[220px]"
          >
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {club && (
        <>
          <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-thin">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                <t.icon className="w-4 h-4" /> {t.key}
              </button>
            ))}
          </div>
          {tab === 'Dashboard' && <ClubDashboardTab club={club} user={managerUser} setTab={setTab} />}
          {tab === 'Settings' && <ClubSettingsForm club={club} user={managerUser} onChanged={refreshClubs} />}
          {tab === 'Pages' && <ClubPagesManager club={club} user={managerUser} />}
          {tab === 'Events' && <ClubEventsManager club={club} user={managerUser} />}
          {tab === 'Members' && <ClubMembersManager club={club} user={managerUser} />}
          {tab === 'Finance' && <ClubFinanceManager club={club} user={managerUser} />}
          {tab === 'Net Attendance' && <ClubNetAttendance club={club} />}
        </>
      )}
    </div>
  );
}