import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ===== APP-SPECIFIC =====
// Returns presence info (full_name, callsign, last_active, show_online_status)
// for a list of user IDs. Runs as service role because regular app users can't
// read another user's User record directly.
//
// Privacy: if a target user has show_online_status === false, their last_active
// is returned as null UNLESS the requester is an admin (admins always see status
// for moderation). The caller's role is resolved via base44.auth.me().
// ===== END APP-SPECIFIC =====

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user_ids = Array.isArray(body?.user_ids) ? body.user_ids.filter(Boolean) : [];
    if (!user_ids.length) {
      return Response.json({ users: [] });
    }

    // Authenticate the caller — presence data is only available to logged-in users.
    let me = null;
    let requesterIsAdmin = false;
    try {
      me = await base44.auth.me();
      requesterIsAdmin = ['admin', 'super_admin'].includes(me?.role);
    } catch (err) {
      console.error('[getFriendsPresence] auth failed:', err?.message || err);
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401 });

    // One bulk query per call instead of one User.get per id: the member
    // directory polls this for every member, and per-id reads were what
    // tripped the app's database rate limit ("Rate limit exceeded").
    const ids = [...new Set(user_ids.slice(0, 100).map(String))];
    let rows: any[] = [];
    try {
      rows = await base44.asServiceRole.entities.User.filter({ id: { $in: ids } }, undefined, ids.length);
    } catch (err) {
      console.error('[getFriendsPresence] bulk user fetch failed:', err?.message || err);
      return Response.json({ error: 'Could not load presence right now' }, { status: 503 });
    }
    const users = [];
    for (const u of rows || []) {
      if (!u?.id) continue;
      const showStatus = u.show_online_status !== false; // default true
      const canSeeStatus = showStatus || requesterIsAdmin;
      users.push({
        id: u.id,
        full_name: u.full_name || '',
        callsign: u.callsign || '',
        last_active: canSeeStatus ? (u.last_active || null) : null,
        show_online_status: showStatus,
      });
    }
    return Response.json({ users });
  } catch (error) {
    console.error('[getFriendsPresence] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}