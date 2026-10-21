import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  Trees, ArrowLeft, MapPin, CalendarDays, Users, Play, Check, X, Plus,
  Share2, Pencil, Trash2, Link as LinkIcon,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PotaContactDialog from '@/components/pota/PotaContactDialog';
import PotaActivationDialog from '@/components/pota/PotaActivationDialog';
import PotaMap from '@/components/pota/PotaMap';
import PotaContactsMap from '@/components/pota/PotaContactsMap';
import PotaRosterCard from '@/components/pota/PotaRosterCard';
import { GMRS_CHANNELS } from '@/lib/gmrsChannels';
import {
  ConsolePage, CommandBar, Panel, DataRow, EmptyPanel, StatusChip,
} from '@/components/console/Console';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

const STATUS_TONE = {
  Upcoming: 'primary',
  Active: 'success',
  Completed: 'muted',
  Cancelled: 'danger',
};

export default function PotaActivationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activation, setActivation] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showContact, setShowContact] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showFrequencyEdit, setShowFrequencyEdit] = useState(false);
  const [frequencyValue, setFrequencyValue] = useState('');
  const [channelValue, setChannelValue] = useState('');
  const [frequencySaving, setFrequencySaving] = useState(false);
  const [activationLog, setActivationLog] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [a, u] = await Promise.all([
        base44.entities.PotaActivation.get(id).catch(() => null),
        base44.auth.me().catch(() => null),
      ]);
      setActivation(a);
      setUser(u);
      setFrequencyValue(a?.frequency ? String(a.frequency) : '');
      setChannelValue(a?.channel || '');
      try { setActivationLog(JSON.parse(a?.activation_log || '[]')); } catch { setActivationLog([]); }
      if (a) {
        const c = await base44.entities.ContactLog.filter({ pota_activation_id: id }, '-date', 500).catch(() => []);
        setContacts(c || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="p-8 max-w-4xl mx-auto"><div className="h-64 rounded-xl bg-muted animate-pulse" /></div>;
  if (!activation) return (
    <div className="p-8 max-w-4xl mx-auto text-center text-muted-foreground">
      <p>Activation not found.</p>
      <Link to="/tools/pota"><Button variant="outline" title="Return to the POTA operations page." className="mt-4">Back to POTA</Button></Link>
    </div>
  );

  const isOwner = activation.created_by_id === user?.id;
  const isCoHost = (activation.co_host_ids || []).includes(user?.id);
  const isClubOwner = activation.club_owner_id === user?.id;
  const canManage = isOwner || isCoHost || isClubOwner || user?.role === 'admin';
  const canLog = activation.status === 'Active' && canManage;

  const saveFrequencyChange = async () => {
    if (!activation?.id || !frequencyValue) {
      toast({ title: 'Enter a frequency', variant: 'destructive' }); return;
    }
    setFrequencySaving(true);
    try {
      const oldFrequency = activation.frequency ?? null;
      const oldChannel = activation.channel || '';
      const nextFrequency = Number(frequencyValue);
      if (!Number.isFinite(nextFrequency)) throw new Error('Invalid frequency');
      const changed = oldFrequency !== nextFrequency || oldChannel !== channelValue;
      if (!changed) { setShowFrequencyEdit(false); return; }
      const entry = {
        id: 'freq-' + Date.now(), timestamp: new Date().toISOString(),
        changed_by: user?.id || '', callsign: user?.callsign || user?.full_name || activation.operator_callsign || 'Operator',
        from_frequency: oldFrequency, to_frequency: nextFrequency, from_channel: oldChannel, to_channel: channelValue || ''
      };
      const logEntry = { id: entry.id, type: 'frequency_change', timestamp: entry.timestamp, callsign: entry.callsign, from_frequency: oldFrequency, to_frequency: nextFrequency, from_channel: oldChannel, to_channel: channelValue || '' };
      const nextActivationLog = [...activationLog, logEntry];
      await base44.entities.PotaActivation.update(activation.id, { frequency: nextFrequency, channel: channelValue || '', activation_log: JSON.stringify(nextActivationLog) });
      setActivation((prev) => ({ ...prev, frequency: nextFrequency, channel: channelValue || '', activation_log: JSON.stringify(nextActivationLog) }));
      setActivationLog(nextActivationLog); setShowFrequencyEdit(false);
      toast({ title: 'Operating frequency updated', description: 'The frequency change was added to the activation log.' });
    } catch { toast({ title: 'Could not update frequency', variant: 'destructive' }); }
    finally { setFrequencySaving(false); }
  };
  const setStatus = async (status) => {
    const patch = { status };
    if (status === 'Active' && !activation.started_at) patch.started_at = new Date().toISOString();
    if (status === 'Completed' && !activation.ended_at) patch.ended_at = new Date().toISOString();
    try {
      await base44.entities.PotaActivation.update(activation.id, patch);
      setActivation({ ...activation, ...patch });
      toast({ title: `Activation ${status.toLowerCase()}` });
    } catch { toast({ title: 'Could not update status', variant: 'destructive' }); }
  };

  const share = async () => {
    const url = `${window.location.origin}/tools/pota/${activation.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: 'Share this activation with other operators.' });
    } catch {
      toast({ title: url, description: 'Copy this link to share.' });
    }
  };

  const removeActivation = async () => {
    if (!confirm('Delete this activation? Contacts logged in your logbook will remain.')) return;
    try {
      await base44.entities.PotaActivation.delete(activation.id);
      toast({ title: 'Activation deleted' });
      navigate('/tools/pota');
    } catch { toast({ title: 'Could not delete', variant: 'destructive' }); }
  };

  const statusTone = STATUS_TONE[activation.status] || 'muted';
  const freqChanges = [...activationLog.filter((e) => e.type === 'frequency_change')].reverse();
  const openFrequencyEditor = () => {
    setFrequencyValue(activation.frequency ? String(activation.frequency) : '');
    setChannelValue(activation.channel || '');
    setShowFrequencyEdit(true);
  };

  return (
    <ConsolePage>
      <CommandBar
        icon={Trees}
        title={activation.park_name}
        subtitle={`${activation.park_number} · POTA operations`}
        status={activation.status === 'Active' ? 'Live activation' : activation.status}
        statusTone={statusTone}
        statusPulse={activation.status === 'Active'}
        actions={(
          <>
            <Link to="/tools/pota" className="hidden sm:inline-flex"><Button variant="outline" size="sm" title="Return to the POTA operations page."><ArrowLeft className="w-4 h-4 mr-1.5" /> POTA</Button></Link>
            <Button variant="outline" size="sm" title="Copy a shareable link to this activation." onClick={share}><Share2 className="w-4 h-4 mr-1.5" /> Share</Button>
          </>
        )}
        kpis={[
          { label: 'Contacts', value: activation.contacts_count || 0 },
          { label: 'Service / Mode', value: <span className="text-sm">{activation.radio_service || '—'} · {activation.mode || '—'}</span> },
          {
            label: 'Frequency',
            value: (
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm">{activation.frequency ? `${activation.frequency} MHz` : '—'}{activation.channel ? ` · Ch${activation.channel}` : ''}</span>
                {canManage && activation.status === 'Active' && (
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] font-sans" title="Change the operating frequency and record the change in activation history." onClick={openFrequencyEditor}>Change</Button>
                )}
              </span>
            ),
          },
          { label: 'Operator', value: <span className="text-sm flex items-center gap-1.5 min-w-0"><span className="truncate">{activation.operator_callsign || activation.operator_name || '—'}</span><StaffTag callsign={activation.operator_callsign} /></span> },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
        <Link to="/tools/pota" title="Return to the POTA operations page." className="inline-flex items-center gap-1.5 hover:text-foreground"><ArrowLeft className="w-3.5 h-3.5" /> Back to POTA operations</Link>
        <div className="flex flex-wrap items-center gap-4">
          {activation.park_location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {activation.park_location}</span>}
          {activation.scheduled_date && <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {format(new Date(activation.scheduled_date), 'EEE, MMM d · h:mm a')}</span>}
        </div>
      </div>

      {canManage && (
        <Panel title="Activation control" accent="primary" meta={activation.status}>
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
            {activation.status === 'Upcoming' && <Button size="sm" title="Mark the activation as live and begin the activation." onClick={() => setStatus('Active')}><Play className="w-4 h-4 mr-1.5" /> Start Activation</Button>}
            {activation.status === 'Active' && <Button size="sm" title="Open the contact logger for this active POTA activation." onClick={() => setShowContact(true)}><Plus className="w-4 h-4 mr-1.5" /> Log Contact</Button>}
            {activation.status === 'Active' && <Button size="sm" variant="outline" title="Mark the activation as completed." onClick={() => setStatus('Completed')}><Check className="w-4 h-4 mr-1.5" /> Complete</Button>}
            {activation.status !== 'Completed' && activation.status !== 'Cancelled' && <Button size="sm" variant="outline" title="Cancel this POTA activation." onClick={() => setStatus('Cancelled')}><X className="w-4 h-4 mr-1.5" /> Cancel</Button>}
            {isOwner && <Button size="sm" variant="outline" title="Edit the activation details." onClick={() => setShowEdit(true)}><Pencil className="w-4 h-4 mr-1.5" /> Edit</Button>}
            {isOwner && <Button size="sm" variant="ghost" title="Permanently delete this activation." onClick={removeActivation} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4 mr-1.5" /> Delete</Button>}
          </div>
          <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="px-3.5 py-2.5"><div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">Status</div><div className="mt-0.5 font-semibold text-sm">{activation.status}</div></div>
            <div className="px-3.5 py-2.5"><div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">Started</div><div className="mt-0.5 font-mono text-sm">{activation.started_at ? format(new Date(activation.started_at), 'MMM d · h:mm a') : 'Not started'}</div></div>
            <div className="px-3.5 py-2.5"><div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">Ended</div><div className="mt-0.5 font-mono text-sm">{activation.ended_at ? format(new Date(activation.ended_at), 'MMM d · h:mm a') : '—'}</div></div>
          </div>
          {activation.co_host_names?.length > 0 && (
            <div className="px-3.5 py-2 border-t border-border bg-primary/5 text-xs flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-primary shrink-0" />
              <span><strong>Co-host logging enabled:</strong> {activation.co_host_names.join(', ')} can log contacts for this activation.</span>
            </div>
          )}
        </Panel>
      )}

      {showFrequencyEdit && (
        <Panel title="Change operating frequency" accent="primary" meta="Recorded in activation history">
          <div className="p-3.5 grid sm:grid-cols-3 gap-3">
            {activation.radio_service === 'HAM' ? (
              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-muted-foreground">Frequency (MHz)</label>
                <input title="Enter the HAM operating frequency in MHz." type="number" step="0.0001" value={frequencyValue} onChange={(e) => setFrequencyValue(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono" />
                <p className="text-[10px] text-muted-foreground mt-1">HAM frequencies remain manually editable.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Channel</label>
                  <select
                    title="Select a GMRS channel and automatically update the frequency when a match exists."
                    value={channelValue}
                    onChange={(e) => {
                      const channel = e.target.value;
                      const match = GMRS_CHANNELS.find((c) => c.ch === channel);
                      setChannelValue(channel);
                      if (match) setFrequencyValue(String(match.freq));
                    }}
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select a GMRS channel…</option>
                    {GMRS_CHANNELS.map((c) => <option key={c.ch} value={c.ch}>{c.type === 'repeater' ? `CH RP${c.ch}` : `CH ${c.ch}`}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Frequency (MHz)</label>
                  <select
                    title="Select a GMRS frequency and automatically update the channel when a match exists."
                    value={frequencyValue}
                    onChange={(e) => {
                      const frequency = e.target.value;
                      const match = GMRS_CHANNELS.find((c) => String(c.freq) === String(frequency));
                      setFrequencyValue(frequency);
                      if (match) setChannelValue(match.ch);
                    }}
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono"
                  >
                    <option value="">Select frequency…</option>
                    {GMRS_CHANNELS.map((c) => <option key={c.ch} value={c.freq}>{c.freq} MHz</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
          <div className="px-3.5 pb-3.5 flex justify-end gap-2"><Button size="sm" variant="outline" title="Close the frequency editor without saving." onClick={() => setShowFrequencyEdit(false)}>Cancel</Button><Button size="sm" title="Save the new operating frequency and add a history entry." onClick={saveFrequencyChange} disabled={frequencySaving}>{frequencySaving ? 'Saving…' : 'Save Frequency'}</Button></div>
        </Panel>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)] gap-3 items-start">
        <Panel title="Activation map" accent="success" meta={activation.lat && activation.lng ? `${Number(activation.lat).toFixed(3)}, ${Number(activation.lng).toFixed(3)}` : 'No coordinates'}>
          {activation.lat && activation.lng ? (
            contacts.some((c) => c.lat && c.lng)
              ? <PotaContactsMap activation={activation} contacts={contacts} height="380px" bare />
              : <PotaMap parks={[activation]} height="380px" bare />
          ) : (
            <EmptyPanel icon={MapPin} title="No mapped coordinates" text="No coordinates were saved for this activation." />
          )}
        </Panel>

        <div className="space-y-3 min-w-0">
          <PotaRosterCard activation={activation} contacts={contacts} canManage={canManage} onChanged={load} />
          {activation.notes && (
            <Panel title="Operational notes" accent="muted">
              <div className="p-3.5 text-sm text-muted-foreground whitespace-pre-wrap"><Linkify text={activation.notes} /></div>
            </Panel>
          )}
          {(activation.co_host_names?.length > 0 || activation.club_name) && (
            <Panel title="Operators / club" accent="muted">
              <div className="p-3.5 space-y-2 text-sm">
                {activation.co_host_names?.length > 0 && <div className="flex items-start gap-2"><Users className="w-4 h-4 mt-0.5 text-primary" /> <span>Co-hosts: {activation.co_host_names.join(', ')}</span></div>}
                {activation.club_name && <Link to={`/clubs/${activation.club_id}`} title="Open this club." className="flex items-center gap-2 text-primary hover:underline"><Users className="w-4 h-4" /> {activation.club_name}</Link>}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <Panel
        title="Activation log"
        accent="primary"
        meta={`${contacts.length} contact${contacts.length === 1 ? '' : 's'}`}
        actions={canLog ? <Button size="sm" className="h-7 text-[11px]" title="Log a new contact for this active POTA activation." onClick={() => setShowContact(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Log Contact</Button> : null}
      >
        {contacts.length === 0 && freqChanges.length === 0 ? (
          <EmptyPanel
            icon={Trees}
            title="No contacts logged yet"
            text={activation.status === 'Active' ? 'Log your first contact to start the activation log.' : 'Contacts will appear here once the activation is live.'}
          />
        ) : (
          <div className="max-h-[52vh] overflow-y-auto scrollbar-thin">
            {freqChanges.map((entry) => (
              <DataRow key={entry.id || entry.timestamp} className="grid-cols-[52px_minmax(0,1fr)_auto] bg-primary/5">
                <StatusChip tone="primary">RF</StatusChip>
                <div className="min-w-0">
                  <div className="font-medium text-sm">Operating frequency changed</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">{entry.to_frequency ? entry.to_frequency + ' MHz' : '—'}{entry.to_channel ? ' · Ch' + entry.to_channel : ''} · from {entry.from_frequency ? entry.from_frequency + ' MHz' : '—'}{entry.from_channel ? ' · Ch' + entry.from_channel : ''}</div>
                </div>
                <div className="text-right text-[11px] text-muted-foreground shrink-0"><div>{entry.callsign || 'Operator'}</div><div>{entry.timestamp ? format(new Date(entry.timestamp), 'MMM d, h:mm a') : ''}</div></div>
              </DataRow>
            ))}
            {contacts.map((c) => (
              <DataRow key={c.id} className="grid-cols-[84px_minmax(0,1fr)_24px]">
                <span className="font-mono text-[13px] font-semibold text-primary truncate">{c.callsign}</span><StaffTag callsign={c.callsign} compact />
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground truncate">{c.date ? format(new Date(c.date), 'MMM d, h:mm a') : ''}{c.signal_report ? ` · ${c.signal_report}` : ''}{c.contact_name ? ` · ${c.contact_name}` : ''}</div>
                  {c.notes && <div className="text-[11px] text-muted-foreground/80 truncate"><Linkify text={c.notes} /></div>}
                </div>
                <Link to="/logbook" className="text-muted-foreground hover:text-primary" title="Open logbook"><LinkIcon className="w-4 h-4" /></Link>
              </DataRow>
            ))}
          </div>
        )}
      </Panel>

      <PotaContactDialog open={showContact} onClose={() => setShowContact(false)} activation={activation} onLogged={load} />
      <PotaActivationDialog open={showEdit} onClose={() => setShowEdit(false)} user={user} onSaved={load} editing={activation} />
    </ConsolePage>
  );
}
