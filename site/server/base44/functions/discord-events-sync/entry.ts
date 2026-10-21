// Puts site events on Discord: a copy in the server's Events tab (needs the
// DISCORD_BOT_TOKEN secret; see shared/discordEvents.ts) and a message in the
// events channel (Admin -> Settings -> Discord webhooks -> New events).
//   { entity_id, op: 'create' | 'update' }  Event workflows
//   { action: 'reconcile' }                hourly workflow: catch-up, edits,
//                                          and removing deleted events
//   admin: { action: 'status' } and { action: 'reconcile' } ("Sync now")
// Signed-in non-admins are refused. Session-less calls can only re-sync an
// existing event (idempotent) or run the sweep at most every 30 minutes.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { postDiscordNotification } from '../../shared/discordWebhook.ts';
import {
  discordEventsConfigured, discordBotConfig, discordFetch, syncEventToDiscord, reconcileDiscordEvents,
  ourDiscordEvents, allowedKinds, eventKind, siteEventUrl, BOT_PERMISSIONS,
} from '../../shared/discordEvents.ts';

const SITE = 'https://repeaternation.com';
const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const KIND_WORD: Record<string, string> = { club: 'club event', net_control: 'net', pota_activation: 'POTA activation', sota_activation: 'SOTA activation', other: 'event' };
const PER_CREATOR_PER_DAY = 10;
const bad = (error: string, status = 400) => Response.json({ error }, { status });

