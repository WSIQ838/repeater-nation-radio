// Shared net gamification helpers — streak tracking, badge evaluation,
// and achievement notifications for club net check-ins.
// Used by the record-net-checkin backend function and admin recalculation.

const STREAK_GRACE_DAYS: Record<string, number> = {
  weekly: 10,
  monthly: 45,
  none: 14,
};

const DEFAULT_QUALIFYING_TYPES = ['standard', 'late', 'guest', 'mobile'];
const STREAK_MILESTONES = [5, 10, 25, 50, 100];
const NET_REQ_TYPES = ['net_checkins', 'net_nets_attended', 'net_streak', 'first_net_checkin', 'clubs_participated'];

export async function resolveUserIdFromCallsign(base44: any, callsign: string): Promise<string | null> {
  if (!callsign) return null;
  const cs = callsign.toUpperCase().trim();
  const profiles = await base44.asServiceRole.entities.Profile.filter({ callsign: cs }, '-updated_date', 5);
  return (profiles || [])[0]?.created_by_id || null;
}

export function computeStreak(lastCheckinDate: string | null, currentStreak: number, netSchedule: string, now = new Date()): number {
  if (!lastCheckinDate) return 1;
  const last = new Date(lastCheckinDate);
  if (isNaN(last.getTime())) return 1;
  const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  const grace = STREAK_GRACE_DAYS[netSchedule] || STREAK_GRACE_DAYS.none;
  if (diffDays <= grace) return (currentStreak || 0) + 1;
  return 1;
}

export async function processNetCheckIn(base44: any, opts: {
  checkinId: string; sessionId: string; clubId: string; clubName: string;
  callsign: string; checkinType: string; checkinTime: string; netName: string;
}): Promise<void> {
  const { sessionId, clubId, clubName, callsign, checkinType, checkinTime } = opts;
  if (!clubId) return;

  // Check global gamification setting
  const settings = (await base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1)) || [];
  if (settings[0]?.gamification_enabled === false) return;

  // Check club gamification setting
  const club = await base44.asServiceRole.entities.Club.get(clubId).catch(() => null);
  if (!club || club.gamification_enabled === false) return;

  // Check if this check-in type qualifies
  let qualifyingTypes = DEFAULT_QUALIFYING_TYPES;
  try { if (club.qualifying_checkin_types) qualifyingTypes = JSON.parse(club.qualifying_checkin_types); } catch {}
  const type = checkinType || (opts.checkinId ? 'standard' : 'standard');
  if (!qualifyingTypes.includes(type)) return;

  // Resolve user from callsign
  const userId = await resolveUserIdFromCallsign(base44, callsign);
  if (!userId) return;

  const user = await base44.asServiceRole.entities.User.get(userId).catch(() => null);
  const userName = user?.full_name || user?.email || '';

  // Get or create streak record
  const existing = await base44.asServiceRole.entities.NetStreak.filter({ user_id: userId, club_id: clubId }, '-updated_date', 1);
  let streak = (existing || [])[0];

  // Prevent duplicate check-ins for the same session
  if (streak?.last_session_id === sessionId) return;

  // Calculate new streak
  const netSchedule = club.net_schedule || 'none';
  const newCurrentStreak = computeStreak(streak?.last_checkin_date || null, streak?.current_streak || 0, netSchedule, new Date(checkinTime));
  const newLongestStreak = Math.max(streak?.longest_streak || 0, newCurrentStreak);
  const newTotalCheckins = (streak?.total_checkins || 0) + 1;
  const newTotalNets = (streak?.total_nets_attended || 0) + 1;

  const updates: any = {
    current_streak: newCurrentStreak, longest_streak: newLongestStreak,
    total_checkins: newTotalCheckins, total_nets_attended: newTotalNets,
    last_checkin_date: checkinTime, last_session_id: sessionId,
    user_name: userName, user_callsign: callsign, club_name: clubName || club.name,
  };

  if (streak) {
    await base44.asServiceRole.entities.NetStreak.update(streak.id, updates);
  } else {
    await base44.asServiceRole.entities.NetStreak.create({ user_id: userId, club_id: clubId, first_checkin_date: checkinTime, ...updates });
  }

  // Update club streak badge if new longest
  if (newCurrentStreak > (streak?.longest_streak || 0)) {
    await updateClubStreakBadge(base44, userId, userName, clubId, clubName || club.name, newCurrentStreak);
  }

  // Evaluate badges and send notifications
  await evaluateAndNotify(base44, userId, userName, clubId, clubName || club.name, newCurrentStreak, newLongestStreak, newTotalCheckins, newTotalNets);
}

