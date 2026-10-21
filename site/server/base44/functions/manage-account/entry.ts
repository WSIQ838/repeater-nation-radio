// Account management — exports all user data via email, and optionally
// deletes all user data across every entity. The user must be authenticated;
// they can only export/delete their own data.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { cascadeDeleteUser } from '../../shared/userCascadeDelete.ts';

function escapeHtml(str: string): string {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildEmailHtml(user: any, data: any, isDelete: boolean): string {
  const sections = [
    { label: 'Profile', count: data.profile.length },
    { label: 'Contact Logs', count: data.contacts.length },
    { label: 'Equipment', count: data.equipment.length },
    { label: 'Forum Posts', count: data.forumPosts.length },
    { label: 'Forum Replies', count: data.forumReplies.length },
    { label: 'Repeaters', count: data.repeaters.length },
    { label: 'Repeater Access Requests', count: data.accessRequests.length },
    { label: 'Repeater Comments', count: data.repeaterComments.length },
    { label: 'Clubs', count: data.clubs.length },
    { label: 'Club Memberships', count: data.memberships.length },
    { label: 'Friendships', count: data.friendships.length },
    { label: 'Messages', count: data.messages.length },
    { label: 'Badges Earned', count: data.badges.length },
    { label: 'Notifications', count: data.notifications.length },
    { label: 'Trips', count: data.trips.length },
    { label: 'Channel Plans', count: data.channelPlans.length },
    { label: 'Net Control Sessions', count: data.netControlSessions.length },
    { label: 'Net Control Rosters', count: data.netControlRosters.length },
    { label: 'Net Control Check-ins', count: data.netControlCheckIns.length },
    { label: 'Events', count: data.events.length },
    { label: 'Club Threads', count: data.clubThreads.length },
    { label: 'Club Thread Replies', count: data.clubThreadReplies.length },
    { label: 'Club Pages', count: data.clubPages.length },
    { label: 'Callsigns', count: data.callsigns.length },
    { label: 'Callsign Access Grants', count: data.callsignAccess.length },
    { label: 'Callsign Access Requests', count: data.callsignAccessRequests.length },
  ];
  const totalRecords = sections.reduce((s, x) => s + x.count, 0);

  let html = `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333;">`;
  html += `<h1 style="color: #f59e0b; margin-bottom: 4px;">Repeater Nation — Your Data ${isDelete ? 'Export (Account Deletion)' : 'Export'}</h1>`;
  html += `<p style="color: #666; margin-bottom: 20px;">Account: ${escapeHtml(user.email)} &middot; Generated: ${new Date().toLocaleString()}</p>`;
  html += `<p><strong>${totalRecords}</strong> total record(s) across ${sections.filter(s => s.count > 0).length} data categories.</p>`;
  html += `<h2 style="border-bottom: 2px solid #f59e0b; padding-bottom: 8px; margin-top: 30px;">Summary</h2><table style="width: 100%; border-collapse: collapse;"><tbody>`;
  for (const s of sections) {
    html += `<tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;">${s.label}</td><td style="padding: 6px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${s.count}</td></tr>`;
  }
  html += `</tbody></table>`;

  // Full JSON export (truncated if very large)
  const jsonStr = JSON.stringify(data, null, 2);
  const truncated = jsonStr.length > 200000 ? jsonStr.substring(0, 200000) + '\n\n... (truncated for email size — contact support for the complete export)' : jsonStr;
  html += `<h2 style="border-bottom: 2px solid #f59e0b; padding-bottom: 8px; margin-top: 30px;">Full Data Export (JSON)</h2>`;
  html += `<p style="font-size: 12px; color: #999;">Copy the JSON below and save it to a <code>.json</code> file for your records.</p>`;
  html += `<pre style="background: #f5f5f5; padding: 15px; border-radius: 8px; font-size: 11px; overflow-x: auto; white-space: pre-wrap; border: 1px solid #ddd;">${escapeHtml(truncated)}</pre>`;

  if (isDelete) {
    html += `<div style="margin-top: 30px; padding: 15px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px;"><strong>Account Deletion:</strong> All your data has been permanently deleted from Repeater Nation. Your login account has been deactivated. If you did not request this, contact support immediately.</div>`;
  }
  html += `</body></html>`;
  return html;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || 'export');
    const userId = user.id;
    const sr = base44.asServiceRole;

    // Gather all user data in parallel
    const [
      profiles, contacts, equipment, forumPosts, forumReplies,
      repeaters, createdAccessReqs, repeaterComments, clubs, memberships,
      allFriendships, allMessages, userBadges, userNotifications, trips,
      channelPlans, netSessions, netRosters, netCheckIns, ownerAccessReqs,
      events, clubThreads, clubThreadReplies, clubPages,
      callsigns, callsignAccess, callsignAccessRequests, ownedRepeaters,
    ] = await Promise.all([
      sr.entities.Profile.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.ContactLog.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.Equipment.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.ForumPost.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.ForumReply.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.Repeater.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.RepeaterAccessRequest.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.RepeaterComment.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.Club.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.Membership.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.Friendship.list('-created_date', 5000).catch(() => []),
      sr.entities.Message.list('-created_date', 5000).catch(() => []),
      sr.entities.UserBadge.filter({ user_id: userId }).catch(() => []),
      sr.entities.UserNotification.filter({ user_id: userId }).catch(() => []),
      sr.entities.Trip.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.ChannelPlan.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.NetControlSession.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.NetControlRoster.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.NetControlCheckIn.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.RepeaterAccessRequest.filter({ owner_id: userId }).catch(() => []),
      sr.entities.Event.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.ClubThread.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.ClubThreadReply.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.ClubPage.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.Callsign.filter({ primary_user_id: userId }).catch(() => []),
      sr.entities.CallsignAccess.filter({ user_id: userId }).catch(() => []),
      sr.entities.CallsignAccessRequest.filter({ requester_user_id: userId }).catch(() => []),
      sr.entities.Repeater.filter({ owner_user_id: userId }).catch(() => []),
    ]);

    const myFriendships = (allFriendships || []).filter((f: any) => f.requester_id === userId || f.recipient_id === userId);
    const myMessages = (allMessages || []).filter((m: any) => m.sender_id === userId || m.recipient_id === userId);
    const allAccessReqs = [...(createdAccessReqs || []), ...(ownerAccessReqs || [])];

    const data = {
      user: { id: user.id, email: user.email, full_name: user.full_name, callsign: user.callsign, created_date: user.created_date },
      profile: profiles || [],
      contacts: contacts || [],
      equipment: equipment || [],
      forumPosts: forumPosts || [],
      forumReplies: forumReplies || [],
      repeaters: repeaters || [],
      accessRequests: allAccessReqs,
      repeaterComments: repeaterComments || [],
      clubs: clubs || [],
      memberships: memberships || [],
      friendships: myFriendships,
      messages: myMessages,
      badges: userBadges || [],
      notifications: userNotifications || [],
      trips: trips || [],
      channelPlans: channelPlans || [],
      netControlSessions: netSessions || [],
      netControlRosters: netRosters || [],
      netControlCheckIns: netCheckIns || [],
      events: events || [],
      clubThreads: clubThreads || [],
      clubThreadReplies: clubThreadReplies || [],
      clubPages: clubPages || [],
      callsigns: callsigns || [],
      callsignAccess: callsignAccess || [],
      callsignAccessRequests: callsignAccessRequests || [],
    };

    // Email the data to the user
    try {
      await base44.integrations.Core.SendEmail({
        to: user.email,
        subject: mode === 'delete' ? 'Your Repeater Nation data export (account deletion)' : 'Your Repeater Nation data export',
        html: buildEmailHtml(user, data, mode === 'delete'),
      });
    } catch (e) {
      console.error('[manage-account] email failed:', e?.message || e);
      return Response.json({ error: 'Could not send data email. Please try again or contact support.' }, { status: 500 });
    }

    if (mode === 'delete') {
      await cascadeDeleteUser(sr, userId);
      return Response.json({ ok: true, deleted: true, email: user.email });
    }

    return Response.json({ ok: true, exported: true, email: user.email });
  } catch (error) {
    console.error('[manage-account] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}