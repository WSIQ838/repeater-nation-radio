import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Trees, ImagePlus, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import FormSection from '@/components/forms/FormSection';
import FormField from '@/components/forms/FormField';
import FormInput from '@/components/forms/FormInput';
import FormSelect from '@/components/forms/FormSelect';

const PARK_TYPES = [
  'State Park', 'National Park', 'National Forest', 'Wildlife Area', 'Recreation Area',
  'Historic Site', 'State Forest', 'Nature Preserve', 'National Historic Site',
  'National Monument', 'National Recreation Area', 'National Wildlife Refuge',
  'State Recreation Area', 'State Historic Site', 'State Nature Area', 'Other',
];

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const EMPTY = {
  name: '', park_number: '', park_type: 'Other', state: '', county: '', city: '',
  address: '', lat: '', lng: '', website: '', pota_url: '', description: '',
  supporting_info: '', photo_urls: [],
};

export default function AddParkDialog({ open, onClose, user, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { if (open) setForm(EMPTY); }, [open]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

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

  const removePhoto = (i) => set('photo_urls', form.photo_urls.filter((_, idx) => idx !== i));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name) { toast({ title: 'Park name is required', variant: 'destructive' }); return; }
    if (!form.park_number && !form.state && !form.lat) {
      toast({ title: 'Add a POTA reference, state, or coordinates', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const profile = (await base44.entities.Profile.filter({ created_by_id: user.id }).catch(() => []))[0];
      const payload = {
        name: form.name,
        park_number: form.park_number || `GMRS-${Date.now().toString(36).toUpperCase()}`,
        park_type: form.park_type,
        city: form.city,
        state: form.state,
        county: form.county,
        address: form.address,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
        location: [form.city, form.state].filter(Boolean).join(', '),
        description: form.description,
        website: form.website,
        pota_url: form.pota_url,
        supporting_info: form.supporting_info,
        photo_urls: form.photo_urls,
        source: 'community',
        verification_status: 'pending',
        pota_status: 'active',
        submitted_by_name: profile?.display_name || user?.full_name || '',
        submitted_at: new Date().toISOString(),
        search_keywords: [form.name, form.park_number, form.city, form.state, form.county, form.description].filter(Boolean).join(' '),
      };
      await base44.functions.invoke('pota-park-manage', { action: 'create', data: payload });
      toast({ title: 'Park submitted for review', description: 'An administrator will review your submission.' });
      onSaved?.();
      onClose();
    } catch (err) {
      toast({ title: 'Could not submit park', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a Park</DialogTitle>
        </DialogHeader>
        <form onSubmit={save}>
          <div className="space-y-5">
            <FormSection icon={Trees} title="Park Details" description="Submit a park not currently in the Repeater Nation database. Submissions are reviewed by an administrator before becoming visible.">
              <FormField label="Park name" required>
                <FormInput title="Enter the name of the park or area." value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Cedar Ridge State Wildlife Area" />
              </FormField>
              <FormField label="POTA reference number" description="Official POTA reference if one exists (e.g. US-4157). Leave blank if none.">
                <FormInput title="Enter the official POTA reference number when one exists." value={form.park_number} onChange={(e) => set('park_number', e.target.value)} placeholder="US-4157" />
              </FormField>
              <FormField label="Park type">
                <FormSelect title="Select the type that best describes this park." value={form.park_type} onChange={(e) => set('park_type', e.target.value)}>
                  {PARK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </FormSelect>
              </FormField>
            </FormSection>

            <FormSection title="Location">
              <FormField label="State">
                <FormSelect title="Select the state where the park is located." value={form.state} onChange={(e) => set('state', e.target.value)}>
                  <option value="">—</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </FormSelect>
              </FormField>
              <FormField label="County">
                <FormInput title="Enter the county or parish for the park." value={form.county} onChange={(e) => set('county', e.target.value)} placeholder="County" />
              </FormField>
              <FormField label="City / Area">
                <FormInput title="Enter the city, town, or nearby area." value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="City or area" />
              </FormField>
              <FormField label="Address or location" full>
                <FormInput title="Enter the street address, entrance, or useful location directions." value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street address or directions" />
              </FormField>
              <FormField label="Latitude">
                <FormInput title="Enter the park latitude for map placement." type="number" step="any" value={form.lat} onChange={(e) => set('lat', e.target.value)} placeholder="39.8283" />
              </FormField>
              <FormField label="Longitude">
                <FormInput title="Enter the park longitude for map placement." type="number" step="any" value={form.lng} onChange={(e) => set('lng', e.target.value)} placeholder="-98.5795" />
              </FormField>
            </FormSection>

            <FormSection title="Links & Description">
              <FormField label="Official park website" full>
                <FormInput title="Optional official park or agency website." value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" />
              </FormField>
              <FormField label="POTA website / reference URL" full>
                <FormInput title="Optional link to the official POTA park reference." value={form.pota_url} onChange={(e) => set('pota_url', e.target.value)} placeholder="https://pota.app/#/park/…" />
              </FormField>
              <FormField label="Description" full>
                <Textarea title="Describe the park, access, or other useful information." value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Park description" />
              </FormField>
              <FormField label="Supporting information" full description="Why this park should be added, sources, etc.">
                <Textarea title="Explain why the park should be added and include supporting sources or details." value={form.supporting_info} onChange={(e) => set('supporting_info', e.target.value)} rows={2} />
              </FormField>
            </FormSection>

            <FormSection title="Optional Photos">
              <FormField label="Photos" full>
                <div className="flex flex-wrap gap-2">
                  {form.photo_urls.map((url, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button type="button" title="Remove this photo from the submission." onClick={() => removePhoto(i)} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label title="Choose an image to add to the park submission." className="w-20 h-20 rounded-lg border-2 border-dashed border-border grid place-items-center cursor-pointer hover:border-primary/50 text-muted-foreground">
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                    <input title="Upload a park photo." type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ''; }} />
                  </label>
                </div>
              </FormField>
            </FormSection>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" title="Close without submitting the park." onClick={onClose}>Cancel</Button>
              <Button type="submit" title="Submit this park to the POTA directory for review." disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                Submit for review
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}