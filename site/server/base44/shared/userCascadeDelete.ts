// Shared cascade-delete logic for purging a user's data across all entities.
// Used by both the self-service manage-account function and the admin-api
// users:delete action so the purge logic stays in one place.

export async function cascadeDeleteUser(sr: any, userId: string): Promise<void> {
  // Gather records that need individual deletion (OR-condition queries), plus the
  // ids of this user's own ForumPost/Club/Repeater/Equipment/Callsign records --
  // deleting those below would otherwise orphan OTHER users' rows that reference
  // them (their replies, memberships, comments, checkouts, access grants).
  const [
    allFriendships, allMessages, ownedRepeaters,
    ownForumPosts, ownClubs, ownCreatedRepeaters, ownEquipment, ownCallsigns,
  ] = await Promise.all([
    sr.entities.Friendship.list('-created_date', 5000).catch(() => []),
    sr.entities.Message.list('-created_date', 5000).catch(() => []),
    sr.entities.Repeater.filter({ owner_user_id: userId }).catch(() => []),
    sr.entities.ForumPost.filter({ created_by_id: userId }).catch(() => []),
    sr.entities.Club.filter({ created_by_id: userId }).catch(() => []),
    sr.entities.Repeater.filter({ created_by_id: userId }).catch(() => []),
    sr.entities.Equipment.filter({ created_by_id: userId }).catch(() => []),
    sr.entities.Callsign.filter({ primary_user_id: userId }).catch(() => []),
  ]);

  const myFriendships = (allFriendships || []).filter(
    (f: any) => f.requester_id === userId || f.recipient_id === userId
  );
  const myMessages = (allMessages || []).filter(
    (m: any) => m.sender_id === userId || m.recipient_id === userId
  );

  const ids = (rows: any[]) => (rows || []).map((r) => r?.id).filter(Boolean);
  const forumPostIds = ids(ownForumPosts);
  const clubIds = ids(ownClubs);
  const deletedRepeaterIds = ids(ownCreatedRepeaters);
  const equipmentIds = ids(ownEquipment);
  const callsignIds = ids(ownCallsigns);

  const del = (fn: Promise<any>) => fn.catch(() => {});
  const delIfAny = (idList: string[], fn: (inIds: string[]) => Promise<any>) =>
    idList.length ? del(fn(idList)) : Promise.resolve();

  await Promise.all([
    // Cross-user rows that would otherwise be orphaned by the deletes below.
    delIfAny(forumPostIds, (inIds) => sr.entities.ForumReply.deleteMany({ post_id: { $in: inIds } })),
    delIfAny(clubIds, (inIds) => sr.entities.Membership.deleteMany({ club_id: { $in: inIds } })),
    delIfAny(deletedRepeaterIds, (inIds) => sr.entities.RepeaterComment.deleteMany({ repeater_id: { $in: inIds } })),
    delIfAny(deletedRepeaterIds, (inIds) => sr.entities.RepeaterAccessRequest.deleteMany({ repeater_id: { $in: inIds } })),
    delIfAny(equipmentIds, (inIds) => sr.entities.EquipmentCheckout.deleteMany({ equipment_id: { $in: inIds } })),
    delIfAny(equipmentIds, (inIds) => sr.entities.EquipmentRepair.deleteMany({ equipment_id: { $in: inIds } })),
    delIfAny(equipmentIds, (inIds) => sr.entities.EquipmentHistory.deleteMany({ equipment_id: { $in: inIds } })),
    delIfAny(equipmentIds, (inIds) => sr.entities.EquipmentReservation.deleteMany({ equipment_id: { $in: inIds } })),
    delIfAny(callsignIds, (inIds) => sr.entities.CallsignAccess.deleteMany({ callsign_id: { $in: inIds } })),
    delIfAny(callsignIds, (inIds) => sr.entities.CallsignAccessRequest.deleteMany({ callsign_id: { $in: inIds } })),
  ]);

  await Promise.all([
    del(sr.entities.Profile.deleteMany({ created_by_id: userId })),
    del(sr.entities.ContactLog.deleteMany({ created_by_id: userId })),
    del(sr.entities.Equipment.deleteMany({ created_by_id: userId })),
    // Equipment sub-records (owner_id denormalized for RLS)
    del(sr.entities.EquipmentCheckout.deleteMany({ owner_id: userId })),
    del(sr.entities.EquipmentRepair.deleteMany({ owner_id: userId })),
    del(sr.entities.EquipmentHistory.deleteMany({ owner_id: userId })),
    del(sr.entities.EquipmentReservation.deleteMany({ owner_id: userId })),
    del(sr.entities.ForumPost.deleteMany({ created_by_id: userId })),
    del(sr.entities.ForumReply.deleteMany({ created_by_id: userId })),
    del(sr.entities.Repeater.deleteMany({ created_by_id: userId })),
    del(sr.entities.RepeaterAccessRequest.deleteMany({ created_by_id: userId })),
    del(sr.entities.RepeaterAccessRequest.deleteMany({ owner_id: userId })),
    del(sr.entities.RepeaterComment.deleteMany({ created_by_id: userId })),
    del(sr.entities.Club.deleteMany({ created_by_id: userId })),
    del(sr.entities.Membership.deleteMany({ created_by_id: userId })),
    del(sr.entities.UserBadge.deleteMany({ user_id: userId })),
    del(sr.entities.UserNotification.deleteMany({ user_id: userId })),
    del(sr.entities.Trip.deleteMany({ created_by_id: userId })),
    del(sr.entities.ChannelPlan.deleteMany({ created_by_id: userId })),
    del(sr.entities.NetControlSession.deleteMany({ created_by_id: userId })),
    del(sr.entities.NetControlRoster.deleteMany({ created_by_id: userId })),
    del(sr.entities.NetControlCheckIn.deleteMany({ created_by_id: userId })),
    // Events created by or owned by the user (club owner)
    del(sr.entities.Event.deleteMany({ created_by_id: userId })),
    del(sr.entities.Event.deleteMany({ club_owner_id: userId })),
    // Club content authored by the user or owned by them as club owner
    del(sr.entities.ClubThread.deleteMany({ created_by_id: userId })),
    del(sr.entities.ClubThread.deleteMany({ club_owner_id: userId })),
    del(sr.entities.ClubThreadReply.deleteMany({ created_by_id: userId })),
    del(sr.entities.ClubThreadReply.deleteMany({ club_owner_id: userId })),
    del(sr.entities.ClubPage.deleteMany({ created_by_id: userId })),
    del(sr.entities.ClubPage.deleteMany({ club_owner_id: userId })),
    // Callsign records and access grants/requests
    del(sr.entities.Callsign.deleteMany({ primary_user_id: userId })),
    del(sr.entities.CallsignAccess.deleteMany({ user_id: userId })),
    del(sr.entities.CallsignAccessRequest.deleteMany({ requester_user_id: userId })),
  ]);

  // Unlink repeaters where the user is the linked owner but did not create the record
  // (community repeater data should remain; just remove the ownership link)
  for (const r of (ownedRepeaters || [])) {
    if (r.created_by_id !== userId) {
      await del(sr.entities.Repeater.update(r.id, { owner_user_id: null }));
    }
  }
  // Delete friendships individually (OR condition)
  for (const f of myFriendships) { await del(sr.entities.Friendship.delete(f.id)); }
  // Delete messages individually (OR condition)
  for (const m of myMessages) { await del(sr.entities.Message.delete(m.id)); }

  // Permanently delete the User record so the email is freed for re-registration
  await del(sr.entities.User.delete(userId));
}