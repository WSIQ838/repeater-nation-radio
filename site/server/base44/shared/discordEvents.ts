// Puts site events (club events, nets, POTA/SOTA activations) into the
// Discord server's Events tab as Discord scheduled events, through a bot.
//   DISCORD_BOT_TOKEN  bot token (Discord Developer Portal -> Bot). Required.
//   DISCORD_GUILD_ID   server id (defaults to the Repeater Nation server).
// The bot needs the Create Events permission. Events are "external" events:
// Discord starts and ends them on its own at the scheduled times.
//
// Each Discord event's description ends with a link to the site event; the
// link carries the site event id, which is how the hourly sync finds Discord
// copies of events that were deleted on the site.
import { secrets } from 'base44:runtime';

const API = 'https://discord.com/api/v10';
const DEFAULT_GUILD_ID = '1532997472815677570';
// Create Events (1 << 44) only: with it the bot can edit and delete just the
// events it created itself, never ones your members make in Discord.
export const BOT_PERMISSIONS = '17592186044416';

export const EVENT_KINDS = ['club', 'net_control', 'pota_activation', 'sota_activation', 'other'] as const;
const KIND_LABEL: Record<string, string> = { club: 'Club event', net_control: 'Net', pota_activation: 'POTA activation', sota_activation: 'SOTA activation', other: 'Event' };
const KIND_HOURS: Record<string, number> = { club: 2, net_control: 1, pota_activation: 2, sota_activation: 3, other: 2 };
const MAX_DAYS_AHEAD = 90;
const PER_CREATOR_PER_DAY = 10;

