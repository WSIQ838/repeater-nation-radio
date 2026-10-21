import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { DollarSign, AlertTriangle, CheckCircle2, Clock, UserPlus, UserMinus, LogOut, History, Lock } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import StaffTag from '@/components/shared/StaffTag';

const STATUSES = ['Free', 'Paid', 'Pending', 'Disputed'];
const STATUS_STYLE = {
  Free: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  Paid: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  Pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  Disputed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
};
const ACTION_STYLE = {
  Joined: { icon: UserPlus, tint: 'text-green-600' },
  Left: { icon: LogOut, tint: 'text-muted-foreground' },
  Removed: { icon: UserMinus, tint: 'text-destructive' },
};

export default function ClubFinanceManager({ club, user }) {
  const [members, setMembers] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const isOwner = user?.callsign && club.creator_callsign === user.callsign;
  const isAppAdmin = user?.role === 'admin';
  const canManage = isOwner || isAppAdmin;

  const load = async () => {
    setLoading(true);
    try {
      const [m, l] = await Promise.all([
        base44.entities.Membership.filter({ club_id: club.id }).catch(() => []),
        canManage
          ? base44.entities.ClubMembershipLog.filter({ club_id: club.id }, '-created_date', 200).catch(() => [])
          : Promise.resolve([]),
      ]);
      setMembers(m || []);
      setLog(l || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [club.id]);

  const setStatus = async (m, status) => {
    setSavingId(m.id);
    try {
      await base44.entities.Membership.update(m.id, { payment_status: status });
      setMembers((ms) => ms.map((x) => (x.id === m.id ? { ...x, payment_status: status } : x)));
      toast({ title: `${m.member_callsign} marked ${status}` });
    } catch (e) { toast({ title: 'Could not update payment status', variant: 'destructive' }); }
    setSavingId(null);
  };

  const paidCount = members.filter((m) => m.payment_status === 'Paid').length;
  const pendingCount = members.filter((m) => m.payment_status === 'Pending').length;
  const disputedCount = members.filter((m) => m.payment_status === 'Disputed').length;
  const totalCollected = members.reduce((sum, m) => sum + (m.payment_status === 'Paid' ? Number(m.fee_amount || 0) : 0), 0);

  if (loading) return <div className="h-32 rounded-xl bg-muted animate-pulse" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> Collected</div>
          <div className="text-2xl font-heading font-bold mt-1">${totalCollected.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Paid</div>
          <div className="text-2xl font-heading font-bold mt-1">{paidCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Pending</div>
          <div className="text-2xl font-heading font-bold mt-1">{pendingCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Disputed</div>
          <div className={`text-2xl font-heading font-bold mt-1 ${disputedCount > 0 ? 'text-destructive' : ''}`}>{disputedCount}</div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Payments</h3>
        {members.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">No members yet.</div>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2">
                <div className="w-8 h-8 rounded-full bg-navy text-white grid place-items-center text-[10px] font-bold shrink-0">{(m.member_callsign || '?').slice(0, 3)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium font-mono flex items-center gap-1.5 min-w-0"><span className="truncate">{m.member_callsign}</span><StaffTag callsign={m.member_callsign} /></div>
                  <div className="text-xs text-muted-foreground truncate">
                    {m.fee_amount > 0 ? `$${Number(m.fee_amount).toFixed(2)} · ${m.fee_period}` : 'No fee'}
                    {m.payment_note ? ` · ${m.payment_note}` : ''}
                  </div>
                </div>
                {canManage ? (
                  <select
                    value={m.payment_status || 'Free'}
                    disabled={savingId === m.id}
                    onChange={(e) => setStatus(m, e.target.value)}
                    className={`h-8 text-xs rounded-md border-0 px-2 font-semibold ${STATUS_STYLE[m.payment_status || 'Free']}`}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-md ${STATUS_STYLE[m.payment_status || 'Free']}`}>{m.payment_status || 'Free'}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2"><History className="w-4 h-4" /> Join / Leave Log</h3>
        {!canManage ? (
          <div className="text-center py-6 text-muted-foreground text-sm flex flex-col items-center gap-1.5">
            <Lock className="w-5 h-5 opacity-40" />
            Only the club owner can view the join/leave log.
          </div>
        ) : log.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">No activity recorded yet.</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
            {log.map((l) => {
              const conf = ACTION_STYLE[l.action] || ACTION_STYLE.Joined;
              const Icon = conf.icon;
              return (
                <div key={l.id} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2">
                  <Icon className={`w-4 h-4 shrink-0 ${conf.tint}`} />
                  <div className="min-w-0 flex-1">
                    <div><span className="font-medium font-mono">{l.member_callsign}</span> <span className="text-muted-foreground">{l.action.toLowerCase()}</span></div>
                    <div className="text-xs text-muted-foreground truncate">
                      {l.reason || ''}{l.created_date ? ` · ${new Date(l.created_date).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
