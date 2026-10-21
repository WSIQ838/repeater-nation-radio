import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Upload, Trash2, Save, Users, Trophy } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import StripeConnectButton from '@/components/clubs/StripeConnectButton';
import RadioServicePicker from '@/components/clubs/RadioServicePicker';

export default function ClubSettingsForm({ club, user, onChanged }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: club.name || '',
    description: club.description || '',
    callsign: club.callsign || '',
    location: club.location || '',
    radio_services: club.radio_services?.length ? club.radio_services : ['GMRS'],
    officers: club.officers || '',
    photo_url: club.photo_url || '',
    membership_fee: club.membership_fee ?? 0,
    fee_period: club.fee_period || 'One-time',
    gamification_enabled: club.gamification_enabled ?? true,
    leaderboard_enabled: club.leaderboard_enabled ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set('photo_url', file_url);
    } catch (err) { toast({ title: 'Upload failed', variant: 'destructive' }); }
    setUploading(false);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: 'Club name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await base44.entities.Club.update(club.id, {
        name: form.name.trim(),
        description: form.description.trim(),
        callsign: form.callsign.trim().toUpperCase(),
        location: form.location.trim(),
        radio_services: form.radio_services,
        officers: form.officers.trim(),
        photo_url: form.photo_url,
        membership_fee: Number(form.membership_fee) || 0,
        fee_period: form.fee_period,
        gamification_enabled: form.gamification_enabled,
        leaderboard_enabled: form.leaderboard_enabled,
      });
      toast({ title: 'Club updated' });
      onChanged?.();
    } catch (err) { toast({ title: 'Update failed', description: err.message, variant: 'destructive' }); }
    setSaving(false);
  };

  const deleteClub = async () => {
    if (!window.confirm(`Delete "${club.name}"? This removes all pages, events, and memberships.`)) return;
    setDeleting(true);
    try {
      await Promise.all([
        base44.entities.Membership.deleteMany({ club_id: club.id }).catch(() => {}),
        base44.entities.Event.deleteMany({ club_id: club.id }).catch(() => {}),
        base44.entities.ClubPage.deleteMany({ club_id: club.id }).catch(() => {}),
      ]);
      await base44.entities.Club.delete(club.id);
      toast({ title: 'Club deleted' });
      onChanged?.();
      navigate('/club-manager');
    } catch (err) { toast({ title: 'Delete failed', description: err.message, variant: 'destructive' }); }
    setDeleting(false);
  };

  const fee = Number(form.membership_fee || 0);

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <h3 className="font-heading font-semibold text-lg">Club details</h3>
        <div className="flex items-start gap-5">
          <div className="shrink-0 text-center">
            {form.photo_url ? (
              <img src={form.photo_url} alt="" className="w-20 h-20 rounded-xl object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-muted grid place-items-center text-muted-foreground"><Users className="w-8 h-8" /></div>
            )}
            <label className="mt-2 inline-flex items-center gap-1.5 text-xs cursor-pointer text-primary hover:underline">
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {uploading ? 'Uploading...' : 'Upload photo'}
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={uploading} />
            </label>
          </div>
          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label>Club name *</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Callsign</Label>
                <Input value={form.callsign} onChange={(e) => set('callsign', e.target.value.toUpperCase())} className="uppercase font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="City, State" />
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Radio Service</Label>
          <p className="text-xs text-muted-foreground">Is this club for GMRS, HAM, or both?</p>
          <RadioServicePicker value={form.radio_services} onChange={(v) => set('radio_services', v)} />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="What's your club about?" />
        </div>
        <div className="space-y-1.5">
          <Label>Officers</Label>
          <Input value={form.officers} onChange={(e) => set('officers', e.target.value)} placeholder="President, VP, Secretary..." />
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-heading font-semibold text-lg">Membership</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Membership fee ($)</Label>
            <Input type="number" min="0" step="0.01" value={form.membership_fee} onChange={(e) => set('membership_fee', e.target.value)} placeholder="0 for free" />
          </div>
          <div className="space-y-1.5">
            <Label>Fee period</Label>
            <select value={form.fee_period} onChange={(e) => set('fee_period', e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="One-time">One-time</option><option value="Monthly">Monthly</option><option value="Annual">Annual</option>
            </select>
          </div>
        </div>
        {fee > 0 && (
          <div className="pt-1">
            <StripeConnectButton club={club} user={user} onChanged={onChanged} />
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-semibold text-lg">Gamification & Leaderboard</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Enable Gamification</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Track net check-in streaks and award badges for this club.</p>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.gamification_enabled} onCheckedChange={(v) => set('gamification_enabled', v)} />
            <span className="text-sm text-muted-foreground">{form.gamification_enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Show Leaderboard</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Display the net streak leaderboard to club members.</p>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.leaderboard_enabled} onCheckedChange={(v) => set('leaderboard_enabled', v)} disabled={!form.gamification_enabled} />
            <span className="text-sm text-muted-foreground">{form.leaderboard_enabled && form.gamification_enabled ? 'Visible' : 'Hidden'}</span>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save changes</>}
        </Button>
        <Button variant="outline" onClick={deleteClub} disabled={deleting} className="text-destructive hover:text-destructive">
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4 mr-1.5" /> Delete club</>}
        </Button>
      </div>
    </div>
  );
}