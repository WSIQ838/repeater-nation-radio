import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const activationId = String(body.activation_id || '');
    const action = String(body.action || 'updated');
    if (!activationId) return Response.json({ error: 'activation_id required' }, { status: 400 });

    const activation = await base44.asServiceRole.entities.SotaActivation.get(activationId).catch(() => null);
    if (!activation) return Response.json({ skipped: true, reason: 'activation_not_found' });

    const isOwner = activation.created_by_id === caller.id || activation.club_owner_id === caller.id;
    const isAdmin = ['admin', 'super_admin'].includes(caller.role) || ['admin', 'super_admin'].includes(caller._app_role);
    if (!isOwner && !isAdmin) return Response.json({ error: 'Not authorized' }, { status: 403 });

    const recipients = new Set((activation.co_host_ids || []).filter((id) => id && id !== caller.id));
    if (action !== 'created' && activation.created_by_id && activation.created_by_id !== caller.id) {
      recipients.add(activation.created_by_id);
    }

    const title = action === 'created' ? 'New SOTA Activation' : 'SOTA Activation Updated';
    const message = action === 'created'
      ? 'You were added as a co-host for the SOTA activation on ' + (activation.summit_name || activation.summit_ref || 'a summit') + '.'
      : 'The POTA activation at ' + (activation.summit_name || activation.summit_ref || 'a summit') + ' was updated.';
    const type = activation.status === 'Cancelled' ? 'alert' : 'system';

    for (const userId of recipients) {
      await base44.asServiceRole.entities.UserNotification.create({
        user_id: userId,
        title,
        message,
        type,
        sender_name: caller.full_name || caller.callsign || 'SOTA operator',
        link_url: '/tools/sota/' + activation.id,
        link_label: 'View Activation',
        description: 'sota_activation:' + activation.id + ':' + action + ':' + userId,
      }).catch((e) => console.error('[notify-sota-activation] notification failed:', e?.message || e));
    }

    return Response.json({ ok: true, notified: recipients.size });
  } catch (error) {
    console.error('[notify-sota-activation] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}