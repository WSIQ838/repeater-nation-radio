// Automatic badge evaluation — called by workflows when a user logs a contact,
// updates their profile, or performs other badge-qualifying actions.
// Awards any earned badges without requiring an admin to manually run evaluation.
//
// This function is invoked by entity-triggered workflows (see
// base44/workflows/Evaluate Badges on *.jsonc), which do not carry a browser
// session, so it cannot require base44.auth.me()/requireAdmin() the way a
// normal endpoint would -- the workflow itself is the trusted trigger, same
// pattern as assignUserRepeaters. To keep this endpoint from being a public,
// unauthenticated way to force an expensive full-site scan, `user_id` is
// required: both workflows always pass it, and the admin panel's own
// "Evaluate all" action uses a separate, requireAdmin-gated implementation
// (adminHelpers.ts evaluateBadges) rather than this function -- so nothing
// legitimate ever needs the unbounded all-users path.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildMetricMap, metricForUser } from '../../shared/badges.ts';
import { postDiscordNotification } from '../../shared/discordWebhook.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const userId = String(body.user_id || body.userId || '');
    if (!userId) return Response.json({ error: 'user_id is required' }, { status: 400 });

    // Get all enabled automatic badges
    const allBadges = await base44.asServiceRole.entities.Badge.list('display_order', 500);
    const badges = (allBadges || []).filter(
      (b: any) => b.enabled && (b.award_method === 'automatic' || b.award_method === 'both') && b.requirement_type !== 'manual_only'
    );
    if (!badges.length) return Response.json({ evaluated: 0, awarded: 0 });

    // Get the user to evaluate
    const targetUser = await base44.asServiceRole.entities.User.get(userId).catch(() => null);
    const users: any[] = targetUser ? [targetUser] : [];
    if (!users.length) return Response.json({ evaluated: badges.length, awarded: 0 });

    // Existing awards for this user, to skip duplicates. Scoped to this one user
    // now that user_id is required. This snapshot and the create below can still
    // be seconds apart (each badge does its own awaited metric lookup in
    // between), so it's re-checked again immediately before writing -- two
    // near-simultaneous evaluate-badges calls for the same user (a retry, a
    // double workflow trigger) would otherwise both pass this snapshot check
    // and double-award the same badge.
    const existingAwards = (await base44.asServiceRole.entities.UserBadge.filter({ user_id: userId })) || [];
    const awardedSet = new Set(existingAwards.map((a: any) => a.badge_id));

    let awarded = 0;
    for (const badge of badges) {
      const amount = badge.requirement_amount || 1;
      let metricMap: Map<string, number> | null = null;
      try {
        metricMap = await buildMetricMap(base44, badge.requirement_type, badge.requirement_period);
      } catch (e) {
        console.error('[evaluate-badges] metricMap failed:', e?.message || e);
      }
      for (const user of users) {
        if (user.account_status === 'suspended') continue;
        if (awardedSet.has(badge.id)) continue;
        const val = metricMap ? (metricMap.get(user.id) || 0) : metricForUser(user, badge.requirement_type);
        if (val >= amount) {
          try {
            const dup = await base44.asServiceRole.entities.UserBadge.filter({ user_id: user.id, badge_id: badge.id }, '-created_date', 1);
            if (dup && dup.length) { awardedSet.add(badge.id); continue; }

            await base44.asServiceRole.entities.UserBadge.create({
              user_id: user.id,
              user_name: user.full_name || user.email || '',
              badge_id: badge.id,
              badge_name: badge.name,
              awarded_at: new Date().toISOString(),
              award_method: 'automatic',
              awarded_by_name: 'System',
            });
            await base44.asServiceRole.entities.UserNotification.create({
              user_id: user.id,
              title: '🏅 New Badge Earned',
              message: `You earned the ${badge.name} badge!`,
              type: 'system',
              sender_name: 'Repeater Nation',
              link_url: '/badges',
              link_label: 'View Badges',
              description: `badge_award:${badge.id}`,
            }).catch(()=>{});
            awardedSet.add(badge.id);
            awarded++;

            await postDiscordNotification(base44, 'badge_award', 'badge_award', {
              member_name: user.full_name || user.email || 'A member',
              badge_name: badge.name,
              badge_rarity_suffix: badge.rarity ? ` (${badge.rarity})` : '',
            }, {
              fields: [
                { name: 'Badge', value: badge.name, inline: true },
                { name: 'Rarity', value: badge.rarity || 'Common', inline: true },
                { name: 'Category', value: badge.category || 'Achievement', inline: true },
              ],
            });
          } catch (e) {
            console.error('[evaluate-badges] award failed:', e?.message || e);
          }
        }
      }
    }

    return Response.json({ evaluated: badges.length, awarded, user_id: userId || null });
  } catch (error) {
    console.error('[evaluate-badges] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}