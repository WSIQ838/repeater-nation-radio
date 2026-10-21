import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Returns a { user_id: role } map for the Member Directory.
// Runs as service role because regular app users cannot read other users' User records.
// Only exposes the normalized role string — no email or other user data.

const ALLOWED_ROLES = new Set([
  'user',
  'member',
  'admin',
  'super_admin',
  'moderator',
  'editor',
  'support_staff',
]);

function normalizeRole(role) {
  const normalized = role == null
    ? 'user'
    : String(role).trim().toLowerCase();

  return ALLOWED_ROLES.has(normalized) ? normalized : 'user';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const user_ids = Array.isArray(body?.user_ids)
      ? [...new Set(body.user_ids.filter(Boolean).map(String))]
      : [];

    if (!user_ids.length) {
      return Response.json({ roles: {} });
    }

    const roles = {};

    // Always initialize every requested ID as a normal member.
    // This prevents a missing/deleted User record from accidentally displaying
    // a staff icon in the public directory.
    user_ids.slice(0, 300).forEach((uid) => {
      roles[uid] = 'user';
    });

    // One bulk query instead of up to 300 simultaneous User.get calls, which
    // burst straight into the app's database rate limit on every directory load.
    try {
      const ids = user_ids.slice(0, 300);
      const users = await base44.asServiceRole.entities.User.filter({ id: { $in: ids } }, undefined, ids.length);
      for (const user of users || []) {
        if (user?.id && roles[user.id]) roles[user.id] = normalizeRole(user.role);
      }
    } catch (err) {
      // Keep the safe default of 'user' when the User records cannot be read.
      console.error('[get-member-roles] bulk user fetch failed:', err?.message || err);
    }

    return Response.json({ roles });
  } catch (error) {
    console.error('[get-member-roles] error:', error?.message || error);
    return Response.json(
      { error: error?.message || 'unexpected error' },
      { status: 500 }
    );
  }
}