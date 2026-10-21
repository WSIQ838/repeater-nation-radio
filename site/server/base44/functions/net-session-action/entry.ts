import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveHostAccess, canCheckIn, canManageSession } from '../../shared/netHostPermissions.ts';

// Applies live operational updates to a NetControlSession (start/end net,
// toggle emergency mode, sync roster, track the script section a co-host is
// reading) on the caller's behalf, tier-checked server-side.
//
// This exists because NetControlSession's own update RLS only checks "is
// this user a host at all" (created_by_id / primary_user_id / admin), not
// which permission tier -- a co-host is only accepted at 'full', 'checkin',
// or 'view' level (see netHostPermissions.ts), and the entity RLS has no way
// to express that distinction. Routing these writes through here (instead of
// a direct client-side entities.NetControlSession.update call) is what
// actually enforces the tiers the app's UI already promises.
const ACT_TIER_FIELDS = new Set(['current_script_section']);

const MANAGE_TIER_FIELDS = new Set([
  'status', 'started_at', 'ended_at', 'duration_minutes',
  'emergency_mode', 'emergency_positions', 'activation_events',
  'roster_members', 'roster_last_sync',
]);

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.session_id || '');
    const updates = body.updates && typeof body.updates === 'object' ? body.updates : {};
    const fields = Object.keys(updates);
    if (!sessionId || !fields.length) {
      return Response.json({ error: 'session_id and updates required' }, { status: 400 });
    }

    const unknownField = fields.find((f) => !ACT_TIER_FIELDS.has(f) && !MANAGE_TIER_FIELDS.has(f));
    if (unknownField) {
      return Response.json({ error: `Field not allowed: ${unknownField}` }, { status: 400 });
    }

    const access = await resolveHostAccess(base44, sessionId, caller.id);
    if (!access) return Response.json({ error: 'Not authorized for this net' }, { status: 403 });
    const { isPrimary, permission } = access;

    const needsManage = fields.some((f) => MANAGE_TIER_FIELDS.has(f));
    const allowed = needsManage ? canManageSession(permission, isPrimary) : canCheckIn(permission, isPrimary);
    if (!allowed) return Response.json({ error: 'Insufficient permissions' }, { status: 403 });

    await base44.asServiceRole.entities.NetControlSession.update(sessionId, updates);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[net-session-action] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}
