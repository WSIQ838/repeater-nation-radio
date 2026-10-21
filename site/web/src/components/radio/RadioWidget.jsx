import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { loadToolsConfig } from '@/lib/configCache';
import useRadioSession from '@/lib/useRadioSession';
import { DEFAULT_RADIO_DSP, ROGER_BEEP_DEFAULT, ROGER_BEEP_STYLES } from '@/lib/radioAudioEffect';
import useKeyboardPTT, { pttBindingLabel } from '@/lib/useKeyboardPTT';
import useRadioPopout from '@/lib/useRadioPopout';
import useRadioDirectCall from '@/lib/useRadioDirectCall';
import { isLedLit } from '@/lib/radioLeds';
import { getRadioAnimatedIconDef } from '@/lib/radioAnimatedIcons';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Radio, Volume2, VolumeX, Mic, MicOff, Plus, Minus,
  X, Loader2, ShieldAlert, KeySquare, Users, UserX, ExternalLink, Scan, Headphones, Phone, PhoneCall, PhoneOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { setVoiceBusy } from '@/lib/appUpdate';
import StaffTag from '@/components/shared/StaffTag';

const STATUS_META = {
  idle: { label: 'IDLE', tone: 'text-muted-foreground' },
  connecting: { label: 'CONNECTING…', tone: 'text-warning' },
  listening: { label: 'LISTENING', tone: 'text-success' },
  receiving: { label: 'RECEIVING', tone: 'text-primary' },
  transmitting: { label: 'TRANSMITTING', tone: 'text-destructive' },
  busy: { label: 'BUSY', tone: 'text-warning' },
  disconnected: { label: 'DISCONNECTED', tone: 'text-muted-foreground' },
  error: { label: 'ERROR', tone: 'text-destructive' },
};

const PTT_KEY_OPTIONS = [
  { value: 'ControlLeft', label: 'Left Ctrl' },
  { value: 'ControlRight', label: 'Right Ctrl' },
  { value: 'Space', label: 'Space' },
  { value: 'AltLeft', label: 'Left Alt' },
  { value: 'ShiftLeft', label: 'Left Shift' },
  { value: 'KeyV', label: 'V' },
  { value: 'CapsLock', label: 'Caps Lock' },
  { value: 'Backquote', label: '`' },
];
const DEFAULT_PTT_KEY = 'ControlLeft';
const SCAN_INTERVAL_MS = 2500; // how often scan hops to the next channel while idle

// Invisible hit-areas laid over the reference photo -- the photo already
// draws the button, this just makes that spot clickable with a faint
// hover/press cue instead of drawing a second fake control on top of it.
const HIT = 'absolute hover:bg-white/10 active:bg-white/25 focus-visible:bg-white/20 focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-950 transition-all duration-100 ease-out outline-none touch-none select-none cursor-pointer active:scale-[0.97]';
const CONTROL_SHAPES = {
  rectangle: '4px',
  rounded: '12px',
  pill: '999px',
  circle: '50%',
};
function controlRadius(shape) { return CONTROL_SHAPES[shape] || CONTROL_SHAPES.rectangle; }

// The text lines are flex containers (for icon+text rows like text_status),
// so plain CSS text-align does nothing -- the text node is a flex item that
// hugs its own content width and always sits at the flex-start edge unless
// justify-content is set to match.
const JUSTIFY_FOR_ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' };

