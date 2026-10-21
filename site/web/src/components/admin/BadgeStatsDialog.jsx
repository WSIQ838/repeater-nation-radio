import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import BadgePreview from '@/components/admin/BadgePreview';
import { adminApi } from '@/lib/adminClient';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Users, TrendingUp, Clock, Award, Trash2, Search, Loader2, History } from 'lucide-react';
import { formatDateTime } from '@/components/admin/parts';

import { errMsg } from '@/lib/utils';
export default function BadgeStatsDialog({ open, onOpenChange, badge, onChanged }) {
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState([]);
  const [earners, setEarners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [awarding, setAwarding] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = async () => {
    if (!badge?.id) return;
    setLoading(true);
    try {
      const [s, a, e] = await Promise.all([
        adminApi('badges:stats', { badge_id: badge.id }),
        adminApi('badges:audit', { badge_id: badge.id }),
        base44.entities.UserBadge.filter({ badge_id: badge.id }, '-created_date', 500),
      ]);
      setStats(s?.stats || null);
      setAudit(a?.audit || []);
      setEarners((e || []).sort((x, y) => new Date(y.awarded_at || y.created_date) - new Date(x.awarded_at || x.created_date)));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open, badge?.id]);

  const searchUsers = async (val) => {
    setQuery(val);
    if (!val.trim()) { setUserResults([]); return; }
    setSearching(true);
    try {
      const r = await adminApi('users:list', { query: val, limit: 10 });
      setUserResults(r?.users || []);
    } catch (err) { console.error(err); }
    setSearching(false);
  };

  const award = async (u) => {
    setAwarding(u.id);
    try {
      await adminApi('badges:award', { user_id: u.id, badge_id: badge.id });
      setQuery(''); setUserResults([]);
      await load();
      onChanged?.();
    } catch (err) { alert(errMsg(err) || 'Could not award badge'); }
    setAwarding(null);
  };

  const revoke = async (ub) => {
    if (!confirm(`Revoke "${badge.name}" from ${ub.user_name}?`)) return;
    setRevoking(ub.id);
    try {
      await adminApi('badges:revoke', { user_id: ub.user_id, badge_id: badge.id });
      await load();
      onChanged?.();
    } catch (err) { alert(errMsg(err) || 'Could not revoke badge'); }
    setRevoking(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgePreview badge={badge} size="sm" /> {badge?.name} — statistics
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        ) : (
          <div className="space-y-5">
            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="p-3"><Users className="w-4 h-4 text-primary mb-1" /><div className="text-xl font-bold">{stats?.earned ?? 0}</div><div className="text-xs text-muted-foreground">Earned</div></Card>
              <Card className="p-3"><TrendingUp className="w-4 h-4 text-blue-500 mb-1" /><div className="text-xl font-bold">{stats?.progressing ?? 0}</div><div className="text-xs text-muted-foreground">In progress</div></Card>
              <Card className="p-3"><Clock className="w-4 h-4 text-amber-500 mb-1" /><div className="text-xs text-muted-foreground">Created</div><div className="text-xs font-medium mt-0.5">{formatDateTime(stats?.created_date)}</div></Card>
              <Card className="p-3"><Clock className="w-4 h-4 text-green-500 mb-1" /><div className="text-xs text-muted-foreground">Modified</div><div className="text-xs font-medium mt-0.5">{formatDateTime(stats?.updated_date)}</div></Card>
            </div>
            {stats?.recent_user && (
              <div className="text-sm text-muted-foreground">Most recent earner: <span className="font-medium text-foreground">{stats.recent_user.name}</span> on {formatDateTime(stats.recent_user.date)}</div>
            )}

            {/* Manual award */}
            <div className="rounded-xl border border-border p-4 bg-muted/30">
              <div className="font-heading font-semibold text-sm mb-2 flex items-center gap-2"><Award className="w-4 h-4 text-primary" /> Manually award to a user</div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={query} onChange={(e) => searchUsers(e.target.value)} placeholder="Search by name, email, or callsign…" className="pl-9" />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" />}
              </div>
              {userResults.length > 0 && (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                  {userResults.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-accent/50">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.full_name || u.email}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.callsign ? `${u.callsign} · ` : ''}{u.email}</div>
                      </div>
                      <Button size="sm" disabled={awarding === u.id || earners.some((e) => e.user_id === u.id)} onClick={() => award(u)}>
                        {earners.some((e) => e.user_id === u.id) ? 'Earned' : awarding === u.id ? '…' : 'Award'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Earners list */}
            <div>
              <div className="font-heading font-semibold text-sm mb-2">Earners ({earners.length})</div>
              {earners.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No one has earned this badge yet.</p>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto scrollbar-thin">
                  {earners.map((ub) => (
                    <div key={ub.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{ub.user_name || 'Member'}</div>
                        <div className="text-xs text-muted-foreground">{ub.award_method === 'automatic' ? 'Auto-awarded' : `By ${ub.awarded_by_name || 'admin'}`} · {formatDateTime(ub.awarded_at || ub.created_date)}</div>
                      </div>
                      <Button size="icon" variant="ghost" disabled={revoking === ub.id} onClick={() => revoke(ub)}>
                        {revoking === ub.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-destructive" />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit log */}
            <div>
              <div className="font-heading font-semibold text-sm mb-2 flex items-center gap-2"><History className="w-4 h-4 text-muted-foreground" /> Audit log</div>
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No changes recorded.</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                  {audit.map((a) => (
                    <div key={a.id} className="text-xs p-2 rounded-lg border border-border">
                      <div className="font-medium">{a.action.replace('badge.', '')} · {a.target_label}</div>
                      <div className="text-muted-foreground">{a.admin_name} · {formatDateTime(a.created_date)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}