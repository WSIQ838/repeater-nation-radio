import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, Sparkles, AlertCircle, Radio, FileText } from 'lucide-react';
import { callsignIcon } from '@/lib/leaflet-setup';
import { useToast } from '@/components/ui/use-toast';
import FormShell from '@/components/forms/FormShell';
import FormSection from '@/components/forms/FormSection';
import FormField from '@/components/forms/FormField';
import FormInput from '@/components/forms/FormInput';
import FormSelect from '@/components/forms/FormSelect';
import TooltipHint from '@/components/ui/TooltipHint';



const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
  'WI','WY','DC',
];

const LOC_FIELDS = ['city', 'state', 'zip', 'county', 'lat', 'lng'];

const EMPTY_FORM = {
  callsign: '', contact_name: '', radio_service: 'GMRS', band: '', frequency: '', channel: '', mode: 'Simplex',
  signal_report: '', radio_used: '', city: '', state: '', zip: '', county: '',
  lat: '', lng: '', notes: '',
};

function MiniMapUpdater({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      map.setView([lat, lng], Math.max(map.getZoom(), 10));
    }
  }, [lat, lng, map]);
  return null;
}

function QsoMiniMap({ lat, lng, callsign, signalReport }) {
  const mapRef = useRef(null);
  const hasCoords = lat && lng && !isNaN(Number(lat)) && !isNaN(Number(lng));

  useEffect(() => {
    if (mapRef.current) {
      const t = setTimeout(() => mapRef.current.invalidateSize(), 250);
      return () => clearTimeout(t);
    }
  }, [hasCoords]);

  if (!hasCoords) {
    return (
      <div className="h-36 rounded-lg border border-dashed border-border grid place-items-center text-muted-foreground bg-muted/30">
        <div className="text-center px-4">
          <MapPin className="w-6 h-6 mx-auto mb-1 opacity-40" />
          <p className="text-xs">Enter a callsign or location to preview on the map</p>
        </div>
      </div>
    );
  }
  return (
    <div className="h-36 rounded-lg overflow-hidden border border-border">
      <MapContainer
        center={[Number(lat), Number(lng)]}
        zoom={10}
        className="h-full w-full"
        scrollWheelZoom={false}
        ref={mapRef}
      >
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxZoom={20} />
        <MiniMapUpdater lat={Number(lat)} lng={Number(lng)} />
        <Marker position={[Number(lat), Number(lng)]} icon={callsignIcon(callsign, signalReport)} />
      </MapContainer>
    </div>
  );
}

