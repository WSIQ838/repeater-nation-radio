import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Search, Mountain, Users, UserPlus, X, Radio } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import FormSection from '@/components/forms/FormSection';
import FormField from '@/components/forms/FormField';
import FormInput from '@/components/forms/FormInput';
import FormSelect from '@/components/forms/FormSelect';
import { loadAll } from '@/lib/loadAll';
import { bandForFrequency } from '@/lib/adif';
import { MODES, SOTA_BANDS, summitLocation } from '@/lib/sota';



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

const summitFields = (p) => ({
  summit_id: p.id,
  summit_name: p.name,
  summit_ref: p.summit_ref,
  summit_location: summitLocation(p),
  summit_points: p.points ?? '',
  summit_altitude_m: p.altitude_m ?? '',
  lat: p.lat || '',
  lng: p.lng || '',
});

const EMPTY = {
  summit_id: '', summit_name: '', summit_ref: '', summit_location: '', summit_points: '', summit_altitude_m: '', lat: '', lng: '',
  scheduled_date: '', end_date: '', radio_service: 'HAM', band: '20m', frequency: '14.285', tx_mode: 'SSB',
  notes: '', club_id: '', club_name: '', co_hosts: '', is_public: true,
  roster: [],
};

export default function SotaActivationDialog({ open, onClose, user, onSaved, editing, presetSummit }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [summits, setSummits] = useState([]);
  const [summitQuery, setSummitQuery] = useState('');
  const [summitOpen, setSummitOpen] = useState(false);
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
        radio_service: 'HAM',
        band: editing.band || '',
        tx_mode: editing.tx_mode || 'SSB',
        frequency: editing.frequency ? String(editing.frequency) : '',
        scheduled_date: toDatetimeLocalValue(editing.scheduled_date),
        end_date: toDatetimeLocalValue(editing.end_date),
        co_hosts: (editing.co_host_names || []).join(', '),
        club_id: editing.club_id || '',
        club_name: editing.club_name || '',
        roster: (() => { try { return JSON.parse(editing.roster_members || '[]'); } catch { return []; } })(),
      });
      setSummitQuery(editing.summit_name || '');
    } else {
      setForm(EMPTY);
      setSummitQuery('');
      if (presetSummit) {
        setForm((prev) => ({ ...prev, ...summitFields(presetSummit) }));
        setSummitQuery(presetSummit.name);
      }
    }
    // Same cached directory load the SOTA page uses, so this is usually free.
    loadAll('SotaSummit', '-created_date', 1000).then(setSummits).catch(() => setSummits([]));
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
  }, [open, editing, user, presetSummit]);

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

  const filteredSummits = summitQuery.trim()
    ? summits.filter((p) => {
        const q = summitQuery.toLowerCase();
        return (p.name || '').toLowerCase().includes(q) ||
          (p.summit_ref || '').toLowerCase().includes(q) ||
          (p.region_name || '').toLowerCase().includes(q) ||
          (p.state || '').toLowerCase().includes(q);
      })
    : summits;

  const pickSummit = (p) => {
    setForm((prev) => ({ ...prev, ...summitFields(p) }));
    setSummitQuery(p.name);
    setSummitOpen(false);
  };

  const onFrequency = (frequency) => {
    const band = bandForFrequency(Number(frequency));
    setForm((prev) => ({ ...prev, frequency, band: band || prev.band }));
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.summit_id) { toast({ title: 'Select a summit', variant: 'destructive' }); return; }
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
        summit_id: form.summit_id,
        summit_name: form.summit_name,
        summit_ref: form.summit_ref,
        summit_location: form.summit_location,
        summit_points: form.summit_points === '' ? null : Number(form.summit_points),
        summit_altitude_m: form.summit_altitude_m === '' ? null : Number(form.summit_altitude_m),
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
        scheduled_date: new Date(form.scheduled_date).toISOString(),
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
        radio_service: 'HAM',
        band: form.band || '',
        frequency: form.frequency ? Number(form.frequency) : null,
        tx_mode: form.tx_mode,
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
        savedActivation = await base44.entities.SotaActivation.update(editing.id, payload);
      } else {
        savedActivation = await base44.entities.SotaActivation.create(payload);
      }

      // Public SOTA plans/activations are also published to the community Events page.
      // Private activations stay private and are not exposed through Events.
      if (form.is_public) {
        const eventPayload = {
          title: `SOTA: ${form.summit_name || form.summit_ref || 'Summit Activation'}`,
          type: 'SOTA Activation',
          date: new Date(form.scheduled_date).toISOString(),
          location: form.summit_location || '',
          lat: form.lat ? Number(form.lat) : null,
          lng: form.lng ? Number(form.lng) : null,
          description: [
            form.summit_ref ? `Summit: ${form.summit_ref}` : '',
            form.summit_points ? `${form.summit_points} pts` : '',
            form.band ? `Band: ${form.band}` : '',
            form.frequency ? `Frequency: ${form.frequency} MHz` : '',
            form.tx_mode ? `Mode: ${form.tx_mode}` : '',
            form.club_name ? `Club: ${form.club_name}` : '',
            form.notes || '',
          ].filter(Boolean).join(' · '),
          club_id: form.club_id || undefined,
          club_owner_id: club?.created_by_id || '',
          organizer: profile?.display_name || user?.full_name || '',
          source_type: 'sota_activation',
          source_id: savedActivation?.id || editing?.id || '',
        };
        if (editing?.event_id) {
          await base44.entities.Event.update(editing.event_id, eventPayload).catch(() => {});
        } else {
          const event = await base44.entities.Event.create(eventPayload).catch(() => null);
          if (event?.id && savedActivation?.id) {
            await base44.entities.SotaActivation.update(savedActivation.id, { event_id: event.id }).catch(() => {});
          }
        }
      } else if (editing?.event_id) {
        await base44.entities.Event.delete(editing.event_id).catch(() => {});
      }
      base44.functions.invoke('notify-sota-activation', {
        activation_id: savedActivation?.id || editing?.id,
        action: editing ? 'updated' : 'created',
      }).catch((err) => console.error('[SotaActivationDialog] notification failed:', err));

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
          <DialogTitle>{editing ? 'Edit Activation' : 'New SOTA Activation'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save}>
          <div className="space-y-5">
            <FormSection icon={Mountain} title="Summit" description="Search the summit directory by name, reference, region, or state.">
              <FormField label="Summit" required full>
                <div className="relative">
                  <Input
                    title="Search the SOTA summit directory."
                    value={summitQuery}
                    onChange={(e) => { setSummitQuery(e.target.value); setSummitOpen(true); }}
                    onFocus={() => setSummitOpen(true)}
                    placeholder="Search summits…"
                    autoComplete="off"
                  />
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  {summitOpen && filteredSummits.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                      {filteredSummits.slice(0, 30).map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          title={`Select ${p.name || p.summit_ref} for the activation.`}
                          onClick={() => pickSummit(p)}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b border-border/50 last:border-0"
                        >
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{p.summit_ref} · {summitLocation(p)}{p.points ? ` · ${p.points} pts` : ''}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {form.summit_id && (
                  <div className="text-xs text-muted-foreground mt-1">Selected: <span className="font-mono font-medium text-foreground">{form.summit_ref}</span>{form.summit_location ? ` · ${form.summit_location}` : ''}{form.summit_points ? ` · ${form.summit_points} pts` : ''}</div>
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

            <FormSection icon={Radio} title="Radio" description="SOTA is an amateur radio programme. You can change frequency and mode during the activation.">
              <FormField label="Band">
                <FormSelect title="Select the band you plan to start on." value={form.band} onChange={(e) => setForm({ ...form, band: e.target.value })}>
                  <option value="">Select a band…</option>
                  {SOTA_BANDS.map((b) => <option key={b.id} value={b.id}>{b.id} ({b.range})</option>)}
                </FormSelect>
              </FormField>
              <FormField label="Frequency (MHz)">
                <FormInput title="Enter the operating frequency in MHz." type="number" step="0.0001" value={form.frequency} onChange={(e) => onFrequency(e.target.value)} placeholder="e.g. 14.285" />
              </FormField>
              <FormField label="Mode">
                <FormSelect title="Operating mode." value={form.tx_mode} onChange={(e) => setForm({ ...form, tx_mode: e.target.value })}>
                  {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
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
                <FormInput title="Enter Repeater Nation callsigns for additional operators who may help run the activation." value={form.co_hosts} onChange={(e) => setForm({ ...form, co_hosts: e.target.value })} placeholder="K7ABC, W7XYZ" />
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
                <Textarea title="Add plans, equipment notes, meeting details, or other operational information." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Route, trailhead, equipment, planned bands…" />
              </FormField>
            </FormSection>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" title="Close this form without saving changes." onClick={onClose}>Cancel</Button>
              <Button type="submit" title={editing ? "Save the changes to this SOTA activation." : "Create the SOTA activation."} disabled={saving}>
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