import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendUserEmail } from '../../shared/notify.ts';
import { postDiscordNotification } from '../../shared/discordWebhook.ts';
import { getEmailTemplateSettings, renderEmailTemplate } from '../../shared/emailTemplates.ts';

// ===== APP-SPECIFIC =====
// Emails a repeater owner when a member submits an access request for their
// closed repeater. Respects the owner's email_access_requests preference.
// ===== END APP-SPECIFIC =====

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Only the member who submitted the request may trigger its notification;
    // otherwise anyone holding a request id could re-send emails to the owner.
    const caller = await base44.auth.me().catch(() => null);
    if (!caller) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json();
    const { request_id } = body || {};
    if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });

    const accessRequest = await base44.asServiceRole.entities.RepeaterAccessRequest.get(request_id).catch(() => null);
    if (!accessRequest) return Response.json({ skipped: true, reason: 'request_not_found' });
    if (accessRequest.created_by_id !== caller.id) {
      return Response.json({ error: 'Not your access request' }, { status: 403 });
    }

    const ownerId = accessRequest.owner_id;
    if (!ownerId) return Response.json({ skipped: true, reason: 'no_owner' });

    const requesterDisplay = `${accessRequest.requester_name || 'A member'}${accessRequest.requester_callsign ? ` (${accessRequest.requester_callsign})` : ''}`;
    const detailsLines: string[] = [];
    if (accessRequest.usage_purpose) detailsLines.push(`Usage: ${accessRequest.usage_purpose}`);
    if (accessRequest.message) detailsLines.push('', 'Their message:', `"${accessRequest.message}"`);

    const settings = await getEmailTemplateSettings(base44);
    const rendered = renderEmailTemplate(settings, 'access_request', {
      requester_display: requesterDisplay,
      repeater_name: accessRequest.repeater_name || 'your repeater',
      repeater_frequency: accessRequest.repeater_frequency || '',
      details_block: detailsLines.join('\n'),
    });

    const res = await sendUserEmail(base44, ownerId, 'access_requests', rendered.subject, rendered.body);

    await postDiscordNotification(base44, 'access_request', 'access_request_repeater', {
      requester_display: requesterDisplay,
      repeater_name: accessRequest.repeater_name || 'a repeater',
      repeater_frequency: accessRequest.repeater_frequency || '',
    }, {
      fields: [
        { name: 'Repeater', value: accessRequest.repeater_name || '—', inline: true },
        { name: 'Requester', value: requesterDisplay, inline: true },
        ...(accessRequest.usage_purpose ? [{ name: 'Usage', value: String(accessRequest.usage_purpose).slice(0, 1024), inline: false }] : []),
      ],
    });

    return Response.json(res);
  } catch (error) {
    console.error('[notify-access-request] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}