// One message per new upcoming event in the events channel. When the event is
// also in Discord's Events tab, its link is included so Discord shows the
// event card with its Interested button.
async function postNewEvent(base44: any, db: any, ev: any, settings: any, discord: any) {
  if (ev.discord_notified_at) return 'already';
  if (!String(settings.webhook_events || '').trim()) return 'no_webhook';
  if (settings.discord_events_enabled === false || !allowedKinds(settings).includes(eventKind(ev))) return 'off';
  const start = Date.parse(ev.date);
  if (!(start > Date.now())) return 'past';
  if (discord?.reason === 'creator_limit') return 'creator_limit';
  if (ev.created_by_id) {
    const since = new Date(Date.now() - 86400_000).toISOString();
    const mine = await db.entities.Event.filter({ created_by_id: ev.created_by_id }, '-created_date', 50).catch(() => []);
    if ((mine || []).filter((e: any) => e.id !== ev.id && String(e.discord_notified_at || '') >= since).length >= PER_CREATOR_PER_DAY) return 'creator_limit';
  }
  const unix = Math.floor(start / 1000);
  const kind = eventKind(ev);
  const when = `<t:${unix}:F> (<t:${unix}:R>)`;
  const location = String(ev.location || '').trim() || 'On the air';
  const link = siteEventUrl(SITE, ev.id);
  const r = await postDiscordNotification(base44, 'event', 'new_event', {
    title: String(ev.title || 'New event').slice(0, 200),
    kind: KIND_WORD[kind],
    when,
    location: location.slice(0, 200),
    organizer: String(ev.organizer || '').slice(0, 100) || '—',
  }, {
    url: link,
    fields: [
      { name: 'When', value: when, inline: true },
      { name: 'Where', value: location.slice(0, 1024), inline: true },
      ...(ev.organizer ? [{ name: 'Organizer', value: String(ev.organizer).slice(0, 1024), inline: true }] : []),
      ...(ev.description ? [{ name: 'Details', value: String(ev.description).slice(0, 1024) }] : []),
    ],
    ...(/^https:\/\//i.test(ev.image_url || '') ? { image: ev.image_url } : {}),
    ...(discord?.url ? { content: discord.url } : {}),
  });
  if (!r?.sent) return r?.reason || 'not_sent';
  await db.entities.Event.update(ev.id, { discord_notified_at: new Date().toISOString() }).catch(() => {});
  return 'sent';
}

function summarize(r: any) {
  const parts = [`${r.created} added`, `${r.updated} updated`, `${r.removed} removed`];
  if (r.errors.length) parts.push(`${r.errors.length} failed: ${r.errors.slice(0, 2).join('; ')}`);
  return parts.join(', ').slice(0, 1000);
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const isAdmin = !!user && (ADMIN_ROLES.has(user.role) || ADMIN_ROLES.has(user._app_role));
    if (user && !isAdmin) return bad('Administrator authorization required', 403);
    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const settings = (await db.entities.AdminSetting.list('-updated_date', 1).catch(() => []))?.[0] || {};
    const action = String(body.action || (body.entity_id ? 'event' : ''));

    if (action === 'status') {
      if (!isAdmin) return bad('Administrator authorization required', 403);
      const { guildId } = discordBotConfig();
      const out: any = {
        configured: discordEventsConfigured(), guild_id: guildId, enabled: settings.discord_events_enabled !== false,
        kinds: allowedKinds(settings), webhook_set: !!String(settings.webhook_events || '').trim(),
        last_sync: settings.discord_events_last_sync || null, last_result: settings.discord_events_last_result || '',
      };
      if (out.configured) {
        try {
          const me = await discordFetch('/users/@me');
          out.bot = { id: me.id, name: me.username };
          out.invite_url = `https://discord.com/oauth2/authorize?client_id=${me.id}&scope=bot&permissions=${BOT_PERMISSIONS}&guild_id=${guildId}&disable_guild_select=true`;
        } catch (e: any) { out.error = e.message; }
        if (out.bot) {
          try {
            const g = await discordFetch(`/guilds/${guildId}`);
            out.guild = { name: g.name };
            const ours = await ourDiscordEvents();
            out.upcoming_in_discord = [...ours.values()].filter((e: any) => e.status === 1 || e.status === 2).length;
          } catch (e: any) { out.guild_error = e.status === 403 || e.status === 404 ? 'not_in_server' : e.message; }
        }
      }
      return Response.json(out);
    }

    if (action === 'event') {
      const id = String(body.entity_id || '').slice(0, 64);
      const ev = id ? (await db.entities.Event.filter({ id }).catch(() => []))?.[0] : null;
      if (!ev) return Response.json({ skipped: 'not_found' });
      const op = body.op === 'create' ? 'create' : 'update';
      // Right after creation the create workflow handles it; an edit landing
      // in the same moment mustn't make a second Discord copy.
      if (op === 'update' && !ev.discord_event_id && Date.now() - Date.parse(ev.created_date || 0) < 120_000) return Response.json({ skipped: 'just_created' });
      let discord: any = null;
      if (discordEventsConfigured()) {
        try { discord = await syncEventToDiscord(db, ev, { appUrl: SITE, settings }); }
        catch (e: any) { console.error('discord-events-sync', e?.message || e); discord = { action: 'error', error: e?.message || String(e) }; }
      }
      const channel = op === 'create' ? await postNewEvent(base44, db, ev, settings, discord) : 'not_new';
      return Response.json({ ok: true, discord, channel });
    }

    if (action === 'reconcile') {
      if (!discordEventsConfigured()) return Response.json({ skipped: 'not_configured' });
      if (!isAdmin && settings.discord_events_last_sync && Date.now() - Date.parse(settings.discord_events_last_sync) < 30 * 60_000) return Response.json({ skipped: 'recent' });
      const r = await reconcileDiscordEvents(db, { appUrl: SITE, settings });
      const summary = summarize(r);
      if (settings.id) await db.entities.AdminSetting.update(settings.id, { discord_events_last_sync: new Date().toISOString(), discord_events_last_result: summary }).catch(() => {});
      return Response.json({ ok: true, summary, ...r });
    }

    return bad('Unknown action');
  } catch (err: any) {
    console.error('discord-events-sync error', err?.message || err);
    return Response.json({ error: err?.message || 'unexpected error' }, { status: 500 });
  }
}
