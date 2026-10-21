import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Copy, Trash2, Save, FileDown, GripVertical, FileText, Radio, Layers3, Pencil, X, ChevronRight } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { GMRS_CHANNELS } from '@/lib/gmrsChannels';

const GMRS_DEFAULT = GMRS_CHANNELS.map((c) => ({
  ch: Number(c.ch),
  name: `GMRS ${c.ch}`,
  rx: Number(c.freq),
  tx: c.input ? Number(c.input) : Number(c.freq),
  tone: '',
  tone_dir: '',
  repeater: '',
  notes: c.input ? `Repeater · RX ${c.freq} MHz · TX ${c.input} MHz` : 'Simplex',
}));

const blank = () => ({ ch: '', name: '', rx: '', tx: '', tone: '', tone_dir: '', repeater: '', notes: '' });
const parseChannels = (str) => { try { const a = JSON.parse(str || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

export default function ChannelPlanner() {
  const { toast } = useToast();
  const [plans, setPlans] = useState([]);
  const [active, setActive] = useState(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const me = await base44.auth.me();
      const list = await base44.entities.ChannelPlan.filter({ created_by_id: me.id }, '-updated_date', 100);
      setPlans(list || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openPlan = (p) => {
    setActive(p);
    setName(p.name || '');
    setDesc(p.description || '');
    setChannels(parseChannels(p.channels));
  };

  const newPlan = () => {
    setActive({ id: 'new' });
    setName('My Channel Plan');
    setDesc('');
    setChannels([blank()]);
  };

  const closePlan = () => {
    setActive(null);
    setName('');
    setDesc('');
    setChannels([]);
  };

  const update = (i, field, value) => {
    setChannels((chs) => chs.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  };

  const addChannel = () => setChannels((chs) => [...chs, blank()]);

  const duplicate = (i) => setChannels((chs) => {
    const copy = { ...chs[i] };
    return [...chs.slice(0, i + 1), copy, ...chs.slice(i + 1)];
  });

  const remove = (i) => setChannels((chs) => chs.filter((_, idx) => idx !== i));

  const onDragEnd = (r) => {
    if (!r.destination) return;
    setChannels((chs) => {
      const next = [...chs];
      const [moved] = next.splice(r.source.index, 1);
      next.splice(r.destination.index, 0, moved);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = { name, description: desc, channels: JSON.stringify(channels) };
      if (active?.id === 'new') {
        const created = await base44.entities.ChannelPlan.create(payload);
        setActive(created);
        toast({ title: 'Channel plan saved' });
      } else if (active?.id) {
        await base44.entities.ChannelPlan.update(active.id, payload);
        toast({ title: 'Channel plan saved' });
      }
      await load();
    } catch (e) {
      toast({ title: 'Save failed', variant: 'destructive' });
    }
    setSaving(false);
  };

  const del = async (p) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    try {
      await base44.entities.ChannelPlan.delete(p.id);
      if (active?.id === p.id) closePlan();
      await load();
    } catch (e) {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const exportCSV = () => {
    const header = ['Channel', 'Name', 'RX (MHz)', 'TX (MHz)', 'Tone', 'Tone Dir', 'Repeater', 'Notes'];
    const rows = channels.map((c) => [c.ch, c.name, c.rx, c.tx, c.tone, c.tone_dir, c.repeater, c.notes]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name || 'channel-plan').replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ name, description: desc, channels }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name || 'channel-plan').replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadDefaults = () => {
    setChannels(GMRS_DEFAULT.map((c) => ({ ...c })));
    toast({ title: 'GMRS defaults loaded', description: `${GMRS_DEFAULT.length} standard channels added to this plan.` });
  };

  return (
    <ToolShell
      title="Channel Planner"
      description="Build, organize, save, and export radio channel plans."
      icon={ClipboardList}
      disclaimer={false}
    >
      <div className="max-w-[1700px] mx-auto space-y-4">
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-orange-500" />
          <div className="px-4 py-4 sm:px-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid place-items-center w-11 h-11 rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-heading font-bold tracking-tight">Channel Planner</h1>
                  <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider">Radio Tools</span>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Build a clean channel plan before programming your radio.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {active && <Button variant="outline" size="sm" onClick={closePlan}><X className="w-4 h-4 mr-1.5" /> Close</Button>}
              <Button size="sm" onClick={newPlan}><Plus className="w-4 h-4 mr-1.5" /> New Plan</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 border-t border-border bg-muted/30">
            <div className="px-4 py-3 border-r border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Saved Plans</div>
              <div className="text-lg font-heading font-bold mt-0.5">{plans.length}</div>
            </div>
            <div className="px-4 py-3 border-r border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Current Channels</div>
              <div className="text-lg font-heading font-bold mt-0.5">{channels.length}</div>
            </div>
            <div className="px-4 py-3 col-span-2 sm:col-span-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Plan Status</div>
              <div className="text-sm font-semibold mt-1">{active ? (active.id === 'new' ? 'Unsaved Plan' : 'Editing') : 'No Plan Selected'}</div>
            </div>
          </div>
        </div>

        <div className="grid xl:grid-cols-[300px_minmax(0,1fr)] gap-4">
          <Card className="overflow-hidden rounded-xl border-border shadow-sm">
            <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-5 rounded-full bg-primary" />
                  <h2 className="font-heading font-semibold text-sm">Saved Plans</h2>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Your private channel configurations</p>
              </div>
              <Layers3 className="w-4 h-4 text-muted-foreground" />
            </div>

            <div className="p-3">
              {loading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : plans.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto mb-3">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <p className="font-medium text-sm">No saved plans</p>
                  <p className="text-xs text-muted-foreground mt-1">Create a plan to start building your radio configuration.</p>
                  <Button size="sm" className="mt-4" onClick={newPlan}><Plus className="w-4 h-4 mr-1.5" /> Create Plan</Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {plans.map((p) => {
                    const selected = active?.id === p.id;
                    const count = parseChannels(p.channels).length;
                    return (
                      <div
                        key={p.id}
                        className={`group flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-all ${selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:border-border hover:bg-muted/40'}`}
                        onClick={() => openPlan(p)}
                      >
                        <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          <Radio className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{count} {count === 1 ? 'channel' : 'channels'}</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); del(p); }} className="p-1.5 rounded-md text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all" title="Delete plan">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selected ? 'text-primary translate-x-0.5' : ''}`} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden rounded-xl border-border shadow-sm">
            {!active ? (
              <div className="min-h-[560px] flex items-center justify-center text-center px-6">
                <div className="max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary grid place-items-center mx-auto mb-4">
                    <ClipboardList className="w-7 h-7" />
                  </div>
                  <h2 className="text-xl font-heading font-bold">Build your channel plan</h2>
                  <p className="text-sm text-muted-foreground mt-2">Create a new plan or select one from the left. Drag channels into the order you want, edit the radio details, then save or export the plan.</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-5">
                    <Button onClick={newPlan}><Plus className="w-4 h-4 mr-1.5" /> New Plan</Button>
                    <Button variant="outline" onClick={newPlan}>Start with a blank channel</Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="px-4 py-4 sm:px-5 border-b border-border bg-muted/10">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Pencil className="w-4 h-4 text-primary shrink-0" />
                        <h2 className="font-heading font-bold text-base sm:text-lg truncate">{name || 'Untitled Plan'}</h2>
                        {active.id === 'new' && <span className="text-[9px] uppercase tracking-wider font-bold rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 px-2 py-1">Unsaved</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Edit channel order, frequencies, tones, repeaters, and notes.</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={loadDefaults}><FileText className="w-4 h-4 mr-1.5" /> GMRS Defaults</Button>
                      <Button size="sm" variant="outline" onClick={addChannel}><Plus className="w-4 h-4 mr-1.5" /> Channel</Button>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 mt-4">
                    <div>
                      <Label className="text-[11px] uppercase tracking-wide">Plan Name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
                    </div>
                    <div>
                      <Label className="text-[11px] uppercase tracking-wide">Description</Label>
                      <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional notes about this plan" className="mt-1.5" />
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{channels.length} {channels.length === 1 ? 'channel' : 'channels'}</span>
                    <span className="text-[10px] text-muted-foreground">Drag <GripVertical className="inline w-3 h-3" /> to reorder</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" onClick={exportCSV} disabled={!channels.length}><FileDown className="w-3.5 h-3.5 mr-1.5" /> CSV</Button>
                    <Button size="sm" variant="ghost" onClick={exportJSON} disabled={!channels.length}><FileDown className="w-3.5 h-3.5 mr-1.5" /> JSON</Button>
                    <Button size="sm" onClick={save} disabled={saving}><Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? 'Saving…' : 'Save Plan'}</Button>
                  </div>
                </div>

                <div className="p-3 sm:p-4">
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="channels">
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                          {channels.map((c, i) => (
                            <Draggable key={`channel-${i}`} draggableId={`channel-${i}`} index={i}>
                              {(p2) => (
                                <div ref={p2.innerRef} {...p2.draggableProps} className="group rounded-2xl border border-border bg-card shadow-sm hover:border-primary/50 hover:shadow-md transition-all overflow-hidden">
                                  <div className="flex flex-wrap items-center gap-3 px-3 sm:px-4 py-3 bg-gradient-to-r from-muted/40 via-muted/15 to-transparent border-b border-border">
                                    <div {...p2.dragHandleProps} className="w-9 h-9 rounded-xl bg-background border border-border grid place-items-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors shrink-0" title="Drag to reorder">
                                      <GripVertical className="w-4 h-4" />
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground grid place-items-center font-mono text-sm font-bold shadow-sm shrink-0">
                                      {c.ch || String(i + 1).padStart(2, '0')}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">Channel</span>
                                        {c.repeater ? <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[9px] font-semibold">REPEATER</span> : <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[9px] font-semibold">SIMPLEX</span>}
                                      </div>
                                      <Input aria-label="Channel name" placeholder="Channel name / alpha tag" value={c.name} onChange={(e) => update(i, 'name', e.target.value)} className="h-8 mt-1 text-sm font-semibold border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" />
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <div className="rounded-xl bg-background/80 border border-border px-3 py-2 min-w-[82px] text-right">
                                        <div className="text-[8px] uppercase tracking-widest text-muted-foreground font-semibold">RX</div>
                                        <div className="font-mono text-sm font-bold">{c.rx || '—'}</div>
                                      </div>
                                      <div className="rounded-xl bg-background/80 border border-border px-3 py-2 min-w-[82px] text-right">
                                        <div className="text-[8px] uppercase tracking-widest text-muted-foreground font-semibold">TX</div>
                                        <div className="font-mono text-sm font-bold">{c.tx || '—'}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button onClick={() => duplicate(i)} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Duplicate channel"><Copy className="w-4 h-4" /></button>
                                      <button onClick={() => remove(i)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete channel"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                  </div>

                                  <div className="p-3 sm:p-4 space-y-4">
                                    <div>
                                      <div className="flex items-center gap-2 mb-2"><span className="w-1 h-4 rounded-full bg-primary" /><span className="text-[10px] uppercase tracking-widest font-bold">Radio Settings</span></div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                        <div className="rounded-xl border border-border bg-muted/10 p-2.5"><Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Channel #</Label><Input aria-label="Channel number" placeholder="1" value={c.ch} onChange={(e) => update(i, 'ch', e.target.value)} className="mt-1 h-9 text-sm font-mono" /></div>
                                        <div className="rounded-xl border border-border bg-muted/10 p-2.5"><Label className="text-[9px] uppercase tracking-wider text-muted-foreground">RX Frequency</Label><Input aria-label="Receive frequency" placeholder="462.550" value={c.rx} onChange={(e) => update(i, 'rx', e.target.value)} className="mt-1 h-9 text-sm font-mono" /></div>
                                        <div className="rounded-xl border border-border bg-muted/10 p-2.5"><Label className="text-[9px] uppercase tracking-wider text-muted-foreground">TX Frequency</Label><Input aria-label="Transmit frequency" placeholder="462.550" value={c.tx} onChange={(e) => update(i, 'tx', e.target.value)} className="mt-1 h-9 text-sm font-mono" /></div>
                                        <div className="rounded-xl border border-border bg-muted/10 p-2.5"><Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Repeater</Label><Input aria-label="Repeater" placeholder="Repeater name or callsign" value={c.repeater} onChange={(e) => update(i, 'repeater', e.target.value)} className="mt-1 h-9 text-sm" /></div>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 mb-2"><span className="w-1 h-4 rounded-full bg-orange-500" /><span className="text-[10px] uppercase tracking-widest font-bold">Tone & Notes</span></div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-border bg-muted/10 p-2.5"><Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Tone</Label><Input aria-label="Tone" placeholder="CTCSS / DCS" value={c.tone} onChange={(e) => update(i, 'tone', e.target.value)} className="mt-1 h-9 text-sm" /></div>
                                        <div className="rounded-xl border border-border bg-muted/10 p-2.5"><Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Tone Direction</Label><Input aria-label="Tone direction" placeholder="TX / RX / Both" value={c.tone_dir} onChange={(e) => update(i, 'tone_dir', e.target.value)} className="mt-1 h-9 text-sm" /></div>
                                        <div className="rounded-xl border border-border bg-muted/10 p-2.5"><Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Notes</Label><Input aria-label="Notes" placeholder="Location, purpose, programming notes" value={c.notes} onChange={(e) => update(i, 'notes', e.target.value)} className="mt-1 h-9 text-sm" /></div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="px-3 sm:px-4 py-2.5 border-t border-border bg-muted/15 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                      <span className="font-semibold text-foreground">{c.rx || '—'}</span><span>RX</span><span>•</span><span className="font-semibold text-foreground">{c.tx || '—'}</span><span>TX</span>{c.tone && <><span>•</span><span className="font-semibold text-foreground">{c.tone}</span><span>tone</span></>}
                                    </div>
                                    <span className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground">{c.name || 'Unnamed channel'}</span>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {channels.length === 0 && (
                            <div className="rounded-xl border border-dashed border-border py-14 text-center">
                              <Radio className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                              <p className="text-sm font-medium">No channels in this plan</p>
                              <p className="text-xs text-muted-foreground mt-1">Add a channel or load the GMRS defaults.</p>
                              <div className="flex justify-center gap-2 mt-4">
                                <Button size="sm" variant="outline" onClick={addChannel}><Plus className="w-4 h-4 mr-1.5" /> Add Channel</Button>
                                <Button size="sm" onClick={loadDefaults}><FileText className="w-4 h-4 mr-1.5" /> GMRS Defaults</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </div>

                <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Radio className="w-3.5 h-3.5 shrink-0" />
                  <span>Plans are private to your account. CSV and JSON exports are general-purpose formats.</span>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </ToolShell>
  );
}