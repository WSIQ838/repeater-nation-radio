import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import RosterPicker from '@/components/netcontrol/RosterPicker';
import CoHostPicker from '@/components/netcontrol/CoHostPicker';
import ClubSelector from '@/components/netcontrol/ClubSelector';
import { Loader2, Plus, Trash2, AlertTriangle, MapPin } from 'lucide-react';
import TooltipHint from '@/components/ui/TooltipHint';
import { GMRS_CHANNELS } from '@/lib/gmrsChannels';
import { HAM_BANDS } from '@/lib/hamBands';

const RADIO_TYPES = ['GMRS Radio', 'Mobile Radio', 'Base Station', 'Portable Repeater', 'Repeater Equipment', 'Emergency Equipment', 'Handheld', 'Mobile', 'Other'];
const eqLabel = (eq) => {
  const detail = [eq.manufacturer, eq.model].filter(Boolean).join(' ');
  return detail ? eq.name + ' — ' + detail : eq.name;
};

const NET_TYPES = ['Regular', 'Weekly', 'Community', 'Training', 'Special Event', 'Emergency', 'Other'];
const RECURRING = [
  { value: 'none', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];


const DEFAULT_POSITIONS = [
  { id: 'nc', name: 'Net Control', callsign: '', scheduled_time: '' },
  { id: 'disp', name: 'Dispatch', callsign: '', scheduled_time: '' },
  { id: 'tac', name: 'Tactical', callsign: '', scheduled_time: '' },
  { id: 'log', name: 'Logistics', callsign: '', scheduled_time: '' },
  { id: 'shelter', name: 'Shelter', callsign: '' },
  { id: 'mobile', name: 'Mobile', callsign: '' },
];

export default function CreateNetDialog({ open, onClose, user, onCreated, editingNet = null }) {
  const [tab, setTab] = useState('details');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', net_type: 'Regular', frequency: '', channel: '',
    repeater_name: '', tone: '', scheduled_date: '', start_time: '', end_time: '',
    location: '', notes: '', recurring: 'none', is_public: false,
    script_opening: '', script_purpose: '', script_roll_call: '', script_announcements: '',
    script_traffic: '', script_emergency: '', script_closing: '',
    emergency_mode: false, latitude: '', longitude: '',
  });
  const [rosterData, setRosterData] = useState({ type: 'none', members: [], club_id: '', club_name: '', roster_id: '' });
  const [positions, setPositions] = useState(DEFAULT_POSITIONS);
  const [coHosts, setCoHosts] = useState([]);
  const [initialHosts, setInitialHosts] = useState([]);
  const [clubAssociation, setClubAssociation] = useState({ club_id: '', club_name: '', club_owner_id: '' });
  const [equipment, setEquipment] = useState([]);
  const [radioCustom, setRadioCustom] = useState(false);

  useEffect(() => {
    if (open) {
      setTab('details');
      const n = editingNet;
      setForm({
        name: n?.name || '', description: n?.description || '', net_type: n?.net_type || 'Regular',
        radio_service: n?.radio_service || 'GMRS', band: n?.band || '', frequency: n?.frequency ?? '', channel: n?.channel || '',
        mode: n?.mode || 'Simplex', radio_used: n?.radio_used || '',
        repeater_name: n?.repeater_name || '', tone: n?.tone || '', scheduled_date: n?.scheduled_date ? new Date(n.scheduled_date).toISOString().slice(0,16) : '', start_time: n?.start_time || '', end_time: n?.end_time || '',
        location: n?.location || '', notes: n?.notes || '', recurring: n?.recurring || 'none', is_public: !!n?.is_public,
        script_opening: n?.script_opening || '', script_purpose: n?.script_purpose || '', script_roll_call: n?.script_roll_call || '', script_announcements: n?.script_announcements || '',
        script_traffic: n?.script_traffic || '', script_emergency: n?.script_emergency || '', script_closing: n?.script_closing || '',
        emergency_mode: !!n?.emergency_mode, latitude: n?.latitude ?? '', longitude: n?.longitude ?? '',
      });
      setRosterData({ type: n?.roster_type || 'none', members: (() => { try { return JSON.parse(n?.roster_members || '[]'); } catch { return []; } })(), club_id: n?.club_id || '', club_name: n?.club_name || '', roster_id: '' });
      setPositions((() => { try { const p = JSON.parse(n?.emergency_positions || '[]'); return p.length ? p : DEFAULT_POSITIONS; } catch { return DEFAULT_POSITIONS; } })());
      setCoHosts([]);
      setInitialHosts([]);
      setClubAssociation({ club_id: n?.club_id || '', club_name: n?.club_name || '', club_owner_id: n?.club_owner_id || '' });
      if (n?.id) {
        base44.functions.invoke('manage-net-hosts', { action: 'list', session_id: n.id }).then((res) => {
          const hosts = res?.data?.hosts || [];
          const accepted = hosts.filter((h) => h.status === 'accepted' && !h.is_primary);
          setInitialHosts(accepted.map((h) => ({ host_id: h.id, user_id: h.user_id })));
          setCoHosts(accepted.map((h) => ({
            user_id: h.user_id,
            user_name: h.user_name || '',
            user_callsign: h.user_callsign || '',
            permission_level: h.permission_level || 'checkin',
          })));
        }).catch(() => {});
      }
      if (n?.club_id) {
        loadClubLeadership(n.club_id).then((leaders) => setCoHosts((current) => {
          const existing = new Map(current.map((h) => [h.user_id, h]));
          leaders.forEach((leader) => { if (!existing.has(leader.user_id)) existing.set(leader.user_id, leader); });
          return [...existing.values()];
        }));
      }
      setEquipment([]);
      setRadioCustom(false);
      Promise.all([base44.auth.me(), base44.entities.Equipment.list()]).then(([me, items]) => {
        setEquipment((items || []).filter((eq) => eq.created_by_id === me.id && RADIO_TYPES.includes(eq.type)));
      }).catch(() => setEquipment([]));
    }
  }, [open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
        const userId = profile?.created_by_id || '';
        return userId ? {
          user_id: userId,
          user_name: profile?.display_name || m.member_name || '',
          user_callsign: profile?.callsign || m.member_callsign || '',
          permission_level: 'full',
          club_role: m.role,
        } : null;
      }).filter(Boolean);
    } catch {
      return [];
    }
  };

  const handleClubChange = async (club) => {
    setClubAssociation(club);
    if (club.club_id) {
      setRosterData((prev) => ({
        ...prev,
        club_id: club.club_id,
        club_name: club.club_name,
        club_owner_id: club.club_owner_id,
      }));
      const leaders = await loadClubLeadership(club.club_id);
      setCoHosts((current) => {
        const existing = new Map(current.map((h) => [h.user_id, h]));
        leaders.forEach((leader) => {
          if (!existing.has(leader.user_id)) existing.set(leader.user_id, leader);
        });
        return [...existing.values()];
      });
    } else {
      setCoHosts((current) => current.filter((h) => !h.club_role));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setTab('details'); return; }
    setSaving(true);
    try {
      const scheduledDate = form.scheduled_date ? new Date(form.scheduled_date).toISOString() : null;
      const payload = {
        event_id: editingNet?.event_id || '',
        name: form.name.trim(),
        description: form.description || '',
        net_type: form.net_type,
        radio_service: form.radio_service,
        band: form.band || '',
        frequency: form.frequency ? parseFloat(form.frequency) : null,
        channel: form.channel || '',
        mode: form.mode || 'Simplex',
        radio_used: form.radio_used || '',
        repeater_name: form.repeater_name || '',
        tone: form.tone || '',
        scheduled_date: scheduledDate,
        start_time: form.start_time || '',
        end_time: form.end_time || '',
        location: form.location || '',
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        notes: form.notes || '',
        recurring: form.recurring,
        is_public: form.is_public,
        status: editingNet?.status || 'scheduled',
        operator_name: user?.full_name || '',
        operator_callsign: user?.callsign || '',
        club_id: clubAssociation.club_id || rosterData.club_id || '',
        club_name: clubAssociation.club_name || rosterData.club_name || '',
        club_owner_id: clubAssociation.club_owner_id || rosterData.club_owner_id || '',
        roster_type: rosterData.type,
        roster_members: JSON.stringify(rosterData.members || []),
        roster_last_sync: rosterData.type === 'club' ? new Date().toISOString() : null,
        script_opening: form.script_opening || '',
        script_purpose: form.script_purpose || '',
        script_roll_call: form.script_roll_call || '',
        script_announcements: form.script_announcements || '',
        script_traffic: form.script_traffic || '',
        script_emergency: form.script_emergency || '',
        script_closing: form.script_closing || '',
        emergency_mode: form.emergency_mode,
        emergency_positions: form.emergency_mode ? JSON.stringify(positions) : '',
        total_checkins: editingNet?.total_checkins ?? 0,
        record_attendance: rosterData.type === 'club',
        primary_user_id: editingNet?.primary_user_id || user?.id || '',
        primary_user_name: editingNet?.primary_user_name || user?.full_name || '',
        host_user_ids: editingNet?.host_user_ids?.length ? editingNet.host_user_ids : [user?.id || ''],
      };
      const saved = editingNet
        ? await base44.entities.NetControlSession.update(editingNet.id, payload)
        : await base44.entities.NetControlSession.create(payload);

      // Public scheduled/active nets are also published to the community Events page.
      // Private nets remain visible only through Net Control's existing access rules.
      if (form.is_public) {
        const eventPayload = {
          title: `Net Control: ${form.name.trim()}`,
          type: 'Net Control',
          date: scheduledDate || new Date().toISOString(),
          location: form.location || '',
          lat: form.latitude ? Number(form.latitude) : null,
          lng: form.longitude ? Number(form.longitude) : null,
          description: [
            form.description || '',
            form.radio_service ? `Service: ${form.radio_service}` : '',
            form.band ? `Band: ${form.band}` : '',
            form.channel ? `Channel: ${form.channel}` : '',
            form.frequency ? `Frequency: ${form.frequency} MHz` : '',
            form.mode ? `Mode: ${form.mode}` : '',
            form.repeater_name ? `Repeater: ${form.repeater_name}` : '',
            form.club_name || clubAssociation.club_name ? `Club: ${form.club_name || clubAssociation.club_name}` : '',
          ].filter(Boolean).join(' · '),
          club_id: clubAssociation.club_id || rosterData.club_id || undefined,
          club_owner_id: clubAssociation.club_owner_id || rosterData.club_owner_id || '',
          organizer: user?.full_name || '',
          source_type: 'net_control',
          source_id: saved?.id || editingNet?.id || '',
        };
        if (editingNet?.event_id) {
          await base44.entities.Event.update(editingNet.event_id, eventPayload).catch(() => {});
        } else {
          const event = await base44.entities.Event.create(eventPayload).catch(() => null);
          if (event?.id && saved?.id) {
            await base44.entities.NetControlSession.update(saved.id, { event_id: event.id }).catch(() => {});
          }
        }
      } else if (editingNet?.event_id) {
        await base44.entities.Event.delete(editingNet.event_id).catch(() => {});
      }
      // Add/update co-hosts. Club Admins/Officers are accepted automatically.
      for (const ch of coHosts) {
        try {
          await base44.functions.invoke('manage-net-hosts', {
            action: 'invite',
            session_id: saved.id,
            user_id: ch.user_id,
            user_name: ch.user_name,
            user_callsign: ch.user_callsign,
            permission_level: ch.permission_level,
            auto_accept: !!ch.club_role,
          });
        } catch (e) { console.error('Co-host invite failed:', e); }
      }

      // Persist removals when editing an existing net.
      if (editingNet?.id) {
        const currentIds = new Set(coHosts.map((h) => h.user_id));
        for (const previous of initialHosts) {
          if (!currentIds.has(previous.user_id)) {
            try {
              await base44.functions.invoke('manage-net-hosts', {
                action: 'remove',
                host_id: previous.host_id,
              });
            } catch (e) { console.error('Co-host removal failed:', e); }
          }
        }
      }
      onCreated(saved || editingNet);
    } catch (e) {
      console.error('Create net error:', e);
      alert('Failed to create net: ' + (e?.message || 'Unknown error'));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingNet ? 'Edit Net Control' : 'Create Net'}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
            <TabsTrigger value="roster" className="flex-1">Roster / Import</TabsTrigger>
            <TabsTrigger value="script" className="flex-1">Script</TabsTrigger>
            <TabsTrigger value="emergency" className="flex-1">Emergency</TabsTrigger>
            <TabsTrigger value="hosts" className="flex-1">Hosts</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="space-y-4 mt-4">
            <div>
              <div className="flex items-center gap-1.5"><Label>Net Name *</Label><TooltipHint>The name operators and members will see for this Net Control event.</TooltipHint></div>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Tuesday Night Net" />
            </div>
            <div>
              <div className="flex items-center gap-1.5"><Label>Description</Label><TooltipHint>A short description explaining the purpose or focus of the net.</TooltipHint></div>
              <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
            </div>
            <div className="rounded-lg border border-border p-4 bg-muted/30">
              <ClubSelector user={user} value={clubAssociation} onChange={handleClubChange} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-1.5"><Label>Net Type</Label><TooltipHint>Choose the category that best describes this net, such as Regular, Training, Special Event, or Emergency.</TooltipHint></div>
                <Select value={form.net_type} onValueChange={(v) => set('net_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{NET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex items-center gap-1.5"><Label>Recurring</Label><TooltipHint>Set whether this net happens once or repeats on a daily, weekly, or monthly schedule.</TooltipHint></div>
                <Select value={form.recurring} onValueChange={(v) => set('recurring', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RECURRING.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border border-border p-4 bg-muted/30 space-y-4">
              <div>
                <div className="flex items-center gap-1.5"><Label className="text-base font-semibold">Radio Information</Label><TooltipHint>Set the radio service, band/channel, frequency, mode, and equipment used for this net.</TooltipHint></div>
                <p className="text-xs text-muted-foreground mt-0.5">Use the same radio-service, band, channel, frequency, mode, and radio fields as Log a Contact.</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5"><Label>Radio Service</Label><TooltipHint>Select GMRS or Amateur Radio (HAM). The available band and channel choices change with the service.</TooltipHint></div>
                <Select value={form.radio_service} onValueChange={(v) => setForm((f) => ({ ...f, radio_service: v, band: '', channel: '', frequency: '', mode: 'Simplex' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="GMRS">GMRS</SelectItem><SelectItem value="HAM">Amateur Radio (HAM)</SelectItem></SelectContent>
                </Select>
              </div>
              {form.radio_service === 'HAM' ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><div className="flex items-center gap-1.5"><Label>HAM Band</Label><TooltipHint>Select the amateur radio band used by the net.</TooltipHint></div><Select value={form.band} onValueChange={(v) => set('band', v)}><SelectTrigger><SelectValue placeholder="Select a band" /></SelectTrigger><SelectContent>{HAM_BANDS.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.range})</SelectItem>)}</SelectContent></Select></div>
                  <div><div className="flex items-center gap-1.5"><Label>Frequency (MHz)</Label><TooltipHint>Enter the operating frequency in MHz. Example: 146.520.</TooltipHint></div><Input type="number" step="0.0001" value={form.frequency} onChange={(e) => set('frequency', e.target.value)} placeholder="e.g. 146.520" /></div>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><div className="flex items-center gap-1.5"><Label>Channel</Label><TooltipHint>Select the GMRS channel for the net. The matching frequency is filled automatically.</TooltipHint></div><Select value={form.channel} onValueChange={(v) => { const ch = GMRS_CHANNELS.find((c) => c.ch === v); setForm((f) => ({ ...f, channel: v, frequency: ch ? String(ch.freq) : '', mode: ch?.type === 'repeater' ? 'Repeater' : 'Simplex' })); }}><SelectTrigger><SelectValue placeholder="Select a GMRS channel" /></SelectTrigger><SelectContent>{GMRS_CHANNELS.map((c) => <SelectItem key={c.ch} value={c.ch}>{c.type === 'repeater' ? 'CH RP' + c.ch : 'CH ' + c.ch}</SelectItem>)}</SelectContent></Select></div>
                  <div><div className="flex items-center gap-1.5"><Label>Frequency (MHz)</Label><TooltipHint>The operating frequency for the selected GMRS channel.</TooltipHint></div><Select value={form.frequency} onValueChange={(v) => { const ch = GMRS_CHANNELS.find((c) => String(c.freq) === v); setForm((f) => ({ ...f, frequency: v, channel: ch ? ch.ch : '', mode: ch?.type === 'repeater' ? 'Repeater' : 'Simplex' })); }}><SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger><SelectContent>{GMRS_CHANNELS.map((c) => <SelectItem key={c.ch} value={String(c.freq)}>{c.freq} MHz</SelectItem>)}</SelectContent></Select></div>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <div><div className="flex items-center gap-1.5"><Label>Mode</Label><TooltipHint>Choose Simplex for direct radio-to-radio communication or Repeater when using a repeater.</TooltipHint></div><Select value={form.mode} onValueChange={(v) => set('mode', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Simplex">Simplex</SelectItem><SelectItem value="Repeater">Repeater</SelectItem></SelectContent></Select></div>
                <div><div className="flex items-center gap-1.5"><Label>Radio Used</Label><TooltipHint>Select the radio or equipment used by Net Control. Your saved equipment can appear here.</TooltipHint></div>{equipment.length === 0 ? <Input value={form.radio_used} onChange={(e) => set('radio_used', e.target.value)} placeholder="Enter radio name" /> : <Select value={radioCustom ? '__custom__' : form.radio_used} onValueChange={(v) => { if (v === '__custom__') setRadioCustom(true); else { setRadioCustom(false); set('radio_used', v); } }}><SelectTrigger><SelectValue placeholder="Select from your equipment" /></SelectTrigger><SelectContent>{equipment.map((eq) => <SelectItem key={eq.id} value={eqLabel(eq)}>{eqLabel(eq)}</SelectItem>)}<SelectItem value="__custom__">Other (type manually)…</SelectItem></SelectContent></Select>}{radioCustom && equipment.length > 0 && <Input value={form.radio_used} onChange={(e) => set('radio_used', e.target.value)} placeholder="Enter radio name" className="mt-2" />}</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-1.5"><Label>Repeater</Label><TooltipHint>Enter the repeater name or callsign when the net uses a repeater.</TooltipHint></div>
                <Input value={form.repeater_name} onChange={(e) => set('repeater_name', e.target.value)} placeholder="Repeater name or callsign" />
              </div>
              <div>
                <div className="flex items-center gap-1.5"><Label>Tone</Label><TooltipHint>Enter the repeater tone, such as 141.3 Hz or a DCS code, when required.</TooltipHint></div>
                <Input value={form.tone} onChange={(e) => set('tone', e.target.value)} placeholder="141.3 Hz or D023" />
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <div className="flex items-center gap-1.5"><Label>Date</Label><TooltipHint>The date the Net Control event is scheduled to take place.</TooltipHint></div>
                <Input type="date" value={form.scheduled_date ? form.scheduled_date.slice(0, 10) : ''} onChange={(e) => set('scheduled_date', e.target.value)} />
              </div>
              <div>
                <div className="flex items-center gap-1.5"><Label>Start Time</Label><TooltipHint>The scheduled time the net begins.</TooltipHint></div>
                <Input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
              </div>
              <div>
                <div className="flex items-center gap-1.5"><Label>End Time</Label><TooltipHint>The scheduled time the net ends.</TooltipHint></div>
                <Input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5"><Label>Location</Label><TooltipHint>Describe the coverage area or location associated with the net. You can also save map coordinates.</TooltipHint></div>
                <Button type="button" size="sm" variant="outline" onClick={() => navigator.geolocation?.getCurrentPosition((pos) => setForm((f) => ({ ...f, latitude: String(pos.coords.latitude.toFixed(6)), longitude: String(pos.coords.longitude.toFixed(6)) })), () => {})}>
                  <MapPin className="w-3.5 h-3.5 mr-1" />Use My Location
                </Button>
              </div>
              <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Repeater coverage area or city" />
              <p className="text-[11px] text-muted-foreground mt-1">Map coordinates: {form.latitude && form.longitude ? `${form.latitude}, ${form.longitude}` : 'not set'}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5"><Label>Notes</Label><TooltipHint>Optional internal notes for Net Control operators.</TooltipHint></div>
              <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="flex items-center gap-1.5"><Label>Public Net</Label><TooltipHint>When enabled, publish this Net Control event so members can find it in the public Net Directory and Events area.</TooltipHint></div>
                <p className="text-xs text-muted-foreground">Show in the Net Directory for all members to find.</p>
              </div>
              <Switch checked={form.is_public} onCheckedChange={(v) => set('is_public', v)} />
            </div>
          </TabsContent>
          <TabsContent value="roster" className="mt-4">
            <RosterPicker user={user} value={rosterData} onChange={setRosterData} />
          </TabsContent>
          <TabsContent value="script" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">Optional operator script read during the net. Leave blank if not needed.<TooltipHint>Use these sections for the wording Net Control should read during the event.</TooltipHint></p>
            {[
              { key: 'script_opening', label: 'Opening' },
              { key: 'script_purpose', label: 'Purpose' },
              { key: 'script_roll_call', label: 'Roll Call' },
              { key: 'script_announcements', label: 'Announcements' },
              { key: 'script_traffic', label: 'Traffic' },
              { key: 'script_emergency', label: 'Emergency Information' },
              { key: 'script_closing', label: 'Closing' },
            ].map((s) => (
              <div key={s.key}>
                <Label>{s.label}</Label>
                <Textarea value={form[s.key]} onChange={(e) => set(s.key, e.target.value)} rows={2} />
              </div>
            ))}
          </TabsContent>
          <TabsContent value="emergency" className="space-y-4 mt-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" />Emergency / Activation Mode<TooltipHint>Enable this to track assigned emergency positions and monitor expected check-ins for an activation.</TooltipHint></Label>
                <p className="text-xs text-muted-foreground">Track position assignments and alert when stations haven't checked in on time.</p>
              </div>
              <Switch checked={form.emergency_mode} onCheckedChange={(v) => set('emergency_mode', v)} />
            </div>
            {form.emergency_mode && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5"><Label>Position Assignments</Label><TooltipHint>Assign callsigns and optional scheduled check-in times to emergency or activation positions.</TooltipHint></div>
                {positions.map((p, i) => (
                  <div key={p.id} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center">
                    <Input className="col-span-2 sm:col-span-4" value={p.name} onChange={(e) => setPositions((prev) => prev.map((x) => x.id === p.id ? { ...x, name: e.target.value } : x))} placeholder="Position name" />
                    <Input className="col-span-2 sm:col-span-4" value={p.callsign} onChange={(e) => setPositions((prev) => prev.map((x) => x.id === p.id ? { ...x, callsign: e.target.value } : x))} placeholder="Assigned callsign" />
                    <Input className="col-span-1 sm:col-span-3" type="time" value={p.scheduled_time} onChange={(e) => setPositions((prev) => prev.map((x) => x.id === p.id ? { ...x, scheduled_time: e.target.value } : x))} />
                    <Button size="icon" variant="ghost" className="col-span-1 sm:col-span-1" onClick={() => setPositions((prev) => prev.filter((x) => x.id !== p.id))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setPositions((prev) => [...prev, { id: `pos-${Date.now()}`, name: '', callsign: '', scheduled_time: '' }])}><Plus className="w-4 h-4 mr-1" />Add Position</Button>
              </div>
            )}
          </TabsContent>
          <TabsContent value="hosts" className="mt-4">
            <CoHostPicker coHosts={coHosts} onChange={setCoHosts} />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Create Net
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}