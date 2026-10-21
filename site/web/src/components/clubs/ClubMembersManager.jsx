import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Users, Trash2, Shield, Star, User } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import StaffTag from '@/components/shared/StaffTag';

const ROLES = ['Member', 'Officer', 'Admin'];
const ROLE_ICON = { Member: User, Officer: Star, Admin: Shield };
const ROLE_STYLE = {
  Member: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  Officer: 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  Admin: 'bg-primary/15 text-primary',
};

export default function ClubMembersManager({ club, user }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const m = await base44.entities.Membership.filter({ club_id: club.id }).catch(() => []);
      setMembers(m || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [club.id]);

  const isOwner = user?.callsign && club.creator_callsign === user.callsign;
  const isAppAdmin = user?.role === 'admin';
  const canManage = isOwner || isAppAdmin;

  const changeRole = async (m, newRole) => {
    setUpdating(m.id);
    try {
      await base44.entities.Membership.update(m.id, { role: newRole });
      setMembers((ms) => ms.map((x) => (x.id === m.id ? { ...x, role: newRole } : x)));
      toast({ title: `${m.member_callsign} is now ${newRole}` });
    } catch (e) { toast({ title: 'Could not update role', variant: 'destructive' }); }
    setUpdating(null);
  };

  const removeMember = async (m) => {
    if (!window.confirm(`Remove ${m.member_callsign} from ${club.name}?`)) return;
    try {
      await base44.functions.invoke('club-member-remove', { membershipId: m.id });
      setMembers((ms) => ms.filter((x) => x.id !== m.id));
      toast({ title: 'Member removed' });
    } catch (e) { toast({ title: 'Could not remove', variant: 'destructive' }); }
  };

  const officers = members.filter((m) => m.role === 'Officer' || m.role === 'Admin');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-lg">Members ({members.length})</h3>
        {officers.length > 0 && <span className="text-sm text-muted-foreground">{officers.length} staff</span>}
      </div>

      {canManage && (
        <Card className="p-4 bg-primary/5 border-primary/20">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Staff management</p>
              <p className="text-muted-foreground mt-0.5">Promote trusted members to <span className="font-semibold text-amber-600">Officer</span> or <span className="font-semibold text-primary">Admin</span> to help run the club. Officers can moderate discussions; Admins can edit club info and pages.</p>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="h-32 rounded-xl bg-muted animate-pulse" />
      ) : members.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No members yet.
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {members.map((m) => {
            const RoleIcon = ROLE_ICON[m.role || 'Member'] || User;
            return (
              <Card key={m.id} className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-navy text-white grid place-items-center text-xs font-bold shrink-0">{(m.member_callsign || '?').slice(0, 3)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm font-mono flex items-center gap-1.5 min-w-0"><span className="truncate">{m.member_callsign || '—'}</span><StaffTag callsign={m.member_callsign} /></div>
                  <div className="text-xs text-muted-foreground truncate">{m.member_name || ''}</div>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <select
                      value={m.role || 'Member'}
                      disabled={updating === m.id}
                      onChange={(e) => changeRole(m, e.target.value)}
                      className="h-8 text-xs rounded-md border border-input bg-transparent px-2 max-w-[90px]"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button onClick={() => removeMember(m)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Remove member"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${ROLE_STYLE[m.role || 'Member']}`}>
                    <RoleIcon className="w-3 h-3" /> {m.role || 'Member'}
                  </span>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}