async function updateClubStreakBadge(base44: any, userId: string, userName: string, clubId: string, clubName: string, longestStreak: number): Promise<void> {
  const existing = await base44.asServiceRole.entities.ClubStreakBadge.filter({ user_id: userId, club_id: clubId }, '-updated_date', 1);
  const badge = (existing || [])[0];
  if (badge) {
    if (longestStreak > (badge.longest_streak || 0)) {
      await base44.asServiceRole.entities.ClubStreakBadge.update(badge.id, { longest_streak: longestStreak, club_name: clubName, user_name: userName });
    }
  } else {
    await base44.asServiceRole.entities.ClubStreakBadge.create({
      user_id: userId, user_name: userName, club_id: clubId, club_name: clubName,
      longest_streak: longestStreak, awarded_at: new Date().toISOString(),
    });
  }
}

async function evaluateAndNotify(base44: any, userId: string, userName: string, clubId: string, clubName: string, currentStreak: number, longestStreak: number, totalCheckins: number, totalNets: number): Promise<void> {
  const allBadges = await base44.asServiceRole.entities.Badge.list('display_order', 500);
  const badges = (allBadges || []).filter((b: any) => b.enabled && (b.award_method === 'automatic' || b.award_method === 'both') && NET_REQ_TYPES.includes(b.requirement_type));

  const allAwards = (await base44.asServiceRole.entities.UserBadge.filter({ user_id: userId }, '-awarded_at', 500)) || [];
  const awardedSet = new Set(allAwards.map((a: any) => a.badge_id));

  // Global metrics across all clubs
  const allStreaks = (await base44.asServiceRole.entities.NetStreak.filter({ user_id: userId }, '-updated_date', 500)) || [];
  const globalCheckins = allStreaks.reduce((s: number, r: any) => s + (r.total_checkins || 0), 0);
  const globalNets = allStreaks.reduce((s: number, r: any) => s + (r.total_nets_attended || 0), 0);
  const globalLongestStreak = allStreaks.reduce((m: number, r: any) => Math.max(m, r.longest_streak || 0), 0);
  const clubsParticipated = allStreaks.length;

  for (const badge of badges) {
    if (awardedSet.has(badge.id)) continue;
    const amount = badge.requirement_amount || 1;
    let met = false;
    switch (badge.requirement_type) {
      case 'net_checkins': met = globalCheckins >= amount; break;
      case 'net_nets_attended': met = globalNets >= amount; break;
      case 'net_streak': met = globalLongestStreak >= amount; break;
      case 'first_net_checkin': met = globalCheckins >= 1; break;
      case 'clubs_participated': met = clubsParticipated >= amount; break;
    }
    if (met) {
      try {
        await base44.asServiceRole.entities.UserBadge.create({
          user_id: userId, user_name: userName, badge_id: badge.id, badge_name: badge.name,
          awarded_at: new Date().toISOString(), award_method: 'automatic', awarded_by_name: 'System',
        });
        awardedSet.add(badge.id);
        await sendAchievementNotification(base44, userId, '🏆 New Badge!', `You earned the "${badge.name}" badge.`);
      } catch (e) { console.error('[netGamification] badge award failed:', e?.message || e); }
    }
  }

  // Streak milestone notifications
  if (STREAK_MILESTONES.includes(currentStreak)) {
    await sendAchievementNotification(base44, userId, '🔥 New Achievement!', `You reached a ${currentStreak}-net check-in streak with ${clubName}!`);
  }
  // Club streak badge milestone notification
  if (STREAK_MILESTONES.includes(longestStreak) && longestStreak === currentStreak) {
    await sendAchievementNotification(base44, userId, '🏆 New Badge!', `You earned the ${clubName} ${longestStreak}-Net Streak badge.`);
  }
}

