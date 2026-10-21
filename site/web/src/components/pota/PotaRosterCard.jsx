import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, X, UserPlus, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Panel, DataRow } from '@/components/console/Console';

const parseRoster = (raw) => {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
};

export default function PotaRosterCard({ activation, contacts, canManage, onChanged }) {
  const { toast } = useToast();
  const editable = canManage && (activation.status === 'Upcoming' || activation.status === 'Active');
  const [roster, setRoster] = useState(parseRoster(activation.roster_members));
  const [entry, setEntry] = useState({ callsign: '', name: '', location: '' });
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);

  const contactedCs = new Set(contacts.map((c) => (c.callsign || '').toUpperCase()));
  const contactedCount = roster.filter((r) => contactedCs.has((r.callsign || '').toUpperCase())).length;

  const lookup = async (callsign) => {
    const cs = (callsign || '').trim().toUpperCase();
    if (cs.length < 3) return;
    setLooking(true);
    try {
      const res = await base44.functions.invoke('lookup-callsign-location', { callsign: cs });
      const data = res?.data || res;
      if (data?.found) {
        setEntry((e) => ({
          ...e,
          name: e.name || data.licensee || '',
          location: e.location || [data.city, data.state].filter(Boolean).join(', ') || '',
        }));
      }
    } catch { /* ignore */ }
    setLooking(false);
  };

  const add = async () => {
    if (!entry.callsign.trim()) return;
    const next = [...roster, { callsign: entry.callsign.trim().toUpperCase(), name: entry.name.trim(), location: entry.location.trim() }];
    setRoster(next);
    setEntry({ callsign: '', name: '', location: '' });
    await persist(next);
  };

  const remove = async (i) => {
    const next = roster.filter((_, idx) => idx !== i);
    setRoster(next);
    await persist(next);
  };

  const persist = async (next) => {
    setSaving(true);
    try {
      await base44.entities.PotaActivation.update(activation.id, { roster_members: JSON.stringify(next) });
    } catch {
      toast({ title: 'Could not save roster', variant: 'destructive' });
    }
    setSaving(false);
  };

  if (!roster.length && !editable) return null;

  return (
    <Panel
      title="Roster"
      accent="primary"
      meta={roster.length > 0 ? `${contactedCount}/${roster.length} contacted` : undefined}
      actions={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : null}
    >
      {editable && (
        <div className="grid sm:grid-cols-4 gap-2 p-3 border-b border-border">
          <div className="relative">
            <Input
              title="Enter the operator callsign. Leaving the field can trigger an automatic lookup."
              value={entry.callsign}
              onChange={(e) => setEntry({ ...entry, callsign: e.target.value })}
              onBlur={(e) => lookup(e.target.value)}
              placeholder="Callsign *"
              className="h-8 text-xs font-mono"
            />
            {looking && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
          <Input className="h-8 text-xs" title="Enter or edit the operator name." value={entry.name} onChange={(e) => setEntry({ ...entry, name: e.target.value })} placeholder="Name" />
          <Input className="h-8 text-xs" title="Enter or edit the operator location." value={entry.location} onChange={(e) => setEntry({ ...entry, location: e.target.value })} placeholder="Location" />
          <Button type="button" size="sm" className="h-8 text-xs" title="Add the operator to this activation roster." onClick={add} disabled={!entry.callsign.trim() || saving}>
            <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add
          </Button>
        </div>
      )}

      {roster.length === 0 ? (
        <p className="px-3.5 py-4 text-xs text-muted-foreground">{editable ? 'Add expected operators to track them at the same location as you and add them to the log contacts.' : 'No roster set.'}</p>
      ) : (
        <div>
          {roster.map((r, i) => {
            const done = contactedCs.has((r.callsign || '').toUpperCase());
            return (
              <DataRow key={i} highlight={done} className="grid-cols-[18px_96px_minmax(0,1fr)_20px] !py-1.5">
                <span className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 ${done ? 'bg-success border-success text-white' : 'border-muted-foreground/30'}`}>
                  {done && <Check className="w-3 h-3" />}
                </span>
                <span className="font-mono text-[13px] font-semibold text-primary truncate">{r.callsign}</span>
                <span className="text-[11px] text-muted-foreground truncate">{[r.name, r.location].filter(Boolean).join(' · ')}</span>
                {editable ? (
                  <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive" title="Remove this operator from the activation roster.">
                    <X className="w-4 h-4" />
                  </button>
                ) : <span />}
              </DataRow>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