export default function QsoFormDialog({ open, onOpenChange, editingContact, prefill, onSaved, inline = false, radioInfo = null }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [autoFilled, setAutoFilled] = useState({});
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNote, setLookupNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [geoValidating, setGeoValidating] = useState(false);

  const autoFilledRef = useRef({});
  const userTypedCallsign = useRef(false);
  const lookupIdRef = useRef(0);

  const syncAuto = (next) => {
    autoFilledRef.current = next;
    setAutoFilled(next);
  };

  useEffect(() => {
    if (open) {
      userTypedCallsign.current = false;
      setSaving(false);
      setGeoValidating(false);
      if (editingContact) {
        setForm({
          callsign: editingContact.callsign || '',
          contact_name: editingContact.contact_name || '',
          radio_service: editingContact.radio_service || 'GMRS',
          band: editingContact.band || '',
          frequency: editingContact.frequency ? String(editingContact.frequency) : '',
          channel: editingContact.channel || '',
          mode: editingContact.mode || 'Simplex',
          signal_report: editingContact.signal_report || '',
          radio_used: editingContact.radio_used || '',
          city: editingContact.city || '',
          state: editingContact.state || '',
          zip: editingContact.zip || '',
          county: editingContact.county || '',
          lat: editingContact.lat ? String(editingContact.lat) : '',
          lng: editingContact.lng ? String(editingContact.lng) : '',
          notes: editingContact.notes || '',
        });
      } else if (prefill) {
        // Repeater/GPS data can prefill the contact, but the user's saved
        // Radio Information remains authoritative for their own station.
        setForm({ ...EMPTY_FORM, ...prefill, ...(radioInfo || {}) });
      } else {
        setForm({ ...EMPTY_FORM, ...(radioInfo || {}) });
      }
      syncAuto({});
      setLookupNote(null);
      setLookingUp(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingContact, prefill]);

  useEffect(() => {
    if (!open) return;
    const cs = form.callsign.trim();
    if (cs.length < 5 || !userTypedCallsign.current) {
      setLookingUp(false);
      return;
    }
    setLookingUp(true);
    const timer = setTimeout(() => doLookup(cs), 700);
    return () => clearTimeout(timer);
  }, [form.callsign, open]);

  const doLookup = async (callsign) => {
    const myId = ++lookupIdRef.current;
    try {
      const res = await base44.functions.invoke('lookup-callsign-location', { callsign });
      if (myId !== lookupIdRef.current) return;
      const data = res?.data || res;
      if (!data || data.found === false) {
        setLookupNote({ type: 'warn', message: data?.message || 'No FCC location found for this callsign. You can enter the location manually.' });
        setLookingUp(false);
        return;
      }
      setForm((prev) => {
        const next = { ...prev };
        LOC_FIELDS.forEach((field) => {
          const val = data[field];
          const isAuto = autoFilledRef.current[field];
          const isEmpty = prev[field] === '' || prev[field] === null || prev[field] === undefined;
          if ((isAuto || isEmpty) && val !== null && val !== undefined && val !== '') {
            next[field] = String(val);
          }
        });
        const nameIsAuto = autoFilledRef.current.contact_name;
        const nameIsEmpty = prev.contact_name === '' || prev.contact_name === null || prev.contact_name === undefined;
        if ((nameIsAuto || nameIsEmpty) && data.licensee) {
          next.contact_name = String(data.licensee);
        }
        return next;
      });
      const newAuto = {};
      LOC_FIELDS.forEach((field) => {
        const val = data[field];
        const isAuto = autoFilledRef.current[field];
        const isEmpty = !form[field];
        if (val !== null && val !== undefined && val !== '' && (isAuto || isEmpty)) {
          newAuto[field] = true;
        }
      });
      if (data.licensee && (autoFilledRef.current.contact_name || !form.contact_name)) {
        newAuto.contact_name = true;
      }
      syncAuto({ ...autoFilledRef.current, ...newAuto });
      setLookupNote({ type: 'success', message: `Location auto-filled from FCC license for ${callsign}.` });
    } catch (err) {
      if (myId !== lookupIdRef.current) return;
      console.error('Lookup error:', err);
      setLookupNote({ type: 'error', message: 'Location lookup failed. You can enter the location manually.' });
    }
    setLookingUp(false);
  };

  const updateLocField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (autoFilledRef.current[field]) {
      const next = { ...autoFilledRef.current };
      delete next[field];
      syncAuto(next);
    }
  };

  const onCallsignChange = (val) => {
    userTypedCallsign.current = true;
    setForm((prev) => ({
      ...prev,
      callsign: val.toUpperCase(),
      ...(autoFilledRef.current.contact_name ? { contact_name: '' } : {}),
    }));
    if (autoFilledRef.current.contact_name) {
      const next = { ...autoFilledRef.current };
      delete next.contact_name;
      syncAuto(next);
    }
  };

  const onContactNameChange = (val) => {
    setForm((prev) => ({ ...prev, contact_name: val }));
    if (autoFilledRef.current.contact_name) {
      const next = { ...autoFilledRef.current };
      delete next.contact_name;
      syncAuto(next);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.callsign) return;
    setSaving(true);

    let lat = form.lat ? parseFloat(form.lat) : null;
    let lng = form.lng ? parseFloat(form.lng) : null;

    if ((!lat || !lng) && (form.city || form.state || form.zip)) {
      setGeoValidating(true);
      try {
        const geocodePromise = base44.functions.invoke('geocode-location', {
          city: form.city, state: form.state, zip: form.zip,
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Geocode timed out')), 10000)
        );
        const res = await Promise.race([geocodePromise, timeoutPromise]);
        const data = res?.data || res;
        if (data && data.lat != null && data.lng != null) {
          lat = data.lat;
          lng = data.lng;
          const extras = { lat: String(lat), lng: String(lng) };
          if (data.county && !form.county) extras.county = data.county;
          setForm((prev) => ({ ...prev, ...extras }));
        } else {
          toast({
            title: 'Location not mapped',
            description: 'The location could not be geocoded. The QSO will be saved without a map marker.',
          });
        }
      } catch (err) {
        console.error('Geocode error:', err);
        toast({
          title: 'Location not mapped',
          description: 'Could not geocode the location. The QSO will be saved without a map marker.',
        });
      } finally {
        setGeoValidating(false);
      }
    }

    try {
      const payload = {
        date: editingContact?.date || new Date().toISOString(),
        callsign: form.callsign,
        contact_name: form.contact_name || undefined,
        radio_service: form.radio_service,
        band: form.band || undefined,
        frequency: form.frequency ? parseFloat(form.frequency) : null,
        channel: form.channel,
        mode: form.mode || 'Simplex',
        signal_report: form.signal_report,
        radio_used: form.radio_used,
        city: form.city || undefined,
        state: form.state || undefined,
        zip: form.zip || undefined,
        county: form.county || undefined,
        lat: lat || undefined,
        lng: lng || undefined,
        notes: form.notes,
      };

      if (editingContact) {
        await base44.entities.ContactLog.update(editingContact.id, payload);
        toast({ title: 'Contact updated', description: 'Your QSO has been updated.' });
      } else {
        await base44.entities.ContactLog.create(payload);
        toast({ title: 'Contact logged', description: 'Your QSO has been saved to your logbook.' });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to save contact', description: err?.message || 'Please try again.', variant: 'destructive' });
    }
    setSaving(false);
  };

  const autoTint = 'border-primary/40 bg-primary/5';

  const formContent = (
    <FormShell
          icon={Radio}
          title={editingContact ? 'Edit Contact' : 'Log a Contact'}
          description={editingContact ? 'Update QSO details.' : 'Record a new QSO in your digital logbook.'}
          standalone={inline}
        >
          <form onSubmit={submit} className="space-y-4">
            {/* Contact Information */}
            <FormSection icon={Radio} title="Contact Information" description="Who did you talk to?">
              <FormField label={<span className="flex items-center gap-1">Callsign <TooltipHint>Enter the station callsign. Repeater Nation looks it up automatically and can fill the contact location when available.</TooltipHint></span>} required full>
                <div className="relative">
                  <FormInput
                    value={form.callsign}
                    onChange={(e) => onCallsignChange(e.target.value)}
                    required
                    className="uppercase pr-10"
                    placeholder="e.g. WQAB123"
                  />
                  {lookingUp && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
                  )}
                </div>
                {lookupNote && (
                  <div className={`text-xs mt-1 flex items-center gap-1 ${lookupNote.type === 'success' ? 'text-success' : lookupNote.type === 'warn' ? 'text-muted-foreground' : 'text-destructive'}`}>
                    {lookupNote.type === 'success' ? <Sparkles className="w-3 h-3 shrink-0" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
                    {lookupNote.message}
                  </div>
                )}
              </FormField>
              <FormField label={<span className="flex items-center gap-1">Operator Name <TooltipHint>Automatically filled from the FCC licensee when available. You can edit it before saving.</TooltipHint></span>} full>
                <FormInput value={form.contact_name} onChange={(e) => onContactNameChange(e.target.value)} className={autoFilled.contact_name ? 'border-primary/40 bg-primary/5' : ''} placeholder="Operator's name" />
                {autoFilled.contact_name && <div className="text-[11px] text-primary mt-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Auto-filled from callsign lookup · editable</div>}
              </FormField>
              <FormField label={<span className="flex items-center gap-1">Signal Report <TooltipHint>Enter the signal report you received or observed, such as 5-9.</TooltipHint></span>}>
                <FormInput value={form.signal_report} onChange={(e) => setForm((prev) => ({ ...prev, signal_report: e.target.value }))} placeholder="e.g. 5-9" />
              </FormField>
            </FormSection>

            {radioInfo && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Saved Radio Information:</span>{' '}
                {radioInfo.radio_service || 'GMRS'} · {radioInfo.mode || 'Simplex'}{radioInfo.channel ? ` · CH ${radioInfo.channel}` : ''}{radioInfo.frequency ? ` · ${radioInfo.frequency} MHz` : ''}{radioInfo.radio_used ? ` · ${radioInfo.radio_used}` : ''}
              </div>
            )}

            {/* Location Information */}
            <FormSection icon={MapPin} title="Location Information" description="Auto-filled from FCC lookup when available." columns={false}><div className="flex items-center gap-1 text-xs text-muted-foreground -mb-1">Location help <TooltipHint>City, state, ZIP, county, and coordinates may be filled from the callsign lookup. You can edit any value before saving.</TooltipHint></div>
              {Object.keys(autoFilled).length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full w-fit">
                  <Sparkles className="w-3 h-3" /> Auto-filled · editable
                </span>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="City">
                  <FormInput value={form.city} onChange={(e) => updateLocField('city', e.target.value)} className={autoFilled.city ? autoTint : ''} placeholder="e.g. Sacramento" />
                </FormField>
                <FormField label="State">
                  <FormSelect value={form.state} onChange={(e) => updateLocField('state', e.target.value)} className={autoFilled.state ? autoTint : ''}>
                    <option value="">Select…</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </FormSelect>
                </FormField>
                <FormField label="ZIP">
                  <FormInput value={form.zip} onChange={(e) => updateLocField('zip', e.target.value)} className={autoFilled.zip ? autoTint : ''} placeholder="e.g. 95814" />
                </FormField>
                <FormField label="County">
                  <FormInput value={form.county} onChange={(e) => updateLocField('county', e.target.value)} className={autoFilled.county ? autoTint : ''} placeholder="Auto-filled from lookup" />
                </FormField>
                <FormField label="Latitude">
                  <FormInput value={form.lat} onChange={(e) => updateLocField('lat', e.target.value)} className={autoFilled.lat ? autoTint : ''} placeholder="e.g. 38.5816" inputMode="decimal" />
                </FormField>
                <FormField label="Longitude">
                  <FormInput value={form.lng} onChange={(e) => updateLocField('lng', e.target.value)} className={autoFilled.lng ? autoTint : ''} placeholder="e.g. -121.4944" inputMode="decimal" />
                </FormField>
              </div>
              <QsoMiniMap lat={form.lat} lng={form.lng} callsign={form.callsign} signalReport={form.signal_report} />
            </FormSection>

            {/* Additional Details */}
            <FormSection icon={FileText} title="Additional Details" columns={false}>
              <FormField label={<span className="flex items-center gap-1">Notes <TooltipHint>Add any extra details about the QSO that are useful later, such as repeater name, antenna, conditions, or conversation notes.</TooltipHint></span>}>
                <FormInput value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </FormField>
            </FormSection>

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="ghost" title="Close without saving this contact." onClick={() => onOpenChange(false)} disabled={saving} className="flex-1">Cancel</Button>
              <Button type="submit" title="Save this QSO to your logbook. Any available location data will be mapped when saved." disabled={saving || geoValidating} className="flex-1">
                {geoValidating ? 'Validating location…' : saving ? 'Saving…' : editingContact ? 'Update Contact' : 'Save Contact'}
              </Button>
            </div>
          </form>
        </FormShell>
  );

  return inline ? (
    <div className="w-full">{formContent}</div>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        {formContent}
      </DialogContent>
    </Dialog>
  );
}