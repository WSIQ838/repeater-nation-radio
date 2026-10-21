import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Bumps ProfilePost.comments_count when a comment is created or deleted. Needed
// because any member can comment on any other member's profile post, but
// ProfilePost's update RLS is (correctly) locked to the post's own author and
// admins — a commenter can't update someone else's post record directly.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const postId = String(body.post_id || '');
    if (!postId) return Response.json({ error: 'Invalid request' }, { status: 400 });
    const post = await base44.asServiceRole.entities.ProfilePost.get(postId).catch(() => null);
    if (!post) return Response.json({ error: 'Not found' }, { status: 404 });
    // Recount the real ProfilePostComment rows instead of applying a caller-supplied
    // +1/-1, so no member can inflate or zero another post's count. (`delta`
    // is still accepted from older clients but ignored.)
    const rows = await base44.asServiceRole.entities.ProfilePostComment.filter({ post_id: postId }, '-created_date', 5000).catch(() => null);
    if (!Array.isArray(rows)) return Response.json({ error: 'Could not count right now' }, { status: 503 });
    const next = rows.length;
    if (post.comments_count !== next) await base44.asServiceRole.entities.ProfilePost.update(postId, { comments_count: next });
    return Response.json({ ok: true, comments_count: next });
  } catch (e) {
    console.error('[adjust-profile-post-comments] error:', e?.message || e);
    return Response.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