export async function sendAchievementNotification(base44: any, userId: string, title: string, message: string): Promise<void> {
  try {
    await base44.asServiceRole.entities.UserNotification.create({
      user_id: userId, title, message, type: 'announcement', sender_name: 'Gamification System',
    });
  } catch (e) { console.error('[netGamification] notification failed:', e?.message || e); }
}

// Recalculate a user's streak for a club from actual check-in records.
// Used when a check-in is deleted/corrected or for admin bulk recalculation.
export async function recalculateStreak(base44: any, userId: string, clubId: string): Promise<void> {
  const user = await base44.asServiceRole.entities.User.get(userId).catch(() => null);
  if (!user?.callsign) return;
  const cs = user.callsign.toUpperCase();
  const club = await base44.asServiceRole.entities.Club.get(clubId).catch(() => null);
  if (!club) return;

  let qualifyingTypes = DEFAULT_QUALIFYING_TYPES;
  try { if (club.qualifying_checkin_types) qualifyingTypes = JSON.parse(club.qualifying_checkin_types); } catch {}

  const sessions = (await base44.asServiceRole.entities.NetControlSession.filter({ club_id: clubId }, 'scheduled_date', 500)) || [];
  const sessionIds = new Set(sessions.map((s: any) => s.id));
  if (!sessionIds.size) return;

  const allCheckIns = (await base44.asServiceRole.entities.NetControlCheckIn.list('-check_in_time', 5000)) || [];
  const userCheckIns = allCheckIns
    .filter((c: any) => sessionIds.has(c.session_id) && c.callsign?.toUpperCase() === cs && c.status === 'checked_in')
    .filter((c: any) => qualifyingTypes.includes(c.checkin_type || 'standard'))
    .sort((a: any, b: any) => new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime());

  if (!userCheckIns.length) {
    const existing = await base44.asServiceRole.entities.NetStreak.filter({ user_id: userId, club_id: clubId }, '-updated_date', 1);
    if (existing?.[0]) await base44.asServiceRole.entities.NetStreak.delete(existing[0].id);
    return;
  }

  // Deduplicate by session
  const seen = new Set<string>();
  const deduped = userCheckIns.filter((c: any) => { if (seen.has(c.session_id)) return false; seen.add(c.session_id); return true; });

  const netSchedule = club.net_schedule || 'none';
  let currentStreak = 0, longestStreak = 0;
  let prevDate: Date | null = null;
  for (const ci of deduped) {
    const date = new Date(ci.check_in_time);
    if (prevDate) {
      const diffDays = (date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      const grace = STREAK_GRACE_DAYS[netSchedule] || STREAK_GRACE_DAYS.none;
      currentStreak = diffDays <= grace ? currentStreak + 1 : 1;
    } else { currentStreak = 1; }
    longestStreak = Math.max(longestStreak, currentStreak);
    prevDate = date;
  }

  const existing = await base44.asServiceRole.entities.NetStreak.filter({ user_id: userId, club_id: clubId }, '-updated_date', 1);
  const streak = (existing || [])[0];
  const lastCi = deduped[deduped.length - 1], firstCi = deduped[0];
  const updates: any = {
    current_streak: currentStreak, longest_streak: longestStreak,
    total_checkins: deduped.length, total_nets_attended: deduped.length,
    last_checkin_date: lastCi.check_in_time, first_checkin_date: firstCi.check_in_time,
    last_session_id: lastCi.session_id, user_name: user.full_name || user.email || '',
    user_callsign: user.callsign, club_name: club.name,
  };
  if (streak) { await base44.asServiceRole.entities.NetStreak.update(streak.id, updates); }
  else { await base44.asServiceRole.entities.NetStreak.create({ user_id: userId, club_id: clubId, ...updates }); }

  await updateClubStreakBadge(base44, userId, user.full_name || user.email || '', clubId, club.name, longestStreak);
}