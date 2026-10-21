// Shared helpers extracted from admin-api to keep the function file manageable.
// These are used only by the admin-api backend function.

import { buildMetricMap, metricForUser } from './badges.ts';
import { writeAudit } from './adminGuard.ts';

/**
 * Retrieve all repeaters in batches of 500 (Base44 list limit).
 */
export async function listAllRepeaters(base44: any): Promise<any[]> {
  const allRepeaters: any[] = [];
  let skip = 0;
  const batchSize = 500;

  while (true) {
    const batch = await base44.asServiceRole.entities.Repeater.list(
      '-created_date',
      batchSize,
      skip
    );

    if (!batch || batch.length === 0) {
      break;
    }

    allRepeaters.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    skip += batchSize;
  }

  return allRepeaters;
}

/**
 * Evaluate all automatic badges and award them to eligible users.
 * Extracted from admin-api badges:evaluate action.
 */
export async function evaluateBadges(base44: any, admin: { id: string; name: string }, ip: string): Promise<Response> {
  const allBadges = await base44.asServiceRole.entities.Badge.list('display_order', 500);

  const badges = (allBadges || []).filter(
    (b: any) =>
      b.enabled &&
      (b.award_method === 'automatic' || b.award_method === 'both') &&
      b.requirement_type !== 'manual_only'
  );

  if (!badges.length) {
    return Response.json({ evaluated: 0, awarded: 0 });
  }

  const users = (await base44.asServiceRole.entities.User.list('-created_date', 5000)) || [];
  const existing = (await base44.asServiceRole.entities.UserBadge.list('-created_date', 5000)) || [];

  const awardedSet = new Set(existing.map((a: any) => `${a.user_id}__${a.badge_id}`));

  let awarded = 0;

  for (const badge of badges) {
    const amount = badge.requirement_amount || 1;

    let metricMap: Map<string, number> | null = null;

    try {
      metricMap = await buildMetricMap(base44, badge.requirement_type, badge.requirement_period);
    } catch (e) {
      console.error('[badges:evaluate] metricMap failed', e?.message || e);
    }

    for (const user of users) {
      if (user.account_status === 'suspended' || user.account_status === 'investigation') {
        continue;
      }

      const key = `${user.id}__${badge.id}`;

      if (awardedSet.has(key)) {
        continue;
      }

      const val = metricMap
        ? metricMap.get(user.id) || 0
        : metricForUser(user, badge.requirement_type);

      if (val >= amount) {
        try {
          await base44.asServiceRole.entities.UserBadge.create({
            user_id: user.id,
            user_name: user.full_name || user.email || '',
            badge_id: badge.id,
            badge_name: badge.name,
            awarded_at: new Date().toISOString(),
            award_method: 'automatic',
            awarded_by_name: 'System',
          });

          awardedSet.add(key);
          awarded++;
        } catch (e) {
          console.error('[badges:evaluate] award failed', e?.message || e);
        }
      }
    }
  }

  await writeAudit(base44, {
    admin_id: admin.id,
    admin_name: admin.name,
    action: 'badge.evaluate',
    category: 'admin',
    target_type: 'Badge',
    target_label: 'bulk',
    after: { evaluated: badges.length, awarded },
    ip,
  });

  return Response.json({ evaluated: badges.length, awarded });
}

// Per-action permission requirements beyond the base admin.view gate.
// Sensitive write actions require a specific permission key.
export const ACTION_PERMISSIONS: Record<string, string> = {
  'users:update': 'users.manage',
  'users:setStatus': 'users.manage',
  'users:delete': 'users.manage',
  'users:invitePrecheck': 'users.create',
  'users:inviteFinish': 'users.create',
  'settings:get': 'settings.manage',
  'settings:update': 'settings.manage',
  'discord:test': 'settings.manage',
  'notifications:create': 'settings.manage',
  'notifications:update': 'settings.manage',
  'notifications:delete': 'settings.manage',
  'notifications:sendEmail': 'settings.manage',
  'repeaters:update': 'repeaters.manage',
  'repeaters:setVerification': 'repeaters.manage',
  'repeaters:verifyAll': 'repeaters.manage',
  'repeaters:bulk': 'repeaters.manage',
  'repeaters:delete': 'repeaters.manage',
  'reports:create': 'reports.manage',
  'reports:update': 'reports.manage',
  'reports:delete': 'reports.manage',
  'badges:create': 'admin.manage',
  'badges:update': 'admin.manage',
  'badges:delete': 'admin.manage',
  'badges:award': 'admin.manage',
  'badges:revoke': 'admin.manage',
  'badges:evaluate': 'admin.manage',
  'gamification:correctStreak': 'admin.manage',
  'gamification:recalculate': 'admin.manage',
  'seo:update': 'seo.manage',
  'email:templates:update': 'email.manage',
  'email:templates:test': 'email.manage',
  'email:send': 'email.manage',
  'users:callsignAction': 'callsigns.manage',
  'users:notifyAll': 'callsigns.manage',
  'fcc:reverifyAll': 'callsigns.manage',
  'reports:deleteRepeater': 'repeaters.manage',
  'audit:create': 'admin.manage',
  'apikeys:list': 'apikeys.view',
  'apikeys:usage': 'apikeys.view',
  'apikeys:revoke': 'apikeys.manage',
  'apikeys:setTier': 'apikeys.manage',
};

export const WEBHOOK_SETTING_FIELDS = [
  'changelog_webhook_url', 'bug_report_webhook_url',
  'webhook_access_requests', 'webhook_friend_requests', 'webhook_messages',
  'webhook_forum_replies', 'webhook_net_host_invites', 'webhook_repeater_submissions',
  'webhook_club_joins', 'webhook_pota_submissions', 'webhook_badge_awards', 'webhook_payments',
  'webhook_events',
];