// Server-side Net Control check-in operations with conflict detection and
// permission enforcement. All collaborative check-in/check-out/guest/note
// actions go through this function so co-hosts with different permission levels
// can safely operate on the same shared session without duplicate records.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { processNetCheckIn } from '../../shared/netGamification.ts';
import { resolveHostAccess, canCheckIn } from '../../shared/netHostPermissions.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const sessionId = String(body.session_id || '');

    if (!sessionId || !action) {
      return Response.json({ error: 'session_id and action required' }, { status: 400 });
    }

    // Authenticate caller
    let caller;
    try {
      caller = await base44.auth.me();
    } catch {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!caller?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });

    // Resolve host access
    const access = await resolveHostAccess(base44, sessionId, caller.id);
    if (!access) return Response.json({ error: 'Not authorized for this net' }, { status: 403 });

    const { isPrimary, permission } = access;
    const session = await base44.asServiceRole.entities.NetControlSession.get(sessionId).catch(() => null);
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

    // ── CHECKIN / ADD_GUEST: create a check-in with conflict detection ──
    if (action === 'checkin' || action === 'add_guest') {
      if (!canCheckIn(permission, isPrimary)) {
        return Response.json({ error: 'Insufficient permissions for check-in' }, { status: 403 });
      }
      const station = body.station || {};
      const callsign = String(station.callsign || '').toUpperCase().trim();
      if (!callsign) return Response.json({ error: 'callsign required' }, { status: 400 });

      // Conflict detection: check if station already checked in
      const existing = await base44.asServiceRole.entities.NetControlCheckIn.filter(
        { session_id: sessionId, callsign, status: 'checked_in' },
        '-check_in_time', 1
      );
      if ((existing || []).length > 0) {
        return Response.json({ error: 'already_checked_in', checkin: existing[0] }, { status: 409 });
      }

      const now = new Date().toISOString();
      const hostIds = session.host_user_ids || [];

      const lat = Number(station.lat);
      const lng = Number(station.lng);

      const checkin = await base44.asServiceRole.entities.NetControlCheckIn.create({
        session_id: sessionId,
        callsign,
        name: String(station.name || ''),
        location: String(station.location || ''),
        ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
        signal_report: String(station.signal_report || ''),
        station_type: String(station.station_type || ''),
        club_role: String(station.club_role || ''),
        membership_status: String(station.membership_status || ''),
        is_guest: action === 'add_guest',
        checkin_type: action === 'add_guest' ? 'guest' : (station.checkin_type || 'standard'),
        status: 'checked_in',
        check_in_time: now,
        notes: String(station.notes || ''),
        session_owner_id: session.created_by_id || session.primary_user_id || '',
        club_owner_id: session.club_owner_id || '',
        checked_in_by_user_id: caller.id,
        checked_in_by_name: caller.full_name || caller.email || '',
        session_host_ids: hostIds,
      });

      // Process gamification (streaks, badges)
      await processNetCheckIn(base44, {
        checkinId: checkin.id, sessionId: session.id, clubId: session.club_id || '',
        clubName: session.club_name || '',
        callsign: checkin.callsign, checkinType: checkin.checkin_type,
        checkinTime: now, netName: session.name || '',
      });

      // Update session total
      await base44.asServiceRole.entities.NetControlSession.update(sessionId, {
        total_checkins: (session.total_checkins || 0) + 1,
      });

      return Response.json({ ok: true, checkin });
    }

    // ── CHECKOUT: check out a station ──
    if (action === 'checkout') {
      if (!canCheckIn(permission, isPrimary)) {
        return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
      const checkinId = String(body.checkin_id || '');
      const callsign = String(body.callsign || '').toUpperCase().trim();
      if (!checkinId && !callsign) {
        return Response.json({ error: 'checkin_id or callsign required' }, { status: 400 });
      }

      // Prefer an exact ID lookup, but fall back to the active callsign record.
      // This avoids a 404 when the client has a stale/malformed record ID while
      // still making sure the record belongs to this net session.
      let checkin = null;
      if (checkinId) {
        const byId = await base44.asServiceRole.entities.NetControlCheckIn.filter(
          { id: checkinId, session_id: sessionId }, '-check_in_time', 1
        );
        checkin = (byId || [])[0] || null;
      }
      if (!checkin && callsign) {
        const active = await base44.asServiceRole.entities.NetControlCheckIn.filter(
          { session_id: sessionId, callsign, status: 'checked_in' }, '-check_in_time', 1
        );
        checkin = (active || [])[0] || null;
      }
      if (!checkin) {
        return Response.json({ error: 'Check-in not found for this session' }, { status: 404 });
      }
      if (checkin.status === 'checked_out') {
        return Response.json({ ok: true, already_checked_out: true, checkin });
      }

      await base44.asServiceRole.entities.NetControlCheckIn.update(checkin.id, {
        status: 'checked_out',
        check_out_time: new Date().toISOString(),
      });
      return Response.json({ ok: true, checkin_id: checkin.id });
    }

    // ── UPDATE_NOTE: update notes for a check-in ──
    if (action === 'update_note') {
      if (!canCheckIn(permission, isPrimary)) {
        return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
      const checkinId = String(body.checkin_id || '');
      if (!checkinId) return Response.json({ error: 'checkin_id required' }, { status: 400 });
      const checkin = await base44.asServiceRole.entities.NetControlCheckIn.get(checkinId).catch(() => null);
      if (!checkin || checkin.session_id !== sessionId) {
        return Response.json({ error: 'Check-in not found for this session' }, { status: 404 });
      }
      const updates = { notes: String(body.note_text || '') };
      if (body.signal_report !== undefined) updates.signal_report = String(body.signal_report || '');
      if (body.name !== undefined) updates.name = String(body.name || '');
      if (body.location !== undefined) updates.location = String(body.location || '');
      if (body.station_type !== undefined) updates.station_type = String(body.station_type || '');
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        updates.lat = lat;
        updates.lng = lng;
      }
      await base44.asServiceRole.entities.NetControlCheckIn.update(checkinId, updates);
      return Response.json({ ok: true });
    }

    // ── ADD_ROSTER_MEMBER: append a station to the roster, or reposition one
    // already on it (top for a quick add of someone still expected, bottom
    // for an early check-in that's now been processed). Checkin-tier hosts
    // can do this even though they can't otherwise edit/reorder/remove the
    // roster (that stays manage-tier via net-session-action) — it only ever
    // adds or moves the one station the caller named, never anyone else's. ──
    if (action === 'add_roster_member') {
      if (!canCheckIn(permission, isPrimary)) {
        return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
      const callsign = String(body.callsign || '').toUpperCase().trim();
      if (!callsign) return Response.json({ error: 'callsign required' }, { status: 400 });
      const position = body.position === 'bottom' ? 'bottom' : 'top';

      let roster = [];
      try {
        const parsed = JSON.parse(session.roster_members || '[]');
        if (Array.isArray(parsed)) roster = parsed;
      } catch { roster = []; }

      const rest = roster.filter((m) => (m.callsign || '').toUpperCase() !== callsign);
      let member = roster.find((m) => (m.callsign || '').toUpperCase() === callsign);
      if (!member) {
        member = {
          id: `custom-${Date.now()}`,
          callsign,
          name: String(body.name || ''),
          location: String(body.location || ''),
          station_type: String(body.station_type || ''),
          notes: String(body.notes || ''),
          source: 'custom',
        };
      }
      const nextRoster = position === 'top' ? [member, ...rest] : [...rest, member];

      await base44.asServiceRole.entities.NetControlSession.update(sessionId, {
        roster_members: JSON.stringify(nextRoster),
      });

      return Response.json({ ok: true, member, roster: nextRoster });
    }

    // ── MARK_LATE: mark a check-in as late ──
    if (action === 'mark_late') {
      if (!canCheckIn(permission, isPrimary)) {
        return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
      const checkinId = String(body.checkin_id || '');
      if (!checkinId) return Response.json({ error: 'checkin_id required' }, { status: 400 });
      const checkin = await base44.asServiceRole.entities.NetControlCheckIn.get(checkinId).catch(() => null);
      if (!checkin || checkin.session_id !== sessionId) {
        return Response.json({ error: 'Check-in not found for this session' }, { status: 404 });
      }
      await base44.asServiceRole.entities.NetControlCheckIn.update(checkinId, { checkin_type: 'late' });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    console.error('[net-checkin-action] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}