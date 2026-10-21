import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Pencil } from 'lucide-react';
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

const STATUS_STYLE = {
  approved: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  under_review: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  rejected: 'bg-destructive/15 text-destructive',
};

export default function ParkReviewDialog({ open, onClose, park, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (park) {
      setForm({
        ...park,
        lat: park.lat ?? '',
        lng: park.lng ?? '',
      });
    }
  }, [park]);

  if (!form) return null;
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const persist = async (overrides) => {
    setBusy(true);
    try {
      await base44.functions.invoke('pota-park-manage', { action: 'moderate', data: { id: park.id, ...overrides } });
      toast({ title: 'Park updated' });
      onSaved?.();
      onClose();
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const saveEdits = async () => {
    setBusy(true);
    try {
      await base44.functions.invoke('pota-park-manage', { action: 'update', data: {
        id: park.id,
        name: form.name,
        park_number: form.park_number,
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
        review_notes: form.review_notes,
        search_keywords: [form.name, form.park_number, form.city, form.state, form.county, form.description].filter(Boolean).join(' '),
      } });
      toast({ title: 'Park updated' });
      onSaved?.();
      onClose();
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Review Park
            <Badge className={STATUS_STYLE[form.verification_status] || ''}>{form.verification_status?.replace('_', ' ')}</Badge>
            <Badge variant="outline" className={form.source === 'official' ? 'text-green-600 border-green-300' : 'text-blue-600 border-blue-300'}>
              {form.source === 'official' ? 'Official' : 'Community'}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {form.submitted_by_name && (
            <div className="text-xs text-muted-foreground">Submitted by {form.submitted_by_name}{form.submitted_at ? ` · ${new Date(form.submitted_at).toLocaleDateString()}` : ''}</div>
          )}
          <FormSection title="Park Details">
            <FormField label="Park name">
              <FormInput title="Edit the park name." value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
            </FormField>
            <FormField label="POTA reference">
              <FormInput title="Edit the POTA reference number." value={form.park_number || ''} onChange={(e) => set('park_number', e.target.value)} />
            </FormField>
            <FormField label="Park type">
              <FormSelect title="Edit the park type." value={form.park_type || 'Other'} onChange={(e) => set('park_type', e.target.value)}>
                {PARK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </FormSelect>
            </FormField>
          </FormSection>
          <FormSection title="Location">
            <FormField label="State">
              <FormSelect title="Edit the park state." value={form.state || ''} onChange={(e) => set('state', e.target.value)}>
                <option value="">—</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
            </FormField>
            <FormField label="County">
              <FormInput title="Edit the county or parish." value={form.county || ''} onChange={(e) => set('county', e.target.value)} />
            </FormField>
            <FormField label="City / Area">
              <FormInput title="Edit the park city or area." value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
            </FormField>
            <FormField label="Address" full>
              <FormInput title="Edit the park address or location details." value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
            </FormField>
            <FormField label="Latitude">
              <FormInput title="Edit the latitude used for map placement." type="number" step="any" value={form.lat} onChange={(e) => set('lat', e.target.value)} />
            </FormField>
            <FormField label="Longitude">
              <FormInput title="Edit the longitude used for map placement." type="number" step="any" value={form.lng} onChange={(e) => set('lng', e.target.value)} />
            </FormField>
          </FormSection>
          <FormSection title="Links & Description">
            <FormField label="Website" full>
              <FormInput title="Edit the official park website." value={form.website || ''} onChange={(e) => set('website', e.target.value)} />
            </FormField>
            <FormField label="POTA URL" full>
              <FormInput title="Edit the official POTA reference URL." value={form.pota_url || ''} onChange={(e) => set('pota_url', e.target.value)} />
            </FormField>
            <FormField label="Description" full>
              <Textarea title="Edit the park description." value={form.description || ''} onChange={(e) => set('description', e.target.value)} rows={2} />
            </FormField>
            {form.supporting_info && (
              <FormField label="Supporting info (from submitter)" full>
                <div className="text-sm p-2 rounded-md bg-muted/40 border border-border">{form.supporting_info}</div>
              </FormField>
            )}
            <FormField label="Admin review notes" full>
              <Textarea title="Add internal review notes for this submission." value={form.review_notes || ''} onChange={(e) => set('review_notes', e.target.value)} rows={2} />
            </FormField>
          </FormSection>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" title="Save the edited park information without changing its approval status." onClick={saveEdits} disabled={busy}><Pencil className="w-4 h-4 mr-1.5" /> Save edits</Button>
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="destructive" title="Reject this park submission." onClick={() => persist({ verification_status: 'rejected', review_notes: form.review_notes })} disabled={busy}>
              <X className="w-4 h-4 mr-1.5" /> Reject
            </Button>
            <Button title="Approve this park and make it available in the directory." onClick={() => persist({ verification_status: 'approved', source: form.source || 'community', review_notes: form.review_notes })} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />} Approve
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}