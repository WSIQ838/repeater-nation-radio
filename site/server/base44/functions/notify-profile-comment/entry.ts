import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const postId = String(body.post_id || '');
    const commentId = String(body.comment_id || '');
    if (!postId || !commentId) return Response.json({ ok: true, notified: 0 });
    // Only for a real comment the caller wrote on this post, and only once
    // per comment; the preview comes from the stored comment, never from the
    // request, so nobody can plant fake comment notifications.
    const comment = await base44.asServiceRole.entities.ProfilePostComment.get(commentId).catch(() => null);
    if (!comment || comment.post_id !== postId || comment.created_by_id !== caller.id) {
      return Response.json({ ok: true, notified: 0 });
    }
    const already = await base44.asServiceRole.entities.UserNotification
      .filter({ description: 'profile_comment:' + commentId }, '-created_date', 1).catch(() => []);
    if (already?.length) return Response.json({ ok: true, notified: 0, duplicate: true });
    const preview = String(comment.body || '').slice(0, 140);

    const post = await base44.asServiceRole.entities.ProfilePost.get(postId).catch(() => null);
    if (!post || !post.created_by_id || post.created_by_id === caller.id) {
      return Response.json({ ok: true, notified: 0 });
    }

    const actorName = caller.full_name || caller.email || 'A member';
    await base44.asServiceRole.entities.UserNotification.create({
      user_id: post.created_by_id,
      title: '💬 New comment on your post',
      message: actorName + ' commented on your profile post' + (preview ? ': "' + preview + '"' : '.'),
      type: 'comment',
      sender_name: actorName,
      link_url: '/members/' + post.created_by_id,
      link_label: 'View post',
      description: 'profile_comment:' + commentId,
      read: false,
    });

    return Response.json({ ok: true, notified: 1 });
  } catch (error) {
    console.error('[notify-profile-comment] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}
