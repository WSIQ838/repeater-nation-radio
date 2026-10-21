import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioTower, MapPin, SlidersHorizontal, FileText } from 'lucide-react';
import MapPinPicker from '@/components/repeaters/MapPinPicker';
import FormShell from '@/components/forms/FormShell';
import FormSection from '@/components/forms/FormSection';
import FormField from '@/components/forms/FormField';
import FormInput from '@/components/forms/FormInput';
import FormSelect from '@/components/forms/FormSelect';
import FormTextarea from '@/components/forms/FormTextarea';
import { GMRS_REPEATER_CHANNELS } from '@/lib/gmrsChannels';

const HAM_BANDS = [
  { value: '6m', label: '6m (50–54 MHz)', min: 50, max: 54 },
  { value: '2m', label: '2m (144–148 MHz)', min: 144, max: 148 },
  { value: '1.25m', label: '1.25m (222–225 MHz)', min: 222, max: 225 },
  { value: '70cm', label: '70cm (420–450 MHz)', min: 420, max: 450 },
  { value: '33cm', label: '33cm (902–928 MHz)', min: 902, max: 928 },
];

const EMPTY = {
  name: '', callsign: '', frequency: '', offset: '', tone: '', input_tone: '',
  mode: 'Analog', access: 'Public', status: 'Online', coverage_radius: '',
  lat: '', lng: '', notes: '',
};

// CTCSS (PL) tones and DCS codes
const CTCSS_TONES = [
  67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8, 97.4,
  100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8, 136.5,
  141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5, 167.9, 171.3, 173.8,
  177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5, 203.5, 206.5,
  210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1,
];
const DCS_CODES = [
  '023', '025', '026', '031', '032', '043', '047', '050', '051', '053',
  '054', '065', '071', '072', '074', '114', '115', '116', '122', '125',
  '131', '132', '134', '143', '152', '155', '156', '162', '165', '172',
  '174', '205', '216', '223', '226', '243', '244', '245', '251', '261',
  '263', '265', '271', '306', '311', '315', '325', '331', '332', '343',
  '346', '351', '356', '364', '365', '371', '411', '412', '413', '423',
  '431', '432', '445', '464', '465', '466', '503', '506', '516', '523',
  '526', '532', '546', '565', '606', '612', '624', '627', '631', '632',
  '654', '662', '664', '703', '712', '723', '731', '732', '734', '743', '754',
];

const toneOptions = (
  <>
    <option value="">None</option>
    <option value="request_access">Request Access</option>
    <optgroup label="CTCSS (PL)">
      {CTCSS_TONES.map((t) => <option key={t} value={String(t)}>{t}</option>)}
    </optgroup>
    <optgroup label="DCS">
      {DCS_CODES.map((d) => <option key={d} value={`D${d}`}>{d}</option>)}
    </optgroup>
  </>
);

// GMRS repeater channels use the shared channel reference (15–22).

