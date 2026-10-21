import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ===== APP-SPECIFIC =====
// Backfills currently-active AdminNotifications to a single user as
// UserNotification records. Intended to run on signup so that announcements
// created before a user joined still appear in their notifications/dashboard.
//
// Input: { user_id }
// Dedup: skips announcements the user already has a matching UserNotification
// for (by title + body), so re-runs are safe and idempotent.
// Respects: active flag, expires_at, and audience (Admins-only -> admins).
// ===== END APP-SPECIFIC =====

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const userId = String(body.user_id || '');
    if (!userId) return Response.json({ error: 'user_id required' }, { status: 400 });

    const user = await base44.asServiceRole.entities.User.get(userId).catch(() => null);
    if (!user) return Response.json({ error: 'user not found' }, { status: 404 });
    if (user.account_status === 'suspended') return Response.json({ ok: true, backfilled: 0, reason: 'suspended' });
    const createdAt = new Date(user.created_date || 0).getTime();
    if (!createdAt || Date.now() - createdAt > 15 * 60 * 1000) return Response.json({ ok: true, backfilled: 0, reason: 'not_new_user' });

    const now = Date.now();
    const all = await base44.asServiceRole.entities.AdminNotification.list('-created_date', 200);
    const active = (all || []).filter((n: any) => {
      if (n.active === false) return false;
      if (n.expires_at) {
        const exp = new Date(n.expires_at).getTime();
        if (!isNaN(exp) && exp < now) return false;
      }
      if (n.audience === 'Admins' && (user.role || 'user') !== 'admin') return false;
      return true;
    });

    if (!active.length) return Response.json({ ok: true, backfilled: 0 });

    // Dedup against notifications the user already has.
    const existing = await base44.asServiceRole.entities.UserNotification.filter({ user_id: userId }, '-created_date', 500);
    const seen = new Set((existing || []).map((u: any) => `${u.title}::${u.message}`));

    const toCreate: any[] = [];
    for (const n of active) {
      if (seen.has(`${n.title}::${n.body}`)) continue;
      const t = (n.type || 'Announcement').toLowerCase();
      const notifType = t === 'alert' ? 'alert' : (t === 'maintenance' || t === 'system') ? 'system' : 'announcement';
      toCreate.push({
        user_id: userId,
        title: n.title,
        message: n.body,
        type: notifType,
        sender_name: n.created_by_name || 'Admin',
        image_url: n.image_url || undefined,
        link_url: n.link_url || undefined,
        link_label: n.link_label || undefined,
        read: false,
      });
    }

    let created = 0;
    if (toCreate.length) {
      try {
        const res = await base44.entities.UserNotification.bulkCreate(toCreate);
        created = Array.isArray(res) ? res.length : toCreate.length;
      } catch (e) { console.error('[backfill-announcements] bulkCreate failed:', e?.message || e); }
    }
    return Response.json({ ok: true, backfilled: created, considered: active.length });
  } catch (error) {
    console.error('[backfill-announcements] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}