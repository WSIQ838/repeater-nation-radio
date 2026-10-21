import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { adminApi } from '@/lib/adminClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { RadioReceiver, MapPin, Plus, Pencil, Trash2, Power, Loader2, ShieldAlert, Lock, Image as ImageIcon, SlidersHorizontal, Volume2, Upload, Play, Mic, MicOff, Headphones, LayoutGrid } from 'lucide-react';
import { DEFAULT_RADIO_DSP, RADIO_EQ_FREQUENCIES, ROGER_BEEP_DEFAULT, ROGER_BEEP_STYLES, createRadioTransmitChain } from '@/lib/radioAudioEffect';
import { cn, errMsg } from '@/lib/utils';
import { PageHeader, Loading, EmptyState } from '@/components/admin/parts';
import RadioLayoutEditor from '@/components/admin/RadioLayoutEditor';
import ColorAlphaInput from '@/components/ui/color-alpha-input';
import { parseColorAlpha, serializeColorAlpha } from '@/lib/colorAlpha';

export default function AdminRadio() {
  const { toast } = useToast();
  const [tab, setTab] = useState('system');
  const [zones, setZones] = useState([]);
  const [channels, setChannels] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSystem, setSavingSystem] = useState(false);
  const [speechVoices, setSpeechVoices] = useState([]);
  const [savingVoice, setSavingVoice] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [z, c, s] = await Promise.all([
        base44.entities.RadioZone.list('display_order', 200),
        base44.entities.RadioChannel.list('number', 500),
        adminApi('settings:get').catch(() => null),
      ]);
      setZones(z || []);
      setChannels(c || []);
      setSettings(s?.settings || null);
    } catch (err) {
      toast({ title: 'Failed to load', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
    const loadVoices = () => setSpeechVoices(window.speechSynthesis.getVoices().filter((voice) => voice?.name));
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
  }, []);

  const toggleRadioEnabled = async () => {
    if (!settings) return;
    const next = !settings.radio_enabled;
    setSavingSystem(true);
    try {
      await adminApi('settings:update', { radio_enabled: next });
      setSettings((s) => ({ ...s, radio_enabled: next }));
      // Lets an already-mounted RadioWidget in this same tab react immediately
      // instead of waiting for a refresh -- see the matching listener there.
      window.dispatchEvent(new CustomEvent('rn:radio-enabled-changed', { detail: { enabled: next } }));
      toast({ title: next ? 'Web radio enabled' : 'Web radio disabled' });
    } catch (err) {
      toast({ title: 'Update failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setSavingSystem(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Web Radio" subtitle="Manage zones, channels, and the site-wide voice radio widget." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="system" className="gap-1.5"><RadioReceiver className="w-4 h-4" /> System</TabsTrigger>
          <TabsTrigger value="zones" className="gap-1.5"><MapPin className="w-4 h-4" /> Zones</TabsTrigger>
          <TabsTrigger value="channels" className="gap-1.5"><RadioReceiver className="w-4 h-4" /> Channels</TabsTrigger>
          <TabsTrigger value="layout" className="gap-1.5"><ImageIcon className="w-4 h-4" /> Layout</TabsTrigger>
        <TabsTrigger value="audio" className="gap-1.5"><SlidersHorizontal className="w-4 h-4" /> Audio / DSP</TabsTrigger>
        <TabsTrigger value="rogerbeeps" className="gap-1.5"><Volume2 className="w-4 h-4" /> Roger Beeps</TabsTrigger>
        <TabsTrigger value="monitor" className="gap-1.5"><LayoutGrid className="w-4 h-4" /> Monitor Grid</TabsTrigger>
        </TabsList>

        <TabsContent value="system">
          <div className="grid gap-4 max-w-3xl">
            <Card className="p-5">
              {loading || !settings ? <Loading /> : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-sm flex items-center gap-2">Enable website radio {savingSystem && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}</div>
                    <p className="text-xs text-muted-foreground mt-1">When off, the floating radio widget is hidden site-wide for every member and no one can connect to a channel.</p>
                  </div>
                  <Switch checked={!!settings.radio_enabled} onCheckedChange={toggleRadioEnabled} disabled={savingSystem} />
                </div>
              )}
            </Card>
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0"><Volume2 className="w-4 h-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">Channel announcement voice</div>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xl">Sets the site default voice for channel announcements. Members can override this in their Radio Settings.</p>
                  <div className="mt-4 flex flex-col sm:flex-row gap-2">
                    <select value={settings?.radio_default_voice_name || ''} onChange={(e) => setSettings((s) => ({ ...s, radio_default_voice_name: e.target.value }))} className="h-9 flex-1 px-3 rounded-md border border-input bg-background text-sm">
                      <option value="">System default</option>
                      {speechVoices.map((voice) => <option key={voice.name} value={voice.name}>{voice.name} · {voice.lang || 'default'}</option>)}
                    </select>
                    <Button type="button" variant="outline" size="sm" disabled={!speechVoices.length} onClick={() => {
                      if (!('speechSynthesis' in window)) return;
                      const name = settings?.radio_default_voice_name || '';
                      const voice = speechVoices.find((v) => v.name === name);
                      const utterance = new SpeechSynthesisUtterance('Zone Two. Channel Seventeen.');
                      if (voice) utterance.voice = voice;
                      utterance.rate = 0.92;
                      window.speechSynthesis.cancel();
                      window.speechSynthesis.speak(utterance);
                    }}>Test</Button>
                    <Button type="button" size="sm" disabled={savingVoice || !settings} onClick={async () => {
                      setSavingVoice(true);
                      try {
                        const value = settings?.radio_default_voice_name || '';
                        await adminApi('settings:update', { radio_default_voice_name: value });
                        setSettings((s) => ({ ...s, radio_default_voice_name: value }));
                        window.dispatchEvent(new CustomEvent('rn:radio-default-voice-changed', { detail: { voice: value } }));
                        toast({ title: value ? 'Default radio voice saved' : 'Radio voice reset to system default' });
                      } catch (err) {
                        toast({ title: 'Voice save failed', description: errMsg(err) || err.message, variant: 'destructive' });
                      } finally { setSavingVoice(false); }
                    }}>{savingVoice ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Save default voice</Button>
                  </div>
                  {!speechVoices.length && <p className="text-xs text-muted-foreground mt-2">No browser voices are available yet. Reload this page after adding a Windows speech voice.</p>}
                  <p className="text-[11px] text-muted-foreground mt-2">The voice name is shared as a preference. If a member's browser does not provide that voice, their local default is used.</p>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="zones">
          <ZonesManager zones={zones} channels={channels} loading={loading} reload={load} />
        </TabsContent>

        <TabsContent value="channels">
          <ChannelsManager zones={zones} channels={channels} loading={loading} reload={load} />
        </TabsContent>

        <TabsContent value="layout">
          <RadioLayoutEditor />
        </TabsContent>
        <TabsContent value="audio">
          <RadioDSPManager />
        </TabsContent>
        <TabsContent value="rogerbeeps">
          <RogerBeepsManager />
        </TabsContent>
        <TabsContent value="monitor">
          <MonitorGridManager zones={zones} channels={channels} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Radio Audio / DSP Manager ---------- */
const RADIO_DSP_PRESETS = {
  'Police Radio': {
    ...DEFAULT_RADIO_DSP,
    preset: 'Police Radio',
    enabled: true,
    presence_q: 2,
    distortion: 1,
  },
  'GMRS Walkie-Talkie': {
    ...DEFAULT_RADIO_DSP,
    preset: 'GMRS Walkie-Talkie',
    highpass_hz: 450,
    lowpass_hz: 3200,
    presence_hz: 1700,
    presence_gain_db: 4,
    presence_q: 1.5,
    drive: 2,
    distortion: 1.5,
    compression_ratio: 7,
    compression_threshold_db: -30,
    attack_ms: 2,
    release_ms: 70,
  },
  'HAM Mobile': {
    ...DEFAULT_RADIO_DSP,
    preset: 'HAM Mobile',
    highpass_hz: 350,
    lowpass_hz: 4000,
    presence_hz: 1800,
    presence_gain_db: 3,
    presence_q: 1.1,
    drive: 1.5,
    distortion: 0.5,
    compression_ratio: 5,
    compression_threshold_db: -26,
    attack_ms: 4,
    release_ms: 90,
  },
  'Clean Voice': {
    ...DEFAULT_RADIO_DSP,
    preset: 'Clean Voice',
    highpass_hz: 300,
    lowpass_hz: 5000,
    presence_hz: 2200,
    presence_gain_db: 2,
    presence_q: 0.8,
    drive: 0.5,
    distortion: 0,
    compression_ratio: 3,
    compression_threshold_db: -24,
    attack_ms: 8,
    release_ms: 120,
  },
};

function RadioGraphicEQ({ values, onChange }) {
  return (
    <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 items-end">
      {RADIO_EQ_FREQUENCIES.map((frequency, index) => {
        const value = Number(values?.[index] ?? 0);
        const label = frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);
        return (
          <div key={frequency} className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground">{value > 0 ? '+' : ''}{value} dB</span>
            <input aria-label={`${frequency} Hz EQ`} type="range" min={-12} max={12} step={0.5} value={value}
              onChange={(e) => {
                const next = [...(values || DEFAULT_RADIO_DSP.eq_bands)];
                next[index] = Number(e.target.value);
                onChange(next);
              }}
              className="h-28 sm:h-36 w-6 [writing-mode:vertical-lr] [direction:rtl] accent-primary"
            />
            <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function RadioDSPControl({ label, value, min, max, step = 1, unit, onChange }) {
  const display = Number.isInteger(step) ? String(Math.round(Number(value))) : Number(value).toFixed(1);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm">{label}</Label>
        <div className="flex items-center gap-1.5 shrink-0">
          <Input
            type="number"
            min={min}
            max={max}
            step={step}
            value={display}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-24 h-8 text-right"
          />
          {unit && <span className="text-xs text-muted-foreground w-8">{unit}</span>}
        </div>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function RadioDSPManager() {
  const { toast } = useToast();
  const [row, setRow] = useState(null);
  const [draft, setDraft] = useState(DEFAULT_RADIO_DSP);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef(null); // { ctx, el, stream, chain } while a mic preview is running

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let rows = await base44.entities.RadioDSPSettings.list('-updated_date', 1);
      let current = rows?.[0];
      if (!current) {
        current = await base44.entities.RadioDSPSettings.create({ ...DEFAULT_RADIO_DSP });
        rows = [current];
      }
      const legacy = { ...DEFAULT_RADIO_DSP, ...current };
      const savedPresets = Array.isArray(current?.presets) && current.presets.length
        ? current.presets
        : Object.entries(RADIO_DSP_PRESETS).map(([name, values]) => ({ name, ...values, preset: name }));
      const defaultPresetName = current?.default_preset || current?.preset || 'Police Radio';
      const defaultPreset = savedPresets.find((p) => p.name === defaultPresetName) || RADIO_DSP_PRESETS[defaultPresetName];
      const activeValues = defaultPreset ? { ...legacy, ...defaultPreset } : legacy;
      setRow({ ...current, presets: savedPresets, default_preset: defaultPresetName });
      setPresetName(defaultPresetName);
      setDraft({ ...DEFAULT_RADIO_DSP, ...activeValues, preset: defaultPresetName });
    } catch (err) {
      toast({ title: 'Failed to load audio settings', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const stopPreview = useCallback(() => {
    const p = previewRef.current;
    if (p) {
      try { p.chain?.disconnect(); } catch { /* already disconnected */ }
      try { p.el.pause(); } catch { /* noop */ }
      try { p.el.remove(); } catch { /* noop */ }
      try { p.stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      try { p.ctx.close(); } catch { /* noop */ }
    }
    previewRef.current = null;
    setPreviewing(false);
  }, []);

  // Stop the mic + AudioContext if this admin navigates away mid-preview --
  // otherwise the mic stays hot and the context keeps running in the
  // background after the panel is gone.
  useEffect(() => () => stopPreview(), [stopPreview]);

  // This is the only place in the app a member's browser routes their own
  // live mic straight back to their own speakers (every other path is
  // receive-only), specifically so an admin can hear what a DSP change
  // sounds like without needing a second person on the radio to test with.
  // That's also exactly the setup that produces acoustic feedback, hence
  // the on-screen headphones warning below.
  const startPreview = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('Web Audio is not supported in this browser');
      const ctx = new Ctx();
      const el = document.createElement('audio');
      el.muted = false;
      el.style.display = 'none';
      document.body.appendChild(el);
      const chain = createRadioTransmitChain(ctx, stream, draft);
      if (!chain?.outputTrack) throw new Error('Could not create the live DSP preview');
      el.srcObject = new MediaStream([chain.outputTrack]);
      await el.play();
      previewRef.current = { ctx, el, stream, chain };
      setPreviewing(true);
    } catch (err) {
      toast({ title: 'Could not start mic preview', description: errMsg(err) || err.message, variant: 'destructive' });
    }
  };

  // Live-updates the running preview chain as sliders move, the same way
  // an already-connected listener's chain updates without needing to
  // reconnect -- see useRadioSession.js's own DSP-sync effect.
  useEffect(() => {
    if (previewing) previewRef.current?.chain?.update(draft);
  }, [draft, previewing]);

  const setValue = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const savedPresets = row?.presets || [];

  const applyPreset = (name) => {
    const preset = savedPresets.find((p) => p.name === name) || RADIO_DSP_PRESETS[name];
    if (!preset) return;
    setDraft({ ...DEFAULT_RADIO_DSP, ...preset, preset: name });
    setPresetName(name);
  };

  const buildPresetPayload = (name, values = draft) => ({
    name: name.trim(),
    enabled: values.enabled !== false,
    preset: name.trim(),
    highpass_hz: Number(values.highpass_hz),
    lowpass_hz: Number(values.lowpass_hz),
    presence_hz: Number(values.presence_hz),
    presence_gain_db: Number(values.presence_gain_db),
    presence_q: Number(values.presence_q),
    drive: Number(values.drive),
    distortion: Number(values.distortion),
    compression_ratio: Number(values.compression_ratio),
    compression_threshold_db: Number(values.compression_threshold_db),
    attack_ms: Number(values.attack_ms),
    release_ms: Number(values.release_ms),
    eq_bands: (values.eq_bands || DEFAULT_RADIO_DSP.eq_bands).map(Number),
  });

  const persist = async (nextPresets, activeName, values = draft) => {
    const payload = { ...buildPresetPayload(activeName, values), presets: nextPresets, default_preset: activeName };
    delete payload.name;
    const saved = await base44.entities.RadioDSPSettings.update(row.id, payload);
    setRow(saved);
    setDraft({ ...DEFAULT_RADIO_DSP, ...saved, preset: activeName });
    setPresetName(activeName);
    window.dispatchEvent(new CustomEvent('rn:radio-dsp-changed', { detail: { dsp: saved } }));
    return saved;
  };

  const savePreset = async () => {
    const name = presetName.trim();
    if (!name) return toast({ title: 'Preset name required', description: 'Enter a name before saving.', variant: 'destructive' });
    setSaving(true);
    try {
      const next = savedPresets.some((p) => p.name === name)
        ? savedPresets.map((p) => p.name === name ? buildPresetPayload(name) : p)
        : [...savedPresets, buildPresetPayload(name)];
      await persist(next, name);
      toast({ title: `Preset “${name}” saved` });
    } catch (err) {
      toast({ title: 'Preset save failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const saveAudioSettings = async () => {
    setSaving(true);
    try {
      const activeName = presetName.trim() || draft.preset || 'Custom';
      const next = savedPresets.some((p) => p.name === activeName)
        ? savedPresets.map((p) => p.name === activeName ? buildPresetPayload(activeName) : p)
        : [...savedPresets, buildPresetPayload(activeName)];
      await persist(next, activeName);
      toast({ title: 'Radio audio settings saved' });
    } catch (err) {
      toast({ title: 'Save failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const renamePreset = async () => {
    const oldName = draft.preset || presetName;
    const newName = presetName.trim();
    if (!oldName || !newName) return;
    if (oldName === newName) return toast({ title: 'Preset name unchanged' });
    if (savedPresets.some((p) => p.name === newName)) return toast({ title: 'That preset name already exists', variant: 'destructive' });
    setSaving(true);
    try {
      const next = savedPresets.map((p) => p.name === oldName ? buildPresetPayload(newName) : p);
      await persist(next, newName);
      toast({ title: `Preset renamed to “${newName}”` });
    } catch (err) {
      toast({ title: 'Rename failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const deletePreset = async () => {
    const name = draft.preset || presetName;
    if (!name || !savedPresets.some((p) => p.name === name)) return;
    if (!confirm(`Delete radio preset “${name}”? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const next = savedPresets.filter((p) => p.name !== name);
      const fallback = next[0];
      if (fallback) {
        await persist(next, fallback.name, fallback);
      } else {
        const fallbackDraft = { ...DEFAULT_RADIO_DSP, preset: 'Custom' };
        await persist([], 'Custom', fallbackDraft);
      }
      toast({ title: `Preset “${name}” deleted` });
    } catch (err) {
      toast({ title: 'Delete failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const reset = () => {
    setDraft({ ...DEFAULT_RADIO_DSP, preset: presetName || 'Custom' });
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-medium flex items-center gap-2"><SlidersHorizontal className="w-4 h-4 text-primary" /> Shared radio audio processing</div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              These are the single site-wide radio sound settings. Each transmitter applies the same DSP before LiveKit, so everyone on the channel hears the same processed transmission. Changes update active transmitters live.
            </p>
          </div>
          <Switch checked={draft.enabled !== false} onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant={previewing ? 'destructive' : 'outline'}
            size="sm"
            onClick={previewing ? stopPreview : startPreview}
            className="gap-1.5"
          >
            {previewing ? <><MicOff className="w-3.5 h-3.5" /> Stop mic preview</> : <><Mic className="w-3.5 h-3.5" /> Preview with your mic</>}
          </Button>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Headphones className="w-3 h-3 shrink-0" /> Use headphones -- this plays your mic through your speakers live and will feed back otherwise.
          </span>
        </div>
        {previewing && <p className="text-xs text-muted-foreground mt-1">Talk normally and adjust the controls below -- you'll hear the effect on your own voice in real time.</p>}

        <div className="mt-5 space-y-2">
          <Label>Saved radio preset (default)</Label>
          <div className="flex items-center gap-2">
            <select
              value={draft.preset || ''}
              onChange={(e) => applyPreset(e.target.value)}
              className="h-9 flex-1 px-3 rounded-md border border-input bg-background text-sm"
            >
              {savedPresets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={reset}>Reset</Button>
            <Button type="button" variant="outline" size="sm" onClick={deletePreset} disabled={saving || !draft.preset}>Delete</Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" />
            <Button type="button" variant="outline" onClick={savePreset} disabled={saving}>Save / Update</Button>
            <Button type="button" variant="outline" onClick={renamePreset} disabled={saving}>Rename</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">The selected preset is the site-wide default. Edit any EQ or DSP control, then use <b>Save / Update</b> to save those changes and make that preset the default. Change the name and use <b>Rename</b> to rename it.</p>
        </div>
      </Card>

      {loading ? <Loading /> : (
        <>
          <Card className="p-5 space-y-6">
            <div>
              <div className="font-medium text-sm">10-band graphic EQ</div>
              <div className="text-xs text-muted-foreground mt-1">Shared transmit EQ. Every listener receives the same EQ-processed signal. Each band ranges from −12 dB to +12 dB.</div>
            </div>
            <RadioGraphicEQ values={draft.eq_bands} onChange={(v) => setValue('eq_bands', v)} />
            <RadioDSPControl label="High-pass / low cut" value={draft.highpass_hz} min={300} max={700} step={10} unit="Hz" onChange={(v) => setValue('highpass_hz', v)} />
            <RadioDSPControl label="Low-pass / high cut" value={draft.lowpass_hz} min={2500} max={5000} step={100} unit="Hz" onChange={(v) => setValue('lowpass_hz', v)} />
            <RadioDSPControl label="Presence frequency" value={draft.presence_hz} min={1500} max={2500} step={50} unit="Hz" onChange={(v) => setValue('presence_hz', v)} />
            <RadioDSPControl label="Presence gain" value={draft.presence_gain_db} min={0} max={8} step={0.5} unit="dB" onChange={(v) => setValue('presence_gain_db', v)} />
            <RadioDSPControl label="Presence Q factor" value={draft.presence_q} min={0.1} max={10} step={0.1} unit="" onChange={(v) => setValue('presence_q', v)} />
          </Card>

          <Card className="p-5 space-y-6">
            <div>
              <div className="font-medium text-sm">Radio processing</div>
              <div className="text-xs text-muted-foreground mt-1">Adds speaker grit and compresses the received voice into a tighter radio-style signal.</div>
            </div>
            <RadioDSPControl label="Speaker drive / saturation" value={draft.drive} min={0} max={10} step={0.5} unit="" onChange={(v) => setValue('drive', v)} />
            <RadioDSPControl label="Distortion" value={draft.distortion} min={0} max={10} step={0.5} unit="" onChange={(v) => setValue('distortion', v)} />
            <RadioDSPControl label="Compression ratio" value={draft.compression_ratio} min={1} max={12} step={0.5} unit=":1" onChange={(v) => setValue('compression_ratio', v)} />
            <RadioDSPControl label="Compression threshold" value={draft.compression_threshold_db} min={-60} max={0} step={1} unit="dB" onChange={(v) => setValue('compression_threshold_db', v)} />
            <RadioDSPControl label="Attack" value={draft.attack_ms} min={1} max={50} step={1} unit="ms" onChange={(v) => setValue('attack_ms', v)} />
            <RadioDSPControl label="Release" value={draft.release_ms} min={20} max={300} step={5} unit="ms" onChange={(v) => setValue('release_ms', v)} />
          </Card>

          <div className="flex items-center justify-end">
            <Button type="button" onClick={saveAudioSettings} disabled={saving} className="min-w-32">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Active Preset
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Roger Beeps Manager ---------- */
function RogerBeepsManager() {
  const { toast } = useToast();
  const [beeps, setBeeps] = useState([]);
  const [dspRow, setDspRow] = useState(null);
  const [defaultStyle, setDefaultStyle] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingDefault, setSavingDefault] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, dspRows] = await Promise.all([
        base44.entities.RadioRogerBeep.list('display_order', 200),
        base44.entities.RadioDSPSettings.list('-updated_date', 1),
      ]);
      setBeeps(rows || []);
      const row = dspRows?.[0] || null;
      setDspRow(row);
      setDefaultStyle(row?.roger_beep_default_style || '');
    } catch (err) {
      toast({ title: 'Failed to load roger beeps', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const toggleEnabled = async (beep) => {
    try {
      await base44.entities.RadioRogerBeep.update(beep.id, { enabled: beep.enabled === false });
      load();
    } catch (err) {
      toast({ title: 'Update failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
  };

  const del = async (beep) => {
    if (!confirm(`Delete roger beep "${beep.label}"? This cannot be undone.`)) return;
    try {
      await base44.entities.RadioRogerBeep.delete(beep.id);
      toast({ title: 'Roger beep deleted' });
      load();
    } catch (err) {
      toast({ title: 'Delete failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
  };

  const play = (url) => {
    try { new Audio(url).play().catch(() => {}); } catch { /* not worth surfacing */ }
  };

  const saveDefault = async () => {
    setSavingDefault(true);
    try {
      let saved;
      if (dspRow?.id) {
        saved = await base44.entities.RadioDSPSettings.update(dspRow.id, { roger_beep_default_style: defaultStyle });
      } else {
        saved = await base44.entities.RadioDSPSettings.create({ ...DEFAULT_RADIO_DSP, roger_beep_default_style: defaultStyle });
      }
      setDspRow(saved);
      // Lets an already-open radio widget in this same tab pick up the new
      // default immediately -- the same event RadioDSPManager's save()
      // already fires for the EQ/compression fields on this same row.
      window.dispatchEvent(new CustomEvent('rn:radio-dsp-changed', { detail: { dsp: saved } }));
      toast({ title: 'Site default roger beep saved' });
    } catch (err) {
      toast({ title: 'Save failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setSavingDefault(false);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-4 space-y-3">
        <div>
          <div className="font-medium text-sm">Site default roger beep</div>
          <p className="text-xs text-muted-foreground mt-0.5">Used for members who haven't chosen their own roger beep in Settings.</p>
        </div>
        {loading ? <Loading /> : (
          <div className="flex items-center gap-2">
            <select
              value={defaultStyle}
              onChange={(e) => setDefaultStyle(e.target.value)}
              className="h-9 flex-1 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">App default ({ROGER_BEEP_STYLES.find((s) => s.value === ROGER_BEEP_DEFAULT)?.label})</option>
              <optgroup label="Built-in">
                {ROGER_BEEP_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </optgroup>
              {beeps.length > 0 && (
                <optgroup label="Custom">
                  {beeps.map((b) => <option key={b.id} value={`custom:${b.id}`}>{b.label || 'Custom beep'}</option>)}
                </optgroup>
              )}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const url = defaultStyle.startsWith('custom:') ? beeps.find((b) => `custom:${b.id}` === defaultStyle)?.audio_url : null;
                if (url) play(url);
              }}
              disabled={!defaultStyle.startsWith('custom:')}
            >
              <Play className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" size="sm" onClick={saveDefault} disabled={savingDefault || (dspRow?.roger_beep_default_style || '') === defaultStyle}>
              {savingDefault ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-md">
          Upload custom roger beep sounds. Members can pick any of these, or a built-in one, in the radio's own Settings dialog.
        </p>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-1.5 shrink-0">
          <Plus className="w-4 h-4" /> Upload Roger Beep
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : beeps.length === 0 ? (
        <EmptyState title="No custom roger beeps yet" description="Upload an audio clip to offer it as a roger beep option." icon={Volume2} />
      ) : (
        <div className="space-y-2">
          {beeps.map((beep) => (
            <Card key={beep.id} className={cn('p-4 flex items-center gap-4', beep.enabled === false && 'opacity-50')}>
              <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0"><Volume2 className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{beep.label || 'Untitled beep'}</div>
              </div>
              <Badge variant={beep.enabled !== false ? 'default' : 'secondary'} className="text-xs">{beep.enabled !== false ? 'Active' : 'Disabled'}</Badge>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => play(beep.audio_url)} className="h-8 gap-1 text-xs">
                  <Play className="w-3 h-3" /> Play
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(beep); setShowForm(true); }} className="h-8 gap-1 text-xs">
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleEnabled(beep)} className="h-8 gap-1 text-xs">
                  <Power className="w-3 h-3" /> {beep.enabled !== false ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => del(beep)} className="h-8 gap-1 text-xs text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <RogerBeepFormDialog open={showForm} onClose={() => setShowForm(false)} editing={editing} onSaved={load} />
    </div>
  );
}

function RogerBeepFormDialog({ open, onClose, editing, onSaved }) {
  const { toast } = useToast();
  const [label, setLabel] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(editing?.label || '');
      setFile(null);
    }
  }, [open, editing]);

  const save = async () => {
    if (!label.trim() || (!editing && !file)) return;
    setSaving(true);
    try {
      let audioUrl = editing?.audio_url;
      if (file) {
        setUploading(true);
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        audioUrl = file_url;
        setUploading(false);
      }
      const data = { label: label.trim(), audio_url: audioUrl };
      if (editing) {
        await base44.entities.RadioRogerBeep.update(editing.id, data);
        toast({ title: 'Roger beep updated' });
      } else {
        await base44.entities.RadioRogerBeep.create({ ...data, enabled: true, display_order: 0 });
        toast({ title: 'Roger beep uploaded' });
      }
      onClose();
      onSaved();
    } catch (err) {
      toast({ title: 'Save failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setUploading(false);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? 'Edit Roger Beep' : 'Upload Roger Beep'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Vintage CB Chirp" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Audio file {editing ? '(leave blank to keep current)' : '*'}</Label>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-input file:bg-background file:text-sm"
            />
            {editing?.audio_url && !file && (
              <p className="text-xs text-muted-foreground">The current file will be kept unless you choose a new one.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !label.trim() || (!editing && !file)}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : uploading ? <Upload className="w-4 h-4 mr-2 animate-pulse" /> : null}
            {editing ? 'Save' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Zones Manager ---------- */
function ZonesManager({ zones, channels, loading, reload }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const channelCount = (zoneId) => channels.filter((c) => c.zone_id === zoneId).length;

  const toggleEnabled = async (zone) => {
    try {
      await base44.entities.RadioZone.update(zone.id, { enabled: !zone.enabled });
      reload();
    } catch (err) {
      toast({ title: 'Update failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
  };

  const del = async (zone) => {
    const count = channelCount(zone.id);
    if (!confirm(`Delete zone "${zone.name}"?${count ? ` Its ${count} channel(s) will be orphaned and hidden.` : ''} This cannot be undone.`)) return;
    try {
      await base44.entities.RadioZone.delete(zone.id);
      toast({ title: 'Zone deleted' });
      reload();
    } catch (err) {
      toast({ title: 'Delete failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Zone
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : zones.length === 0 ? (
        <EmptyState title="No zones yet" description="Create a zone to start organizing radio channels." icon={MapPin} />
      ) : (
        <div className="space-y-2">
          {[...zones].sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map((zone) => (
            <Card key={zone.id} className={cn('p-4 flex items-center gap-4', !zone.enabled && 'opacity-50')}>
              <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0"><MapPin className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm flex items-center gap-2">
                  {zone.name}
                  {zone.min_role && zone.min_role !== 'user' && (
                    <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="w-2.5 h-2.5" /> {zone.min_role}+</Badge>
                  )}
                </div>
                {zone.description && <div className="text-xs text-muted-foreground truncate">{zone.description}</div>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{channelCount(zone.id)} channel{channelCount(zone.id) === 1 ? '' : 's'}</span>
              <Badge variant={zone.enabled ? 'default' : 'secondary'} className="text-xs">{zone.enabled ? 'Active' : 'Disabled'}</Badge>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(zone); setShowForm(true); }} className="h-8 gap-1 text-xs">
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleEnabled(zone)} className="h-8 gap-1 text-xs">
                  <Power className="w-3 h-3" /> {zone.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => del(zone)} className="h-8 gap-1 text-xs text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ZoneFormDialog open={showForm} onClose={() => setShowForm(false)} editing={editing} onSaved={reload} />
    </div>
  );
}

function ZoneFormDialog({ open, onClose, editing, onSaved }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [order, setOrder] = useState(0);
  const [minRole, setMinRole] = useState('user');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name || '');
      setDescription(editing?.description || '');
      setOrder(editing?.display_order || 0);
      setMinRole(editing?.min_role || 'user');
    }
  }, [open, editing]);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data = { name: name.trim(), description: description.trim() || undefined, display_order: Number(order) || 0, min_role: minRole };
      if (editing) {
        await base44.entities.RadioZone.update(editing.id, data);
        toast({ title: 'Zone updated' });
      } else {
        await base44.entities.RadioZone.create({ ...data, enabled: true });
        toast({ title: 'Zone created' });
      }
      onClose();
      onSaved();
    } catch (err) {
      toast({ title: 'Save failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? 'Edit Zone' : 'New Zone'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Zone Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Southern California" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Display Order</Label>
              <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Minimum Role</Label>
              <select value={minRole} onChange={(e) => setMinRole(e.target.value)} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
                <option value="user">Any member</option>
                <option value="moderator">Moderator+</option>
                <option value="admin">Admin only</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Channels Manager ---------- */
function ChannelsManager({ zones, channels, loading, reload }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [zoneFilter, setZoneFilter] = useState('all');

  const zoneName = (zoneId) => zones.find((z) => z.id === zoneId)?.name || 'Unassigned zone';
  const filtered = zoneFilter === 'all' ? channels : channels.filter((c) => c.zone_id === zoneFilter);

  const toggleEnabled = async (ch) => {
    try {
      await base44.entities.RadioChannel.update(ch.id, { enabled: !ch.enabled });
      reload();
    } catch (err) {
      toast({ title: 'Update failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
  };

  const del = async (ch) => {
    if (!confirm(`Delete channel "${ch.name}"? This cannot be undone.`)) return;
    try {
      await base44.entities.RadioChannel.delete(ch.id);
      toast({ title: 'Channel deleted' });
      reload();
    } catch (err) {
      toast({ title: 'Delete failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
  };

  if (!loading && zones.length === 0) {
    return <EmptyState title="Create a zone first" description="Channels belong to a zone -- add one from the Zones tab." icon={ShieldAlert} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
          <option value="all">All zones</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-1.5" disabled={zones.length === 0}>
          <Plus className="w-4 h-4" /> New Channel
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState title="No channels yet" description="Create a channel to make it selectable on the radio." icon={RadioReceiver} />
      ) : (
        <div className="space-y-2">
          {[...filtered].sort((a, b) => (a.number || 0) - (b.number || 0)).map((ch) => (
            <Card key={ch.id} className={cn('p-4 flex items-center gap-4', !ch.enabled && 'opacity-50')}>
              <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0 font-mono text-xs font-bold">{ch.number}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                  {ch.name}
                  {ch.admin_only && <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="w-2.5 h-2.5" /> Admin only</Badge>}
                  {ch.moderator_only && !ch.admin_only && <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="w-2.5 h-2.5" /> Mods transmit</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">{zoneName(ch.zone_id)}{ch.description ? ` · ${ch.description}` : ''}</div>
              </div>
              <Badge variant={ch.enabled ? 'default' : 'secondary'} className="text-xs">{ch.enabled ? 'Active' : 'Disabled'}</Badge>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(ch); setShowForm(true); }} className="h-8 gap-1 text-xs">
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleEnabled(ch)} className="h-8 gap-1 text-xs">
                  <Power className="w-3 h-3" /> {ch.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => del(ch)} className="h-8 gap-1 text-xs text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ChannelFormDialog open={showForm} onClose={() => setShowForm(false)} editing={editing} onSaved={reload} zones={zones} defaultZoneId={zoneFilter !== 'all' ? zoneFilter : zones[0]?.id} />
    </div>
  );
}

function ChannelFormDialog({ open, onClose, editing, onSaved, zones, defaultZoneId }) {
  const { toast } = useToast();
  const [zoneId, setZoneId] = useState('');
  const [number, setNumber] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [moderatorOnly, setModeratorOnly] = useState(false);
  const [adminOnly, setAdminOnly] = useState(false);
  const [maxUsers, setMaxUsers] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setZoneId(editing?.zone_id || defaultZoneId || '');
      setNumber(editing?.number || 1);
      setName(editing?.name || '');
      setDescription(editing?.description || '');
      setModeratorOnly(!!editing?.moderator_only);
      setAdminOnly(!!editing?.admin_only);
      setMaxUsers(editing?.max_users ? String(editing.max_users) : '');
    }
  }, [open, editing, defaultZoneId]);

  const save = async () => {
    if (!name.trim() || !zoneId) return;
    setSaving(true);
    try {
      const data = {
        zone_id: zoneId,
        number: Number(number) || 1,
        name: name.trim(),
        description: description.trim() || undefined,
        moderator_only: moderatorOnly,
        admin_only: adminOnly,
        max_users: maxUsers ? Number(maxUsers) : undefined,
      };
      if (editing) {
        await base44.entities.RadioChannel.update(editing.id, data);
        toast({ title: 'Channel updated' });
      } else {
        await base44.entities.RadioChannel.create({ ...data, enabled: true });
        toast({ title: 'Channel created' });
      }
      onClose();
      onSaved();
    } catch (err) {
      toast({ title: 'Save failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? 'Edit Channel' : 'New Channel'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Zone *</Label>
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
              <option value="" disabled>Select a zone…</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Channel Number *</Label>
              <Input type="number" min="1" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Max Users</Label>
              <Input type="number" min="0" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} placeholder="Unlimited" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Channel Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Calling" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description" />
          </div>
          <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
            <div>
              <div className="text-sm font-medium">Moderators transmit only</div>
              <div className="text-xs text-muted-foreground">Members can still listen; only mods/admins get the floor.</div>
            </div>
            <Switch checked={moderatorOnly} onCheckedChange={setModeratorOnly} disabled={adminOnly} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
            <div>
              <div className="text-sm font-medium">Admin-only channel</div>
              <div className="text-xs text-muted-foreground">Only admins can join at all.</div>
            </div>
            <Switch checked={adminOnly} onCheckedChange={(v) => { setAdminOnly(v); if (v) setModeratorOnly(false); }} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim() || !zoneId}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const MONITOR_SLOT_COUNT = 12;

// Which channels appear as embedded, listen-only radios on the public
// /radio monitor page (see RadioMonitorGrid.jsx) -- a single site-wide
// RadioMonitorConfig row (same "singleton settings" pattern as
// RadioDSPSettings above), read by anyone but writable only by admins.
const DEFAULT_STATUS_LIGHT = {
  status_light_idle_color: '#a1a1aa',
  status_light_connecting_color: '#f59e0b',
  status_light_receiving_color: '#22c55e',
  status_light_error_color: '#ef4444',
  status_light_pulse: true,
  status_light_size: 'md',
};
const STATUS_LIGHT_SIZES = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
];

function MonitorGridManager({ zones, channels, loading: parentLoading }) {
  const { toast } = useToast();
  const [row, setRow] = useState(null);
  const [slots, setSlots] = useState(() => Array(MONITOR_SLOT_COUNT).fill(''));
  const [statusLight, setStatusLight] = useState(DEFAULT_STATUS_LIGHT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await base44.entities.RadioMonitorConfig.list('-updated_date', 1);
      const current = rows?.[0] || null;
      setRow(current);
      const existing = Array.isArray(current?.slots) ? current.slots : [];
      setSlots(Array.from({ length: MONITOR_SLOT_COUNT }, (_, i) => existing[i] || ''));
      setStatusLight({ ...DEFAULT_STATUS_LIGHT, ...(current || {}) });
    } catch (err) {
      toast({ title: 'Failed to load monitor grid', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const setSlot = (index, channelId) => {
    setSlots((prev) => prev.map((v, i) => (i === index ? channelId : v)));
  };

  const setLight = (key, value) => {
    setStatusLight((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { slots, ...statusLight };
      const saved = row?.id
        ? await base44.entities.RadioMonitorConfig.update(row.id, payload)
        : await base44.entities.RadioMonitorConfig.create(payload);
      setRow(saved);
      toast({ title: 'Monitor grid saved' });
    } catch (err) {
      toast({ title: 'Save failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const channelsByZone = useMemo(() => {
    const map = new Map();
    for (const c of channels) {
      const list = map.get(c.zone_id) || [];
      list.push(c);
      map.set(c.zone_id, list);
    }
    return map;
  }, [channels]);

  if (loading || parentLoading) return <Loading />;

  return (
    <Card className="p-5 max-w-3xl space-y-4">
      <div>
        <div className="font-medium text-sm">Public monitor grid</div>
        <p className="text-xs text-muted-foreground mt-1">
          Choose which channels show up as embedded, listen-only radios on the public <code className="px-1 py-0.5 rounded bg-muted text-xs">/radio</code> page
          (up to {MONITOR_SLOT_COUNT}). Members can still open the floating radio button to actually transmit on any channel they have access to — this grid is receive-only.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {slots.map((channelId, i) => (
          <div key={i} className="space-y-1">
            <Label className="text-xs text-muted-foreground">Slot {i + 1}</Label>
            <Select value={channelId || '__empty'} onValueChange={(v) => setSlot(i, v === '__empty' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="— Empty —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty">— Empty —</SelectItem>
                {zones.map((zone) => {
                  const zoneChannels = channelsByZone.get(zone.id) || [];
                  if (!zoneChannels.length) return null;
                  return (
                    <SelectGroup key={zone.id}>
                      <SelectLabel>{zone.name}</SelectLabel>
                      {zoneChannels.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.number != null ? `${c.number} — ${c.name}` : c.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div>
          <div className="font-medium text-sm">Status light</div>
          <p className="text-xs text-muted-foreground mt-1">The little dot on each tile showing idle / connecting / receiving / error.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { key: 'status_light_idle_color', label: 'Idle / listening' },
            { key: 'status_light_connecting_color', label: 'Connecting / busy' },
            { key: 'status_light_receiving_color', label: 'Receiving' },
            { key: 'status_light_error_color', label: 'Error' },
          ].map(({ key, label }) => {
            const { hex6, opacity } = parseColorAlpha(statusLight[key]);
            return (
              <div key={key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <ColorAlphaInput
                  color={hex6}
                  opacity={opacity}
                  onColorChange={(v) => setLight(key, serializeColorAlpha(v, opacity))}
                  onOpacityChange={(v) => setLight(key, serializeColorAlpha(hex6, v))}
                />
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Size</Label>
            <Select value={statusLight.status_light_size} onValueChange={(v) => setLight('status_light_size', v)}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_LIGHT_SIZES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={statusLight.status_light_pulse} onCheckedChange={(v) => setLight('status_light_pulse', v)} />
            <Label className="text-xs text-muted-foreground">Pulse while connecting/receiving</Label>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">Preview:</span>
            <span
              className={cn('rounded-full inline-block', statusLight.status_light_pulse && 'animate-pulse')}
              style={{
                width: statusLight.status_light_size === 'sm' ? 6 : statusLight.status_light_size === 'lg' ? 12 : 8,
                height: statusLight.status_light_size === 'sm' ? 6 : statusLight.status_light_size === 'lg' ? 12 : 8,
                backgroundColor: statusLight.status_light_receiving_color,
              }}
            />
          </div>
        </div>
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Save monitor grid
      </Button>
    </Card>
  );
}
