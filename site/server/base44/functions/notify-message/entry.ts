import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendUserEmail } from '../../shared/notify.ts';
import { requireVerifiedCallsign } from '../../shared/verifiedCallsign.ts';
import { postDiscordNotification } from '../../shared/discordWebhook.ts';
import { getEmailTemplateSettings, renderEmailTemplate } from '../../shared/emailTemplates.ts';

// ===== APP-SPECIFIC =====
// Emails a member when they receive a direct message. Respects the
// recipient's email_messages preference. Requires a verified active callsign.
// ===== END APP-SPECIFIC =====

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    // Require verified callsign — messaging is a protected community action.
    const { user: caller, error } = await requireVerifiedCallsign(base44);
    if (error) return error;

    const body = await req.json();
    const recipient_id = String(body?.recipient_id || '');
    if (!recipient_id) return Response.json({ error: 'recipient_id required' }, { status: 400 });
    if (recipient_id === caller.id) return Response.json({ skipped: true, reason: 'self' });

    // Only notify about a message the caller really just sent, and use the STORED text
    // (never text supplied in the request). Otherwise any verified member could use this
    // endpoint to email arbitrary content to any other member.
    const recent = await base44.asServiceRole.entities.Message
      .filter({ sender_id: caller.id, recipient_id }, '-created_date', 1)
      .catch(() => []);
    const latest = recent?.[0];
    const createdAt = latest?.created_date
      ? new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(String(latest.created_date)) ? latest.created_date : `${latest.created_date}Z`).getTime()
      : 0;
    if (!latest || !Number.isFinite(createdAt) || Date.now() - createdAt > 5 * 60 * 1000) {
      return Response.json({ error: 'No recent message to notify about' }, { status: 403 });
    }
    const message_body = String(latest.body || '').slice(0, 500);

    const sender_name = caller.full_name || caller.email || 'a member';
    const settings = await getEmailTemplateSettings(base44);
    const rendered = renderEmailTemplate(settings, 'new_message', { sender_name, message_body });

    const res = await sendUserEmail(base44, recipient_id, 'messages', rendered.subject, rendered.body);

    await postDiscordNotification(base44, 'message', 'message', {
      sender_name,
    }, {
      fields: [{ name: 'Message', value: String(message_body || '').slice(0, 1024) || '—', inline: false }],
    });

    return Response.json(res);
  } catch (error) {
    console.error('[notify-message] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}