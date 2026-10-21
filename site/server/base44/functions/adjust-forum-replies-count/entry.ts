import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Bumps ForumPost.replies_count when a reply is created or deleted. Needed
// because any member can reply to any other member's forum post, but
// ForumPost's update RLS is (correctly) locked to the post's own author,
// moderators, and admins — a replier can't update someone else's post
// record directly.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const postId = String(body.post_id || '');
    if (!postId) return Response.json({ error: 'Invalid request' }, { status: 400 });
    const post = await base44.asServiceRole.entities.ForumPost.get(postId).catch(() => null);
    if (!post) return Response.json({ error: 'Not found' }, { status: 404 });
    // Recount the real ForumReply rows instead of applying a caller-supplied
    // +1/-1, so no member can inflate or zero another post's count. (`delta`
    // is still accepted from older clients but ignored.)
    const rows = await base44.asServiceRole.entities.ForumReply.filter({ post_id: postId }, '-created_date', 5000).catch(() => null);
    if (!Array.isArray(rows)) return Response.json({ error: 'Could not count right now' }, { status: 503 });
    const next = rows.length;
    if (post.replies_count !== next) await base44.asServiceRole.entities.ForumPost.update(postId, { replies_count: next });
    return Response.json({ ok: true, replies_count: next });
  } catch (e) {
    console.error('[adjust-forum-replies-count] error:', e?.message || e);
    return Response.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
