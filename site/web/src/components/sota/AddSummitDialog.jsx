import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Mountain, ImagePlus, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import FormSection from '@/components/forms/FormSection';
import FormField from '@/components/forms/FormField';
import FormInput from '@/components/forms/FormInput';
import FormSelect from '@/components/forms/FormSelect';
import { SUMMIT_RE, cleanRef } from '@/lib/sota';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const EMPTY = {
  name: '', summit_ref: '', altitude_m: '', points: '', bonus_points: '', state: '', county: '',
  region_name: '', lat: '', lng: '', sota_url: '', description: '', access_notes: '', supporting_info: '', photo_urls: [],
  verification_status: 'pending', review_notes: '',
};

const toForm = (s) => ({
  ...EMPTY,
  ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, s?.[k] ?? EMPTY[k]])),
  altitude_m: s?.altitude_m ?? '', points: s?.points ?? '', bonus_points: s?.bonus_points ?? '', lat: s?.lat ?? '', lng: s?.lng ?? '',
  photo_urls: s?.photo_urls || [],
});

// Members submit summits for review (like Add a Park on POTA). Admins reuse
// this dialog to review and edit a summit, including its moderation status.
export default function AddSummitDialog({ open, onClose, onSaved, editing = null, admin = false }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { if (open) setForm(editing ? toForm(editing) : EMPTY); }, [open, editing]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const ref = cleanRef(form.summit_ref);

  const uploadPhoto = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      set('photo_urls', [...form.photo_urls, file_url]);
    } catch {
      toast({ title: 'Photo upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast({ title: 'Summit name is required', variant: 'destructive' }); return; }
    if (!SUMMIT_RE.test(ref)) { toast({ title: 'Summit reference must look like W7W/KG-001', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const [association, rest] = ref.split('/');
      const n = (v) => (v === '' || v == null ? null : Number(v));
      const altitudeM = n(form.altitude_m);
      const data = {
        name: form.name.trim(),
        summit_ref: ref,
        association,
        region: rest.split('-')[0],
        region_name: form.region_name.trim(),
        altitude_m: altitudeM,
        altitude_ft: altitudeM != null ? Math.round(altitudeM * 3.28084) : null,
        points: n(form.points),
        bonus_points: n(form.bonus_points),
        state: form.state,
        county: form.county.trim(),
        lat: n(form.lat),
        lng: n(form.lng),
        sota_url: form.sota_url.trim() || `https://www.sotadata.org.uk/en/summit/${ref}`,
        description: form.description,
        access_notes: form.access_notes,
        supporting_info: form.supporting_info,
        photo_urls: form.photo_urls,
        search_keywords: [form.name, ref, form.region_name, form.state, form.county].filter(Boolean).join(' '),
      };
      if (editing?.id) {
        const res = await base44.functions.invoke('sota-summit-manage', { action: 'update', data: { id: editing.id, ...data } });
        if ((res?.data || res)?.error) throw new Error((res?.data || res).error);
        if (admin && (form.verification_status !== editing.verification_status || form.review_notes !== (editing.review_notes || ''))) {
          await base44.functions.invoke('sota-summit-manage', { action: 'moderate', data: { id: editing.id, verification_status: form.verification_status, review_notes: form.review_notes } });
        }
        toast({ title: 'Summit saved' });
      } else {
        const res = await base44.functions.invoke('sota-summit-manage', { action: 'create', data });
        if ((res?.data || res)?.error) throw new Error((res?.data || res).error);
        toast({ title: 'Summit submitted for review', description: 'An administrator will review your submission.' });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      toast({ title: 'Could not save summit', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.summit_ref}` : 'Add a Summit'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save}>
          <div className="space-y-5">
            <FormSection icon={Mountain} title="Summit" description={editing ? undefined : 'Submit a SOTA summit that is not in the Repeater Nation directory yet. Submissions are reviewed by an administrator before becoming visible.'}>
              <FormField label="Summit name" required>
                <FormInput title="The summit's name." value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Mount Si" />
              </FormField>
              <FormField label="SOTA reference" required description="Association/region-number, e.g. W7W/KG-001.">
                <FormInput title="The official SOTA summit reference." value={form.summit_ref} onChange={(e) => set('summit_ref', e.target.value.toUpperCase())} placeholder="W7W/KG-001" className="font-mono" />
              </FormField>
              <FormField label="Altitude (m)">
                <FormInput type="number" step="any" title="Summit altitude in metres." value={form.altitude_m} onChange={(e) => set('altitude_m', e.target.value)} placeholder="1270" />
              </FormField>
              <FormField label="Points">
                <FormInput type="number" min="1" max="10" title="Activation points for this summit." value={form.points} onChange={(e) => set('points', e.target.value)} placeholder="1–10" />
              </FormField>
              <FormField label="Winter bonus points">
                <FormInput type="number" min="0" max="3" title="Seasonal bonus points, if any." value={form.bonus_points} onChange={(e) => set('bonus_points', e.target.value)} placeholder="0–3" />
              </FormField>
            </FormSection>

            <FormSection title="Location">
              <FormField label="State">
                <FormSelect title="State the summit is in." value={form.state} onChange={(e) => set('state', e.target.value)}>
                  <option value="">—</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </FormSelect>
              </FormField>
              <FormField label="County">
                <FormInput title="County the summit is in." value={form.county} onChange={(e) => set('county', e.target.value)} placeholder="County" />
              </FormField>
              <FormField label="SOTA region name" full>
                <FormInput title="The SOTA region's name, e.g. King County." value={form.region_name} onChange={(e) => set('region_name', e.target.value)} placeholder="e.g. King County" />
              </FormField>
              <FormField label="Latitude">
                <FormInput type="number" step="any" title="Summit latitude for map placement." value={form.lat} onChange={(e) => set('lat', e.target.value)} placeholder="47.4876" />
              </FormField>
              <FormField label="Longitude">
                <FormInput type="number" step="any" title="Summit longitude for map placement." value={form.lng} onChange={(e) => set('lng', e.target.value)} placeholder="-121.7234" />
              </FormField>
            </FormSection>

            <FormSection title="Access & Description">
              <FormField label="Access notes" full description="Trailhead, parking, permits, seasonal closures.">
                <Textarea title="How to get to the summit." value={form.access_notes} onChange={(e) => set('access_notes', e.target.value)} rows={3} />
              </FormField>
              <FormField label="Description" full>
                <Textarea title="Anything else operators should know." value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
              </FormField>
              <FormField label="SOTA database link" full description="Leave blank to link the summit's page on sotadata.org.uk.">
                <FormInput title="Optional link to this summit on the SOTA database." value={form.sota_url} onChange={(e) => set('sota_url', e.target.value)} placeholder="https://www.sotadata.org.uk/en/summit/…" />
              </FormField>
              {!editing && (
                <FormField label="Supporting information" full description="Where the reference and details came from.">
                  <Textarea title="Sources for this submission." value={form.supporting_info} onChange={(e) => set('supporting_info', e.target.value)} rows={2} />
                </FormField>
              )}
            </FormSection>

            <FormSection title="Optional Photos">
              <FormField label="Photos" full>
                <div className="flex flex-wrap gap-2">
                  {form.photo_urls.map((url, i) => (
                    <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button type="button" title="Remove this photo." onClick={() => set('photo_urls', form.photo_urls.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label title="Add a summit photo." className="w-20 h-20 rounded-lg border-2 border-dashed border-border grid place-items-center cursor-pointer hover:border-primary/50 text-muted-foreground">
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ''; }} />
                  </label>
                </div>
              </FormField>
            </FormSection>

            {admin && editing && (
              <FormSection title="Moderation">
                <FormField label="Status">
                  <FormSelect title="Only approved summits are visible to members." value={form.verification_status} onChange={(e) => set('verification_status', e.target.value)}>
                    <option value="approved">Approved</option>
                    <option value="pending">Pending</option>
                    <option value="under_review">Under review</option>
                    <option value="rejected">Rejected</option>
                  </FormSelect>
                </FormField>
                <FormField label="Review notes" full>
                  <Textarea value={form.review_notes} onChange={(e) => set('review_notes', e.target.value)} rows={2} />
                </FormField>
                {editing.supporting_info && <p className="text-xs text-muted-foreground sm:col-span-2">Submitter's sources: {editing.supporting_info}</p>}
              </FormSection>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                {editing ? 'Save summit' : 'Submit for review'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
