import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const targetId = body?.user_id;
    if (!targetId) return Response.json({ error: 'user_id is required' }, { status: 400 });
    if (targetId === user.id) return Response.json({ commonFriends: [], commonClubs: [] });

    // --- Common Friends ---
    // My friends (user-scoped — RLS allows reading my own friendships)
    const myFriendships = await base44.entities.Friendship.filter({ status: 'accepted' });
    const myFriendIds = new Set();
    myFriendships.forEach((f) => {
      if (f.requester_id === user.id) myFriendIds.add(f.recipient_id);
      else if (f.recipient_id === user.id) myFriendIds.add(f.requester_id);
    });

    // Their friends (service role — bypass RLS to read the target's friendships)
    const theirReqs = await base44.asServiceRole.entities.Friendship.filter({ status: 'accepted', requester_id: targetId });
    const theirRcps = await base44.asServiceRole.entities.Friendship.filter({ status: 'accepted', recipient_id: targetId });
    const theirFriendIds = new Set();
    const friendNameMap = {};
    [...theirReqs, ...theirRcps].forEach((f) => {
      if (f.requester_id === targetId) {
        theirFriendIds.add(f.recipient_id);
        if (f.recipient_name) friendNameMap[f.recipient_id] = f.recipient_name;
      } else if (f.recipient_id === targetId) {
        theirFriendIds.add(f.requester_id);
        if (f.requester_name) friendNameMap[f.requester_id] = f.requester_name;
      }
    });

    const commonFriendIds = [...myFriendIds].filter((id) => theirFriendIds.has(id));
    const commonFriends = commonFriendIds.map((id) => ({ id, name: friendNameMap[id] || 'Member' }));

    // --- Common Clubs ---
    // Membership read is public — query all active memberships and split by user
    const allMemberships = await base44.entities.Membership.filter({ status: 'Active' });
    const clubNames = {};
    const myClubIds = new Set();
    const theirClubIds = new Set();
    allMemberships.forEach((m) => {
      if (m.club_name) clubNames[m.club_id] = m.club_name;
      if (m.created_by_id === user.id) myClubIds.add(m.club_id);
      if (m.created_by_id === targetId) theirClubIds.add(m.club_id);
    });
    const commonClubIds = [...myClubIds].filter((id) => theirClubIds.has(id));
    const commonClubs = commonClubIds.map((id) => ({ id, name: clubNames[id] || 'Club' }));

    return Response.json({ commonFriends, commonClubs });
  } catch (error) {
    console.error('get-common-connections error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}