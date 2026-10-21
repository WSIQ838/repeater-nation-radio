import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const { comment_id } = await req.json().catch(() => ({}));
    if (!comment_id) return Response.json({ error: 'comment_id required' }, { status: 400 });
    const comment = await base44.asServiceRole.entities.RepeaterComment.get(comment_id).catch(() => null);
    if (!comment) return Response.json({ skipped: true, reason: 'comment_not_found' });
    // Only the comment's author can trigger it, and only once per comment.
    if (comment.created_by_id !== caller.id) return Response.json({ skipped: true, reason: 'not_author' });
    const already = await base44.asServiceRole.entities.UserNotification
      .filter({ description: 'repeater_comment:' + comment.id }, '-created_date', 1).catch(() => []);
    if (already?.length) return Response.json({ skipped: true, reason: 'already_notified' });
    const repeater = await base44.asServiceRole.entities.Repeater.get(comment.repeater_id).catch(() => null);
    if (!repeater) return Response.json({ skipped: true, reason: 'repeater_not_found' });
    const ownerId = repeater.owner_user_id || repeater.created_by_id;
    if (!ownerId || ownerId === comment.created_by_id) return Response.json({ skipped: true, reason: 'self_or_no_owner' });
    await base44.asServiceRole.entities.UserNotification.create({
      user_id: ownerId,
      title: 'New Repeater Comment',
      message: (comment.author_callsign || comment.author_name || 'A member') + ' commented on ' + (comment.repeater_name || repeater.name || 'your repeater') + '.',
      type: 'message',
      sender_name: comment.author_callsign || comment.author_name || 'Repeater Nation member',
      link_url: '/repeaters/' + comment.repeater_id,
      link_label: 'View Repeater',
      description: 'repeater_comment:' + comment.id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[notify-repeater-comment] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}
