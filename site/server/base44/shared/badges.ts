// Shared badge evaluation helpers used by admin-api badge actions.
// Computes a per-user metric for each requirement type so badges can be
// awarded automatically and "progressing" counts can be derived.

const PERIOD_MS: Record<string, number> = {
  all_time: 0,
  daily: 86400000,
  weekly: 7 * 86400000,
  monthly: 30 * 86400000,
  yearly: 365 * 86400000,
};

function inPeriod(created: string | undefined, period: string): boolean {
  if (!created) return false;
  if (!period || period === 'all_time' || !PERIOD_MS[period]) return true;
  const d = new Date(created).getTime();
  if (isNaN(d)) return false;
  return Date.now() - d < PERIOD_MS[period];
}

// Returns a Map<userId, count> for count-based requirement types, respecting
// the time period. Returns null for per-user types (account_age) that are
// computed inline from the user record.
export async function buildMetricMap(
  base44: any,
  requirementType: string,
  period: string
): Promise<Map<string, number> | null> {
  const map = new Map<string, number>();
  const add = (uid: string, n = 1) => {
    if (uid) map.set(uid, (map.get(uid) || 0) + n);
  };

  switch (requirementType) {
    case 'contacts': {
      const items = await base44.asServiceRole.entities.ContactLog.list('-created_date', 5000);
      (items || []).forEach((x: any) => {
        if (inPeriod(x.created_date, period)) add(x.created_by_id);
      });
      return map;
    }
    case 'repeater_contacts': {
      const items = await base44.asServiceRole.entities.ContactLog.list('-created_date', 5000);
      (items || []).forEach((x: any) => {
        if ((x.mode === 'Repeater' || x.repeater_id) && inPeriod(x.created_date, period)) add(x.created_by_id);
      });
      return map;
    }
    case 'unique_repeaters': {
      const items = await base44.asServiceRole.entities.ContactLog.list('-created_date', 5000);
      const seen = new Map<string, Set<string>>();
      (items || []).forEach((x: any) => {
        if (!x.repeater_id || !inPeriod(x.created_date, period)) return;
        let s = seen.get(x.created_by_id);
        if (!s) { s = new Set<string>(); seen.set(x.created_by_id, s); }
        s.add(x.repeater_id);
      });
      seen.forEach((s, uid) => add(uid, s.size));
      return map;
    }
    case 'equipment': {
      const items = await base44.asServiceRole.entities.Equipment.list('-created_date', 5000);
      (items || []).forEach((x: any) => {
        if (inPeriod(x.created_date, period)) add(x.created_by_id);
      });
      return map;
    }
    case 'repeater_contributions': {
      const items = await base44.asServiceRole.entities.Repeater.list('-created_date', 5000);
      (items || []).forEach((x: any) => {
        if (x.verification === 'Verified' && inPeriod(x.created_date, period)) add(x.created_by_id);
      });
      return map;
    }
    case 'repeater_access_requests': {
      const items = await base44.asServiceRole.entities.RepeaterAccessRequest.list('-created_date', 5000);
      (items || []).forEach((x: any) => {
        if (inPeriod(x.created_date, period)) add(x.created_by_id);
      });
      return map;
    }
    case 'club_memberships': {
      const items = await base44.asServiceRole.entities.Membership.list('-created_date', 5000);
      (items || []).forEach((x: any) => {
        if (inPeriod(x.created_date, period)) add(x.created_by_id);
      });
      return map;
    }
    case 'club_owner': {
      const items = await base44.asServiceRole.entities.Club.list('-created_date', 5000);
      (items || []).forEach((x: any) => {
        if (inPeriod(x.created_date, period)) add(x.created_by_id);
      });
      return map;
    }
    case 'forum_posts': {
      const items = await base44.asServiceRole.entities.ForumPost.list('-created_date', 5000);
      (items || []).forEach((x: any) => {
        if (inPeriod(x.created_date, period)) add(x.created_by_id);
      });
      return map;
    }
    case 'forum_replies': {
      const items = await base44.asServiceRole.entities.ForumReply.list('-created_date', 5000);
      (items || []).forEach((x: any) => {
        if (inPeriod(x.created_date, period)) add(x.created_by_id);
      });
      return map;
    }
    case 'profile_complete': {
      const items = await base44.asServiceRole.entities.Profile.list('-created_date', 5000);
      (items || []).forEach((x: any) => {
        const complete = !!(x.avatar_url && x.bio && x.callsign && x.location);
        if (complete) add(x.created_by_id, 1);
      });
      return map;
    }
    case 'bug_reports':
    case 'feature_requests':
    case 'accepted_feature_requests':
    case 'directory_views':
    case 'map_discoveries':
    case 'helpful_interactions':
      // No stored tracking for these yet — manual awarding only.
      return map;
    case 'net_checkins': {
      const items = await base44.asServiceRole.entities.NetStreak.list('-updated_date', 5000);
      (items || []).forEach((x: any) => {
        if (inPeriod(x.updated_date, period)) add(x.user_id, x.total_checkins || 0);
      });
      return map;
    }
    case 'net_nets_attended': {
      const items = await base44.asServiceRole.entities.NetStreak.list('-updated_date', 5000);
      (items || []).forEach((x: any) => {
        if (inPeriod(x.updated_date, period)) add(x.user_id, x.total_nets_attended || 0);
      });
      return map;
    }
    case 'net_streak': {
      const items = await base44.asServiceRole.entities.NetStreak.list('-updated_date', 5000);
      (items || []).forEach((x: any) => {
        const v = x.longest_streak || 0;
        const cur = map.get(x.user_id) || 0;
        if (v > cur) map.set(x.user_id, v);
      });
      return map;
    }
    case 'first_net_checkin': {
      const items = await base44.asServiceRole.entities.NetStreak.list('-updated_date', 5000);
      (items || []).forEach((x: any) => {
        if ((x.total_checkins || 0) >= 1) {
          const cur = map.get(x.user_id) || 0;
          if (cur < 1) map.set(x.user_id, 1);
        }
      });
      return map;
    }
    case 'clubs_participated': {
      const items = await base44.asServiceRole.entities.NetStreak.list('-updated_date', 5000);
      (items || []).forEach((x: any) => {
        if (inPeriod(x.updated_date, period)) add(x.user_id, 1);
      });
      return map;
    }
    case 'account_age':
      return null; // handled per-user
    default:
      return null;
  }
}

// Computes a single user's metric for non-count-based types.
export function metricForUser(user: any, requirementType: string): number {
  if (requirementType === 'account_age') {
    if (!user?.created_date) return 0;
    return Math.floor((Date.now() - new Date(user.created_date).getTime()) / 86400000);
  }
  return 0;
}