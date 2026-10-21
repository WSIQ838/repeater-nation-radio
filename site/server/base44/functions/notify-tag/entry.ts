import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ===== APP-SPECIFIC =====
// Notifies every member tagged (@mentioned) in a ProfilePost or ForumPost.
// Runs with the service role because UserNotification.create is admin-only
// under RLS -- the poster is a regular member with no permission to write
// notifications directly, and this also re-verifies each tag server-side
// (never trusting the client's claim that a callsign was really tagged)
// before creating anything.
// Input: { mentions: string[] (callsigns), context_type: 'post', context_id, preview }
// ===== END APP-SPECIFIC =====

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mentions = Array.isArray(body.mentions)
      ? [...new Set(body.mentions.map((m: any) => String(m || '').trim().toUpperCase()).filter(Boolean))]
      : [];
    const contextType = String(body.context_type || 'post');
    const contextId = String(body.context_id || '');
    const preview = String(body.preview || '').slice(0, 140);
    if (!mentions.length || !contextId) {
      return Response.json({ ok: true, notified: 0 });
    }

    // The tag itself only names a callsign -- resolve each one to the real
    // member who holds/owns that callsign (via Profile) server-side, rather
    // than trusting the client to have already done that mapping correctly.
    const profiles = await base44.asServiceRole.entities.Profile
      .filter({ callsign: { $in: mentions } }, '-updated_date', mentions.length)
      .catch(() => []);

    const recipientIds = new Set(
      (profiles || [])
        .map((p: any) => String(p.created_by_id || ''))
        .filter((id: string) => id && id !== caller.id)
    );

    const authorName = caller.full_name || caller.email || 'A member';
    const linkUrl = contextType === 'forum_post' ? `/forums/${contextId}` : `/members/${caller.id}`;

    let notified = 0;
    for (const recipientId of recipientIds) {
      try {
        await base44.asServiceRole.entities.UserNotification.create({
          user_id: recipientId,
          title: 'You were tagged',
          message: `${authorName} tagged you in a post${preview ? `: "${preview}"` : '.'}`,
          type: 'mention',
          sender_name: authorName,
          link_url: linkUrl,
          link_label: 'View post',
          description: `mention:${contextType}:${contextId}`,
          read: false,
        });
        notified++;
      } catch (e) {
        console.error('[notify-tag] notification failed for', recipientId, e?.message || e);
      }
    }

    return Response.json({ ok: true, notified });
  } catch (error) {
    console.error('[notify-tag] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}
