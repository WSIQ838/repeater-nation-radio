import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { postDiscordNotification } from '../../shared/discordWebhook.ts';

// ===== APP-SPECIFIC =====
// Creates a UserNotification for the recipient of a friend request so it
// appears in their Notifications tab. Uses the service role because
// UserNotification.create is admin-only under RLS — the requester is a
// regular user with no permission to write notifications directly.
// Input: { recipient_id, requester_id, requester_name }
// ===== END APP-SPECIFIC =====

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Only a signed-in member may trigger this, and only for a friend request
    // they really sent. Identity comes from the session, never from the request
    // body, so nobody can plant fake notifications in another member's inbox.
    const caller = await base44.auth.me().catch(() => null);
    if (!caller) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const recipient_id = String(body?.recipient_id || '');
    const requester_id = caller.id;
    const requester_name = caller.full_name || caller.email || 'A member';
    if (!recipient_id) {
      return Response.json({ error: 'recipient_id required' }, { status: 400 });
    }
    if (recipient_id === requester_id) {
      return Response.json({ skipped: true, reason: 'self' });
    }

    const pending = await base44.asServiceRole.entities.Friendship
      .filter({ requester_id, recipient_id, status: 'pending' }, '-created_date', 1)
      .catch(() => []);
    if (!pending || pending.length === 0) {
      return Response.json({ error: 'No matching friend request' }, { status: 403 });
    }

    const n = await base44.asServiceRole.entities.UserNotification.create({
      user_id: recipient_id,
      title: 'New friend request',
      message: `${requester_name || 'A member'} sent you a friend request.`,
      type: 'message',
      sender_name: requester_name || 'Member',
      link_url: `/members/${requester_id}`,
      link_label: 'View profile',
      description: `friend_request:${requester_id}`,
      read: false,
    });

    await postDiscordNotification(base44, 'friend_request', 'friend_request', {
      requester_name: requester_name || 'A member',
    });

    return Response.json({ ok: true, notification: n });
  } catch (error) {
    console.error('[notify-friend-request] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}