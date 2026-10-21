// Shared Discord webhook poster. Reads only the per-type webhook URL from AdminSetting.
// If a notification type has no webhook configured, nothing is posted.
// Title/description/color/username are resolved from the admin-editable
// template registry in discordTemplates.ts. Fire-and-forget: logs errors
// but never throws, so a Discord failure never breaks the originating
// notification flow.

import { renderDiscordTemplate, resolveDiscordUsername } from './discordTemplates.ts';

// Validates that a webhook URL is safe to fetch server-side.
//
// This only ever needs to reach Discord's own webhook API, so it allowlists
// Discord's hosts rather than denylisting "bad" ones.
const ALLOWED_WEBHOOK_HOSTS = new Set(['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com']);

export function validateWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_WEBHOOK_HOSTS.has(host)) return false;
    if (!parsed.pathname.startsWith('/api/webhooks/')) return false;
    return true;
  } catch {
    return false;
  }
}

// Maps a notification type to its AdminSetting webhook field.
const SETTING_FIELD: Record<string, string> = {
  access_request: 'webhook_access_requests',
  friend_request: 'webhook_friend_requests',
  message: 'webhook_messages',
  forum_reply: 'webhook_forum_replies',
  net_host_invite: 'webhook_net_host_invites',
  repeater_submission: 'webhook_repeater_submissions',
  club_join: 'webhook_club_joins',
  pota_submission: 'webhook_pota_submissions',
  badge_award: 'webhook_badge_awards',
  payment: 'webhook_payments',
  event: 'webhook_events',
};

// Short cache so a single function call that fires several notifications
// (e.g. badge awards) doesn't re-read AdminSetting every time.
let cachedSettings: any = null;
let cachedAt = 0;

export async function getDiscordSettings(base44: any) {
  const now = Date.now();
  if (cachedSettings && now - cachedAt < 30000) return cachedSettings;
  try {
    const list = await base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1);
    cachedSettings = (list && list[0]) || {};
  } catch (e) {
    console.error('[discordWebhook] AdminSetting read failed:', e?.message || e);
    cachedSettings = {};
  }
  cachedAt = now;
  return cachedSettings;
}

// Posts a notification only to the webhook explicitly configured for the
// given type. There is intentionally NO shared/default Discord fallback.
// `templateId` selects the admin-editable title/description/color template
// (see discordTemplates.ts); `vars` is a flat object of pre-formatted strings
// substituted into that template. `extra` may carry structural embed data
// that isn't admin-editable (`fields`, `timestamp`, `footer`).
export async function postDiscordNotification(
  base44: any,
  type: string,
  templateId: string,
  vars: Record<string, any> = {},
  extra: { fields?: any[]; timestamp?: string; footer?: any; url?: string; image?: string; content?: string } = {}
) {
  try {
    const field = SETTING_FIELD[type];
    if (!field) return { sent: false, reason: 'unknown_type' };

    const settings = await getDiscordSettings(base44);
    const webhookUrl = String(settings[field] || '').trim();
    if (!webhookUrl) return { sent: false, reason: 'no_webhook' };

    const rendered = renderDiscordTemplate(settings, templateId, vars);
    if (!rendered) return { sent: false, reason: 'unknown_template' };

    const payload: any = {
      username: resolveDiscordUsername(settings, type),
      embeds: [{
        title: rendered.title,
        description: rendered.description,
        color: rendered.color,
        fields: extra.fields,
        timestamp: extra.timestamp || new Date().toISOString(),
        footer: extra.footer || { text: 'Repeater Nation' },
        ...(extra.url ? { url: extra.url } : {}),
        ...(extra.image ? { image: { url: extra.image } } : {}),
      }],
      // Text from members never pings @everyone, roles or users.
      allowed_mentions: { parse: [] },
    };
    // A plain link (e.g. a Discord event link) unfurls into its own card.
    if (extra.content) payload.content = extra.content;

    if (!validateWebhookUrl(webhookUrl)) {
      console.error(`[discordWebhook] ${type} rejected: invalid or unsafe webhook URL`);
      return { sent: false, reason: 'invalid_url' };
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[discordWebhook] ${type} failed`, res.status, text);
      return { sent: false, reason: 'http_error', status: res.status };
    }
    return { sent: true };
  } catch (e) {
    console.error(`[discordWebhook] ${type} error:`, e?.message || e);
    return { sent: false, reason: 'exception' };
  }
}
