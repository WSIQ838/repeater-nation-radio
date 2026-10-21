import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const friendship_id = String(body?.friendship_id || '');
    if (!friendship_id) return Response.json({ error: 'friendship_id required' }, { status: 400 });

    const fs = await base44.asServiceRole.entities.Friendship.get(friendship_id).catch(() => null);
    if (!fs) return Response.json({ error: 'Friendship not found' }, { status: 404 });

    // Only the recipient who accepted the request may trigger this notification.
    if (fs.recipient_id !== caller.id || fs.status !== 'accepted') {
      return Response.json({ error: 'Not an accepted request for this member' }, { status: 403 });
    }

    if (!fs.requester_id || fs.requester_id === caller.id) {
      return Response.json({ skipped: true });
    }

    const actorName = caller.full_name || caller.email || 'A member';
    const description = `friend_accepted:${friendship_id}`;

    const existing = await base44.asServiceRole.entities.UserNotification
      .filter({ user_id: fs.requester_id, description }, '-created_date', 1)
      .catch(() => []);

    if (existing?.length) return Response.json({ ok: true, duplicate: true });

    const notification = await base44.asServiceRole.entities.UserNotification.create({
      user_id: fs.requester_id,
      title: 'Friend request accepted',
      message: `${actorName} accepted your friend request. You are now friends.`,
      type: 'message',
      sender_name: actorName,
      link_url: `/members/${caller.id}`,
      link_label: 'View profile',
      description,
      read: false,
    });

    return Response.json({ ok: true, notification });
  } catch (error) {
    console.error('[notify-friend-accepted] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}