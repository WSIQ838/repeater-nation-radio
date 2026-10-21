import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, FileText, CalendarDays, DollarSign, TrendingUp, ArrowRight, Shield } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';

export default function ClubDashboardTab({ club, user, setTab }) {
  const [members, setMembers] = useState([]);
  const [pages, setPages] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [mems, pgs, evs] = await Promise.all([
          base44.entities.Membership.filter({ club_id: club.id }).catch(() => []),
          base44.entities.ClubPage.filter({ club_id: club.id }, '-created_date', 5).catch(() => []),
          base44.entities.Event.filter({ club_id: club.id }, 'date', 5).catch(() => []),
        ]);
        setMembers(mems || []);
        setPages(pgs || []);
        setEvents(evs || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [club.id]);

  const fee = Number(club.membership_fee || 0);
  const officers = members.filter((m) => m.role === 'Officer' || m.role === 'Admin');
  const paidMembers = members.filter((m) => m.payment_status === 'Paid');
  const revenue = paidMembers.reduce((sum, m) => sum + Number(m.fee_amount || 0), 0);
  const upcoming = events.filter((e) => e.date && new Date(e.date) >= new Date());

  const stats = [
    { label: 'Total members', value: members.length, icon: Users, color: 'text-blue-600 bg-blue-100 dark:bg-blue-950', action: () => setTab('Members') },
    { label: 'Staff', value: officers.length, icon: Shield, color: 'text-primary bg-primary/10', action: () => setTab('Members') },
    { label: 'Club pages', value: pages.length, icon: FileText, color: 'text-purple-600 bg-purple-100 dark:bg-purple-950', action: () => setTab('Pages') },
    { label: 'Upcoming events', value: upcoming.length, icon: CalendarDays, color: 'text-green-600 bg-green-100 dark:bg-green-950', action: () => setTab('Events') },
  ];

  if (loading) return <div className="h-48 rounded-xl bg-muted animate-pulse" />;

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <button key={s.label} onClick={s.action} className="text-left">
            <Card className="p-4 hover:shadow-md transition-shadow h-full">
              <div className={`w-9 h-9 rounded-lg grid place-items-center mb-3 ${s.color}`}>
                <s.icon className="w-4.5 h-4.5" />
              </div>
              <div className="text-2xl font-heading font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </Card>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Revenue / membership info */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-success" />
            <h3 className="font-heading font-semibold">Membership</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fee</span>
              <span className="font-semibold">{fee === 0 ? 'Free' : `$${fee.toFixed(2)}`}{fee > 0 && ` / ${String(club.fee_period || 'one-time').toLowerCase()}`}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Paid members</span>
              <span className="font-semibold">{paidMembers.length}</span>
            </div>
            {fee > 0 && (
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-sm text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Total collected</span>
                <span className="font-semibold text-success">${revenue.toFixed(2)}</span>
              </div>
            )}
            {fee > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Stripe</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${club.stripe_charges_enabled ? 'bg-success/15 text-success' : 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400'}`}>
                  {club.stripe_charges_enabled ? 'Connected' : 'Not connected'}
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Staff */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-heading font-semibold">Staff</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setTab('Members')}>Manage <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button>
          </div>
          {officers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff assigned yet. Promote trusted members to Officer or Admin to help run the club.</p>
          ) : (
            <div className="space-y-2">
              {officers.slice(0, 5).map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-navy text-white grid place-items-center text-xs font-bold shrink-0">{(m.member_callsign || '?').slice(0, 3)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm font-mono flex items-center gap-1.5 min-w-0"><span className="truncate">{m.member_callsign}</span><StaffTag callsign={m.member_callsign} /></div>
                    <div className="text-xs text-muted-foreground truncate">{m.member_name || ''}</div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${m.role === 'Admin' ? 'bg-primary/15 text-primary' : 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400'}`}>{m.role}</span>
                </div>
              ))}
              {officers.length > 5 && <p className="text-xs text-muted-foreground pt-1">+{officers.length - 5} more</p>}
            </div>
          )}
        </Card>
      </div>

      {/* Recent pages & events */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              <h3 className="font-heading font-semibold">Recent pages</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setTab('Pages')}>All pages <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button>
          </div>
          {pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pages yet.</p>
          ) : (
            <div className="space-y-2">
              {pages.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{p.title}</span>
                  {p.page_type && <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">{p.page_type}</span>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-green-600" />
              <h3 className="font-heading font-semibold">Upcoming events</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setTab('Events')}>All events <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.slice(0, 5).map((e) => (
                <div key={e.id} className="flex items-center gap-3">
                  <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{e.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{e.date ? new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* View club link */}
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link to={`/clubs/${club.id}`}>View public club page <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
        </Button>
      </div>
    </div>
  );
}