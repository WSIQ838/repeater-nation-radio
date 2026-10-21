import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Returns public member information used by profiles and messaging.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user_id = String(body?.user_id || '').trim();
    if (!user_id) return Response.json({ error: 'user_id is required' }, { status: 400 });

    let user;
    try {
      user = await base44.asServiceRole.entities.User.get(user_id);
    } catch (err) {
      console.error('[getMemberInfo] User fetch failed:', err?.message || err);
      return Response.json({ error: 'user not found' }, { status: 404 });
    }

    let profile = null;
    try {
      const profiles = await base44.asServiceRole.entities.Profile.filter(
        { created_by_id: user_id }, '-updated_date', 1
      );
      profile = profiles?.[0] || null;
    } catch (err) {
      console.error('[getMemberInfo] Profile fetch failed:', err?.message || err);
    }

    const callsign = user?.callsign || profile?.callsign || '';

    // The public profile needs every GMRS/HAM callsign this member holds or
    // has been granted access to, not just the single legacy callsign field.
    // CallsignAccess reads are RLS-restricted to the grant's own user/primary
    // holder, so a viewer looking at someone else's profile can't read them
    // client-side — resolved here with the service role instead.
    let callsigns = [];
    try {
      const [owned, access] = await Promise.all([
        base44.asServiceRole.entities.Callsign.filter({ primary_user_id: user_id, duplicate_flagged: { $ne: true } }, '-created_date', 50).catch(() => []),
        base44.asServiceRole.entities.CallsignAccess.filter({ user_id, status: 'approved' }, '-approved_at', 50).catch(() => []),
      ]);
      const authorizedRecords = await Promise.all(
        (access || []).map((a) => base44.asServiceRole.entities.Callsign.get(a.callsign_id).catch(() => null))
      );
      // Base44 does not enforce uniqueness on Callsign.normalized_callsign, so a
      // registration race or an admin duplicate scan can leave more than one
      // Callsign row for the same real callsign. Keying this map by cs.id (the
      // row's own primary key) let every duplicate row through as if it were a
      // distinct callsign -- keyed on normalized_callsign instead, same as the
      // canonicalOwned/canonicalRecords grouping CallsignManagement.jsx already
      // uses, keeping the oldest (canonical) row on a collision.
      const dedupKey = (cs) => String(cs.normalized_callsign || cs.display_callsign || cs.id).trim().toUpperCase();
      const merged = new Map();
      for (const cs of owned || []) {
        const key = dedupKey(cs);
        const existing = merged.get(key);
        if (existing && new Date(existing.created_date || 0).getTime() <= new Date(cs.created_date || 0).getTime()) continue;
        merged.set(key, { id: cs.id, display_callsign: cs.display_callsign, radio_service: cs.radio_service || 'GMRS', license_status: cs.license_status, verification_status: cs.verification_status, created_date: cs.created_date, relationship: 'Primary' });
      }
      for (const cs of authorizedRecords) {
        if (!cs) continue;
        const key = dedupKey(cs);
        if (merged.has(key)) continue;
        merged.set(key, { id: cs.id, display_callsign: cs.display_callsign, radio_service: cs.radio_service || 'GMRS', license_status: cs.license_status, verification_status: cs.verification_status, created_date: cs.created_date, relationship: 'Authorized' });
      }
      callsigns = Array.from(merged.values()).map(({ created_date, ...rest }) => rest);
    } catch (err) {
      console.error('[getMemberInfo] callsigns fetch failed:', err?.message || err);
    }

    let clubs = [];
    if (callsign) {
      try {
        const memberships = await base44.asServiceRole.entities.Membership.filter(
          { member_callsign: callsign }, '-updated_date', 100
        );
        clubs = (memberships || []).map((m) => ({
          club_id: m.club_id, club_name: m.club_name, status: m.status,
        }));
      } catch (err) {
        console.error('[getMemberInfo] Membership fetch failed:', err?.message || err);
      }
    }

    // Friendship reads are RLS-restricted to the requester/recipient, so a
    // viewer looking at someone else's public profile can't count that
    // person's friends client-side — compute it here with the service role.
    let friendsCount = 0;
    try {
      const [reqSide, recSide] = await Promise.all([
        base44.asServiceRole.entities.Friendship.filter({ requester_id: user_id, status: 'accepted' }, undefined, 2000).catch(() => []),
        base44.asServiceRole.entities.Friendship.filter({ recipient_id: user_id, status: 'accepted' }, undefined, 2000).catch(() => []),
      ]);
      friendsCount = (reqSide?.length || 0) + (recSide?.length || 0);
    } catch (err) {
      console.error('[getMemberInfo] friends count failed:', err?.message || err);
    }

    return Response.json({
      id: user_id,
      role: user?.role || 'user',
      full_name: user?.full_name || user?.name || '',
      display_name: profile?.display_name || user?.full_name || user?.name || 'Member',
      avatar_url: profile?.avatar_url || null,
      callsign,
      callsigns,
      clubs,
      friends_count: friendsCount,
    });
  } catch (error) {
    console.error('[getMemberInfo] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}