import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BadgePreview, { rarityStyle } from '@/components/admin/BadgePreview';
import { Loader2, Upload } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ColorAlphaInput from '@/components/ui/color-alpha-input';
import { parseColorAlpha, serializeColorAlpha } from '@/lib/colorAlpha';

const CATEGORIES = ['Activity', 'Contribution', 'Achievement', 'Social', 'Special', 'License'];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const REQ_TYPES = [
  { value: 'manual_only', label: 'Manual only' },
  { value: 'contacts', label: 'QSO / Contact logs' },
  { value: 'repeater_contacts', label: 'Repeater QSO logs' },
  { value: 'unique_repeaters', label: 'Unique repeaters contacted' },
  { value: 'equipment', label: 'Equipment entries' },
  { value: 'repeater_contributions', label: 'Approved repeater contributions' },
  { value: 'repeater_access_requests', label: 'Repeater access requests' },
  { value: 'club_memberships', label: 'Club memberships' },
  { value: 'club_owner', label: 'Clubs owned' },
  { value: 'profile_complete', label: 'Completed profile' },
  { value: 'forum_posts', label: 'Forum posts' },
  { value: 'forum_replies', label: 'Forum replies' },
  { value: 'bug_reports', label: 'Confirmed bug reports' },
  { value: 'feature_requests', label: 'Feature suggestions' },
  { value: 'accepted_feature_requests', label: 'Accepted feature suggestions' },
  { value: 'directory_views', label: 'Repeater directory views' },
  { value: 'map_discoveries', label: 'Map repeater discoveries' },
  { value: 'helpful_interactions', label: 'Helpful interactions' },
  { value: 'account_age', label: 'Account age (days)' },
  { value: 'net_checkins', label: 'Total net check-ins' },
  { value: 'net_nets_attended', label: 'Total nets attended' },
  { value: 'net_streak', label: 'Longest net streak (any club)' },
  { value: 'first_net_checkin', label: 'First net check-in' },
  { value: 'clubs_participated', label: 'Clubs participated in' },
];
const PERIODS = [
  { value: 'all_time', label: 'All time' },
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This week' },
  { value: 'monthly', label: 'This month' },
  { value: 'yearly', label: 'This year' },
];
const AWARD_METHODS = [
  { value: 'manual', label: 'Manual only' },
  { value: 'automatic', label: 'Automatic only' },
  { value: 'both', label: 'Automatic + Manual' },
];

const EMPTY = {
  name: '', description: '', icon: '🏆', icon_type: 'emoji', image_url: '',
  category: 'Achievement', rarity: 'Common', color: '#f59e0b', display_order: 0,
  enabled: true, is_secret: false, requirement_type: 'manual_only', requirement_amount: 1,
  requirement_period: 'all_time', requirement_label: '', award_method: 'manual',
};

