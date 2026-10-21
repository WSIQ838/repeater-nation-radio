import { useState } from 'react';
import { adminApi } from '@/lib/adminClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Flame, Trophy, Search, RefreshCw, Pencil, Loader2 } from 'lucide-react';

import { errMsg } from '@/lib/utils';
import BodyPortal from '@/components/shared/BodyPortal';
export default function StreakManagement() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [streaks, setStreaks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ current_streak: 0, longest_streak: 0 });
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(null);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      // If it looks like a user ID, use it directly; otherwise resolve via member search
      let userId = q;
      if (q.length < 20) {
        const res = await adminApi('users:list', { query: q, limit: 1 });
        userId = res?.users?.[0]?.id;
        if (!userId) { toast({ title: 'User not found', variant: 'destructive' }); setStreaks([]); setLoading(false); return; }
      }
      const res = await adminApi('gamification:viewStreaks', { user_id: userId });
      setStreaks(res?.streaks || []);
    } catch (e) { toast({ title: errMsg(e) || 'Search failed', variant: 'destructive' }); }
    setLoading(false);
  };

  const startEdit = (s) => {
    setEditing(s);
    setEditForm({ current_streak: s.current_streak || 0, longest_streak: s.longest_streak || 0 });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await adminApi('gamification:correctStreak', {
        streak_id: editing.id,
        current_streak: Number(editForm.current_streak),
        longest_streak: Number(editForm.longest_streak),
      });
      toast({ title: 'Streak corrected' });
      setEditing(null);
      // Refresh
      setStreaks((prev) => (prev || []).map((s) => s.id === editing.id ? { ...s, current_streak: Number(editForm.current_streak), longest_streak: Number(editForm.longest_streak) } : s));
    } catch (e) { toast({ title: errMsg(e) || 'Correction failed', variant: 'destructive' }); }
    setSaving(false);
  };

  const recalculate = async (s) => {
    setRecalculating(s.id);
    try {
      await adminApi('gamification:recalculate', { user_id: s.user_id, club_id: s.club_id });
      toast({ title: 'Streak recalculated from check-in records' });
      // Refresh the list
      const res = await adminApi('gamification:viewStreaks', { user_id: s.user_id });
      setStreaks(res?.streaks || []);
    } catch (e) { toast({ title: errMsg(e) || 'Recalculation failed', variant: 'destructive' }); }
    setRecalculating(null);
  };

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="flex items-center gap-2 mb-2">
        <Flame className="w-4 h-4 text-orange-500" />
        <h2 className="font-semibold">Net Streak Management</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Search for a member by name, email, or callsign to view and correct their net check-in streaks. All changes are recorded in the audit log.</p>

      <div className="flex gap-2 mb-4">
        <Input placeholder="Search by name, email, or callsign…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <Button variant="outline" onClick={search} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search
        </Button>
      </div>

      {streaks && streaks.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">No streaks found for this member.</p>
      )}

      {streaks && streaks.length > 0 && (
        <div className="space-y-2">
          {streaks.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
              <span className="text-xl">🔥</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.club_name || 'Club'}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-0.5"><Flame className="w-3 h-3 text-orange-500" /> Current: {s.current_streak || 0}</span>
                  <span className="flex items-center gap-0.5"><Trophy className="w-3 h-3 text-amber-500" /> Longest: {s.longest_streak || 0}</span>
                  <span>Check-ins: {s.total_checkins || 0}</span>
                  <span>Nets: {s.total_nets_attended || 0}</span>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => recalculate(s)} disabled={recalculating === s.id}>
                {recalculating === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => startEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <BodyPortal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
            <Card className="p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-heading font-semibold">Correct Streak — {editing.club_name || 'Club'}</h3>
              <p className="text-xs text-muted-foreground">Manually adjust this member's streak. This action is recorded in the audit log.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Current Streak</Label>
                  <Input type="number" min={0} value={editForm.current_streak} onChange={(e) => setEditForm({ ...editForm, current_streak: e.target.value })} />
                </div>
                <div>
                  <Label>Longest Streak</Label>
                  <Input type="number" min={0} value={editForm.longest_streak} onChange={(e) => setEditForm({ ...editForm, longest_streak: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                <Button size="sm" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Correction'}</Button>
              </div>
            </Card>
          </div>
        </BodyPortal>
      )}
    </Card>
  );
}