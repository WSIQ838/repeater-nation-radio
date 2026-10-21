import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin, listAll } from '../../shared/adminGuard.ts';

// ===== APP-SPECIFIC =====
// Lists all app users for the admin-only Members management page. Runs as
// service role because the built-in User RLS blocks client-side User.list even
// for admins in this app. Verifies the caller is an admin before returning
// anything — non-admins get 403.
// ===== END APP-SPECIFIC =====

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const { error } = await requireAdmin(base44);
    if (error) return error;

    const users = await listAll(base44.asServiceRole.entities.User, '-created_date', 500, 20000);
    const safe = (users || []).map((u) => ({
      id: u.id,
      full_name: u.full_name || '',
      email: u.email || '',
      role: u.role || 'user',
      callsign: u.callsign || '',
      created_date: u.created_date,
    }));
    return Response.json({ users: safe });
  } catch (error) {
    console.error('[listMembers] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}