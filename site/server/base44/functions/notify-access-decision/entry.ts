import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const { request_id } = await req.json().catch(() => ({}));
    if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
    const request = await base44.asServiceRole.entities.RepeaterAccessRequest.get(request_id).catch(() => null);
    if (!request) return Response.json({ skipped: true, reason: 'request_not_found' });
    const isAdmin = ['admin', 'super_admin'].includes(caller.role) || ['admin', 'super_admin'].includes(caller._app_role);
    if (request.owner_id !== caller.id && !isAdmin) return Response.json({ error: 'Not authorized' }, { status: 403 });
    if (!['Granted', 'Denied'].includes(request.status)) return Response.json({ skipped: true, reason: 'not_decided' });
    const title = request.status === 'Granted' ? 'Repeater Access Granted' : 'Repeater Access Request Denied';
    const message = request.status === 'Granted'
      ? 'Your request to access ' + (request.repeater_name || 'the repeater') + ' was granted.'
      : 'Your request to access ' + (request.repeater_name || 'the repeater') + ' was denied.';
    await base44.asServiceRole.entities.UserNotification.create({
      user_id: request.created_by_id,
      title,
      message,
      type: request.status === 'Granted' ? 'system' : 'alert',
      sender_name: caller.full_name || caller.callsign || 'Repeater owner',
      link_url: '/dashboard',
      link_label: 'View Dashboard',
      description: 'repeater_access:' + request.id + ':' + request.status.toLowerCase(),
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[notify-access-decision] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}