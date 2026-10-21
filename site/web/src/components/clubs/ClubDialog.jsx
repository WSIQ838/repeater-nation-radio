import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, Users, DollarSign, Trophy } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import FormShell from '@/components/forms/FormShell';
import FormSection from '@/components/forms/FormSection';
import FormField from '@/components/forms/FormField';
import FormInput from '@/components/forms/FormInput';
import FormSelect from '@/components/forms/FormSelect';
import FormTextarea from '@/components/forms/FormTextarea';
import RadioServicePicker from '@/components/clubs/RadioServicePicker';

export default function ClubDialog({ open, onClose, onCreated, user }) {
  const [form, setForm] = useState({ name: '', description: '', callsign: user?.callsign || '', location: user?.location || '', radio_services: ['GMRS'], membership_fee: '', fee_period: 'One-time', photo_url: '', gamification_enabled: true, leaderboard_enabled: false });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set('photo_url', file_url);
    } catch (err) { setError('Upload failed'); }
    setUploading(false);
  };

  const submit = async () => {
    setError('');
    if (!form.name.trim()) { setError('Club name is required.'); return; }
    setLoading(true);
    try {
      let lat = null, lng = null;
      if (form.location.trim()) {
        const coordMatch = form.location.trim().match(/^(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)$/);
        if (coordMatch) { lat = Number(coordMatch[1]); lng = Number(coordMatch[2]); }
        else {
          try {
            const geo = await base44.functions.invoke('geocode-location', { query: form.location.trim() });
            if (geo?.lat != null) { lat = geo.lat; lng = geo.lng; }
          } catch (err) { console.error('Geocode failed:', err); }
        }
      }
      const club = await base44.entities.Club.create({
        name: form.name.trim(),
        description: form.description.trim(),
        callsign: form.callsign.trim().toUpperCase(),
        location: form.location.trim(),
        radio_services: form.radio_services,
        membership_fee: Number(form.membership_fee) || 0,
        fee_period: form.fee_period,
        members_count: 1,
        creator_callsign: user?.callsign || '',
        photo_url: form.photo_url,
        gamification_enabled: form.gamification_enabled,
        leaderboard_enabled: form.leaderboard_enabled,
        lat, lng,
      });
      setForm({ name: '', description: '', callsign: '', location: '', radio_services: ['GMRS'], membership_fee: '', fee_period: 'One-time', photo_url: '', gamification_enabled: true, leaderboard_enabled: false });
      onCreated?.(club);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create club');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <FormShell
          icon={Users}
          title="Create a Club"
          description="Start a new GMRS or HAM community club on Repeater Nation."
        >
          <div className="space-y-4">
            {/* Logo */}
            <div className="flex items-center gap-4">
              {form.photo_url ? (
                <img src={form.photo_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-muted grid place-items-center text-muted-foreground"><Users className="w-6 h-6" /></div>
              )}
              <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer text-primary hover:underline">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Upload club logo'}
                <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={uploading} />
              </label>
            </div>

            {/* Basic Information */}
            <FormSection icon={Users} title="Basic Information" description="Club identity and description.">
              <FormField label="Club Name" required full>
                <FormInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Northern California GMRS Group" />
              </FormField>
              <FormField label="Callsign">
                <FormInput value={form.callsign} onChange={(e) => set('callsign', e.target.value.toUpperCase())} className="uppercase font-mono" placeholder="WRAB123" />
              </FormField>
              <FormField label="Location">
                <FormInput value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="City, State" />
              </FormField>
              <FormField label="Radio Service" description="Is this club for GMRS, HAM, or both?" full>
                <RadioServicePicker value={form.radio_services} onChange={(v) => set('radio_services', v)} />
              </FormField>
              <FormField label="Description" full>
                <FormTextarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="What's your club about?" />
              </FormField>
            </FormSection>

            {/* Membership Information */}
            <FormSection icon={DollarSign} title="Membership Information" description="Set up club membership fees.">
              <FormField label="Membership Fee ($)" description="Enter 0 for free membership.">
                <FormInput type="number" min="0" step="0.01" value={form.membership_fee} onChange={(e) => set('membership_fee', e.target.value)} placeholder="0 for free" />
              </FormField>
              <FormField label="Fee Period">
                <FormSelect value={form.fee_period} onChange={(e) => set('fee_period', e.target.value)}>
                  <option value="One-time">One-time</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Annual">Annual</option>
                </FormSelect>
              </FormField>
            </FormSection>

            {/* Gamification Settings */}
            <FormSection icon={Trophy} title="Gamification & Leaderboard" description="Configure net check-in streaks and achievements for this club.">
              <FormField label="Enable Gamification" description="Track net check-in streaks and award badges for this club." full>
                <div className="flex items-center gap-3 pt-1">
                  <Switch checked={form.gamification_enabled} onCheckedChange={(v) => set('gamification_enabled', v)} />
                  <span className="text-sm text-muted-foreground">{form.gamification_enabled ? 'Enabled' : 'Disabled'}</span>
                </div>
              </FormField>
              <FormField label="Show Leaderboard" description="Display the net streak leaderboard to club members." full>
                <div className="flex items-center gap-3 pt-1">
                  <Switch checked={form.leaderboard_enabled} onCheckedChange={(v) => set('leaderboard_enabled', v)} disabled={!form.gamification_enabled} />
                  <span className="text-sm text-muted-foreground">{form.leaderboard_enabled && form.gamification_enabled ? 'Visible to members' : 'Hidden'}</span>
                </div>
              </FormField>
            </FormSection>

            {error && (
              <p className="text-sm text-destructive flex items-center gap-1.5 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Create Club'}
            </Button>
          </DialogFooter>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}