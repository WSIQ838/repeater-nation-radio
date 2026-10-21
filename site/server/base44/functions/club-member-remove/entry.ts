import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ===== APP-SPECIFIC =====
// Removes a member from a club. Runs the delete as service role so it can
// also write an immutable ClubMembershipLog entry (that entity's RLS blocks
// client-side create entirely) — the same request that removes the
// Membership records the "Removed" event, so Club Manager's Finance tab has
// a real join/leave history instead of just losing the record on delete.
// ===== END APP-SPECIFIC =====

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const membershipId = body?.membershipId;
    if (!membershipId) return Response.json({ error: 'membershipId required' }, { status: 400 });

    const db = base44.asServiceRole;
    const membership = await db.entities.Membership.get(membershipId).catch(() => null);
    if (!membership) return Response.json({ error: 'Membership not found' }, { status: 404 });

    const club = (await db.entities.Club.filter({ id: membership.club_id }))[0];
    const isOwner = !!club && (club.created_by_id === user.id || (user.callsign && club.creator_callsign === user.callsign));
    const isAppAdmin = user.role === 'admin' || user.role === 'super_admin' || user._app_role === 'admin' || user._app_role === 'super_admin';
    // A member can leave on their own (self-removal). The club owner cannot
    // leave this way — they must transfer ownership or delete the club.
    const isSelf = membership.created_by_id === user.id || (user.callsign && membership.member_callsign === user.callsign);
    const isSelfLeaving = isSelf && body?.self === true;
    if (!isOwner && !isAppAdmin && !isSelfLeaving) {
      return Response.json({ error: 'You do not have permission to remove this member.' }, { status: 403 });
    }
    if (isSelfLeaving && isOwner) {
      return Response.json({ error: 'Transfer ownership or delete the club to leave.' }, { status: 400 });
    }

    await db.entities.Membership.delete(membershipId);
    if (club) {
      await db.entities.Club.update(club.id, { members_count: Math.max(0, (club.members_count || 0) - 1) });
    }
    await db.entities.ClubMembershipLog.create({
      club_id: membership.club_id,
      club_name: membership.club_name || club?.name || '',
      member_callsign: membership.member_callsign,
      member_name: membership.member_name || '',
      action: 'Removed',
      reason: isSelfLeaving ? `Left by ${user.full_name || user.callsign || 'member'}` : `Removed by ${user.full_name || user.callsign || 'club staff'}`,
      club_owner_id: club?.created_by_id || membership.club_owner_id || null,
    }).catch((e) => console.error('[club-member-remove] log create failed:', e?.message || e));

    const memberProfile = membership.member_callsign
      ? (await db.entities.Profile.filter({ callsign: membership.member_callsign }, '-updated_date', 1).catch(() => []))[0]
      : null;
    const removedUserId = memberProfile?.created_by_id;
    if (removedUserId && removedUserId !== user.id) {
      await db.entities.UserNotification.create({
        user_id: removedUserId,
        title: 'Removed from Club',
        message: 'You were removed from ' + (membership.club_name || club?.name || 'the club') + '.',
        type: 'alert',
        sender_name: user.full_name || user.callsign || 'Club staff',
        link_url: '/clubs/' + membership.club_id,
        link_label: 'View Club',
        description: 'club_removed:' + membership.id,
      }).catch((e) => console.error('[club-member-remove] notification failed:', e?.message || e));
    }

    console.log('[club-member-remove] removed', { membershipId, callsign: membership.member_callsign, by: user.id });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[club-member-remove] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}