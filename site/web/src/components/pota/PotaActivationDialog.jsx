import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Search, Trees, Users, UserPlus, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { GMRS_CHANNELS } from '@/lib/gmrsChannels';
import { HAM_BANDS } from '@/lib/hamBands';
import { useToast } from '@/components/ui/use-toast';
import FormSection from '@/components/forms/FormSection';
import FormField from '@/components/forms/FormField';
import FormInput from '@/components/forms/FormInput';
import FormSelect from '@/components/forms/FormSelect';



// scheduled_date/end_date are stored as UTC ISO strings, but a datetime-local
// input always displays and edits in the browser's LOCAL time. Slicing the raw
// UTC digits into the input (the old approach) shows the wrong wall-clock time
// and, worse, silently shifts the real time by the browser's UTC offset the
// moment the form is saved again. Convert to the equivalent local wall-clock
// string instead.
function toDatetimeLocalValue(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

const EMPTY = {
  park_id: '', park_name: '', park_number: '', park_location: '', lat: '', lng: '',
  scheduled_date: '', end_date: '', radio_service: 'GMRS', band: '', frequency: '', channel: '', mode: 'Simplex',
  notes: '', club_id: '', club_name: '', co_hosts: '', is_public: true,
  roster: [],
};

export default function PotaActivationDialog({ open, onClose, user, onSaved, editing, presetPark }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [parks, setParks] = useState([]);
  const [parkQuery, setParkQuery] = useState('');
  const [parkOpen, setParkOpen] = useState(false);
  const [clubs, setClubs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [rosterEntry, setRosterEntry] = useState({ callsign: '', name: '', location: '' });
  const [rosterLookup, setRosterLookup] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        ...EMPTY,
        ...editing,
        lat: editing.lat ?? '',
        lng: editing.lng ?? '',
        radio_service: editing.radio_service || 'GMRS',
        band: editing.band || '',
        frequency: editing.frequency ? String(editing.frequency) : '',
        scheduled_date: toDatetimeLocalValue(editing.scheduled_date),
        end_date: toDatetimeLocalValue(editing.end_date),
        co_hosts: (editing.co_host_names || []).join(', '),
        club_id: editing.club_id || '',
        club_name: editing.club_name || '',
        roster: (() => { try { return JSON.parse(editing.roster_members || '[]'); } catch { return []; } })(),
      });
      setParkQuery(editing.park_name || '');
    } else {
      setForm(EMPTY);
      setParkQuery('');
      if (presetPark) {
        setForm((prev) => ({
          ...prev,
          park_id: presetPark.id,
          park_name: presetPark.name,
          park_number: presetPark.park_number,
          park_location: [presetPark.city, presetPark.state].filter(Boolean).join(', '),
          lat: presetPark.lat || '',
          lng: presetPark.lng || '',
        }));
        setParkQuery(presetPark.name);
      }
    }
    base44.entities.PotaPark.list('-favorites_count', 200).then(setParks).catch(() => setParks([]));
    (async () => {
      try {
        const [profile, allClubs] = await Promise.all([
          base44.entities.Profile.filter({ created_by_id: user.id }).catch(() => []),
          base44.entities.Club.list('-name', 200).catch(() => []),
        ]);
        const myProfile = (profile || [])[0];
        const myCallsign = myProfile?.callsign || '';
        let memberClubIds = new Set();
        if (myCallsign) {
          const mems = await base44.entities.Membership.filter({ member_callsign: myCallsign }).catch(() => []);
          (mems || []).forEach((m) => memberClubIds.add(m.club_id));
        }
        const mine = (allClubs || []).filter((c) => c.creator_callsign === myCallsign || memberClubIds.has(c.id));
        setClubs(mine);
      } catch { setClubs([]); }
    })();
  }, [open, editing, user, presetPark]);

  const loadClubLeadership = async (clubId) => {
    if (!clubId) return [];
    try {
      const memberships = await base44.entities.Membership.filter({ club_id: clubId, status: 'Active' }, '-updated_date', 500);
      const leaders = (memberships || []).filter((m) => m.role === 'Admin' || m.role === 'Officer');
      if (!leaders.length) return [];
      const profiles = await base44.entities.Profile.list('-updated_date', 500);
      const byCallsign = {};
      (profiles || []).forEach((p) => {
        if (p.callsign) byCallsign[p.callsign.toUpperCase()] = p;
      });
      return leaders.map((m) => {
        const profile = byCallsign[(m.member_callsign || '').toUpperCase()];
        return (profile?.callsign || m.member_callsign || '').toUpperCase();
      }).filter(Boolean);
    } catch {
      return [];
    }
  };

  useEffect(() => {
    if (!open || !form.club_id) return;
    loadClubLeadership(form.club_id).then((leaders) => {
      if (!leaders.length) return;
      setForm((current) => {
        const existing = current.co_hosts.split(',').map((s) => s.trim()).filter(Boolean);
        const keys = new Set(existing.map((s) => s.toUpperCase()));
        const merged = [...existing];
        leaders.forEach((callsign) => {
          if (!keys.has(callsign.toUpperCase())) {
            merged.push(callsign);
            keys.add(callsign.toUpperCase());
          }
        });
        return { ...current, co_hosts: merged.join(', ') };
      });
    });
  }, [open, form.club_id]);

  // Auto-populate roster entry name/location from callsign (FCC ULS lookup)
  useEffect(() => {
    const cs = rosterEntry.callsign.trim().toUpperCase();
    if (cs.length < 3) { setRosterLookup(false); return; }
    setRosterLookup(true);
    const timer = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke('lookup-callsign-location', { callsign: cs });
        const data = res?.data || res;
        if (data?.found) {
          setRosterEntry((r) => ({
            ...r,
            name: r.name || data.licensee || '',
            location: r.location || [data.city, data.state].filter(Boolean).join(', ') || '',
          }));
        }
      } catch { /* ignore */ }
      setRosterLookup(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [rosterEntry.callsign]);

  const addRosterEntry = () => {
    const cs = rosterEntry.callsign.trim().toUpperCase();
    if (!cs) return;
    if (form.roster.some((r) => (r.callsign || '').toUpperCase() === cs)) return;
    setForm((f) => ({ ...f, roster: [...f.roster, { callsign: cs, name: rosterEntry.name.trim(), location: rosterEntry.location.trim() }] }));
    setRosterEntry({ callsign: '', name: '', location: '' });
  };

  const removeRosterEntry = (idx) => {
    setForm((f) => ({ ...f, roster: f.roster.filter((_, i) => i !== idx) }));
  };

  const filteredParks = parkQuery.trim()
    ? parks.filter((p) => {
        const q = parkQuery.toLowerCase();
        return (p.name || '').toLowerCase().includes(q) ||
          (p.park_number || '').toLowerCase().includes(q) ||
          (p.city || '').toLowerCase().includes(q) ||
          (p.state || '').toLowerCase().includes(q);
      })
    : parks;

  const pickPark = (p) => {
    setForm((prev) => ({
      ...prev,
      park_id: p.id,
      park_name: p.name,
      park_number: p.park_number,
      park_location: [p.city, p.state].filter(Boolean).join(', '),
      lat: p.lat || '',
      lng: p.lng || '',
    }));
    setParkQuery(p.name);
    setParkOpen(false);
  };

  const onChannel = (ch) => {
    const c = GMRS_CHANNELS.find((x) => x.ch === ch);
    setForm((prev) => ({ ...prev, channel: ch, frequency: c ? c.freq : '', mode: c?.type === 'repeater' ? 'Repeater' : 'Simplex' }));
  };

  const onFrequency = (frequency) => {
    const c = GMRS_CHANNELS.find((x) => x.freq === frequency);
    setForm((prev) => ({ ...prev, frequency, channel: c ? c.ch : '', mode: c?.type === 'repeater' ? 'Repeater' : 'Simplex' }));
  };

  const setRadioService = (service) => {
    setForm((prev) => ({ ...prev, radio_service: service, band: '', channel: '', frequency: '', mode: 'Simplex' }));
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.park_id) { toast({ title: 'Select a park', variant: 'destructive' }); return; }
    if (!form.scheduled_date) { toast({ title: 'Set a date and time', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const profile = (await base44.entities.Profile.filter({ created_by_id: user.id }).catch(() => []))[0];
      const coHostNames = form.co_hosts.split(',').map((s) => s.trim()).filter(Boolean);
      let coHostIds = [];
      if (coHostNames.length) {
        const profiles = await base44.entities.Profile.list('-updated_date', 500).catch(() => []);
        const map = {};
        (profiles || []).forEach((p) => { if (p.callsign) map[p.callsign.toUpperCase()] = p.created_by_id; });
        coHostIds = coHostNames.map((n) => map[n.toUpperCase()]).filter(Boolean);
      }
      const club = clubs.find((c) => c.id === form.club_id) || null;
      const payload = {
        event_id: editing?.event_id || '',
        park_id: form.park_id,
        park_name: form.park_name,
        park_number: form.park_number,
        park_location: form.park_location,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
        scheduled_date: new Date(form.scheduled_date).toISOString(),
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
        radio_service: form.radio_service,
        band: form.band || '',
        frequency: form.frequency ? Number(form.frequency) : null,
        channel: form.channel,
        mode: form.mode,
        notes: form.notes,
        status: editing?.status || 'Upcoming',
        club_id: form.club_id || '',
        club_name: club?.name || '',
        club_owner_id: club?.created_by_id || '',
        operator_name: profile?.display_name || user?.full_name || '',
        operator_callsign: profile?.callsign || '',
        co_host_ids: coHostIds,
        co_host_names: coHostNames,
        is_public: form.is_public,
        contacts_count: editing?.contacts_count || 0,
        roster_members: JSON.stringify(form.roster || []),
      };
      let savedActivation;
      if (editing?.id) {
        savedActivation = await base44.entities.PotaActivation.update(editing.id, payload);
      } else {
        savedActivation = await base44.entities.PotaActivation.create(payload);
      }

      // Public POTA plans/activations are also published to the community Events page.
      // Private activations stay private and are not exposed through Events.
      if (form.is_public) {
        const eventPayload = {
          title: `POTA: ${form.park_name || form.park_number || 'Park Activation'}`,
          type: 'POTA Activation',
          date: new Date(form.scheduled_date).toISOString(),
          location: form.park_location || '',
          lat: form.lat ? Number(form.lat) : null,
          lng: form.lng ? Number(form.lng) : null,
          description: [
            form.park_number ? `Park: ${form.park_number}` : '',
            form.radio_service ? `Service: ${form.radio_service}` : '',
            form.band ? `Band: ${form.band}` : '',
            form.channel ? `Channel: ${form.channel}` : '',
            form.frequency ? `Frequency: ${form.frequency} MHz` : '',
            form.mode ? `Mode: ${form.mode}` : '',
            form.club_name ? `Club: ${form.club_name}` : '',
            form.notes || '',
          ].filter(Boolean).join(' · '),
          club_id: form.club_id || undefined,
          club_owner_id: club?.created_by_id || '',
          organizer: profile?.display_name || user?.full_name || '',
          source_type: 'pota_activation',
          source_id: savedActivation?.id || editing?.id || '',
        };
        if (editing?.event_id) {
          await base44.entities.Event.update(editing.event_id, eventPayload).catch(() => {});
        } else {
          const event = await base44.entities.Event.create(eventPayload).catch(() => null);
          if (event?.id && savedActivation?.id) {
            await base44.entities.PotaActivation.update(savedActivation.id, { event_id: event.id }).catch(() => {});
          }
        }
      } else if (editing?.event_id) {
        await base44.entities.Event.delete(editing.event_id).catch(() => {});
      }
      base44.functions.invoke('notify-pota-activation', {
        activation_id: savedActivation?.id || editing?.id,
        action: editing ? 'updated' : 'created',
      }).catch((err) => console.error('[PotaActivationDialog] notification failed:', err));

      toast({ title: editing ? 'Activation updated' : 'Activation created' });
      onSaved?.();
      onClose();
    } catch (err) {
      toast({ title: 'Could not save activation', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Activation' : 'New POTA Activation'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save}>
          <div className="space-y-5">
            <FormSection icon={Trees} title="Park" description="Search POTA parks by name, number, city, or state.">
              <FormField label="Park" required full>
                <div className="relative">
                  <Input
                    title="Search the POTA park directory by name, reference, city, or state."
                    value={parkQuery}
                    onChange={(e) => { setParkQuery(e.target.value); setParkOpen(true); }}
                    onFocus={() => setParkOpen(true)}
                    placeholder="Search parks…"
                    autoComplete="off"
                  />
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  {parkOpen && filteredParks.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                      {filteredParks.slice(0, 30).map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          title={`Select ${p.name || p.park_number || 'this park'} for the activation.`}
                          onClick={() => pickPark(p)}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b border-border/50 last:border-0"
                        >
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{p.park_number} · {[p.city, p.state].filter(Boolean).join(', ')}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {form.park_id && (
                  <div className="text-xs text-muted-foreground mt-1">Selected: <span className="font-mono font-medium text-foreground">{form.park_number}</span> · {form.park_location}</div>
                )}
              </FormField>
            </FormSection>

            <FormSection title="Schedule">
              <FormField label="Start date & time" required>
                <FormInput title="Set the date and local start time for the activation." type="datetime-local" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
              </FormField>
              <FormField label="End time (optional)">
                <FormInput title="Optionally set when the activation is expected to end." type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </FormField>
            </FormSection>

            <FormSection icon={Search} title="Radio">
              <FormField label="Radio Service" full>
                <FormSelect title="Choose whether this activation uses GMRS or Amateur Radio (HAM)." value={form.radio_service} onChange={(e) => setRadioService(e.target.value)}>
                  <option value="GMRS">GMRS</option>
                  <option value="HAM">Amateur Radio (HAM)</option>
                </FormSelect>
              </FormField>
              {form.radio_service === 'HAM' ? (
                <>
                  <FormField label="HAM Band">
                    <FormSelect title="Select the Amateur Radio band for this activation." value={form.band} onChange={(e) => setForm({ ...form, band: e.target.value })}>
                      <option value="">Select a band…</option>
                      {HAM_BANDS.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.range})</option>)}
                    </FormSelect>
                  </FormField>
                  <FormField label="Frequency (MHz)">
                    <FormInput title="Enter the operating frequency in MHz." type="number" step="0.0001" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder="e.g. 146.520" />
                  </FormField>
                </>
              ) : (
                <>
                  <FormField label="Channel">
                    <FormSelect title="Select the GMRS channel; the frequency and mode are filled automatically when applicable." value={form.channel} onChange={(e) => onChannel(e.target.value)}>
                      <option value="">Select a GMRS channel…</option>
                      {GMRS_CHANNELS.map((c) => <option key={c.ch} value={c.ch}>{c.type === 'repeater' ? `CH RP${c.ch}` : `CH ${c.ch}`}</option>)}
                    </FormSelect>
                  </FormField>
                  <FormField label="Frequency (MHz)">
                    <FormSelect title="Select the GMRS operating frequency; the channel and mode are filled automatically when applicable." value={form.frequency} onChange={(e) => onFrequency(e.target.value)}>
                      <option value="">Select frequency…</option>
                      {GMRS_CHANNELS.map((c) => <option key={c.ch} value={c.freq}>{c.freq} MHz</option>)}
                    </FormSelect>
                  </FormField>
                </>
              )}
              <FormField label="Mode">
                <FormSelect title="Choose simplex or repeater operating mode." value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                  <option value="Simplex">Simplex</option>
                  <option value="Repeater">Repeater</option>
                </FormSelect>
              </FormField>
            </FormSection>

            <FormSection icon={Users} title="Club & Operators" description="Optional — leave club blank for a personal activation.">
              <FormField label="Club (optional)" full>
                <FormSelect title="Optionally associate this activation with a club you belong to." value={form.club_id} onChange={(e) => setForm({ ...form, club_id: e.target.value })}>
                  <option value="">Personal activation (no club)</option>
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.creator_callsign === form.operator_callsign ? ' (owner)' : ''}</option>
                  ))}
                </FormSelect>
                {clubs.length === 0 && <p className="text-xs text-muted-foreground mt-1">You are not a member of any club yet.</p>}
              </FormField>
              <FormField label="Co-hosts / additional operators" full description="Enter comma-separated Repeater Nation callsigns. Co-hosts can open the active activation and log contacts with you.">
                <FormInput title="Enter Repeater Nation callsigns for additional operators who may help run the activation." value={form.co_hosts} onChange={(e) => setForm({ ...form, co_hosts: e.target.value })} placeholder="WRXY123, WRXY456" />
                {form.club_id && <p className="text-[10px] text-muted-foreground mt-1">Tip: delete a callsign from the list to remove that person from the activation co-hosts.</p>}
              </FormField>
              <FormField label="Public activation" full description="Public activations are visible to all users.">
                <div className="flex items-center gap-2 pt-1">
                  <Switch title="Toggle whether this activation is visible to all users." checked={form.is_public} onCheckedChange={(v) => setForm({ ...form, is_public: v })} />
                  <span className="text-sm text-muted-foreground">{form.is_public ? 'Visible to everyone' : 'Private — only you & co-hosts'}</span>
                </div>
              </FormField>
            </FormSection>

            <FormSection icon={Users} title="Roster" description="Expected operators you plan to contact during the activation.">
              <FormField full label="Add operator">
                <div className="grid sm:grid-cols-3 gap-2">
                  <div className="relative">
                    <Input
                      title="Enter the operator callsign. Name and location can be auto-filled from the callsign lookup."
                      value={rosterEntry.callsign}
                      onChange={(e) => setRosterEntry({ ...rosterEntry, callsign: e.target.value })}
                      placeholder="Callsign *"
                    />
                    {rosterLookup && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                  </div>
                  <Input
                    title="Enter or edit the operator name."
                    value={rosterEntry.name}
                    onChange={(e) => setRosterEntry({ ...rosterEntry, name: e.target.value })}
                    placeholder="Name"
                  />
                  <div className="flex gap-2">
                    <Input
                      title="Enter or edit the operator location."
                      value={rosterEntry.location}
                      onChange={(e) => setRosterEntry({ ...rosterEntry, location: e.target.value })}
                      placeholder="Location"
                    />
                    <Button type="button" size="icon" title="Add this operator to the activation roster." onClick={addRosterEntry} disabled={!rosterEntry.callsign.trim()}>
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </FormField>
              {form.roster.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {form.roster.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                      <span className="font-mono font-medium">{r.callsign}</span>
                      {r.name && <span className="text-muted-foreground">{r.name}</span>}
                      {r.location && <span className="text-xs text-muted-foreground">· {r.location}</span>}
                      <button type="button" title="Remove this operator from the activation roster." onClick={() => removeRosterEntry(i)} className="ml-auto text-muted-foreground hover:text-destructive">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {form.roster.length === 0 && <p className="text-xs text-muted-foreground mt-1">No roster added yet. Operators you add here will be checked off as you log contacts.</p>}
            </FormSection>

            <FormSection title="Notes">
              <FormField label="Activation notes" full>
                <Textarea title="Add plans, equipment notes, meeting details, or other operational information." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Plans, equipment, meeting spot…" />
              </FormField>
            </FormSection>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" title="Close this form without saving changes." onClick={onClose}>Cancel</Button>
              <Button type="submit" title={editing ? "Save the changes to this POTA activation." : "Create the POTA activation."} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                {editing ? 'Save changes' : 'Create activation'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}