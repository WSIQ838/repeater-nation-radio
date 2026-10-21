import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  Mountain, ArrowLeft, MapPin, CalendarDays, Users, Play, Check, X, Plus,
  Share2, Pencil, Trash2, Link as LinkIcon, Download, CheckCircle2,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import SotaContactDialog from '@/components/sota/SotaContactDialog';
import SotaActivationDialog from '@/components/sota/SotaActivationDialog';
import SotaMap from '@/components/sota/SotaMap';
import SotaRosterCard from '@/components/sota/SotaRosterCard';
import { bandForFrequency } from '@/lib/adif';
import { STATUS_TONE, MODES, QUALIFY, uniqueCalls, downloadCsv, modeOf } from '@/lib/sota';
import {
  ConsolePage, CommandBar, Panel, DataRow, EmptyPanel, StatusChip,
} from '@/components/console/Console';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

export default function SotaActivationDetail() {
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
  const [modeValue, setModeValue] = useState('SSB');
  const [frequencySaving, setFrequencySaving] = useState(false);
  const [activationLog, setActivationLog] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [a, u] = await Promise.all([
        base44.entities.SotaActivation.get(id).catch(() => null),
        base44.auth.me().catch(() => null),
      ]);
      setActivation(a);
      setUser(u);
      setFrequencyValue(a?.frequency ? String(a.frequency) : '');
      setModeValue(a?.tx_mode || 'SSB');
      try { setActivationLog(JSON.parse(a?.activation_log || '[]')); } catch { setActivationLog([]); }
      if (a) {
        const c = await base44.entities.ContactLog.filter({ sota_activation_id: id }, '-date', 500).catch(() => []);
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
      <Link to="/tools/sota"><Button variant="outline" className="mt-4">Back to SOTA</Button></Link>
    </div>
  );

  const isOwner = activation.created_by_id === user?.id;
  const isCoHost = (activation.co_host_ids || []).includes(user?.id);
  const isClubOwner = activation.club_owner_id === user?.id;
  const canManage = isOwner || isCoHost || isClubOwner || user?.role === 'admin';
  const canLog = activation.status === 'Active' && canManage;
  const worked = uniqueCalls(contacts);
  const qualified = worked >= QUALIFY;
  const exportCsv = () => downloadCsv(`sota-${(activation.summit_ref || 'activation').replace('/', '_')}-${String(activation.started_at || activation.scheduled_date || '').slice(0, 10)}.csv`, contacts, activation.operator_callsign);

  const saveFrequencyChange = async () => {
    if (!activation?.id || !frequencyValue) {
      toast({ title: 'Enter a frequency', variant: 'destructive' }); return;
    }
    setFrequencySaving(true);
    try {
      const oldFrequency = activation.frequency ?? null;
      const oldMode = activation.tx_mode || '';
      const nextFrequency = Number(frequencyValue);
      if (!Number.isFinite(nextFrequency)) throw new Error('Invalid frequency');
      if (oldFrequency === nextFrequency && oldMode === modeValue) { setShowFrequencyEdit(false); return; }
      const band = bandForFrequency(nextFrequency) || activation.band || '';
      const logEntry = {
        id: 'freq-' + Date.now(), type: 'frequency_change', timestamp: new Date().toISOString(),
        callsign: user?.callsign || user?.full_name || activation.operator_callsign || 'Operator',
        from_frequency: oldFrequency, to_frequency: nextFrequency, from_mode: oldMode, to_mode: modeValue,
      };
      const nextActivationLog = [...activationLog, logEntry];
      const patch = { frequency: nextFrequency, band, tx_mode: modeValue, activation_log: JSON.stringify(nextActivationLog) };
      await base44.entities.SotaActivation.update(activation.id, patch);
      setActivation((prev) => ({ ...prev, ...patch }));
      setActivationLog(nextActivationLog); setShowFrequencyEdit(false);
      toast({ title: 'Frequency / mode updated', description: 'The change was added to the activation log.' });
    } catch { toast({ title: 'Could not update frequency', variant: 'destructive' }); }
    finally { setFrequencySaving(false); }
  };
  const setStatus = async (status) => {
    const patch = { status };
    if (status === 'Active' && !activation.started_at) patch.started_at = new Date().toISOString();
    if (status === 'Completed' && !activation.ended_at) patch.ended_at = new Date().toISOString();
    try {
      await base44.entities.SotaActivation.update(activation.id, patch);
      setActivation({ ...activation, ...patch });
      toast({ title: `Activation ${status.toLowerCase()}` });
    } catch { toast({ title: 'Could not update status', variant: 'destructive' }); }
  };

  const share = async () => {
    const url = `${window.location.origin}/tools/sota/${activation.id}`;
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
      await base44.entities.SotaActivation.delete(activation.id);
      toast({ title: 'Activation deleted' });
      navigate('/tools/sota');
    } catch { toast({ title: 'Could not delete', variant: 'destructive' }); }
  };

  const statusTone = STATUS_TONE[activation.status] || 'muted';
  const freqChanges = [...activationLog.filter((e) => e.type === 'frequency_change')].reverse();
  const openFrequencyEditor = () => {
    setFrequencyValue(activation.frequency ? String(activation.frequency) : '');
    setModeValue(activation.tx_mode || 'SSB');
    setShowFrequencyEdit(true);
  };

  return (
    <ConsolePage>
      <CommandBar
        icon={Mountain}
        title={activation.summit_name}
        subtitle={`${activation.summit_ref} · SOTA operations`}
        status={activation.status === 'Active' ? (qualified ? 'Live · qualified' : 'Live activation') : activation.status}
        statusTone={statusTone}
        statusPulse={activation.status === 'Active'}
        actions={(
          <>
            <Link to="/tools/sota" className="hidden sm:inline-flex"><Button variant="outline" size="sm" title="Return to the SOTA operations page."><ArrowLeft className="w-4 h-4 mr-1.5" /> SOTA</Button></Link>
            <Button variant="outline" size="sm" title="Copy a shareable link to this activation." onClick={share}><Share2 className="w-4 h-4 mr-1.5" /> Share</Button>
            {contacts.length > 0 && <Button variant="outline" size="sm" title="Download the SOTA CSV to upload at the SOTA database." onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" /> SOTA CSV</Button>}
          </>
        )}
        kpis={[
          { label: 'Contacts', value: activation.contacts_count || contacts.length },
          { label: 'Qualification', value: `${worked} / ${QUALIFY}`, tone: qualified ? 'success' : 'primary', title: `An activation qualifies with contacts with ${QUALIFY} different stations.` },
          {
            label: 'Frequency / mode',
            value: (
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm">{activation.frequency ? `${activation.frequency} MHz` : '—'}{activation.tx_mode ? ` · ${activation.tx_mode}` : ''}</span>
                {canManage && activation.status === 'Active' && (
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] font-sans" title="Change the operating frequency or mode and record it in the activation history." onClick={openFrequencyEditor}>Change</Button>
                )}
              </span>
            ),
          },
          { label: 'Points', value: activation.summit_points != null ? activation.summit_points : '—', title: 'Activation points for this summit.' },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
        <Link to="/tools/sota" className="inline-flex items-center gap-1.5 hover:text-foreground"><ArrowLeft className="w-3.5 h-3.5" /> Back to SOTA operations</Link>
        <div className="flex flex-wrap items-center gap-4">
          {activation.summit_location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {activation.summit_location}</span>}
          {activation.operator_callsign && <span className="inline-flex items-center gap-1.5">Operator <span className="font-mono text-foreground">{activation.operator_callsign}</span><StaffTag callsign={activation.operator_callsign} /></span>}
          {activation.scheduled_date && <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {format(new Date(activation.scheduled_date), 'EEE, MMM d · h:mm a')}</span>}
        </div>
      </div>

      {canManage && (
        <Panel title="Activation control" accent="primary" meta={activation.status}>
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
            {activation.status === 'Upcoming' && <Button size="sm" title="Mark the activation as live and begin the activation." onClick={() => setStatus('Active')}><Play className="w-4 h-4 mr-1.5" /> Start Activation</Button>}
            {activation.status === 'Active' && <Button size="sm" title="Open the contact logger for this activation." onClick={() => setShowContact(true)}><Plus className="w-4 h-4 mr-1.5" /> Log Contact</Button>}
            {activation.status === 'Active' && <Button size="sm" variant="outline" title="Mark the activation as completed." onClick={() => setStatus('Completed')}><Check className="w-4 h-4 mr-1.5" /> Complete</Button>}
            {activation.status !== 'Completed' && activation.status !== 'Cancelled' && <Button size="sm" variant="outline" title="Cancel this SOTA activation." onClick={() => setStatus('Cancelled')}><X className="w-4 h-4 mr-1.5" /> Cancel</Button>}
            {isOwner && <Button size="sm" variant="outline" title="Edit the activation details." onClick={() => setShowEdit(true)}><Pencil className="w-4 h-4 mr-1.5" /> Edit</Button>}
            {isOwner && <Button size="sm" variant="ghost" title="Permanently delete this activation." onClick={removeActivation} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4 mr-1.5" /> Delete</Button>}
          </div>
          <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="px-3.5 py-2.5"><div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">Status</div><div className="mt-0.5 font-semibold text-sm">{activation.status}</div></div>
            <div className="px-3.5 py-2.5"><div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">Started</div><div className="mt-0.5 font-mono text-sm">{activation.started_at ? format(new Date(activation.started_at), 'MMM d · h:mm a') : 'Not started'}</div></div>
            <div className="px-3.5 py-2.5"><div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">Ended</div><div className="mt-0.5 font-mono text-sm">{activation.ended_at ? format(new Date(activation.ended_at), 'MMM d · h:mm a') : '—'}</div></div>
          </div>
          {activation.status === 'Active' && (
            <div className={`px-3.5 py-2 border-t border-border text-xs flex items-center gap-2 ${qualified ? 'bg-success/10' : 'bg-muted/30'}`}>
              {qualified ? <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" /> : <Mountain className="w-3.5 h-3.5 text-primary shrink-0" />}
              <span>{qualified ? <><strong>Activation qualifies</strong> — {worked} different stations worked.</> : <>{worked} of {QUALIFY} different stations worked — <strong>{QUALIFY - worked} more</strong> to qualify.</>}</span>
            </div>
          )}
          {activation.co_host_names?.length > 0 && (
            <div className="px-3.5 py-2 border-t border-border bg-primary/5 text-xs flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-primary shrink-0" />
              <span><strong>Co-host logging enabled:</strong> {activation.co_host_names.join(', ')} can log contacts for this activation.</span>
            </div>
          )}
        </Panel>
      )}

      {showFrequencyEdit && (
        <Panel title="Change frequency / mode" accent="primary" meta="Recorded in activation history">
          <div className="p-3.5 grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Frequency (MHz)</label>
              <input title="Operating frequency in MHz." type="number" step="0.0001" value={frequencyValue} onChange={(e) => setFrequencyValue(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono" />
              <p className="text-[10px] text-muted-foreground mt-1">Band: {bandForFrequency(Number(frequencyValue)) || '—'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mode</label>
              <select value={modeValue} onChange={(e) => setModeValue(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="px-3.5 pb-3.5 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setShowFrequencyEdit(false)}>Cancel</Button><Button size="sm" onClick={saveFrequencyChange} disabled={frequencySaving}>{frequencySaving ? 'Saving…' : 'Save'}</Button></div>
        </Panel>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)] gap-3 items-start">
        <Panel title="Activation map" accent="success" meta={activation.lat && activation.lng ? `${Number(activation.lat).toFixed(3)}, ${Number(activation.lng).toFixed(3)}` : 'No coordinates'}>
          {activation.lat && activation.lng ? (
            <SotaMap summit={{ lat: activation.lat, lng: activation.lng, name: activation.summit_name, ref: activation.summit_ref, location: activation.summit_location }} contacts={contacts} height="380px" bare />
          ) : (
            <EmptyPanel icon={MapPin} title="No mapped coordinates" text="No coordinates were saved for this activation." />
          )}
        </Panel>

        <div className="space-y-3 min-w-0">
          <SotaRosterCard activation={activation} contacts={contacts} canManage={canManage} onChanged={load} />
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
        actions={canLog ? <Button size="sm" className="h-7 text-[11px]" title="Log a new contact for this activation." onClick={() => setShowContact(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Log Contact</Button> : null}
      >
        {contacts.length === 0 && freqChanges.length === 0 ? (
          <EmptyPanel
            icon={Mountain}
            title="No contacts logged yet"
            text={activation.status === 'Active' ? 'Log your first contact to start the activation log.' : 'Contacts will appear here once the activation is live.'}
          />
        ) : (
          <div className="max-h-[52vh] overflow-y-auto scrollbar-thin">
            {freqChanges.map((entry) => (
              <DataRow key={entry.id || entry.timestamp} className="grid-cols-[52px_minmax(0,1fr)_auto] bg-primary/5">
                <StatusChip tone="primary">RF</StatusChip>
                <div className="min-w-0">
                  <div className="font-medium text-sm">QSY</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">{entry.to_frequency ? entry.to_frequency + ' MHz' : '—'}{entry.to_mode ? ' ' + entry.to_mode : ''} · from {entry.from_frequency ? entry.from_frequency + ' MHz' : '—'}{entry.from_mode ? ' ' + entry.from_mode : ''}</div>
                </div>
                <div className="text-right text-[11px] text-muted-foreground shrink-0"><div>{entry.callsign || 'Operator'}</div><div>{entry.timestamp ? format(new Date(entry.timestamp), 'MMM d, h:mm a') : ''}</div></div>
              </DataRow>
            ))}
            {contacts.map((c) => (
              <DataRow key={c.id} className="grid-cols-[84px_minmax(0,1fr)_24px]">
                <span className="font-mono text-[13px] font-semibold text-primary truncate">{c.callsign}</span><StaffTag callsign={c.callsign} compact />
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground truncate">{c.date ? format(new Date(c.date), 'MMM d, HH:mm') : ''}{c.band ? ` · ${c.band}` : ''} {modeOf(c)}{c.signal_report ? ` · ${c.signal_report}` : ''}{c.contact_name ? ` · ${c.contact_name}` : ''}</div>
                  {c.sota_ref && <div className="text-[11px] text-success truncate">Summit-to-summit · <span className="font-mono">{c.sota_ref}</span></div>}
                </div>
                <Link to="/logbook" className="text-muted-foreground hover:text-primary" title="Open logbook"><LinkIcon className="w-4 h-4" /></Link>
              </DataRow>
            ))}
          </div>
        )}
      </Panel>

      <SotaContactDialog open={showContact} onClose={() => setShowContact(false)} activation={activation} onLogged={load} />
      <SotaActivationDialog open={showEdit} onClose={() => setShowEdit(false)} user={user} onSaved={load} editing={activation} />
    </ConsolePage>
  );
}
