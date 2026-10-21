import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Toggles a like/dislike on a ProfilePost, ForumPost, or ForumReply on the
// caller's behalf. This exists because those entities' `update` RLS is
// (intentionally) locked to the author + admins — nobody else can write to
// them directly — so reacting to someone else's post has to go through a
// service-role function instead of a client-side entity update.
const ENTITY_CONFIG: Record<string, { likeField: string; dislikeField: string | null }> = {
  ProfilePost: { likeField: 'liked_by', dislikeField: null },
  ProfilePostComment: { likeField: 'liked_by', dislikeField: null },
  ForumPost: { likeField: 'liked_by', dislikeField: 'disliked_by' },
  ForumReply: { likeField: 'liked_by', dislikeField: 'disliked_by' },
};

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.account_status === 'suspended' || user.account_status === 'banned') {
      return Response.json({ error: 'Your account cannot do this right now' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const entityName = String(body.entity || '');
    const recordId = String(body.record_id || '');
    const reaction = String(body.reaction || 'like');

    const config = ENTITY_CONFIG[entityName];
    if (!config || !recordId || !['like', 'dislike'].includes(reaction)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (reaction === 'dislike' && !config.dislikeField) {
      return Response.json({ error: 'This content does not support dislikes' }, { status: 400 });
    }

    const record = await base44.asServiceRole.entities[entityName].get(recordId).catch(() => null);
    if (!record) return Response.json({ error: 'Not found' }, { status: 404 });

    const { likeField, dislikeField } = config;
    let likedBy: string[] = Array.isArray(record[likeField]) ? [...record[likeField]] : [];
    let dislikedBy: string[] = dislikeField && Array.isArray(record[dislikeField]) ? [...record[dislikeField]] : [];

    if (reaction === 'like') {
      if (likedBy.includes(user.id)) {
        likedBy = likedBy.filter((id) => id !== user.id);
      } else {
        likedBy.push(user.id);
        dislikedBy = dislikedBy.filter((id) => id !== user.id);
      }
    } else {
      if (dislikedBy.includes(user.id)) {
        dislikedBy = dislikedBy.filter((id) => id !== user.id);
      } else {
        dislikedBy.push(user.id);
        likedBy = likedBy.filter((id) => id !== user.id);
      }
    }

    const update: Record<string, any> = { [likeField]: likedBy };
    if (dislikeField) update[dislikeField] = dislikedBy;

    await base44.asServiceRole.entities[entityName].update(recordId, update);

    // Social notification: only notify when a new like is added (not when
    // someone removes a like). Resolve the content owner server-side so the
    // client cannot choose the notification recipient.
    const wasLiked = Array.isArray(record[likeField]) && record[likeField].includes(user.id);
    const isNowLiked = likedBy.includes(user.id);
    if (!wasLiked && isNowLiked && record.created_by_id && record.created_by_id !== user.id) {
      const contentLabels: Record<string, string> = {
        ProfilePost: 'your profile post',
        ProfilePostComment: 'your profile comment',
        ForumPost: 'your forum post',
        ForumReply: 'your forum reply',
      };
      const label = contentLabels[entityName] || 'your post';
      const actorName = user.full_name || user.email || 'A member';
      const linkUrl = entityName.startsWith('Forum') ? `/forums/${entityName === 'ForumPost' ? recordId : record.post_id}` : `/members/${record.created_by_id}`;

      await base44.asServiceRole.entities.UserNotification.create({
        user_id: record.created_by_id,
        title: '❤️ Someone liked your post',
        message: `${actorName} liked ${label}.`,
        type: 'like',
        sender_name: actorName,
        link_url: linkUrl,
        link_label: 'View',
        description: `like:${entityName}:${recordId}:${user.id}`,
        read: false,
      }).catch((e) => console.error('[toggle-post-reaction] like notification failed:', e?.message || e));
    }

    return Response.json({ ok: true, liked_by: likedBy, disliked_by: dislikedBy });
  } catch (e) {
    console.error('[toggle-post-reaction] error:', e?.message || e);
    return Response.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