function hexToRgba(hex, opacityPct) {
  const h = (hex || '#ffffff').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16); const g = parseInt(h.substring(2, 4), 16); const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${Number.isNaN(r) ? 255 : r}, ${Number.isNaN(g) ? 255 : g}, ${Number.isNaN(b) ? 255 : b}, ${Math.max(0, Math.min(100, opacityPct ?? 92)) / 100})`;
}


// Built-in fallback so the widget still works before any admin uploads a
// custom photo/layout from Admin -> Web Radio -> Layout. Coordinates are
// percentages of the photo, matching RadioLayoutEditor's own format.
const DEFAULT_IMAGE_ASPECT = '481 / 137';
const DEFAULT_CONTROLS = {
  display_bg: { left: 28, top: 6, width: 44, height: 48, bgColor: '#ffffff', bgOpacity: 92, borderRadius: 2, borderColor: '', borderWidth: 0 },
  text_zone: { left: 29, top: 8, width: 41, height: 9, fontSize: 6.5, bold: false, color: '#64748b', align: 'left', uppercase: true, letterSpacing: 0.5, fontFamily: 'monospace', visible: true },
  text_channel: { left: 29, top: 19, width: 30, height: 13, fontSize: 8.5, bold: true, color: '#0f172a', align: 'left', uppercase: false, letterSpacing: 0, fontFamily: 'monospace', visible: true },
  text_channel_number: { left: 61, top: 19, width: 9, height: 13, fontSize: 8.5, bold: true, color: '#0f172a', align: 'right', uppercase: true, letterSpacing: 0, fontFamily: 'monospace', visible: true },
  text_status: { left: 29, top: 34, width: 41, height: 10, fontSize: 7, bold: true, color: '', align: 'left', uppercase: false, letterSpacing: 0.3, fontFamily: 'monospace', visible: true },
  text_callsign: { left: 29, top: 46, width: 41, height: 9, fontSize: 8, bold: true, color: '#ef4444', align: 'left', uppercase: true, letterSpacing: 1, fontFamily: 'monospace', visible: true },
  zone: { left: 44, top: 57, width: 9, height: 38 },
  channel: { left: 53, top: 57, width: 9, height: 38 },
  dpad_up: { left: 84, top: 55, width: 7, height: 13 },
  dpad_down: { left: 84, top: 82, width: 7, height: 13 },
  dpad_left: { left: 78, top: 68, width: 6, height: 13 },
  dpad_right: { left: 90, top: 68, width: 6, height: 13 },
  ptt: { left: 90, top: 2, width: 10, height: 28 },
  settings: { left: 91, top: 47, width: 8, height: 19 },
  collapse: { left: 92, top: 79, width: 8, height: 19 },
  who_on: { left: 70, top: 40, width: 12, height: 10, shape: 'rounded' },
  call: { left: 70, top: 52, width: 12, height: 10, shape: 'rounded' },
};

export default function RadioWidget() {
  const { user } = useAuth();
  const [radioEnabled, setRadioEnabled] = useState(null); // null = not checked yet
  const [open, setOpen] = useState(false);
  const [zones, setZones] = useState([]);
  const [channels, setChannels] = useState([]);
  const [zoneId, setZoneId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [settings, setSettings] = useState(null);
  const [radioLayouts, setRadioLayouts] = useState([]);
  const [radioDsp, setRadioDsp] = useState(DEFAULT_RADIO_DSP);
  const [personalRadioDsp, setPersonalRadioDsp] = useState(null);
  const [rogerBeeps, setRogerBeeps] = useState([]); // admin-uploaded RadioRogerBeep rows
  const [showSettings, setShowSettings] = useState(false);
  const [customLayout, setCustomLayout] = useState(null); // { image_url, image_width, image_height, controls } or null = use built-in default
  const [popoutError, setPopoutError] = useState('');
  const [scanning, setScanning] = useState(false); // auto-hops through zoneChannels while idle, pausing on activity
  const [speechVoices, setSpeechVoices] = useState([]);
  const [adminDefaultVoice, setAdminDefaultVoice] = useState('');
  const { popoutWindow, isDocPip, popOut, popIn } = useRadioPopout();

  useEffect(() => {
    if (!user) return;
    loadToolsConfig().then((config) => {
      setRadioEnabled(!!config.radio_enabled);
      setAdminDefaultVoice(config.radio_default_voice_name || '');
    }).catch(() => setRadioEnabled(false));
  }, [user]);

  // Admin -> Web Radio -> System dispatches this in the same tab when the
  // "Enable website radio" toggle changes, so an already-open widget hides
  // immediately instead of waiting for a page refresh.
  useEffect(() => {
    const onToggle = (e) => {
      const enabled = !!e.detail?.enabled;
      setRadioEnabled(enabled);
      if (!enabled) { setOpen(false); popIn(); }
    };
    const onDspChanged = (e) => {
      if (e.detail?.dsp) setRadioDsp({ ...DEFAULT_RADIO_DSP, ...e.detail.dsp });
    };
    window.addEventListener('rn:radio-enabled-changed', onToggle);
    window.addEventListener('rn:radio-dsp-changed', onDspChanged);
    return () => {
      window.removeEventListener('rn:radio-enabled-changed', onToggle);
      window.removeEventListener('rn:radio-dsp-changed', onDspChanged);
    };
  }, [popIn]);

  useEffect(() => {
    if (!user || !radioEnabled) return;
    (async () => {
      try {
        const [z, c, mySettings, layoutRows, dspRows, beepRows] = await Promise.all([
          base44.entities.RadioZone.list('display_order', 100),
          base44.entities.RadioChannel.list('number', 500),
          base44.entities.RadioUserSettings.list('-created_date', 1),
          base44.entities.RadioLayout.list('-updated_date', 100).catch(() => []),
          base44.entities.RadioDSPSettings.list('-updated_date', 1).catch(() => []),
          base44.entities.RadioRogerBeep.list('display_order', 200).catch(() => []),
        ]);
        setRogerBeeps((beepRows || []).filter((b) => b.enabled !== false));
        // Only offer what issue-radio-session will actually let this member
        // join -- otherwise dialing (or scanning) into a higher-role zone or
        // an admin-only channel just ends in an "access denied" error.
        const roleRank = { user: 0, moderator: 1, admin: 2, super_admin: 2 };
        const myRank = roleRank[user.role] || 0;
        const isStaff = user.role === 'admin' || user.role === 'super_admin';
        const enabledZones = (z || []).filter((zz) => zz.enabled !== false && (roleRank[zz.min_role] || 0) <= myRank);
        const zoneIds = new Set(enabledZones.map((zz) => zz.id));
        setZones(enabledZones);
        setChannels((c || []).filter((cc) => cc.enabled !== false && zoneIds.has(cc.zone_id) && (!cc.admin_only || isStaff)));
        let mine = mySettings?.[0];
        if (!mine) {
          mine = await base44.entities.RadioUserSettings.create({ ptt_key: DEFAULT_PTT_KEY, volume: 80 });
        }
        setSettings(mine);
        const initialZone = enabledZones.find((zz) => zz.id === mine.last_zone_id) || enabledZones[0];
        if (initialZone) setZoneId(initialZone.id);
        const dspRow = dspRows?.[0];
        if (dspRow) setRadioDsp({ ...DEFAULT_RADIO_DSP, ...dspRow });

        const availableLayouts = (layoutRows || []).map((row) => {
          let controls = {};
          try { controls = JSON.parse(row.controls || '{}'); } catch { /* fall back to defaults below */ }
          return { ...row, controls };
        });
        setRadioLayouts(availableLayouts);

        const selectedLayoutId = mine.radio_layout_id;
        const layoutRow =
          availableLayouts.find((r) => r.id === selectedLayoutId) ||
          availableLayouts.find((r) => r.is_default) ||
          availableLayouts[0];

        if (layoutRow && mine.radio_layout_id !== layoutRow.id) {
          const nextSettings = { ...mine, radio_layout_id: layoutRow.id };
          setSettings(nextSettings);
          base44.entities.RadioUserSettings.update(mine.id, { radio_layout_id: layoutRow.id }).catch(() => {});
        }

        if (layoutRow?.image_url) {
          setCustomLayout({
            id: layoutRow.id,
            layout_name: layoutRow.layout_name,
            image_url: layoutRow.image_url,
            image_width: layoutRow.image_width,
            image_height: layoutRow.image_height,
            controls: layoutRow.controls,
            widget_width: layoutRow.widget_width,
          });
        }
      } catch (e) { console.error('[radio] init failed', e); }
    })();
  }, [user, radioEnabled]);

  // RadioDSPSettings is the single site-wide source of truth. Subscribe so
  // an admin changing the shared EQ updates every open radio immediately,
  // including a member who is currently holding PTT.
  useEffect(() => {
    if (!user || !radioEnabled) return undefined;
    const unsubscribe = base44.entities.RadioDSPSettings.subscribe((event) => {
      if ((event?.type === 'create' || event?.type === 'update') && event?.data) {
        setRadioDsp({ ...DEFAULT_RADIO_DSP, ...event.data });
      }
    });
    return () => { try { unsubscribe?.(); } catch { /* noop */ } };
  }, [user, radioEnabled]);

  const zoneChannels = useMemo(
    () => channels.filter((c) => c.zone_id === zoneId).sort((a, b) => (a.number || 0) - (b.number || 0)),
    [channels, zoneId]
  );

  useEffect(() => {
    if (!zoneId) return;
    if (zoneChannels.length === 0) { setChannelId(''); return; }
    const stillValid = zoneChannels.some((c) => c.id === channelId);
    if (!stillValid) {
      const preferred = zoneChannels.find((c) => c.id === settings?.last_channel_id) || zoneChannels[0];
      setChannelId(preferred.id);
    }
  }, [zoneId, zoneChannels]);

  // A member's own choice wins; otherwise fall back to the admin-configured
  // site default (Admin -> Web Radio -> Roger Beeps -> Site default), and
  // only then to the app's built-in default. A custom (admin-uploaded)
  // roger beep is stored as "custom:<RadioRogerBeep id>" -- for either the
  // member's choice or the site default -- so it can't collide with the
  // fixed built-in style keys.
  const availableRadioPresets = useMemo(() => {
    const saved = Array.isArray(radioDsp?.presets) ? radioDsp.presets : [];
    return saved.length ? saved : [{ ...DEFAULT_RADIO_DSP, name: 'Police Radio', preset: 'Police Radio' }];
  }, [radioDsp]);
  useEffect(() => {
    if (!user?.id || !radioDsp) return;
    try {
      const savedName = localStorage.getItem('rn.radio.eqPreset.' + user.id);
      if (!savedName) return;
      const preset = availableRadioPresets.find((p) => p.name === savedName || p.preset === savedName);
      if (preset) setPersonalRadioDsp({ ...DEFAULT_RADIO_DSP, ...preset, preset: preset.name || preset.preset || savedName });
    } catch { /* local storage may be unavailable */ }
  }, [user?.id, radioDsp, availableRadioPresets]);
  const effectiveRadioDsp = personalRadioDsp || radioDsp;
  const effectiveRogerBeepStyle = settings?.roger_beep_style || effectiveRadioDsp?.roger_beep_default_style || ROGER_BEEP_DEFAULT;
  const selectedCustomBeep = useMemo(() => {
    if (!effectiveRogerBeepStyle.startsWith('custom:')) return null;
    return rogerBeeps.find((b) => `custom:${b.id}` === effectiveRogerBeepStyle) || null;
  }, [effectiveRogerBeepStyle, rogerBeeps]);

  const { status, participants, pttHolder, session, error, setError, requestPTT, releasePTT, moderate, setLocalVolume, previewRogerBeep } =
    useRadioSession(open ? channelId : '', {
      echoCancellation: settings?.echo_cancellation !== false,
      noiseSuppression: settings?.noise_suppression !== false,
      autoGainControl: true,
      // Transmissions are processed once, before LiveKit. Received audio is
      // already processed by the sender, so applying DSP here would double-EQ it.
      radioFilter: false,
      radioDsp: effectiveRadioDsp,
      rogerBeepEnabled: settings?.roger_beep_enabled !== false,
      rogerBeepStyle: effectiveRogerBeepStyle,
      rogerBeepCustomUrl: selectedCustomBeep?.audio_url || null,
      micDeviceId: settings?.mic_device_id || undefined,
      speakerDeviceId: settings?.speaker_device_id || undefined,
      zoneId,
      channelNumber: zoneChannels.find((c) => c.id === channelId)?.number ?? null,
    });

  // Share the active channel and output preferences with the receive-only
  // monitor grid so the same channel cannot play twice through one speaker.
  useEffect(() => {
    const playback = {
      channelId: open && ['listening', 'receiving', 'transmitting', 'busy'].includes(status) ? channelId : '',
      speakerMuted: !!settings?.speaker_muted || Number(settings?.volume ?? 80) <= 0,
      speakerDeviceId: settings?.speaker_device_id || '',
    };
    window.__rnRadioWidgetPlayback = playback;
    window.dispatchEvent(new CustomEvent('rn:radio-widget-playback', { detail: playback }));
  }, [open, channelId, status, settings?.speaker_muted, settings?.volume, settings?.speaker_device_id]);

  useEffect(() => () => {
    const inactive = { channelId: '', speakerMuted: true, speakerDeviceId: '' };
    window.__rnRadioWidgetPlayback = inactive;
    window.dispatchEvent(new CustomEvent('rn:radio-widget-playback', { detail: inactive }));
  }, []);

  const { onlineUsers, incoming, call, callState, activeCallUserIds, startCall, accept, decline, endCall } =
    useRadioDirectCall(!!radioEnabled && !!user, channelId, user?.id, {
      // Who's-online lookups list every LiveKit room, so only run them while
      // the radio is open. Incoming-call checks keep running when collapsed.
      presenceEnabled: open,
      callMicMuted: settings?.mic_muted === true,
      callVolume: settings?.volume ?? 80,
      callSpeakerMuted: settings?.speaker_muted === true,
      callSpeakerDeviceId: settings?.speaker_device_id || '',
    });
  useEffect(() => {
    setLocalVolume(['calling','connecting','connected'].includes(callState) ? 0 : (settings?.speaker_muted ? 0 : (settings?.volume ?? 80)));
  }, [callState, settings?.speaker_muted, settings?.volume, setLocalVolume]);
  // Tells the background updater not to reload the page while someone is
  // listening, transmitting or on a direct call.
  const voiceBusy = (!!open && !!channelId && !['idle', 'disconnected', 'error'].includes(status)) || (callState && callState !== 'idle') || !!incoming;
  useEffect(() => { setVoiceBusy(voiceBusy); }, [voiceBusy]);
  useEffect(() => () => setVoiceBusy(false), []);

  const [showWhoOn, setShowWhoOn] = useState(false);
  const [showCallList, setShowCallList] = useState(false);
  const [callError, setCallError] = useState('');
  const [whoOnFilter, setWhoOnFilter] = useState(() => {
    try { return localStorage.getItem(`rn.radio.whoOnFilter.${user?.id || 'guest'}`) || 'all'; } catch { return 'all'; }
  });
  const [callFilter, setCallFilter] = useState(() => {
    try { return localStorage.getItem(`rn.radio.callFilter.${user?.id || 'guest'}`) || 'all'; } catch { return 'all'; }
  });

  useEffect(() => {
    if (!user?.id) return;
    try {
      const who = localStorage.getItem(`rn.radio.whoOnFilter.${user.id}`);
      const calls = localStorage.getItem(`rn.radio.callFilter.${user.id}`);
      if (who) setWhoOnFilter(who);
      if (calls) setCallFilter(calls);
    } catch { /* local storage may be unavailable */ }
  }, [user?.id]);

  const saveListFilter = useCallback((kind, value) => {
    if (kind === 'who') setWhoOnFilter(value);
    else setCallFilter(value);
    try { localStorage.setItem(`rn.radio.${kind === 'who' ? 'whoOnFilter' : 'callFilter'}.${user?.id || 'guest'}`, value); } catch { /* noop */ }
  }, [user?.id]);

  const filteredWhoOn = useMemo(() => participants.filter((p) => {
    if (whoOnFilter === 'in_call') return activeCallUserIds.has(p.userId);
    if (whoOnFilter === 'transmitting') return !activeCallUserIds.has(p.userId) && pttHolder?.userId === p.userId;
    if (whoOnFilter === 'available') return !activeCallUserIds.has(p.userId);
    if (whoOnFilter === 'listening') return !activeCallUserIds.has(p.userId) && pttHolder?.userId !== p.userId;
    return true;
  }), [participants, whoOnFilter, activeCallUserIds, pttHolder]);

  const filteredCallUsers = useMemo(() => onlineUsers.filter((p) => {
    const sameChannel = p.channelId === channelId;
    const inCall = activeCallUserIds.has(p.userId);
    if (callFilter === 'my_channel') return sameChannel;
    if (callFilter === 'available') return !inCall;
    if (callFilter === 'in_call') return inCall;
    if (callFilter === 'other_channels') return !sameChannel;
    return true;
  }), [onlineUsers, callFilter, channelId, activeCallUserIds]);

  useEffect(() => {
    if (incoming) setCallError('');
  }, [incoming]);

  // A blocked/denied PTT press (not authorized, busy, muted, rate-limited,
  // still connecting) shows on the radio's own tiny status line, but that's
  // a small piece of colored text on a custom admin-styled display and easy
  // to miss entirely, especially walkie-talkie style with eyes off the
  // screen. Mirror it as a toast so it's impossible to miss regardless of
  // the configured layout's size/colors/visibility.
  const lastToastedErrorRef = useRef('');
  useEffect(() => {
    if (error && error !== lastToastedErrorRef.current) {
      lastToastedErrorRef.current = error;
      toast({ title: 'Radio', description: error, variant: 'destructive' });
    } else if (!error) {
      lastToastedErrorRef.current = '';
    }
  }, [error]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
    const loadVoices = () => setSpeechVoices(window.speechSynthesis.getVoices().filter((voice) => voice?.name));
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
  }, []);

  const persistLastLocation = useCallback((zId, chId) => {
    if (!settings) return;
    base44.entities.RadioUserSettings.update(settings.id, { last_zone_id: zId, last_channel_id: chId }).catch(() => {});
  }, [settings]);

  // Give the radio a real "channel voice" identity: when a member manually
  // changes channels, the browser announces the zone and channel just like a
  // physical radio can identify a selected channel. Scan hops stay silent so
  // a 2.5-second scan does not turn into a stream of spoken announcements.
  const announceChannel = useCallback((zone, channel) => {
    if (settings?.channel_voice_enabled === false || settings?.speaker_muted) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !channel) return;
    const zoneLabel = String(zone?.name || 'Zone').trim();
    const channelLabel = String(channel?.name || (channel?.number != null ? `Channel ${channel.number}` : 'Channel')).trim();
    const spokenZone = /^zone\b/i.test(zoneLabel) ? zoneLabel : `Zone ${zoneLabel}`;
    const spokenChannel = /^channel\b/i.test(channelLabel) ? channelLabel : `Channel ${channelLabel}`;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`${spokenZone}. ${spokenChannel}.`);
      const selectedVoiceName = String(settings?.channel_voice_name || adminDefaultVoice || '').trim();
      if (selectedVoiceName) {
        const selectedVoice = speechVoices.find((voice) => voice.name === selectedVoiceName);
        if (selectedVoice) utterance.voice = selectedVoice;
      }
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = Math.max(0, Math.min(1, Number(settings?.volume ?? 80) / 100));
      window.speechSynthesis.speak(utterance);
    } catch { /* browser speech synthesis is optional */ }
  }, [settings?.channel_voice_enabled, settings?.speaker_muted, settings?.volume, settings?.channel_voice_name, adminDefaultVoice, speechVoices]);

  useEffect(() => {
    const onDefaultVoiceChanged = (e) => setAdminDefaultVoice(e.detail?.voice || '');
    window.addEventListener('rn:radio-default-voice-changed', onDefaultVoiceChanged);
    return () => window.removeEventListener('rn:radio-default-voice-changed', onDefaultVoiceChanged);
  }, []);

  const currentZone = zones.find((z) => z.id === zoneId);
  const currentChannel = channels.find((c) => c.id === channelId);
  const callDisplayActive = callState === 'calling' || callState === 'connecting' || callState === 'connected';
  const isCaller = call?.caller_user_id === user?.id;
  const directTargetCallsign = isCaller ? call?.recipient_callsign : call?.caller_callsign;
  const displayChannelName = callState === 'calling' ? `CALLING — ${directTargetCallsign || '—'}` : callDisplayActive ? `DIRECT — ${directTargetCallsign || '—'}` : (incoming ? `INCOMING — ${incoming.caller_callsign || 'CALL'}` : (currentChannel?.name || '— No channel —'));
  const displayChannelNumber = callDisplayActive || incoming ? '' : `CH. ${currentChannel?.number ?? '--'}`;
  const meta = STATUS_META[status] || STATUS_META.idle;
  const micEnabled = !!settings && !settings.mic_muted;
  const speakerEnabled = !!settings && !settings.speaker_muted;

  const layoutImage = customLayout?.image_url || '';
  const layoutAspect = customLayout?.image_width && customLayout?.image_height
    ? `${customLayout.image_width} / ${customLayout.image_height}`
    : DEFAULT_IMAGE_ASPECT;
  const widgetWidth = customLayout?.widget_width || 440;
  // Text font sizes/letter-spacing are authored in the layout editor at
  // this widgetWidth, in plain px. Popped out into a resizable window (or
  // shrunk to fit a narrow phone), the photo itself already scales via
  // percentage left/top/width/height -- but a fixed px font wouldn't, so
  // it'd read as tiny writing on a big radio (or vice versa). Container
  // query width units (cqw, 1cqw = 1% of the nearest ancestor with
  // container-type set -- the photo wrapper below) make font size scale
  // with the box exactly the same way position/size already do: px2cqw
  // converts an authored px value into "that many cqw at widgetWidth",
  // which reproduces the exact original px size when the box is actually
  // rendered at widgetWidth, and scales proportionally at any other size.
  const px2cqw = (px) => `${(px / widgetWidth) * 100}cqw`;
  // Per-key fallback: a saved layout that customized only some controls
  // shouldn't blank out the ones it never touched (e.g. an older layout
  // saved before text_zone/text_channel/text_status existed still gets
  // sensible built-in positions for them until re-saved).
  const styleFor = (key) => ({ ...(DEFAULT_CONTROLS[key] || {}), ...(customLayout?.controls?.[key] || {}) });
  const statusStyle = styleFor('text_status');
  const statusLabels = { ...(DEFAULT_CONTROLS.text_status.labels || {}), ...(statusStyle.labels || {}) };
  const displayedStatusLabel = statusLabels[status] || meta.label;
  const displayedListenOnlyLabel = statusLabels.listen_only || 'LISTEN ONLY';
  const box = (key) => {
    const b = customLayout?.controls?.[key] || DEFAULT_CONTROLS[key];
    if (!b) return null;
    return { left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` };
  };
  const buttonBox = (key) => {
    const b = customLayout?.controls?.[key] || DEFAULT_CONTROLS[key];
    const geometry = box(key);
    if (!geometry) return null;
    const style = { ...geometry, borderRadius: controlRadius(b?.shape) };
    if (b?.shape === 'freehand' && b?.polygon?.length) {
      style.clipPath = 'polygon(' + b.polygon.map((p) => p.x + '% ' + p.y + '%').join(', ') + ')';
    }
    return style;
  };
  const customBackgrounds = customLayout?.controls?.backgrounds || [];
  const customTexts = customLayout?.controls?.custom_texts || [];
  const micOnPhoto = box('mic_mute');
  const speakerOnPhoto = box('speaker_mute');
  const volumeUpOnPhoto = box('volume_up');
  const volumeDownOnPhoto = box('volume_down');
  const scanOnPhoto = box('scan');
  const whoOnPhoto = box('who_on');
  const callOnPhoto = box('call');

  // A blocked/denied PTT press is surfaced by requestPTT and the radio status line.
  const doRequestPTT = useCallback(() => {
    // Committing to transmit means committing to a fixed channel -- can't
    // still be auto-hopping while pressing PTT.
    setScanning(false);
    // Do not play a local PTT-start beep. With speakers, any start-of-TX
    // tone can leak back into the microphone and be rebroadcast to everyone
    // on the channel. The radio should go straight from floor grant to voice.
    if (callState !== 'idle') { setError('Direct call is active — PTT is unavailable until the call ends.'); return; }
    if (!micEnabled) { setError('Your mic is muted — unmute it to transmit.'); return; }
    requestPTT();
  }, [micEnabled, requestPTT, setError, callState]);
  useKeyboardPTT(settings?.ptt_key || DEFAULT_PTT_KEY, doRequestPTT, releasePTT, open && !!channelId && status !== 'idle', popoutWindow);

  // The on-screen PTT button (pointer-based) relies on onPointerUp/
  // onPointerLeave to release, but neither fires if the window loses focus
  // or is hidden while physically still held down (alt-tab, a notification,
  // switching tabs) -- unlike useKeyboardPTT above, which already has this
  // exact safety net built in for keyboard/mouse bindings. releasePTT()
  // itself is a no-op unless PTT is actually held, so it's always safe to
  // call unconditionally here.
  useEffect(() => {
    if (!open) return undefined;
    const onBlur = () => releasePTT();
    const onVisibility = () => { if (document.hidden) releasePTT(); };
    const targets = [window, popoutWindow].filter(Boolean);
    for (const w of targets) w.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      for (const w of targets) w.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [open, releasePTT, popoutWindow]);

  // `fromScan` distinguishes scan's own auto-advance from a manual dpad/
  // channel-list press so a manual press correctly cancels an active scan
  // (touching the controls should always take over) without scan's own
  // hop doing the same to itself every tick.
  const changeChannel = (dir, fromScan = false) => {
    if (!fromScan && scanning) setScanning(false);
    if (!zoneChannels.length || !currentChannel) return;
    const idx = zoneChannels.findIndex((c) => c.id === currentChannel.id);
    const next = zoneChannels[(idx + dir + zoneChannels.length) % zoneChannels.length];
    setChannelId(next.id);
    persistLastLocation(zoneId, next.id);
    if (!fromScan) announceChannel(currentZone, next);
  };

  const selectZone = (z) => {
    // Scan only hops within one zone -- switching zones invalidates it.
    setScanning(false);
    const nextZoneChannels = channels.filter((c) => c.zone_id === z.id).sort((a, b) => (a.number || 0) - (b.number || 0));
    const nextChannel = nextZoneChannels.find((c) => c.id === settings?.last_channel_id) || nextZoneChannels[0];
    setZoneId(z.id);
    if (nextChannel) {
      setChannelId(nextChannel.id);
      persistLastLocation(z.id, nextChannel.id);
      announceChannel(z, nextChannel);
    } else {
      persistLastLocation(z.id, '');
    }
  };

  const changeZone = (dir = 1) => {
    if (!zones.length) return;
    const idx = zones.findIndex((z) => z.id === zoneId);
    const next = zones[(idx + dir + zones.length) % zones.length];
    selectZone(next);
  };

  // Auto-hops through zoneChannels every SCAN_INTERVAL_MS while idle,
  // pausing (not stopping) whenever the current channel has activity so
  // the user actually hears it, then resuming once it goes quiet again.
  // Reads status via a ref rather than an effect dependency so the
  // interval isn't torn down and rebuilt on every status change (which
  // would happen constantly while someone's transmitting).
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  const scanAdvanceRef = useRef(() => {});
  useEffect(() => { scanAdvanceRef.current = () => changeChannel(1, true); });
  useEffect(() => {
    if (!scanning) return undefined;
    const id = setInterval(() => {
      const s = statusRef.current;
      if (s === 'receiving' || s === 'transmitting' || s === 'connecting' || s === 'busy') return;
      scanAdvanceRef.current();
    }, SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [scanning]);
  // Scanning only makes sense while actually tuned in -- don't leave it
  // silently running in the background if the widget closes.
  useEffect(() => { if (!open || !channelId) setScanning(false); }, [open, channelId]);

  const toggleScan = () => {
    if (!zoneChannels.length) return;
    setScanning((v) => !v);
  };

  const updateSettings = (patch) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);

    // Apply speaker volume/mute immediately to the already-connected
    // LiveKit audio. Do not wait for the database round-trip or a
    // settings reload.
    if (Object.prototype.hasOwnProperty.call(patch, 'volume') || Object.prototype.hasOwnProperty.call(patch, 'speaker_muted')) {
      const liveVolume = next.speaker_muted ? 0 : Number(next.volume ?? 80);
      setLocalVolume(liveVolume);
    }

    base44.entities.RadioUserSettings.update(settings.id, patch).catch(() => {});
  };

  const selectRadioLayout = (layoutId) => {
    if (!settings) return;
    const row = layoutId ? radioLayouts.find((r) => r.id === layoutId) : radioLayouts.find((r) => r.is_default) || radioLayouts[0];
    if (!row) return;
    setCustomLayout({
      id: row.id,
      layout_name: row.layout_name,
      image_url: row.image_url,
      image_width: row.image_width,
      image_height: row.image_height,
      controls: row.controls,
      widget_width: row.widget_width,
    });
    updateSettings({ radio_layout_id: row.id });
  };

  const adjustVolume = (delta) => {
    const current = settings?.speaker_muted ? 0 : (settings?.volume ?? 80);
    const next = Math.max(0, Math.min(100, current + delta));
    updateSettings(next === 0 ? { volume: 0, speaker_muted: true } : { volume: next, speaker_muted: false });
  };

  if (!user || radioEnabled === null || radioEnabled === false) return null;

  // Shown above the open radio, and also above the collapsed radio button
  // so a direct call can't ring out unseen just because the widget is closed.
  const incomingCallCard = incoming && (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground animate-pulse">
        <Phone className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold tracking-widest text-primary">INCOMING CALL</div>
        <div className="font-mono text-sm font-bold flex items-center gap-1.5 min-w-0"><span className="truncate">{incoming.caller_callsign || 'UNKNOWN'}</span><StaffTag userId={incoming.caller_user_id} compact /></div>
        <div className="text-[11px] text-muted-foreground truncate">{incoming.caller_display_name || 'Repeater Nation Member'}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" className="h-8 px-2.5" onClick={decline} title="Decline">
          <PhoneOff className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="sm" className="h-8 px-3 gap-1.5" onClick={async()=>{try{setOpen(true);await accept();}catch(e){setCallError(e?.message||'Could not accept call');}}}>
          <Phone className="h-3.5 w-3.5" /> Answer
        </Button>
      </div>
    </div>
  );

  if (!open) {
    return (
      <>
        {incomingCallCard && (
          <div className="fixed bottom-20 right-4 z-[130] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-primary/50 bg-background/95 shadow-2xl ring-1 ring-primary/20 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3">
            {incomingCallCard}
          </div>
        )}
        <button
          type="button"
          onClick={() => { setOpen(true); }}
          title={incoming ? 'Incoming direct call — open web radio' : 'Open web radio'}
          className={cn(
            'fixed bottom-4 right-4 z-[45] grid place-items-center w-14 h-14 rounded-full bg-gradient-to-b from-neutral-700 to-neutral-950 border-2 border-red-900 text-red-500 shadow-xl hover:scale-105 transition-transform',
            incoming && 'animate-pulse ring-2 ring-primary'
          )}
        >
          {incoming ? <PhoneCall className="w-6 h-6" /> : <Radio className="w-6 h-6" />}
        </button>
      </>
    );
  }

  const closeWidget = () => { setOpen(false); popIn(); };
  const openSettingsSafe = () => { setShowSettings(true); };
  const doPopOut = async () => {
    setPopoutError('');
    try { await popOut(); }
    catch (e) { setPopoutError(e?.message || 'Could not pop out the radio.'); }
  };
  const popInRadio = () => { popIn(); };

  const panel = (
    <div
      className={cn(
        'select-none',
        popoutWindow
          ? 'relative w-full h-full flex flex-col justify-end bg-neutral-950 overflow-visible'
          : 'fixed bottom-4 right-4 z-[45] max-w-[calc(100vw-2rem)] rounded-2xl bg-neutral-950 border border-neutral-800 shadow-2xl overflow-visible'
      )}
      style={popoutWindow ? undefined : { width: widgetWidth }}
    >
      {/* Minimal top bar -- the photo below has no clean space for a status dot or a close button */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', status === 'idle' || status === 'error' || status === 'disconnected' ? 'bg-destructive' : 'bg-success animate-pulse')} />
        <span className="flex-1 text-[9px] font-mono uppercase tracking-[0.15em] text-neutral-500 truncate">Repeater Nation Radio</span>
        {!popoutWindow && (
          <button type="button" onClick={doPopOut} title={isDocPip ? 'Pop out (stays visible even when this tab is in the background)' : 'Pop out into a separate window'} className="p-1 -m-1 text-neutral-500 hover:text-neutral-200 active:scale-90 transition-transform">
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
        {popoutWindow && (
          <button type="button" onClick={popInRadio} title="Return to page" className="text-[9px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 active:scale-95 transition-all">
            Pop in
          </button>
        )}
        <button type="button" onClick={closeWidget} title="Collapse" className="p-1 -m-1 text-neutral-500 hover:text-neutral-200">
          <X className="w-3 h-3" />
        </button>
      </div>
      {popoutError && <div className="px-3 py-1 text-[10px] text-warning bg-neutral-900 border-b border-neutral-800 shrink-0">{popoutError}</div>}

      {/* Radio face: an admin-configurable reference photo (Admin -> Web Radio -> Layout), with the real controls hit-tested over the matching drawn button. Falls back to a built-in default until one is configured. */}
      <div className="relative w-full bg-black" style={{ aspectRatio: layoutAspect, containerType: 'inline-size' }}>
        {layoutImage && <img src={layoutImage} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />}

        {/* Background panel -- a plain backdrop behind the text, positioned/styled independently in Admin -> Web Radio -> Layout */}
        {(() => { const s = styleFor('display_bg'); return (
          <div
            className="absolute pointer-events-none"
            style={{
              ...box('display_bg'),
              backgroundColor: hexToRgba(s.bgColor || '#ffffff', s.bgOpacity ?? 92),
              borderRadius: `${s.borderRadius ?? 2}px`,
              border: s.borderWidth ? `${s.borderWidth}px solid ${hexToRgba(s.borderColor || '#000000', s.borderOpacity ?? 100)}` : undefined,
            }}
          />
        ); })()}
        {customBackgrounds.map((bg) => (
          <div key={bg.id} className="absolute pointer-events-none" style={{
            left: `${bg.left}%`, top: `${bg.top}%`, width: `${bg.width}%`, height: `${bg.height}%`,
            backgroundColor: hexToRgba(bg.bgColor || '#ffffff', bg.bgOpacity ?? 80),
            borderRadius: `${bg.borderRadius ?? 2}px`,
            border: bg.borderWidth ? `${bg.borderWidth}px solid ${hexToRgba(bg.borderColor || '#000000', bg.borderOpacity ?? 100)}` : undefined,
          }} />
        ))}

        {/* Zone -- its own independently positioned/styled text */}
        {(() => { const s = styleFor('text_zone'); return s.visible !== false && (
          <div
            className="absolute overflow-hidden truncate pointer-events-none flex items-center"
            style={{ ...box('text_zone'), fontSize: px2cqw(s.fontSize || 6.5), fontWeight: s.bold ? 700 : 400, color: hexToRgba(s.color || '#64748b', s.colorOpacity ?? 100), textAlign: s.align || 'left', justifyContent: JUSTIFY_FOR_ALIGN[s.align] || 'flex-start', textTransform: s.uppercase ? 'uppercase' : 'none', letterSpacing: px2cqw(s.letterSpacing ?? 0), fontFamily: s.fontFamily || 'monospace' }}
          >
            {currentZone?.name ? `ZONE-${currentZone.name}` : 'ZONE-No zone'}
          </div>
        ); })()}

        {/* Channel name -- its own independently positioned/styled text */}
        {(() => { const s = styleFor('text_channel'); return s.visible !== false && (
          <div
            className="absolute overflow-hidden truncate pointer-events-none flex items-center"
            style={{ ...box('text_channel'), fontSize: px2cqw(s.fontSize || 8.5), fontWeight: s.bold ? 700 : 400, color: hexToRgba(s.color || '#0f172a', s.colorOpacity ?? 100), textAlign: s.align || 'left', justifyContent: JUSTIFY_FOR_ALIGN[s.align] || 'flex-start', textTransform: s.uppercase ? 'uppercase' : 'none', letterSpacing: px2cqw(s.letterSpacing ?? 0), fontFamily: s.fontFamily || 'monospace' }}
          >
            {displayChannelName}
          </div>
        ); })()}

        {/* Channel number -- independent from the channel name */}
        {(() => { const s = styleFor('text_channel_number'); return s.visible !== false && (
          <div
            className="absolute overflow-hidden truncate pointer-events-none flex items-center"
            style={{ ...box('text_channel_number'), fontSize: px2cqw(s.fontSize || 8.5), fontWeight: s.bold ? 700 : 400, color: hexToRgba(s.color || '#0f172a', s.colorOpacity ?? 100), textAlign: s.align || 'right', justifyContent: JUSTIFY_FOR_ALIGN[s.align] || 'flex-end', textTransform: s.uppercase ? 'uppercase' : 'none', letterSpacing: px2cqw(s.letterSpacing ?? 0), fontFamily: s.fontFamily || 'monospace' }}
          >
            {displayChannelNumber}
          </div>
        ); })()}

        {/* Status label -- its own independently positioned/styled text; falls back to its live state color unless a custom one is set. The 4th dynamic line (callsign/error/listen-only) shares this slot's styling and swaps in when relevant. */}
        {(() => { const s = styleFor('text_status'); return s.visible !== false && (
          <div
            className="absolute overflow-hidden truncate pointer-events-none flex items-center gap-0.5"
            style={{ ...box('text_status'), fontSize: px2cqw(s.fontSize || 7), fontWeight: s.bold ? 700 : 400, textAlign: s.align || 'left', justifyContent: JUSTIFY_FOR_ALIGN[s.align] || 'flex-start', textTransform: s.uppercase ? 'uppercase' : 'none', letterSpacing: px2cqw(s.letterSpacing ?? 0), fontFamily: s.fontFamily || 'monospace' }}
          >
            {error ? (
              <span className="text-warning">{error}</span>
            ) : scanning && (status === 'idle' || status === 'listening') ? (
              <span className="text-primary">SCANNING…</span>
            ) : !session?.canTransmit && status !== 'idle' && status !== 'connecting' ? (
              <><ShieldAlert className="w-2 h-2 shrink-0 text-warning" /> <span className="text-warning">{displayedListenOnlyLabel}</span></>
            ) : (
              <span className={cn(!s.color && meta.tone)} style={{ color: s.color ? hexToRgba(s.color, s.colorOpacity ?? 100) : undefined }}>{displayedStatusLabel}</span>
            )}
          </div>
        ); })()}

        {/* Direct-call display takes priority over normal channel status. */}
        {callState === 'calling' && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="sr-only">CALLING</span></div>}

        {/* Callsign -- its own independent display slot. It only appears while someone is actively transmitting, so the status line remains a true status field. */}
        {(() => { const s = styleFor('text_callsign'); return s.visible !== false && (status === 'receiving' || status === 'transmitting') && pttHolder?.callsign ? (
          <div
            className="absolute overflow-hidden truncate pointer-events-none flex items-center"
            style={{ ...box('text_callsign'), fontSize: px2cqw(s.fontSize || 8), fontWeight: s.bold ? 700 : 400, color: hexToRgba(s.color || '#ef4444', s.colorOpacity ?? 100), textAlign: s.align || 'left', justifyContent: JUSTIFY_FOR_ALIGN[s.align] || 'flex-start', textTransform: s.uppercase ? 'uppercase' : 'none', letterSpacing: px2cqw(s.letterSpacing ?? 0), fontFamily: s.fontFamily || 'monospace' }}
          >
            {pttHolder.callsign}
          </div>
        ) : null; })()}

        {customTexts.map((item) => item.visible !== false && (
          <div key={item.id} className="absolute overflow-hidden truncate pointer-events-none flex items-center"
            style={{ left: `${item.left}%`, top: `${item.top}%`, width: `${item.width}%`, height: `${item.height}%`, fontSize: px2cqw(item.fontSize || 10), fontWeight: item.bold ? 700 : 400, color: hexToRgba(item.color || '#ffffff', item.colorOpacity ?? 100), textAlign: item.align || 'left', justifyContent: JUSTIFY_FOR_ALIGN[item.align] || 'flex-start', textTransform: item.uppercase ? 'uppercase' : 'none', letterSpacing: px2cqw(item.letterSpacing ?? 0), fontFamily: item.fontFamily || 'monospace' }}>
            {item.text || 'Custom text'}
          </div>
        ))}

        {/* Zone -- toggles to the next zone each press, like a physical radio's zone button, instead of opening a list */}
        {box('zone') && (
          <button type="button" onClick={() => changeZone(1)} title="Next zone" className={HIT} style={buttonBox('zone')} />
        )}

        {/* Chan -- toggles to the next channel each press, same as the D-pad left/right, instead of opening a list */}
        {box('channel') && (
          <button type="button" onClick={() => changeChannel(1)} title="Next channel" className={HIT} style={buttonBox('channel')} />
        )}

        {/* D-pad -- up/down change zone (like a physical radio's group/bank
            switch), left/right change channel within the current zone.
            Each arrow only renders where this layout has placed it. */}
        {box('dpad_up') && <button type="button" onClick={() => changeZone(1)} title="Next zone" className={HIT} style={buttonBox('dpad_up')} />}
        {box('dpad_down') && <button type="button" onClick={() => changeZone(-1)} title="Previous zone" className={HIT} style={buttonBox('dpad_down')} />}
        {box('dpad_left') && <button type="button" onClick={() => changeChannel(-1)} title="Previous channel" className={cn(HIT, 'rounded-full')} style={buttonBox('dpad_left')} />}
        {box('dpad_right') && <button type="button" onClick={() => changeChannel(1)} title="Next channel" className={cn(HIT, 'rounded-full')} style={buttonBox('dpad_right')} />}

        {/* Settings */}
        {box('settings') && (
          <button type="button" onClick={openSettingsSafe} title="Radio settings" className={cn(HIT, 'rounded-full')} style={buttonBox('settings')} />
        )}

        {/* Mic / speaker mute, when this layout has a spot for them -- otherwise they stay in the footer strip below */}
        {micOnPhoto && (
          <button type="button" onClick={() => { updateSettings({ mic_muted: !settings?.mic_muted }); }} title={micEnabled ? 'Mute microphone' : 'Unmute microphone'} className={cn(HIT, 'rounded-full')} style={{ ...micOnPhoto, borderRadius: controlRadius(customLayout?.controls?.mic_mute?.shape) }} />
        )}
        {speakerOnPhoto && (
          <button type="button" onClick={() => { updateSettings({ speaker_muted: !settings?.speaker_muted }); }} title={speakerEnabled ? 'Mute speaker' : 'Unmute speaker'} className={cn(HIT, 'rounded-full')} style={{ ...speakerOnPhoto, borderRadius: controlRadius(customLayout?.controls?.speaker_mute?.shape) }} />
        )}
        {volumeUpOnPhoto && (
          <button type="button" onClick={() => adjustVolume(10)} title="Volume up" className={cn(HIT, 'rounded-full')} style={{ ...volumeUpOnPhoto, borderRadius: controlRadius(customLayout?.controls?.volume_up?.shape) }} />
        )}
        {volumeDownOnPhoto && (
          <button type="button" onClick={() => adjustVolume(-10)} title="Volume down" className={cn(HIT, 'rounded-full')} style={{ ...volumeDownOnPhoto, borderRadius: controlRadius(customLayout?.controls?.volume_down?.shape) }} />
        )}
        {scanOnPhoto && (
          <button type="button" onClick={toggleScan} title={scanning ? 'Stop scan' : 'Scan channels'} className={cn(HIT, 'rounded-full', scanning && 'bg-primary/25')} style={{ ...scanOnPhoto, borderRadius: controlRadius(customLayout?.controls?.scan?.shape) }} />
        )}
        {whoOnPhoto && (
          <button type="button" onClick={() => setShowWhoOn(true)} title="Who's On" className={HIT} style={{ ...whoOnPhoto, borderRadius: controlRadius(customLayout?.controls?.who_on?.shape) }} />
        )}
        {callOnPhoto && (
          <button type="button" onClick={() => setShowCallList(true)} disabled={callState !== 'idle' && !!call} title="Call" className={HIT} style={{ ...callOnPhoto, borderRadius: controlRadius(customLayout?.controls?.call?.shape) }} />
        )}

        {/* PTT -- the one control every layout should place; if unmapped, keyboard PTT still works */}
        {box('ptt') && (
          <button
            type="button"
            // Intentionally NOT a native `disabled` button even when blocked
            // (unverified callsign, still connecting, muted mic): a disabled
            // element eats the click/tap entirely with zero event firing, so
            // a blocked press looked identical to a broken button -- nothing
            // happened, no message, nothing. Always let the press reach
            // doRequestPTT/requestPTT, which already surface *why* it can't
            // transmit on the status line; only dim the button visually.
            onPointerDown={(e) => {
              e.preventDefault();
              try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
              doRequestPTT();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              releasePTT();
              try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
            }}
            onPointerCancel={releasePTT}
            onLostPointerCapture={releasePTT}
            title={settings?.ptt_key ? `Hold to transmit (or press ${PTT_KEY_OPTIONS.find((k) => k.value === settings.ptt_key)?.label || settings.ptt_key})` : 'Hold to transmit'}
            className={cn(
              'absolute rounded-full touch-none transition-all hover:bg-white/10 active:bg-white/25',
              (callState !== 'idle' || !session?.canTransmit || !micEnabled || status === 'idle' || status === 'connecting') && status !== 'transmitting' && status !== 'receiving'
                ? 'opacity-40'
                : ''
            )}
            style={buttonBox('ptt')}
          />
        )}

        {/* Admin-placed animated radio status icons. */}
        {(customLayout?.controls?.animated_icons || []).filter((item) => item.visible !== false).map((item) => {
          const def = getRadioAnimatedIconDef(item.icon);
          const Icon = def.Icon;
          const animation = item.animation && item.animation !== 'none' ? 'rn-radio-icon-' + item.animation : '';
          return (
            <div key={item.id} className="absolute pointer-events-none flex items-center justify-center" style={{ left: item.left + '%', top: item.top + '%', width: item.width + '%', height: item.height + '%', color: hexToRgba(item.color || '#22c55e', item.opacity ?? 100) }}>
              <Icon className={animation} style={{ width: '100%', height: '100%' }} strokeWidth={item.strokeWidth ?? 2} />
            </div>
          );
        })}

        {/* TX/RX (and any other) indicator LEDs -- admin-placed, as many as
            configured, independent of the PTT button itself. */}
        {(customLayout?.controls?.leds || []).map((led) => {
          const lit = isLedLit(led.mode, status);
          const rawColor = lit ? (led.onColor || '#ef4444') : (led.offColor || '#2a2a2a');
          const rawOpacity = lit ? (led.onColorOpacity ?? 100) : (led.offColorOpacity ?? 100);
          const color = hexToRgba(rawColor, rawOpacity);
          return (
            <div
              key={led.id}
              className="absolute rounded-full pointer-events-none transition-colors duration-150"
              style={{
                left: `${led.left}%`, top: `${led.top}%`, width: `${led.width}%`, height: `${led.height}%`,
                backgroundColor: color,
                boxShadow: lit && led.glow !== false ? `0 0 6px 2px ${color}` : 'none',
              }}
            />
          );
        })}

        {/* Collapse -- in addition to the top-bar close button, which always works regardless of this layout */}
        {box('collapse') && <button type="button" onClick={closeWidget} title="Collapse" className={HIT} style={buttonBox('collapse')} />}
      </div>

      {/* Radio utility buttons */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-950 border-t border-neutral-800">
        {!whoOnPhoto && <Button type="button" size="sm" variant="outline" onClick={() => setShowWhoOn(true)} className="h-7 flex-1 text-[10px] gap-1.5 bg-neutral-900 border-neutral-700 text-neutral-200">
          <Users className="w-3 h-3" /> Who's On {participants.length > 0 ? `(${participants.length})` : ''}
        </Button>}
        {!callOnPhoto && <Button type="button" size="sm" variant="outline" onClick={() => setShowCallList(true)} disabled={callState !== 'idle' && !!call} className="h-7 flex-1 text-[10px] gap-1.5 bg-neutral-900 border-neutral-700 text-neutral-200">
          <Phone className="w-3 h-3" /> Call
        </Button>}
      </div>

      {/* Mic + speaker mute (when not placed on the photo above) + volume, which never has a photo spot */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-neutral-900 border-t border-neutral-800">
        {!micOnPhoto && (
          <button type="button" onClick={() => { updateSettings({ mic_muted: !settings?.mic_muted }); }} title={micEnabled ? 'Mute microphone' : 'Unmute microphone'} className="grid place-items-center w-7 h-7 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-neutral-100 hover:bg-neutral-700 active:bg-neutral-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 transition-all shrink-0">
            {micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5 text-destructive" />}
          </button>
        )}
        {!speakerOnPhoto && (
          <button type="button" onClick={() => { updateSettings({ speaker_muted: !settings?.speaker_muted }); }} title={speakerEnabled ? 'Mute speaker' : 'Unmute speaker'} className="grid place-items-center w-7 h-7 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-neutral-100 shrink-0">
            {speakerEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-destructive" />}
          </button>
        )}
        {!volumeDownOnPhoto && (
          <button type="button" onClick={() => adjustVolume(-10)} title="Volume down" className="grid place-items-center w-7 h-7 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-neutral-100 shrink-0">
            <Minus className="w-3.5 h-3.5" />
          </button>
        )}
        {!scanOnPhoto && (
          <button
            type="button" onClick={toggleScan} disabled={!zoneChannels.length}
            title={scanning ? 'Stop scan' : 'Scan channels'}
            className={cn(
              'grid place-items-center w-7 h-7 rounded-md border shrink-0 disabled:opacity-40',
              scanning ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-neutral-100'
            )}
          >
            <Scan className="w-3.5 h-3.5" />
          </button>
        )}
        <Slider
          value={[speakerEnabled ? (settings?.volume ?? 80) : 0]}
          max={100}
          step={5}
          disabled={!speakerEnabled}
          onValueChange={([v]) => updateSettings({ volume: v })}
          className="flex-1"
        />
        {!volumeUpOnPhoto && (
          <button type="button" onClick={() => adjustVolume(10)} title="Volume up" className="grid place-items-center w-7 h-7 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-neutral-100 shrink-0">
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {participants.length > 0 && (
        <div className="px-3 pb-3">
          {popoutWindow && session?.canModerate ? (
            <Button type="button" size="sm" variant="outline" onClick={popInRadio} className="w-full h-7 text-xs bg-neutral-800 border-neutral-600 text-neutral-200 hover:bg-neutral-700 gap-1.5">
              <Users className="w-3 h-3" /> {participants.length} on channel — pop in to moderate
            </Button>
          ) : session?.canModerate ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" variant="outline" onClick={() => {} } className="w-full h-7 text-xs bg-neutral-800 border-neutral-600 text-neutral-200 hover:bg-neutral-700 gap-1.5">
                  <Users className="w-3 h-3" /> {participants.length} on channel — moderate
                </Button>
              </PopoverTrigger>
              <PopoverContent className="z-[95] w-64 p-1.5 space-y-1" align="start">
                {pttHolder && (
                  <Button type="button" size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => { moderate('force_release'); }}>
                    Force release floor
                  </Button>
                )}
                {participants.map((p) => (
                  <div key={p.userId} className="flex items-center justify-between gap-2 px-1.5 py-1 rounded text-sm">
                    <span className="truncate">
                      <span className="font-mono font-medium">{p.callsign}</span>
                      {p.displayName && <span className="text-muted-foreground"> · {p.displayName}</span>}
                    </span>
                    {p.userId !== session?.userId && <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" title={p.muted ? 'Unmute' : 'Mute'} onClick={() => { moderate(p.muted ? 'unmute' : 'mute', p.userId); }} className="p-1 rounded hover:bg-accent">
                        {p.muted ? <MicOff className="w-3.5 h-3.5 text-destructive" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button" title="Kick from channel" onClick={() => { moderate('kick', p.userId); }} className="p-1 rounded hover:bg-accent">
                        <UserX className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>}
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          ) : (
            <div className="text-[10px] text-neutral-500">{participants.length} on this channel</div>
          )}
        </div>
      )}

      {showWhoOn && (
        <div role="dialog" aria-label="Who's On — This Channel" className="absolute bottom-full left-1/2 z-[110] mb-2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-primary/50 bg-background/95 shadow-2xl ring-1 ring-primary/20 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3">
          <div className="rounded-xl border border-primary/30 bg-neutral-950 p-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold tracking-widest text-primary">THIS CHANNEL</div>
                <div className="font-mono text-sm font-bold tracking-wider">WHO'S ON</div>
                <div className="text-[11px] text-muted-foreground">Members tuned to {currentChannel?.name || 'your channel'}</div>
              </div>
              <button type="button" onClick={() => setShowWhoOn(false)} className="shrink-0 p-1 text-neutral-500 hover:text-neutral-200 active:scale-90 transition-transform" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          <div className="flex items-center gap-2 mb-2">
            <Label className="text-xs text-muted-foreground shrink-0">Filter</Label>
            <select value={whoOnFilter} onChange={(e) => saveListFilter('who', e.target.value)} className="h-8 flex-1 px-2 rounded-md border border-input bg-background text-xs">
              <option value="all">All on my channel</option>
              <option value="listening">Listening</option>
              <option value="transmitting">Transmitting</option>
              <option value="in_call">In Call</option>
              <option value="available">Available</option>
            </select>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {filteredWhoOn.length === 0 ? <div className="text-sm text-muted-foreground py-4 text-center">No members match this filter.</div> : filteredWhoOn.map((p) => (
              <div key={p.userId} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div><div className="font-mono font-semibold text-sm">{p.callsign || 'No callsign'}</div><div className="text-xs text-muted-foreground">{p.displayName}</div></div>
                <div className="text-xs">{activeCallUserIds.has(p.userId) ? <span className="text-red-500">In Call</span> : pttHolder?.userId === p.userId ? <span className="text-red-500">Transmitting</span> : <span className="text-emerald-500">Listening</span>}</div>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {showCallList && (
        <div role="dialog" aria-label="Call a Member" className="absolute bottom-full left-1/2 z-[110] mb-2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-primary/50 bg-background/95 shadow-2xl ring-1 ring-primary/20 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3">
          <div className="rounded-xl border border-primary/30 bg-neutral-950 p-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Phone className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold tracking-widest text-primary">DIRECT CALL</div>
                <div className="font-mono text-sm font-bold tracking-wider">CALL A MEMBER</div>
                <div className="text-[11px] text-muted-foreground">Select a Repeater Nation member to call</div>
              </div>
              <button type="button" onClick={() => setShowCallList(false)} className="shrink-0 p-1 text-neutral-500 hover:text-neutral-200" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          {callError && <div className="text-xs text-destructive mb-2">{callError}</div>}
          <div className="flex items-center gap-2 mb-2">
            <Label className="text-xs text-muted-foreground shrink-0">Filter</Label>
            <select value={callFilter} onChange={(e) => saveListFilter('call', e.target.value)} className="h-8 flex-1 px-2 rounded-md border border-input bg-background text-xs">
              <option value="all">All Online</option>
              <option value="my_channel">My Channel</option>
              <option value="available">Available</option>
              <option value="in_call">In Call</option>
              <option value="other_channels">Other Channels</option>
            </select>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {filteredCallUsers.length === 0 ? <div className="text-sm text-muted-foreground py-4 text-center">No members match this filter.</div> : filteredCallUsers.map((p) => (
              <div key={p.userId} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="min-w-0"><div className="font-mono font-semibold text-sm truncate">{p.callsign || 'No callsign'}</div><div className="text-xs text-muted-foreground truncate">{p.displayName} · {channels.find((c) => c.id === p.channelId)?.name || 'Another channel'}{activeCallUserIds.has(p.userId) ? ' · In Call' : ''}</div></div>
                <Button type="button" size="sm" className="h-7 gap-1" disabled={(callState !== 'idle' && !!call) || activeCallUserIds.has(p.userId)} onClick={async()=>{try{setCallError('');await startCall(p);setShowCallList(false);}catch(e){setCallError(e?.message||'Could not start call');}}}>{activeCallUserIds.has(p.userId) ? <><PhoneOff className="w-3 h-3"/> In Call</> : <><PhoneCall className="w-3 h-3"/> Call</>}</Button>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {incomingCallCard && (
        <div className="absolute bottom-full left-1/2 z-[130] mb-2 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-xl border border-primary/50 bg-background/95 shadow-2xl ring-1 ring-primary/20 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3">
          {incomingCallCard}
        </div>
      )}

      {callState !== 'idle' && call && (
        <div role="dialog" aria-label={callState === 'calling' ? 'Calling member' : 'Direct call'} className="absolute bottom-full left-1/2 z-[115] mb-2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-primary/50 bg-background/95 shadow-2xl ring-1 ring-primary/20 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3">
          <div className="rounded-xl border border-primary/30 bg-neutral-950 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground animate-pulse">
                {callState === 'calling' ? <PhoneCall className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold tracking-widest text-primary">{callState === 'calling' ? 'CALLING' : 'DIRECT CALL'}</div>
                <div className="font-mono text-sm font-bold truncate">{directTargetCallsign || 'UNKNOWN'}</div>
                <div className="text-[11px] text-muted-foreground">{callState === 'calling' ? 'Waiting for answer…' : 'Connected — speak normally'}</div>
              </div>
              <button type="button" onClick={endCall} className="shrink-0 p-1 text-neutral-500 hover:text-neutral-200" title="End Call">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="destructive" size="sm" onClick={endCall} className="h-8 gap-1.5">
                <PhoneOff className="w-3.5 h-3.5" /> End Call
              </Button>
            </div>
          </div>
        </div>
      )}

      <RadioSettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onChange={updateSettings}
        layouts={radioLayouts}
        onLayoutChange={selectRadioLayout}
        rogerBeeps={rogerBeeps}
        defaultRogerBeepStyle={effectiveRogerBeepStyle}
        radioEqPresets={availableRadioPresets}
        selectedRadioEq={effectiveRadioDsp?.preset || effectiveRadioDsp?.name || radioDsp?.default_preset || radioDsp?.preset || 'Police Radio'}
        onRadioEqChange={(presetName) => {
          const preset = availableRadioPresets.find((p) => p.name === presetName || p.preset === presetName);
          if (!preset || !user?.id) return;
          const selected = { ...DEFAULT_RADIO_DSP, ...preset, preset: preset.name || preset.preset || presetName };
          setPersonalRadioDsp(selected);
          try { localStorage.setItem('rn.radio.eqPreset.' + user.id, selected.preset); } catch { /* noop */ }
        }}
        onPreviewRogerBeep={previewRogerBeep}
        speechVoices={speechVoices}
        onTestChannelVoice={() => announceChannel(currentZone, currentChannel)}
      />
    </div>
  );

  return popoutWindow ? createPortal(panel, popoutWindow.document.body) : panel;
}

// Chromium-only (Firefox/Safari have no setSinkId) -- feature-detected
// once so the speaker/headphone picker can hide itself where it wouldn't
// do anything, rather than offering a control that silently no-ops.
const SINK_ID_SUPPORTED = typeof window !== 'undefined' && typeof window.HTMLMediaElement !== 'undefined' && 'setSinkId' in window.HTMLMediaElement.prototype;

// Device labels are blank until the browser has granted mic permission at
// least once in this origin -- enumerateDevices() still lists the devices
// (so the dropdown isn't empty), just without names, until then.
function useAudioDevices(active) {
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [requesting, setRequesting] = useState(false);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setInputs(all.filter((d) => d.kind === 'audioinput'));
      setOutputs(all.filter((d) => d.kind === 'audiooutput'));
    } catch { /* leave whatever was already loaded */ }
  }, []);

  useEffect(() => { if (active) refresh(); }, [active, refresh]);

  const needsPermission = inputs.length > 0 && inputs.every((d) => !d.label);

  const requestPermission = async () => {
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      await refresh();
    } catch { /* denied -- device ids still work, just unnamed */ }
    setRequesting(false);
  };

  return { inputs, outputs, needsPermission, requesting, requestPermission };
}

function RadioSettingsDialog({ open, onClose, settings, onChange, layouts = [], onLayoutChange, rogerBeeps = [], defaultRogerBeepStyle = ROGER_BEEP_DEFAULT, radioEqPresets = [], selectedRadioEq = '', onRadioEqChange, onPreviewRogerBeep, speechVoices = [], onTestChannelVoice }) {
  const [pttKey, setPttKey] = useState(settings?.ptt_key || DEFAULT_PTT_KEY);
  const [listening, setListening] = useState(false);
  const { inputs: micDevices, outputs: speakerDevices, needsPermission: micNeedsPermission, requesting: micRequesting, requestPermission: grantMicPermission } = useAudioDevices(open);

  useEffect(() => { setPttKey(settings?.ptt_key || DEFAULT_PTT_KEY); }, [settings, open]);

  // Captures literally the next keyboard key, mouse button, or gamepad
  // button pressed -- not just the ones in PTT_KEY_OPTIONS below, which is
  // only a shortlist of common choices. Whichever input fires first wins;
  // the other listeners are torn down immediately after. Gamepad buttons
  // have no press event, so they're polled every animation frame instead,
  // only while actively listening for a new binding (not during normal
  // radio use -- see useKeyboardPTT.js for that runtime cost tradeoff).
  useEffect(() => {
    if (!listening) return undefined;
    let stopped = false;
    let rafId = null;

    const finish = (binding) => {
      if (stopped) return;
      stopped = true;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      if (rafId) cancelAnimationFrame(rafId);
      setPttKey(binding);
      setListening(false);
    };

    const onKeyDown = (e) => {
      e.preventDefault();
      if (e.code === 'Escape') { stopped = true; window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('mousedown', onMouseDown, true); if (rafId) cancelAnimationFrame(rafId); setListening(false); return; }
      finish(`key:${e.code}`);
    };
    // Ignore clicks on interactive controls (Cancel/Save/the Set… button
    // itself, any select/input) -- otherwise closing this dialog while
    // listening would also bind to "left click."
    const onMouseDown = (e) => {
      if (e.target?.closest?.('button, a, [role="button"], select, input, textarea')) return;
      e.preventDefault();
      finish(`mouse:${e.button}`);
    };
    const pollGamepad = () => {
      if (stopped) return;
      const pads = navigator.getGamepads?.() || [];
      for (const pad of pads) {
        if (!pad) continue;
        for (let i = 0; i < pad.buttons.length; i++) {
          if (pad.buttons[i]?.pressed) { finish(`gamepad:${i}`); return; }
        }
      }
      rafId = requestAnimationFrame(pollGamepad);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
    if (navigator.getGamepads) rafId = requestAnimationFrame(pollGamepad);

    return () => {
      stopped = true;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [listening]);

  const save = () => { onChange({ ptt_key: pttKey }); onClose(); };
  const reset = () => { setPttKey(DEFAULT_PTT_KEY); };
  const startListening = () => { setListening(true); };
  const pttKeyLabels = useMemo(() => Object.fromEntries(PTT_KEY_OPTIONS.map((k) => [k.value, k.label])), []);
  const isPresetBinding = PTT_KEY_OPTIONS.some((k) => k.value === pttKey);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(94vw,720px)] max-w-2xl max-h-[88vh] overflow-hidden">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Radio className="w-5 h-5" /> Radio Settings</DialogTitle></DialogHeader>
        <div className="space-y-4 overflow-y-auto pr-2 max-h-[calc(88vh-7rem)]">
          {layouts.length > 0 && (
            <div className="space-y-1.5">
              <Label>Radio face / layout</Label>
              <select
                value={settings?.radio_layout_id || ''}
                onChange={(e) => onLayoutChange?.(e.target.value)}
                className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm"
              >
                {layouts.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.layout_name || 'Radio layout'}{layout.is_default ? ' · Default' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Choose the radio face you want to use. This selection is saved to your account.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><KeySquare className="w-3.5 h-3.5" /> Push-to-talk key</Label>
            <div className="flex items-center gap-2">
              <select value={pttKey} onChange={(e) => setPttKey(e.target.value)} className="h-9 flex-1 px-3 rounded-md border border-input bg-background text-sm">
                {PTT_KEY_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                {/* Whatever's currently bound always shows up as a real option, even if it's a custom key/mouse/gamepad binding captured via "Set…" rather than one of the shortlist above. */}
                {!isPresetBinding && <option value={pttKey}>{pttBindingLabel(pttKey, pttKeyLabels)}</option>}
              </select>
              <Button type="button" variant="outline" size="sm" onClick={startListening}>
                {listening ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set…'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Current: {pttBindingLabel(pttKey, pttKeyLabels)}. Click "Set…" then press any key, mouse button, or gamepad button — Esc cancels.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
            <div>
              <div className="text-sm font-medium">Echo cancellation</div>
            </div>
            <Switch checked={settings?.echo_cancellation !== false} onCheckedChange={(v) => onChange({ echo_cancellation: v })} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
            <div>
              <div className="text-sm font-medium">Noise suppression</div>
            </div>
            <Switch checked={settings?.noise_suppression !== false} onCheckedChange={(v) => onChange({ noise_suppression: v })} />
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-sm font-semibold">Channel announcements</div>
                <div className="text-xs text-muted-foreground mt-1">Speak the selected zone and channel when you manually change channels.</div>
              </div>
              <Switch checked={settings?.channel_voice_enabled !== false} onCheckedChange={(v) => onChange({ channel_voice_enabled: v })} />
            </div>
            <div className="grid gap-2">
              <Label>Announcement voice</Label>
              <div className="flex gap-2">
                <select value={settings?.channel_voice_name || ''} onChange={(e) => onChange({ channel_voice_name: e.target.value })} className="h-10 min-w-0 flex-1 px-3 rounded-md border border-input bg-background text-sm">
                  <option value="">Site / system default</option>
                  {speechVoices.map((voice) => <option key={voice.name} value={voice.name}>{voice.name} · {voice.lang || 'default'}</option>)}
                </select>
                <Button type="button" variant="outline" size="sm" className="h-10 px-4" onClick={onTestChannelVoice} disabled={settings?.channel_voice_enabled === false || speechVoices.length === 0}>Test</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Leave this on Site / system default to use the administrator's default voice when available.</p>
              {speechVoices.length === 0 && <p className="text-xs text-muted-foreground">No browser voices are available yet. Reload after adding a Windows speech voice.</p>}
            </div>
          </div>
          <div className="space-y-1.5 rounded-md border border-input px-3 py-2">
            <Label>Radio EQ</Label>
            <select
              value={selectedRadioEq}
              onChange={(e) => onRadioEqChange?.(e.target.value)}
              className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm"
            >
              {radioEqPresets.map((preset) => (
                <option key={preset.name || preset.preset} value={preset.name || preset.preset}>
                  {preset.name || preset.preset || 'Radio EQ'}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Choose your personal radio EQ. This changes how your radio sounds without changing the site-wide default.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Mic className="w-3.5 h-3.5" /> Microphone</Label>
            <select
              value={settings?.mic_device_id || ''}
              onChange={(e) => onChange({ mic_device_id: e.target.value })}
              className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">System default</option>
              {micDevices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
              ))}
            </select>
            {micNeedsPermission && (
              <Button type="button" variant="outline" size="sm" onClick={grantMicPermission} disabled={micRequesting} className="gap-1.5">
                {micRequesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                Grant microphone access to see device names
              </Button>
            )}
          </div>
          {SINK_ID_SUPPORTED ? (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Headphones className="w-3.5 h-3.5" /> Speaker / Headphones</Label>
              <select
                value={settings?.speaker_device_id || ''}
                onChange={(e) => onChange({ speaker_device_id: e.target.value })}
                className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="">System default</option>
                {speakerDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Speaker ${i + 1}`}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              This browser doesn't support choosing a speaker/headphone device here — use your system's own audio output settings instead.
            </p>
          )}
          <div className="space-y-1.5 rounded-md border border-input px-3 py-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Roger beep</div>
                <div className="text-xs text-muted-foreground">Plays a short confirmation tone locally when someone releases PTT.</div>
              </div>
              <Switch checked={settings?.roger_beep_enabled !== false} onCheckedChange={(v) => onChange({ roger_beep_enabled: v })} />
            </div>
            {settings?.roger_beep_enabled !== false && (
              <div className="flex items-center gap-2 pt-1">
                <select
                  value={settings?.roger_beep_style || defaultRogerBeepStyle}
                  onChange={(e) => onChange({ roger_beep_style: e.target.value })}
                  className="h-9 flex-1 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <optgroup label="Built-in">
                    {ROGER_BEEP_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </optgroup>
                  {rogerBeeps.length > 0 && (
                    <optgroup label="Custom">
                      {rogerBeeps.map((b) => <option key={b.id} value={`custom:${b.id}`}>{b.label || 'Custom beep'}</option>)}
                    </optgroup>
                  )}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const style = settings?.roger_beep_style || defaultRogerBeepStyle;
                    const customUrl = style.startsWith('custom:') ? rogerBeeps.find((b) => `custom:${b.id}` === style)?.audio_url : null;
                    onPreviewRogerBeep?.(style, customUrl);
                  }}
                >
                  Test
                </Button>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={reset}>Reset to default</Button>
          <Button type="button" size="sm" onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}