export function discordBotConfig() {
  return {
    token: String(secrets.get('DISCORD_BOT_TOKEN') || '').trim(),
    guildId: String(secrets.get('DISCORD_GUILD_ID') || '').trim() || DEFAULT_GUILD_ID,
  };
}
export const discordEventsConfigured = () => !!discordBotConfig().token;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function discordFetch(path: string, init: { method?: string; body?: any } = {}, retried = false): Promise<any> {
  const { token } = discordBotConfig();
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');
  const res = await fetch(`${API}${path}`, {
    method: init.method || 'GET',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'RepeaterNation (https://repeaternation.com, 1.0)' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (res.status === 429 && !retried) {
    const wait = Math.min(5, Number(data?.retry_after || 1));
    await sleep(wait * 1000);
    return discordFetch(path, init, true);
  }
  if (!res.ok) {
    const err: any = new Error(data?.message ? `Discord: ${data.message}` : `Discord API ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

export function eventKind(ev: any): string {
  if (EVENT_KINDS.includes(ev?.source_type)) return ev.source_type;
  if (ev?.club_id) return 'club';
  return 'other';
}

export const siteEventUrl = (appUrl: string, id: string) => `${appUrl.replace(/\/$/, '')}/events?event=${id}`;
export const markerId = (description: string) => String(description || '').match(/\/events\?event=([A-Za-z0-9_-]+)/)?.[1] || '';
export const discordEventUrl = (guildId: string, id: string) => `https://discord.com/events/${guildId}/${id}`;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// The Discord scheduled event for a site event.
export function scheduledEventBody(ev: any, appUrl: string) {
  const kind = eventKind(ev);
  const start = new Date(ev.date);
  const end = new Date(start.getTime() + (KIND_HOURS[kind] || 2) * 3600_000);
  const coords = Number.isFinite(Number(ev.lat)) && Number.isFinite(Number(ev.lng)) && ev.lat !== null && ev.lng !== null ? `${Number(ev.lat).toFixed(4)}, ${Number(ev.lng).toFixed(4)}` : '';
  const location = clip(String(ev.location || '').trim() || coords || 'On the air', 100);
  const link = `More on Repeater Nation: ${siteEventUrl(appUrl, ev.id)}`;
  const about = [String(ev.description || '').trim(), ev.organizer ? `Organizer: ${ev.organizer}` : '', `${KIND_LABEL[kind]}${ev.type && ev.type !== KIND_LABEL[kind] ? ` · ${ev.type}` : ''}`]
    .filter(Boolean).join('\n\n');
  return {
    name: clip(String(ev.title || '').trim() || KIND_LABEL[kind], 100),
    description: `${clip(about, 1000 - link.length - 2)}\n\n${link}`,
    privacy_level: 2, // guild only
    entity_type: 3, // external
    entity_metadata: { location },
    scheduled_start_time: start.toISOString(),
    scheduled_end_time: end.toISOString(),
  };
}

export function syncHash(body: any, ev: any) {
  const s = JSON.stringify([body.name, body.description, body.entity_metadata.location, body.scheduled_start_time, body.scheduled_end_time, ev.image_url || '']);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Cover image for the Discord event (best effort; Discord wants a data URI).
// Only images uploaded to the site (Base44 file storage) are fetched, so a
// typed-in URL can't make the server request arbitrary addresses.
const IMAGE_HOSTS = /(^|\.)base44\.(app|com)$/i;
async function coverImage(url: string): Promise<string | null> {
  let host = '';
  try { const u = new URL(url); if (u.protocol !== 'https:') return null; host = u.hostname; } catch { return null; }
  if (!IMAGE_HOSTS.test(host)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!res.ok || !/^image\/(png|jpeg|gif|webp)$/.test(type)) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  } catch { return null; }
}

// Which kinds of events go to Discord. Unset or empty means all of them
// (Base44 returns an unset list as []); "none" is the on/off switch.
export function allowedKinds(settings: any): string[] {
  const k = Array.isArray(settings?.discord_event_kinds) ? settings.discord_event_kinds.filter((x: string) => EVENT_KINDS.includes(x as any)) : [];
  return k.length ? k : [...EVENT_KINDS];
}

// Creates or updates the Discord copy of one site event. Returns what it did.
export async function syncEventToDiscord(db: any, ev: any, { appUrl, settings }: { appUrl: string; settings: any }) {
  if (!discordEventsConfigured()) return { action: 'skipped', reason: 'not_configured' };
  if (!ev?.id) return { action: 'skipped', reason: 'missing' };
  const { guildId } = discordBotConfig();
  const on = settings?.discord_events_enabled !== false && allowedKinds(settings).includes(eventKind(ev));
  const start = Date.parse(ev.date);
  const now = Date.now();
  const existing = ev.discord_event_id && ev.discord_event_id !== 'removed' ? String(ev.discord_event_id) : '';

  if (!on) {
    // Turned off for this kind of event: take down a copy that hasn't started.
    if (existing && start > now) {
      const current = await discordFetch(`/guilds/${guildId}/scheduled-events/${existing}`).catch(() => null);
      if (current && markerId(current.description) === String(ev.id)) await deleteDiscordEvent(existing);
      await db.entities.Event.update(ev.id, { discord_event_id: '', discord_synced_hash: '' });
      return { action: 'removed', reason: 'off' };
    }
    return { action: 'skipped', reason: 'off' };
  }
  if (!Number.isFinite(start)) return { action: 'skipped', reason: 'no_date' };
  if (ev.discord_event_id === 'removed') return { action: 'skipped', reason: 'removed_in_discord' };

  const body = scheduledEventBody(ev, appUrl);
  const hash = syncHash(body, ev);

  if (!existing) {
    if (start < now + 60_000) return { action: 'skipped', reason: 'past' };
    if (start > now + MAX_DAYS_AHEAD * 86400_000) return { action: 'skipped', reason: 'too_far' };
    if (ev.created_by_id) {
      const since = new Date(now - 86400_000).toISOString();
      const mine = await db.entities.Event.filter({ created_by_id: ev.created_by_id }, '-created_date', 50).catch(() => []);
      const today = (mine || []).filter((e: any) => e.id !== ev.id && e.discord_event_id && String(e.created_date || '') >= since).length;
      if (today >= PER_CREATOR_PER_DAY) return { action: 'skipped', reason: 'creator_limit' };
    }
    const image = await coverImage(ev.image_url);
    let created: any;
    try {
      created = await discordFetch(`/guilds/${guildId}/scheduled-events`, { method: 'POST', body: image ? { ...body, image } : body });
    } catch (e: any) {
      if (!image || e?.status !== 400) throw e;
      created = await discordFetch(`/guilds/${guildId}/scheduled-events`, { method: 'POST', body });
    }
    await db.entities.Event.update(ev.id, { discord_event_id: String(created.id), discord_synced_hash: hash });
    return { action: 'created', discord_event_id: String(created.id), url: discordEventUrl(guildId, String(created.id)) };
  }

  if (ev.discord_synced_hash === hash) return { action: 'unchanged', discord_event_id: existing };
  if (start < now) {
    // Already started (or over) in Discord; times can't move back now.
    await db.entities.Event.update(ev.id, { discord_synced_hash: hash });
    return { action: 'skipped', reason: 'started' };
  }
  try {
    // Members can edit their own Event rows, so check the Discord event really
    // is this site event's copy before changing it.
    const current = await discordFetch(`/guilds/${guildId}/scheduled-events/${existing}`);
    if (markerId(current?.description) !== String(ev.id)) {
      await db.entities.Event.update(ev.id, { discord_event_id: '', discord_synced_hash: '' });
      return { action: 'skipped', reason: 'not_ours' };
    }
    await discordFetch(`/guilds/${guildId}/scheduled-events/${existing}`, { method: 'PATCH', body });
  } catch (e: any) {
    if (e?.status !== 404) throw e;
    // A moderator deleted it in Discord: respect that and don't recreate it.
    await db.entities.Event.update(ev.id, { discord_event_id: 'removed', discord_synced_hash: hash });
    return { action: 'skipped', reason: 'removed_in_discord' };
  }
  await db.entities.Event.update(ev.id, { discord_synced_hash: hash });
  return { action: 'updated', discord_event_id: existing };
}

export async function deleteDiscordEvent(id: string) {
  const { guildId } = discordBotConfig();
  try { await discordFetch(`/guilds/${guildId}/scheduled-events/${id}`, { method: 'DELETE' }); }
  catch (e: any) { if (e?.status !== 404) throw e; }
}

// Discord events this bot created for site events, by site event id.
export async function ourDiscordEvents() {
  const { guildId } = discordBotConfig();
  const me = await discordFetch('/users/@me');
  const list = (await discordFetch(`/guilds/${guildId}/scheduled-events`)) || [];
  const out = new Map<string, any>();
  for (const e of list) {
    const id = markerId(e.description);
    if (id && e.creator_id === me.id) out.set(id, e);
  }
  return out;
}

// Hourly: copies upcoming events the instant sync missed, applies edits, and
// removes Discord copies of events deleted on the site.
export async function reconcileDiscordEvents(db: any, { appUrl, settings, maxWrites = 15 }: { appUrl: string; settings: any; maxWrites?: number }) {
  const result = { created: 0, updated: 0, removed: 0, skipped: 0, errors: [] as string[] };
  const ours = await ourDiscordEvents();
  let writes = 0;
  for (const [siteId, de] of ours) {
    if (de.status !== 1) continue; // only events that haven't started
    const ev = (await db.entities.Event.filter({ id: siteId }))?.[0];
    if (!ev) {
      if (writes++ >= maxWrites) break;
      await deleteDiscordEvent(String(de.id)).then(() => result.removed++).catch((e) => result.errors.push(e.message));
    }
  }
  const upcoming = await db.entities.Event.filter({ date: { $gte: new Date().toISOString() } }, 'date', 200).catch(() => []);
  for (const ev of upcoming || []) {
    if (writes >= maxWrites) break;
    try {
      const r = await syncEventToDiscord(db, ev, { appUrl, settings });
      if (r.action === 'created') { result.created++; writes++; }
      else if (r.action === 'updated' || r.action === 'removed') { result[r.action === 'updated' ? 'updated' : 'removed']++; writes++; }
      else if (r.action === 'skipped') result.skipped++;
    } catch (e: any) {
      result.errors.push(`${ev.title}: ${e?.message || e}`.slice(0, 200));
      if (e?.status === 401 || e?.status === 403) break;
    }
  }
  return result;
}