const Field = ({ label, children, hint }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export default function BadgeDialog({ open, onOpenChange, badge, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) setForm(badge ? { ...EMPTY, ...badge } : EMPTY);
  }, [open, badge]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set('image_url', file_url);
    } catch (err) { console.error(err); }
    setUploading(false);
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onSave(form); } catch (e) { console.error(e); }
    setSaving(false);
  };

  const isManual = form.requirement_type === 'manual_only';
  const reqLabel = form.requirement_label?.trim() ||
    (isManual ? 'Awarded manually by an administrator.' :
      `${REQ_TYPES.find((t) => t.value === form.requirement_type)?.label || form.requirement_type}: ${form.requirement_amount}${form.requirement_period !== 'all_time' ? ` (${PERIODS.find((p) => p.value === form.requirement_period)?.label || ''})` : ''}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{badge ? 'Edit badge' : 'Create badge'}</DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          {/* ===== Form ===== */}
          <div className="space-y-4">
            <Field label="Badge name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Repeater Expert" /></Field>
            <Field label="Description"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} placeholder="Contribute approved repeater records." /></Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Icon type">
                <Select value={form.icon_type} onValueChange={(v) => set('icon_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emoji">Emoji</SelectItem>
                    <SelectItem value="icon">Lucide icon</SelectItem>
                    <SelectItem value="image">Uploaded image</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Accent color">
                {(() => {
                  const { hex6, opacity } = parseColorAlpha(form.color);
                  return (
                    <div className="flex items-center gap-2">
                      <ColorAlphaInput
                        color={hex6}
                        opacity={opacity}
                        onColorChange={(v) => set('color', serializeColorAlpha(v, opacity))}
                        onOpacityChange={(v) => set('color', serializeColorAlpha(hex6, v))}
                        className="flex-1"
                      />
                      <Input value={form.color} onChange={(e) => set('color', e.target.value)} className="w-28 shrink-0" />
                    </div>
                  );
                })()}
              </Field>
            </div>

            {form.icon_type === 'emoji' && (
              <Field label="Emoji" hint="Paste any emoji."><Input value={form.icon} onChange={(e) => set('icon', e.target.value)} placeholder="📡" /></Field>
            )}
            {form.icon_type === 'icon' && (
              <Field label="Lucide icon name" hint="e.g. Trophy, RadioTower, Star. See lucide.dev."><Input value={form.icon} onChange={(e) => set('icon', e.target.value)} placeholder="Trophy" /></Field>
            )}
            {form.icon_type === 'image' && (
              <Field label="Badge image">
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-input cursor-pointer hover:bg-accent text-sm">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploading ? 'Uploading…' : form.image_url ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" onChange={onImage} disabled={uploading} />
                  </label>
                  {form.image_url && <span className="text-xs text-muted-foreground truncate">Uploaded</span>}
                </div>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select value={form.category} onValueChange={(v) => set('category', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Rarity">
                <Select value={form.rarity} onValueChange={(v) => set('rarity', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RARITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Display order" hint="Lower shows first."><Input type="number" value={form.display_order} onChange={(e) => set('display_order', Number(e.target.value))} /></Field>
              <Field label="Award method">
                <Select value={form.award_method} onValueChange={(v) => set('award_method', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AWARD_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex items-center gap-6 pt-1">
              <div className="flex items-center gap-2">
                <Switch checked={form.enabled} onCheckedChange={(v) => set('enabled', v)} />
                <span className="text-sm">Enabled</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_secret} onCheckedChange={(v) => set('is_secret', v)} />
                <span className="text-sm">Secret</span>
              </div>
            </div>
          </div>

          {/* ===== Requirements + Preview ===== */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-4 bg-muted/30">
              <div className="font-heading font-semibold text-sm mb-3">How it's earned</div>
              <div className="space-y-3">
                <Field label="Requirement type">
                  <Select value={form.requirement_type} onValueChange={(v) => set('requirement_type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{REQ_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                {!isManual && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Required amount" hint="Minimum activity to earn.">
                      <Input type="number" min={1} value={form.requirement_amount} onChange={(e) => set('requirement_amount', Number(e.target.value))} />
                    </Field>
                    <Field label="Time period">
                      <Select value={form.requirement_period} onValueChange={(v) => set('requirement_period', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                  </div>
                )}
                <Field label="Requirement label" hint="Shown to users as the goal.">
                  <Textarea value={form.requirement_label} onChange={(e) => set('requirement_label', e.target.value)} rows={2} placeholder="Contribute 25 approved repeater records." />
                </Field>
              </div>
            </div>

            <div className="rounded-xl border border-border p-5 bg-card">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 text-center">Live preview</div>
              <div className="flex flex-col items-center text-center gap-2">
                <BadgePreview badge={form} size="lg" />
                <div className="font-heading font-bold text-lg">{form.name || 'Badge name'}</div>
                <p className="text-sm text-muted-foreground max-w-xs">{form.description || 'Badge description appears here.'}</p>
                <p className="text-xs text-muted-foreground italic max-w-xs">"{reqLabel}"</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${rarityStyle(form.rarity).chip}`}>{form.rarity}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save badge'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}