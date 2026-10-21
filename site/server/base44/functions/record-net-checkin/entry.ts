// Processes a net check-in for gamification — updates streaks, evaluates badges,
// and sends achievement notifications. Called from the Net Control dashboard
// after a check-in is created. Reads the check-in record server-side so the
// client cannot fake streak data.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { processNetCheckIn } from '../../shared/netGamification.ts';
import { resolveHostAccess } from '../../shared/netHostPermissions.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    let caller;
    try {
      caller = await base44.auth.me();
    } catch {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!caller?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const checkinId = String(body.checkin_id || '');
    if (!checkinId) return Response.json({ error: 'checkin_id required' }, { status: 400 });

    const checkin = await base44.asServiceRole.entities.NetControlCheckIn.get(checkinId).catch(() => null);
    if (!checkin) return Response.json({ error: 'check-in not found' }, { status: 404 });

    const session = await base44.asServiceRole.entities.NetControlSession.get(checkin.session_id).catch(() => null);
    if (!session) return Response.json({ ok: true, skipped: 'session not found' });

    const access = await resolveHostAccess(base44, session.id, caller.id);
    const isAdmin = caller.role === 'admin' || caller.role === 'super_admin';
    if (!access && !isAdmin) return Response.json({ error: 'Not authorized for this net' }, { status: 403 });

    if (!session.club_id) return Response.json({ ok: true, skipped: 'no club' });

    await processNetCheckIn(base44, {
      checkinId, sessionId: session.id, clubId: session.club_id, clubName: session.club_name || '',
      callsign: checkin.callsign || '',
      checkinType: checkin.checkin_type || (checkin.is_guest ? 'guest' : 'standard'),
      checkinTime: checkin.check_in_time || new Date().toISOString(),
      netName: session.name || '',
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[record-net-checkin] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}