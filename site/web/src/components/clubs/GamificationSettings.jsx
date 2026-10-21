import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Flame, Trophy, Settings } from 'lucide-react';

const CHECKIN_TYPES = [
  { value: 'standard', label: 'Standard Check-In' },
  { value: 'late', label: 'Late Check-In' },
  { value: 'guest', label: 'Guest Check-In' },
  { value: 'mobile', label: 'Mobile Check-In' },
];

const SCHEDULES = [
  { value: 'none', label: 'No fixed schedule' },
  { value: 'weekly', label: 'Weekly nets' },
  { value: 'monthly', label: 'Monthly nets' },
];

export default function GamificationSettings({ club, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    gamification_enabled: true,
    leaderboard_enabled: false,
    qualifying_checkin_types: ['standard', 'late', 'guest', 'mobile'],
    net_schedule: 'none',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!club) return;
    let types = ['standard', 'late', 'guest', 'mobile'];
    try { if (club.qualifying_checkin_types) types = JSON.parse(club.qualifying_checkin_types); } catch {}
    setForm({
      gamification_enabled: club.gamification_enabled !== false,
      leaderboard_enabled: !!club.leaderboard_enabled,
      qualifying_checkin_types: types,
      net_schedule: club.net_schedule || 'none',
    });
  }, [club]);

  const toggleType = (type) => {
    setForm((f) => ({
      ...f,
      qualifying_checkin_types: f.qualifying_checkin_types.includes(type)
        ? f.qualifying_checkin_types.filter((t) => t !== type)
        : [...f.qualifying_checkin_types, type],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.Club.update(club.id, {
        gamification_enabled: form.gamification_enabled,
        leaderboard_enabled: form.leaderboard_enabled,
        qualifying_checkin_types: JSON.stringify(form.qualifying_checkin_types),
        net_schedule: form.net_schedule,
      });
      toast({ title: 'Gamification settings saved' });
      onSaved?.();
    } catch (e) { toast({ title: 'Save failed', description: e?.message, variant: 'destructive' }); }
    setSaving(false);
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-primary" />
        <h3 className="font-heading font-semibold">Net Gamification Settings</h3>
      </div>
      <p className="text-xs text-muted-foreground">Configure how net check-in streaks and achievements work for your club.</p>

      <div className="flex items-start justify-between gap-4 py-2 border-b border-border">
        <div><div className="text-sm font-medium flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-500" /> Enable Gamification</div><div className="text-xs text-muted-foreground">Track check-in streaks and award badges for this club.</div></div>
        <Switch checked={form.gamification_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, gamification_enabled: v }))} />
      </div>

      <div className="flex items-start justify-between gap-4 py-2 border-b border-border">
        <div><div className="text-sm font-medium flex items-center gap-1.5"><Trophy className="w-4 h-4 text-amber-500" /> Enable Leaderboard</div><div className="text-xs text-muted-foreground">Show the net streak leaderboard to club members.</div></div>
        <Switch checked={form.leaderboard_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, leaderboard_enabled: v }))} />
      </div>

      <div className="py-2 border-b border-border">
        <Label className="mb-2 block">Qualifying Check-In Types</Label>
        <p className="text-xs text-muted-foreground mb-2">Select which check-in types count toward streaks.</p>
        <div className="grid grid-cols-2 gap-2">
          {CHECKIN_TYPES.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.qualifying_checkin_types.includes(t.value)} onChange={() => toggleType(t.value)} className="rounded" />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      <div className="py-2">
        <Label className="mb-2 block">Net Schedule</Label>
        <p className="text-xs text-muted-foreground mb-2">How often does your club hold nets? This determines when a missed net resets a streak.</p>
        <select value={form.net_schedule} onChange={(e) => setForm((f) => ({ ...f, net_schedule: e.target.value }))} className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm">
          {SCHEDULES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <Button onClick={save} disabled={saving} size="sm">Save Settings</Button>
    </Card>
  );
}