export default function RepeaterDialog({ open, onOpenChange, onCreated, repeater, onUpdated, service: serviceProp = 'GMRS' }) {
  // When editing, the repeater's OWN service always wins. The page-level `service` prop only
  // decides which kind of repeater is being added. (Previously an edit opened from the
  // directory fell back to GMRS, showed the GMRS channel picker and re-saved a HAM repeater
  // as GMRS.) Records with no radio_service are GMRS.
  const service = repeater ? String(repeater.radio_service || 'GMRS').toUpperCase() : serviceProp;
  const isHam = service === 'HAM';
  const editing = !!repeater;
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    if (editing && repeater) {
      setForm({
        name: repeater.name || '',
        callsign: repeater.callsign || '',
        frequency: repeater.frequency != null ? String(repeater.frequency) : '',
        offset: repeater.offset != null ? String(repeater.offset) : '',
        tone: repeater.tone || '',
        input_tone: repeater.input_tone || '',
        mode: repeater.mode || 'Analog',
        access: repeater.access || 'Public',
        status: repeater.status || 'Online',
        coverage_radius: repeater.coverage_radius != null ? String(repeater.coverage_radius) : '',
        lat: repeater.lat != null ? String(repeater.lat) : '',
        lng: repeater.lng != null ? String(repeater.lng) : '',
        notes: repeater.notes || '',
      });
      return;
    }
    setForm(EMPTY);
    base44.auth.me().then((u) => {
      if (!u) return;
      base44.entities.Profile.filter({ created_by_id: u.id }).then((profiles) => {
        const cs = profiles?.[0]?.callsign || u.full_name || '';
        if (cs) set('callsign', cs.toUpperCase());
      }).catch(() => {});
    }).catch(() => {});
  }, [open, editing, repeater]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.callsign || !form.frequency || form.lat === '' || form.lng === '') {
      setError('Name, callsign, frequency, and a pin location on the map are required.');
      return;
    }
    if (isHam) {
      const freq = Number(form.frequency);
      const band = HAM_BANDS.find((b) => freq >= b.min && freq <= b.max);
      if (!Number.isFinite(freq) || !band) {
        setError('HAM repeater frequency must be within a supported amateur band: 6m, 2m, 1.25m, 70cm, or 33cm.');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        callsign: form.callsign.toUpperCase(),
        frequency: Number(form.frequency),
        offset: form.offset === '' ? undefined : Number(form.offset),
        tone: form.tone || undefined,
        input_tone: form.input_tone || undefined,
        mode: form.mode,
        access: form.access,
        status: form.status,
        coverage_radius: form.coverage_radius === '' ? undefined : Number(form.coverage_radius),
        lat: Number(form.lat),
        lng: Number(form.lng),
        notes: form.notes || undefined,
        radio_service: service,
      };
      if (editing) {
        const updated = (await base44.functions.invoke('repeater-manage', { action: 'update', data: { ...payload, id: repeater.id } })).data;
        onUpdated?.(updated);
      } else {
        const created = (await base44.functions.invoke('repeater-manage', { action: 'create', data: payload })).data;
        onCreated?.(created);
      }
      setForm(EMPTY);
      onOpenChange?.(false);
    } catch (err) {
      setError(err?.message || 'Could not save repeater.');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <FormShell
          icon={RadioTower}
          title={editing ? 'Edit Repeater' : 'Add a Repeater'}
          description={editing ? 'Update repeater details and settings.' : isHam ? 'Submit a new amateur radio repeater to the HAM directory.' : 'Submit a new GMRS repeater to the GMRS directory.'}
        >
          <form onSubmit={submit} className="space-y-4">
            {/* Basic Information */}
            <FormSection icon={RadioTower} title="Basic Information" description="Core repeater identification.">
              <FormField label="Name" required>
                <FormInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Mt. Hood GMRS" />
              </FormField>
              <FormField label="Callsign" required>
                <FormInput value={form.callsign} onChange={(e) => set('callsign', e.target.value.toUpperCase())} className="uppercase" placeholder="WRABC123" />
              </FormField>
              {isHam ? (
                <FormField label="Frequency (MHz)" required description="Enter a coordinated amateur-radio repeater frequency within one of the supported HAM bands.">
                  <FormInput
                    type="number"
                    step="0.0001"
                    min="50"
                    max="928"
                    value={form.frequency}
                    onChange={(e) => { set('frequency', e.target.value); set('offset', ''); }}
                    placeholder="e.g. 146.9400"
                  />
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {HAM_BANDS.map((b) => (
                      <div key={b.value} className="text-xs text-muted-foreground rounded-md border px-2 py-1.5">
                        <span className="font-medium text-foreground">{b.label}</span>
                      </div>
                    ))}
                  </div>
                </FormField>
              ) : (
                <FormField label="Frequency (MHz)" required>
                  <FormSelect value={form.frequency} onChange={(e) => { set('frequency', e.target.value); set('offset', e.target.value ? 5 : ''); }}>
                    <option value="">Select a GMRS repeater channel…</option>
                    {GMRS_REPEATER_CHANNELS.map((c) => <option key={c.ch} value={c.freq}>{c.label} · Input {c.input} MHz</option>)}
                  </FormSelect>
                </FormField>
              )}
              <FormField label="Coverage (mi)" description="Approximate coverage radius in miles.">
                <FormInput type="number" value={form.coverage_radius} onChange={(e) => set('coverage_radius', e.target.value)} placeholder="25" />
              </FormField>
            </FormSection>

            {/* Radio Information */}
            <FormSection icon={SlidersHorizontal} title="Radio Information" description="Tones, mode, and access settings.">
              <FormField label="Output Tone (TX)" description="CTCSS or DCS tone for transmit.">
                <FormSelect value={form.tone} onChange={(e) => set('tone', e.target.value)}>
                  {toneOptions}
                </FormSelect>
              </FormField>
              <FormField label="Input Tone (RX)" description="CTCSS or DCS tone for receive.">
                <FormSelect value={form.input_tone} onChange={(e) => set('input_tone', e.target.value)}>
                  {toneOptions}
                </FormSelect>
              </FormField>
              <FormField label="Status">
                <FormSelect value={form.status} onChange={(e) => set('status', e.target.value)}>
                  <option>Online</option>
                  <option>Offline</option>
                  <option>Maintenance</option>
                </FormSelect>
              </FormField>
              <FormField label="Access" description="Public repeaters are open to all.">
                <FormSelect value={form.access} onChange={(e) => set('access', e.target.value)}>
                  <option value="Public">Public — open to all</option>
                  <option value="Closed">Closed — request access</option>
                </FormSelect>
              </FormField>
            </FormSection>

            {/* Location Information */}
            <FormSection icon={MapPin} title="Location Information" description="Click the map to drop a pin on the repeater site." columns={false}>
              <FormField label="Location" required>
                <MapPinPicker lat={form.lat} lng={form.lng} onPick={(ll) => { set('lat', ll.lat.toFixed(4)); set('lng', ll.lng.toFixed(4)); }} />
              </FormField>
              {form.lat !== '' && form.lng !== '' && (
                <p className="text-xs text-muted-foreground font-mono">{form.lat}, {form.lng}</p>
              )}
            </FormSection>

            {/* Additional Details */}
            <FormSection icon={FileText} title="Additional Details" columns={false}>
              <FormField label="Notes" description="Linked systems, access requirements, etc.">
                <FormTextarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Linked systems, access requirements, etc." />
              </FormField>
            </FormSection>

            {error && (
              <p className="text-sm text-destructive flex items-center gap-1.5 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange?.(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Repeater'}
              </Button>
            </DialogFooter>
          </form>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}