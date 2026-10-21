import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { validateWebhookUrl, getDiscordSettings } from '../../shared/discordWebhook.ts';
import { renderDiscordTemplate, resolveDiscordUsername } from '../../shared/discordTemplates.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    const body = await req.json().catch(() => ({}));
    const title = (body.title || '').toString().trim();
    const description = (body.description || '').toString().trim();
    const category = (body.category || 'General').toString();
    const page = (body.page || '').toString().trim();
    const severity = (body.severity || 'Medium').toString();

    if (!title || !description) {
      return Response.json({ error: 'Title and description are required.' }, { status: 400 });
    }

    // Bug reports post ONLY when their dedicated AdminSetting webhook exists.
    // There is intentionally no shared/default Discord fallback.
    const settings = await getDiscordSettings(base44);
    const webhookUrl = String(settings.bug_report_webhook_url || '').trim();
    if (!webhookUrl) {
      return Response.json({ ok: true, sent: false, skipped: true, reason: 'no_webhook' });
    }

    const reporter = user ? `${user.full_name || 'Member'} (${user.email || user.id})` : 'Anonymous';
    const fields = [
      { name: 'Reporter', value: reporter, inline: false },
      { name: 'Category', value: category, inline: true },
      { name: 'Severity', value: severity, inline: true },
    ];
    if (page) fields.push({ name: 'Page / Location', value: page, inline: false });

    const rendered = renderDiscordTemplate(settings, 'bug_report', {
      bug_title: title,
      reporter,
      category,
      severity,
      page: page || '—',
      description: description.slice(0, 4000),
    });

    const payload = {
      username: resolveDiscordUsername(settings, 'bug_report'),
      embeds: [
        {
          title: rendered.title,
          description: rendered.description,
          color: rendered.color,
          fields,
          timestamp: new Date().toISOString(),
          footer: { text: 'Repeater Nation · Bug Report' },
        },
      ],
    };

    if (!validateWebhookUrl(webhookUrl)) {
      console.error('Bug report webhook URL rejected: invalid or unsafe URL');
      return Response.json({ error: 'Reporting is not configured properly.' }, { status: 500 });
    }

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!discordRes.ok) {
      const text = await discordRes.text().catch(() => '');
      console.error('Discord webhook failed', discordRes.status, text);
      return Response.json({ error: 'Failed to forward report.' }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('submitBugReport error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
