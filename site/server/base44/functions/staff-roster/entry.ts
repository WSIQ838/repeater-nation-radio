// Public list of staff accounts, so the site can show a staff tag next to
// staff members' names wherever they appear (forums, clubs, nets, messages...).
// Exposes only what's already public: the account id, the role and its label,
// and the callsign when it's FCC-verified (so nobody gets a tag by typing in a
// staff member's callsign). No emails or other account data.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const NOT_STAFF = new Set(['user', 'member']);
const BUILT_IN: Record<string, string> = { super_admin: 'Super Admin', admin: 'Admin', moderator: 'Moderator', editor: 'Editor', support_staff: 'Support' };
const RANK: Record<string, number> = { super_admin: 0, admin: 1, moderator: 2, support_staff: 3, editor: 4 };
const HIDDEN_STATUS = new Set(['suspended', 'banned', 'deactivated', 'deleted']);

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    // Custom roles made in Admin -> Roles count as staff too.
    const roles = (await db.entities.RolePermission.list('display_order', 200).catch(() => [])) || [];
    const labels: Record<string, string> = { ...BUILT_IN };
    for (const r of roles) {
      const key = String(r?.role_key || '').trim().toLowerCase();
      if (key && !NOT_STAFF.has(key) && r.enabled !== false && !BUILT_IN[key]) labels[key] = String(r.role_name || key).slice(0, 40);
    }
    const users = (await db.entities.User.filter({ role: { $in: Object.keys(labels) } }, undefined, 500)) || [];
    const staff = users
      .filter((u: any) => u?.id && labels[u.role] && !HIDDEN_STATUS.has(String(u.account_status || '').toLowerCase()))
      .map((u: any) => ({
        user_id: String(u.id),
        role: u.role,
        label: labels[u.role],
        rank: RANK[u.role] ?? 5,
        callsign: u.callsign_verified === true && u.callsign ? String(u.callsign).trim().toUpperCase() : '',
      }))
      .sort((a: any, b: any) => a.rank - b.rank);
    return Response.json({ staff }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (err: any) {
    console.error('staff-roster error', err?.message || err);
    return Response.json({ staff: [] });
  }
}
