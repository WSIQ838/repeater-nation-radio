import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin, listAll } from '../../shared/adminGuard.ts';

// ===== APP-SPECIFIC =====
// Admin-only notification management. Actions:
//   send      — create UserNotification records for all users or specific users
//   list_all  — list all UserNotifications across all users (admin history)
//   delete    — delete a single UserNotification by id (admin)
// Admin status is verified via the platform-authenticated caller (base44.auth.me()).
// ===== END APP-SPECIFIC =====

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const { error } = await requireAdmin(base44);
    if (error) return error;

    // ---- SEND ----
    if (action === 'send') {
      const { title, message, type, sender_name, link_url, link_label, recipient_ids, scheduled_date } = body;
      if (!title || !message) {
        return Response.json({ error: 'Title and message are required' }, { status: 400 });
      }

      // Determine recipient IDs
      let userIds: string[] = [];
      if (recipient_ids && Array.isArray(recipient_ids) && recipient_ids.length > 0) {
        userIds = recipient_ids;
      } else {
        // Send to all users — paginate through the complete User collection.
        const allUsers = await listAll(base44.asServiceRole.entities.User, '-created_date', 500, 20000);
        userIds = allUsers.map((u: any) => u.id);
      }

      if (!userIds.length) {
        return Response.json({ error: 'No recipients found' }, { status: 400 });
      }

      const records = userIds.map((uid) => ({
        user_id: uid,
        title,
        message,
        type: type || 'announcement',
        sender_name: sender_name || 'Admin',
        link_url: link_url || undefined,
        link_label: link_label || undefined,
        read: false,
        scheduled_date: scheduled_date || undefined,
      }));

      // Bulk create in batches of 500
      let sent = 0;
      for (let i = 0; i < records.length; i += 500) {
        try {
          await base44.entities.UserNotification.bulkCreate(records.slice(i, i + 500));
          sent += Math.min(500, records.length - i);
        } catch (err) {
          console.error('[send-notification] bulkCreate batch failed:', err?.message || err);
        }
      }

      return Response.json({ sent, total: records.length });
    }

    // ---- LIST ALL (admin history) ----
    if (action === 'list_all') {
      const { page = 1, pageSize = 50 } = body;
      const all = await listAll(base44.asServiceRole.entities.UserNotification, '-created_date', 500, 20000);
      const total = all.length;
      const p = Math.max(1, Number(page) || 1);
      const ps = Math.min(Math.max(1, Number(pageSize) || 50), 200);
      const start = (p - 1) * ps;
      const paginated = all.slice(start, start + ps);

      // Look up user names for the current page
      const userIds = [...new Set(paginated.map((n: any) => n.user_id).filter(Boolean))];
      const userNames: Record<string, string> = {};
      for (const uid of userIds) {
        try {
          const u = await base44.asServiceRole.entities.User.get(uid);
          userNames[uid] = u?.full_name || u?.email || uid;
        } catch { userNames[uid] = uid; }
      }

      return Response.json({
        notifications: paginated.map((n: any) => ({ ...n, user_name: userNames[n.user_id] || n.user_id })),
        total,
        page: p,
        pageSize: ps,
        totalPages: Math.ceil(total / ps),
      });
    }

    // ---- DELETE (admin) ----
    if (action === 'delete') {
      const { id } = body;
      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
      await base44.asServiceRole.entities.UserNotification.delete(id);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[send-notification] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}