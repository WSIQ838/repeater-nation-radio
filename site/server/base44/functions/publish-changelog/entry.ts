// Posts new (unsent) changelog entries to Discord when the app is published.
// Invoked by the "Publish Changelog to Discord" workflow on the app_publish trigger.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { validateWebhookUrl, getDiscordSettings } from '../../shared/discordWebhook.ts';
import { renderDiscordTemplate, resolveDiscordUsername } from '../../shared/discordTemplates.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    // Invoked from the admin UI (signed in) and from the publish workflow
    // (no session). A signed-in caller must be an admin. A session-less call
    // can't be told apart from an anonymous one, so it may only post entries
    // that are actually pending -- never an empty "published" notice -- and
    // marking them sent makes repeats no-ops. Caller-supplied text is limited
    // to a valid date and a short visibility word so it can't inject content
    // into the Discord post.
    const caller = await base44.auth.me().catch(() => null);
    if (caller && !['admin', 'super_admin'].includes(caller.role)) {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const rawDate = Date.parse(String(body.published_at || ''));
    const publishedAt = (Number.isFinite(rawDate) ? new Date(rawDate) : new Date()).toISOString();
    const visibility = /^[a-z_ -]{1,20}$/i.test(String(body.visibility || '')) ? String(body.visibility) : '';
    const isFirstPublish = !!body.is_first_publish;

    // Changelog posts ONLY when its dedicated AdminSetting webhook exists.
    // There is intentionally no shared/default Discord fallback.
    const settings = await getDiscordSettings(base44);
    const webhookUrl = String(settings.changelog_webhook_url || '').trim();
    if (!webhookUrl) {
      return Response.json({ ok: true, sent: 0, skipped: true, reason: 'no_webhook' });
    }

    // Fetch unsent changelog entries (service role bypasses RLS for workflow runs)
    const entries = await base44.asServiceRole.entities.ChangeLog
      .filter({ sent: false }, '-created_date', 50)
      .catch(() => []);

    const list = Array.isArray(entries) ? entries : [];
    if (!caller && !list.length) {
      return Response.json({ ok: true, sent: 0, skipped: true, reason: 'nothing_pending' });
    }
    const lines = list.map((e, i) => {
      const label = e.version ? `**${e.version}**` : `**Entry ${i + 1}**`;
      return `${label}\n${(e.notes || '').slice(0, 1000)}`;
    });

    const entriesText = lines.length
      ? lines.join('\n\n')
      : 'No new changelog notes were recorded for this publish.';

    const rendered = renderDiscordTemplate(settings, 'changelog_publish', {
      visibility: visibility || '—',
      published_at: publishedAt,
      entries_count: String(lines.length),
      entries: entriesText.slice(0, 4000),
      launch_suffix: isFirstPublish ? ' (First Launch)' : '',
    });

    const payload = {
      username: resolveDiscordUsername(settings, 'changelog'),
      embeds: [
        {
          title: rendered.title,
          description: rendered.description,
          color: rendered.color,
          fields: [
            { name: 'Visibility', value: visibility || '—', inline: true },
            { name: 'Published At', value: publishedAt, inline: true },
            { name: 'Entries Sent', value: String(lines.length), inline: true },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Repeater Nation · Change Log' },
        },
      ],
    };

    if (!validateWebhookUrl(webhookUrl)) {
      console.error('Changelog webhook URL rejected: invalid or unsafe URL');
      return Response.json({ error: 'Discord webhook not configured properly.' }, { status: 500 });
    }

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!discordRes.ok) {
      const text = await discordRes.text().catch(() => '');
      console.error('Discord webhook failed', discordRes.status, text);
      return Response.json({ error: 'Failed to post to Discord.' }, { status: 502 });
    }

    // Mark the posted entries as sent
    if (lines.length) {
      await base44.asServiceRole.entities.ChangeLog
        .updateMany({ sent: false }, { $set: { sent: true, sent_date: new Date().toISOString() } })
        .catch((e) => console.error('mark sent failed', e));
    }

    return Response.json({ ok: true, sent: lines.length });
  } catch (error) {
    console.error('publish-changelog error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
