import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { adminApi } from '@/lib/adminClient';
import { errMsg } from '@/lib/utils';

const KINDS = [
  ['club', 'Club events'],
  ['net_control', 'Scheduled nets'],
  ['pota_activation', 'POTA activations'],
  ['sota_activation', 'SOTA activations'],
  ['other', 'Other events'],
];
const ALL = KINDS.map(([k]) => k);

async function sync(payload) {
  const res = await base44.functions.invoke('discord-events-sync', payload);
  if (res?.data?.error) throw new Error(res.data.error);
  return res?.data || {};
}

function Step({ ok, children }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      {ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-success shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Site events -> the Discord server's Events tab (via a bot), plus which
// kinds of events go to Discord at all. The switches save as soon as they
// change, and the events they cover are synced right away.
export default function DiscordEventsCard({ settings, setSettings }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => sync({ action: 'status' }).then((s) => { setStatus(s); return s; }).catch((e) => { setStatus({ error: errMsg(e) || e.message }); return null; });

  // An empty list means every kind (that's how Base44 returns an unset list).
  const picked = (Array.isArray(settings.discord_event_kinds) ? settings.discord_event_kinds : []).filter((k) => ALL.includes(k));
  const kinds = picked.length ? picked : ALL;
  const enabled = settings.discord_events_enabled !== false;
  const ready = !!(status?.configured && status?.bot && status?.guild);

  const syncNow = async ({ quiet = false } = {}) => {
    setBusy(true);
    try {
      const r = await sync({ action: 'reconcile' });
      if (!quiet || r.created || r.removed) toast({ title: 'Discord events synced', description: r.summary || r.skipped });
      await load();
    } catch (e) { toast({ title: errMsg(e) || e.message, variant: 'destructive' }); }
    setBusy(false);
  };

  // Once the bot is connected, the first sync runs by itself.
  useEffect(() => {
    load().then((s) => { if (s?.configured && s?.bot && s?.guild && !s.last_sync) syncNow({ quiet: true }); });
  }, []);

  // Switches save immediately, then Discord catches up right away.
  const saveNow = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await adminApi('settings:update', patch);
      toast({ title: 'Saved' });
      if (ready && next.discord_events_enabled !== false) syncNow({ quiet: true });
    } catch (e) { toast({ title: errMsg(e) || 'Could not save', variant: 'destructive' }); }
  };
  const toggleKind = (k, on) => {
    const list = on ? [...new Set([...kinds, k])] : kinds.filter((x) => x !== k);
    // Switching off the last kind turns Discord events off altogether.
    if (!list.length) saveNow({ discord_events_enabled: false });
    else saveNow({ discord_event_kinds: list });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0"><CalendarDays className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h2 className="font-semibold">Discord Events (calendar)</h2>
          <p className="text-sm text-muted-foreground">New site events show up in your Discord server's <b>Events</b> tab, where members can click <b>Interested</b> and Discord reminds them when it starts. Edits on the site update Discord, and deleted events are removed within the hour. To also post each new event in a channel, add a webhook under <b>New events</b> in Discord Webhooks below.</p>
        </div>
      </div>

      {status === null ? <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking the Discord bot…</div> : (
        <div className="rounded-lg border border-border p-3 space-y-2.5">
          <Step ok={!!status.configured}>
            {status.configured ? 'Bot token is set.' : (
              <span className="space-y-1 block">
                <span className="block font-medium">Create the bot (once, about 5 minutes)</span>
                <span className="block text-muted-foreground">1. Open <a className="underline inline-flex items-center gap-0.5" href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer">discord.com/developers/applications <ExternalLink className="w-3 h-3" /></a> → <b>New Application</b> → name it "Repeater Nation".</span>
                <span className="block text-muted-foreground">2. Open <b>Bot</b> → <b>Reset Token</b> → copy the token.</span>
                <span className="block text-muted-foreground">3. In Base44, add a secret named <code className="px-1 rounded bg-muted">DISCORD_BOT_TOKEN</code> with that token (don't share it anywhere else), then reload this page.</span>
              </span>
            )}
          </Step>
          {status.configured && (
            <Step ok={!!status.bot}>{status.bot ? <>Signed in as <b>{status.bot.name}</b>. <span className="text-muted-foreground">It shows offline in Discord unless the small always-on program from <a className="underline" href="https://github.com/WSIQ838/repeater-nation-discord-bot" target="_blank" rel="noopener noreferrer">repeater-nation-discord-bot</a> is running on a PC or server; events work either way.</span></> : `The token didn't work: ${status.error || 'unknown error'}. Reset it in the Developer Portal and update the secret.`}</Step>
          )}
          {status.bot && (
            <Step ok={!!status.guild}>
              {status.guild ? <>In your server <b>{status.guild.name}</b>{typeof status.upcoming_in_discord === 'number' ? ` · ${status.upcoming_in_discord} upcoming event(s) in Discord` : ''}.</> : (
                <span className="flex flex-col items-start gap-2">
                  <span>Add the bot to your server. It only asks for <b>Create Events</b>.</span>
                  <Button asChild size="sm"><a href={status.invite_url} target="_blank" rel="noopener noreferrer">Add bot to Discord <ExternalLink className="w-3.5 h-3.5 ml-1.5" /></a></Button>
                  <span className="text-xs text-muted-foreground">Then reload this page.</span>
                </span>
              )}
            </Step>
          )}
          {ready && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button size="sm" variant="outline" onClick={() => syncNow()} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />} Sync now</Button>
              <span className="text-xs text-muted-foreground">{busy ? 'Syncing…' : status.last_sync ? `Automatic: new and edited events go over right away, and everything is checked every hour. Last check ${new Date(status.last_sync).toLocaleString()}: ${status.last_result}.` : 'Automatic: new and edited events go over right away, and everything is checked every hour.'}</span>
            </div>
          )}
        </div>
      )}

      <label className="flex items-start gap-3 text-sm"><Switch checked={enabled} onCheckedChange={(v) => saveNow(v ? { discord_events_enabled: true, discord_event_kinds: kinds } : { discord_events_enabled: false })} className="mt-0.5" aria-label="Put site events on Discord" /><span><span className="font-medium">Put site events on Discord</span><span className="block text-xs text-muted-foreground">Upcoming events only (up to 90 days ahead). Each member can add up to 10 a day, so nobody can flood your server.</span></span></label>
      {enabled && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 pl-1">
          {KINDS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><Switch checked={kinds.includes(k)} onCheckedChange={(v) => toggleKind(k, v)} aria-label={label} /> {label}</label>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">These switches save right away.</p>
    </div>
  );
}
