// Frontend permission check helper.
// Reads from the user's pre-computed `permissions` field (JSON string).
// Server-side enforcement is the real security layer — this is for UI gating only.

export function hasPermission(user, key) {
  if (!user) return false;
  if (['admin', 'super_admin'].includes(user.role) || ['admin', 'super_admin'].includes(user._app_role)) return true;
  if (!user.permissions) return false;
  try {
    const perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
    return perms[key] === true;
  } catch {
    return false;
  }
}

export function getUserPermissions(user) {
  if (!user) return {};
  if (['admin', 'super_admin'].includes(user.role) || ['admin', 'super_admin'].includes(user._app_role)) return null; // null = all permissions
  if (!user.permissions) return {};
  try {
    return typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
  } catch {
    return {};
  }
}
// Staff seniority, most senior first. Admins manage everyone but Super Admins;
// every other role (moderators, support staff, ...) only manages accounts
// strictly below its own and only hands out lower roles. Custom roles have no
// fixed place, so only admins can touch or assign them. admin-api enforces the
// same rule (base44/shared/permissions.ts); this copy is for the UI.
const ROLE_RANK = { super_admin: 0, admin: 1, moderator: 2, support_staff: 3, editor: 4, member: 5, user: 6 };

export function isAdminRole(user) {
  return ['admin', 'super_admin'].includes(user?.role) || ['admin', 'super_admin'].includes(user?._app_role);
}

export function canManageRole(actor, targetRole) {
  const role = actor?.role || actor?._app_role || 'user';
  const target = targetRole || 'user';
  if (role === 'super_admin') return true;
  if (role === 'admin') return target !== 'super_admin';
  const mine = ROLE_RANK[role];
  const theirs = ROLE_RANK[target];
  return mine !== undefined && theirs !== undefined && theirs > mine;
}
