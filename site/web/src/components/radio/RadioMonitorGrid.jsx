import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import useRadioSession from '@/lib/useRadioSession';
import { DEFAULT_RADIO_DSP, ROGER_BEEP_DEFAULT } from '@/lib/radioAudioEffect';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, Radio, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Receive-only monitor grid. Public access is enforced server-side by
// issue-radio-session against the administrator-selected monitor slots.


const MONITOR_SLOT_COUNT = 12;

const STATUS_LABEL = {
  idle: 'Idle', connecting: 'Connecting…', listening: 'Listening', receiving: 'Receiving',
  busy: 'Busy', disconnected: 'Disconnected', error: 'Error',
};

export const DEFAULT_STATUS_LIGHT = {
  status_light_idle_color: '#a1a1aa',
  status_light_connecting_color: '#f59e0b',
  status_light_receiving_color: '#22c55e',
  status_light_error_color: '#ef4444',
  status_light_pulse: true,
  status_light_size: 'md',
};
const STATUS_LIGHT_PX = { sm: 6, md: 8, lg: 12 };

// idle/listening/disconnected all read as "connected, nothing happening"
// (grey); connecting/busy as "in progress" (amber, pulsing if enabled);
// receiving as "live" (the configured accent color, pulsing if enabled);
// error covers both error and a dropped connection.
function statusLightProps(status, statusLight) {
  const px = STATUS_LIGHT_PX[statusLight.status_light_size] || STATUS_LIGHT_PX.md;
  const color = status === 'receiving' ? statusLight.status_light_receiving_color
    : status === 'connecting' || status === 'busy' ? statusLight.status_light_connecting_color
    : status === 'error' || status === 'disconnected' ? statusLight.status_light_error_color
    : statusLight.status_light_idle_color;
  const pulse = statusLight.status_light_pulse && ['connecting', 'busy', 'receiving'].includes(status);
  return { style: { width: px, height: px, backgroundColor: color }, pulse };
}

function MonitorSlot({ channel, zoneName, radioDsp, statusLight }) {
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const { status, pttHolder, error, setLocalVolume } = useRadioSession(channel.id, {
    radioFilter: false,
    speakerDeviceId: '',
    monitorMode: true,
    radioDsp,
    rogerBeepEnabled: false,
    rogerBeepStyle: radioDsp?.roger_beep_default_style || ROGER_BEEP_DEFAULT,
  });

  // The floating RadioWidget announces which channel it is playing. If it's
  // this one, stay silent here so the same audio doesn't play twice.
  const [widgetChannelId, setWidgetChannelId] = useState(() => (typeof window !== 'undefined' && window.__rnRadioWidgetPlayback?.channelId) || '');
  useEffect(() => {
    const onPlayback = (e) => setWidgetChannelId(e.detail?.channelId || '');
    window.addEventListener('rn:radio-widget-playback', onPlayback);
    return () => window.removeEventListener('rn:radio-widget-playback', onPlayback);
  }, []);
  const playingInWidget = !!widgetChannelId && widgetChannelId === channel.id;

  useEffect(() => { setLocalVolume(muted || playingInWidget ? 0 : volume); }, [volume, muted, playingInWidget, setLocalVolume]);

  const light = statusLightProps(status, statusLight);

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{zoneName}</div>
          <div className="font-heading font-semibold text-sm truncate">
            {channel.number != null ? `CH ${channel.number} — ` : ''}{channel.name}
          </div>
        </div>
        <span className={cn('rounded-full shrink-0', light.pulse && 'animate-pulse')} style={light.style} title={STATUS_LABEL[status] || status} />
      </div>

      <div className="text-xs min-h-4">
        {status === 'connecting' ? (
          <span className="text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Connecting…</span>
        ) : status === 'receiving' && pttHolder ? (
          <span className="text-success font-medium truncate block">{pttHolder.callsign || pttHolder.displayName}</span>
        ) : status === 'error' ? (
          <span className="text-destructive truncate block">{error || 'Connection error'}</span>
        ) : (
          <span className="text-muted-foreground">{STATUS_LABEL[status] || status}</span>
        )}
        {playingInWidget && <span className="block text-muted-foreground">Playing in your radio — muted here</span>}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button" size="icon" variant="ghost" className="w-7 h-7 shrink-0"
          onClick={() => setMuted((v) => !v)}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </Button>
        <Slider
          value={[muted ? 0 : volume]}
          max={100}
          step={1}
          disabled={muted}
          onValueChange={([v]) => { setVolume(v); if (v > 0) setMuted(false); }}
          className="flex-1"
        />
      </div>
    </div>
  );
}

function padSlots(arr) {
  return Array.from({ length: MONITOR_SLOT_COUNT }, (_, i) => arr?.[i] || '');
}

export default function RadioMonitorGrid() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [zones, setZones] = useState([]);
  const [channels, setChannels] = useState([]);
  const [siteSlots, setSiteSlots] = useState(() => padSlots([]));
  const [radioDsp, setRadioDsp] = useState(DEFAULT_RADIO_DSP);
  const [statusLight, setStatusLight] = useState(DEFAULT_STATUS_LIGHT);

  useEffect(() => {
    (async () => {
      try {
        const [configRows, zoneRows, channelRows, dspRows] = await Promise.all([
          base44.entities.RadioMonitorConfig.list('-updated_date', 1).catch(() => []),
          base44.entities.RadioZone.list('display_order', 200).catch(() => []),
          base44.entities.RadioChannel.list('number', 500).catch(() => []),
          base44.entities.RadioDSPSettings.list('-updated_date', 1).catch(() => []),
        ]);
        if (dspRows?.[0]) setRadioDsp({ ...DEFAULT_RADIO_DSP, ...dspRows[0] });
        setZones(zoneRows || []);
        setChannels(channelRows || []);
        setSiteSlots(padSlots(configRows?.[0]?.slots));
        if (configRows?.[0]) setStatusLight({ ...DEFAULT_STATUS_LIGHT, ...configRows[0] });
      } catch (e) {
        setLoadError(e?.message || 'Could not load the monitor grid');
      }
      setLoading(false);
    })();
  }, []);

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const channelById = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);

  const resolvedSlots = useMemo(() => {
    const seenChannelIds = new Set();
    return siteSlots
      .map((channelId) => {
        const channel = channelById.get(channelId);
        if (!channel || channel.enabled === false) return null;
        const zone = zoneById.get(channel.zone_id);
        if (!zone || zone.enabled === false) return null;
        return { channel, zoneName: zone.name };
      })
      .filter((slot) => {
        if (!slot || seenChannelIds.has(slot.channel.id)) return false;
        seenChannelIds.add(slot.channel.id);
        return true;
      });
  }, [siteSlots, channelById, zoneById]);

  if (loading) {
    return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  return (
    <div className="space-y-3">
      {resolvedSlots.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {resolvedSlots.map(({ channel, zoneName }) => (
            <MonitorSlot key={channel.id} channel={channel} zoneName={zoneName} radioDsp={radioDsp} statusLight={statusLight} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-xl p-6 text-center">
          <Radio className="w-6 h-6 mx-auto mb-2 opacity-40" />
          No channels are configured for the monitor grid yet. An admin can set this up in Admin → Web Radio → Monitor Grid.
        </div>
      )}
    </div>
  );
}
