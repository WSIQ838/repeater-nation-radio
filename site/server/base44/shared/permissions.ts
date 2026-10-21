// Centralized permission system for Repeater Nation.
// Defines the permission catalog, default role configurations,
// and server-side permission checking used by all backend functions.

export const PERMISSION_TYPES = ['view', 'create', 'edit', 'delete', 'manage', 'approve'];

export const PERMISSION_CATEGORIES = [
  { key: 'users', label: 'Users', description: 'Manage platform users, roles, and account status' },
  { key: 'callsigns', label: 'Callsigns', description: 'GMRS callsign verification and access management' },
  { key: 'repeaters', label: 'Repeaters', description: 'Repeater directory submissions and management' },
  { key: 'qso', label: 'QSO / Logging', description: 'Contact log entries and logbook management' },
  { key: 'tools', label: 'Operator Tools', description: 'Calculators and operator utility tools' },
  { key: 'equipment', label: 'Equipment Manager', description: 'Equipment inventory, checkout, and maintenance' },
  { key: 'netcontrol', label: 'Net Control', description: 'Net control sessions and check-in management' },
  { key: 'trips', label: 'Trip Planner', description: 'Trip planning and route optimization' },
  { key: 'clubs', label: 'Clubs', description: 'Club creation, membership, and management' },
  { key: 'events', label: 'Events', description: 'Community events, nets, and gatherings' },
  { key: 'messaging', label: 'Messaging', description: 'Direct messaging between members' },
  { key: 'reports', label: 'Reports', description: 'User-submitted reports and moderation' },
  { key: 'content', label: 'Content', description: 'Forum posts, replies, and community content' },
  { key: 'tags', label: 'Tags & Categories', description: 'Tag and category system management' },
  { key: 'seo', label: 'SEO', description: 'SEO and GEO optimization settings' },
  { key: 'email', label: 'Email', description: 'Outbound email templates and member email' },
  { key: 'admin', label: 'Admin Panel', description: 'Administrative panel access and navigation' },
  { key: 'settings', label: 'System Settings', description: 'Platform-wide configuration and settings' },
  { key: 'audit', label: 'Audit Logs', description: 'System audit log access and review' },
  { key: 'radio', label: 'Web Radio', description: 'Site-wide voice radio zones, channels, and configuration' },
  { key: 'apikeys', label: 'API Keys', description: 'Developer API key issuance and public API access' },
];

export function allPermissionKeys(): string[] {
  const keys: string[] = [];
  for (const cat of PERMISSION_CATEGORIES) {
    for (const type of PERMISSION_TYPES) {
      keys.push(`${cat.key}.${type}`);
    }
  }
  return keys;
}

export function fullPermissions(): Record<string, boolean> {
  const perms: Record<string, boolean> = {};
  for (const key of allPermissionKeys()) perms[key] = true;
  return perms;
}

export function emptyPermissions(): Record<string, boolean> {
  const perms: Record<string, boolean> = {};
  for (const key of allPermissionKeys()) perms[key] = false;
  return perms;
}

// Default role definitions — seeded on first access.
export const DEFAULT_ROLES = [
  {
    role_key: 'super_admin', role_name: 'Super Admin',
    description: 'Full system access with no restrictions. Protected role — only Super Admins can modify.',
    is_system: true, is_protected: true, display_order: 0,
    buildPermissions: () => fullPermissions(),
  },
  {
    role_key: 'admin', role_name: 'Administrator',
    description: 'Full administrative access except Super Admin management and system deletion.',
    is_system: true, is_protected: false, display_order: 1,
    buildPermissions: () => {
      const p = fullPermissions();
      p['settings.delete'] = false;
      return p;
    },
  },
  {
    role_key: 'moderator', role_name: 'Moderator',
    description: 'Content moderation and member management without system config access.',
    is_system: true, is_protected: false, display_order: 2,
    buildPermissions: () => {
      const p = emptyPermissions();
      for (const k of allPermissionKeys()) if (k.endsWith('.view')) p[k] = true;
      for (const cat of ['repeaters','reports','content','events','clubs','tags','messaging','callsigns','apikeys']) {
        for (const t of ['create','edit','delete','manage','approve']) p[`${cat}.${t}`] = true;
      }
      p['users.view'] = true; p['users.edit'] = true; p['users.manage'] = true;
      p['admin.view'] = true; p['audit.view'] = true;
      return p;
    },
  },
  {
    role_key: 'support_staff', role_name: 'Support Staff',
    description: 'Member support, report handling, and messaging.',
    is_system: true, is_protected: false, display_order: 3,
    buildPermissions: () => {
      const p = emptyPermissions();
      for (const k of allPermissionKeys()) if (k.endsWith('.view')) p[k] = true;
      for (const t of ['create','edit','manage']) { p[`reports.${t}`] = true; p[`messaging.${t}`] = true; }
      p['users.view'] = true; p['users.edit'] = true;
      p['callsigns.view'] = true;
      return p;
    },
  },
  {
    role_key: 'editor', role_name: 'Editor',
    description: 'Content creation and editing across community features.',
    is_system: true, is_protected: false, display_order: 4,
    buildPermissions: () => {
      const p = emptyPermissions();
      for (const k of allPermissionKeys()) if (k.endsWith('.view')) p[k] = true;
      for (const cat of ['repeaters','qso','equipment','netcontrol','trips','clubs','events','content','tags']) {
        for (const t of ['create','edit']) p[`${cat}.${t}`] = true;
      }
      return p;
    },
  },
  {
    role_key: 'member', role_name: 'Verified Operator',
    description: 'Verified GMRS operator with full community feature access.',
    is_system: true, is_protected: false, display_order: 5,
    buildPermissions: () => {
      const p = emptyPermissions();
      for (const cat of ['repeaters','qso','equipment','netcontrol','trips','clubs','events','content','messaging','tools','apikeys']) {
        for (const t of ['view','create','edit','delete']) p[`${cat}.${t}`] = true;
      }
      p['reports.create'] = true;
      // Radio zone/channel setup stays admin-only, but any verified member
      // can open and use the radio (listen/transmit gating happens
      // separately, based on callsign verification and per-channel role
      // requirements, not a blanket permission).
      p['radio.view'] = true;
      return p;
    },
  },
  {
    role_key: 'user', role_name: 'User',
    description: 'Basic registered user with view-only access to public features.',
    is_system: true, is_protected: false, display_order: 6,
    buildPermissions: () => {
      const p = emptyPermissions();
      for (const cat of ['repeaters','qso','equipment','netcontrol','trips','clubs','events','content','tools','radio']) {
        p[`${cat}.view`] = true;
      }
      p['messaging.view'] = true; p['messaging.create'] = true;
      p['reports.create'] = true;
      return p;
    },
  },
];

// Staff seniority, most senior first. Admins manage everyone but Super
// Admins; every other role (moderators, support staff, ...) only manages
// accounts strictly below its own and only hands out lower roles. Custom roles
// have no fixed place, so only admins can touch or assign them. The frontend
// mirrors this in src/lib/permissions.js.
export const ROLE_RANK: Record<string, number> = {
  super_admin: 0, admin: 1, moderator: 2, support_staff: 3, editor: 4, member: 5, user: 6,
};

export function canManageRole(actor: any, targetRole: string): boolean {
  const role = actor?.role || actor?._app_role || 'user';
  const target = targetRole || 'user';
  if (role === 'super_admin') return true;
  if (role === 'admin') return target !== 'super_admin';
  const mine = ROLE_RANK[role];
  const theirs = ROLE_RANK[target];
  return mine !== undefined && theirs !== undefined && theirs > mine;
}

// Quick check using the user's pre-computed permissions field.
export function hasPermission(user: any, key: string): boolean {
  if (!user) return false;
  if (user.role === 'super_admin' || user._app_role === 'super_admin') return true;
  if (!user.permissions) return false;
  try {
    const perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
    return perms[key] === true;
  } catch { return false; }
}

// Server-side check that loads role permissions + overrides from the database.
// A per-user override wins either way (Grant or Deny), the same rule
// updateUserPermissions uses for the user's cached `permissions` field and the
// override dialog shows as "effective". Only honouring Deny here meant a Grant
// showed in the UI (and in the nav) but every backend call still said 403.
export async function checkPermission(base44: any, user: any, key: string): Promise<boolean> {
  if (!user) return false;
  if (user.role === 'super_admin' || user._app_role === 'super_admin') return true;
  try {
    const overrides = await base44.asServiceRole.entities.UserPermissionOverride.filter({ user_id: user.id, permission_key: key }, '-created_date', 1);
    if (overrides && overrides.length) return overrides[0].allowed === true;
    const rolePerms = await base44.asServiceRole.entities.RolePermission.filter({ role_key: user.role || user._app_role || 'user' }, 'display_order', 1);
    if (!rolePerms || !rolePerms.length) return false;
    let perms: Record<string, boolean> = {};
    try { perms = JSON.parse(rolePerms[0].permissions || '{}'); } catch { return false; }
    return perms[key] === true;
  } catch (e) {
    console.error('[permissions] checkPermission error:', e?.message || e);
    return false;
  }
}

export async function seedDefaultRoles(base44: any): Promise<void> {
  try {
    const existing = await base44.asServiceRole.entities.RolePermission.list('display_order', 100);
    if (!existing || !existing.length) {
      for (const role of DEFAULT_ROLES) {
        await base44.asServiceRole.entities.RolePermission.create({
          role_key: role.role_key, role_name: role.role_name, description: role.description,
          permissions: JSON.stringify(role.buildPermissions()),
          is_system: role.is_system, is_protected: role.is_protected || false,
          enabled: true, display_order: role.display_order, user_count: 0,
        });
      }
      return;
    }
    // Self-healing backfill: a permission KEY added to DEFAULT_ROLES after
    // a role's RolePermission row was first created (e.g. a brand-new
    // category like apikeys) would otherwise never reach that row -- this
    // function returns immediately above once any rows exist, so every
    // account stays silently denied a permission that's "granted" only in
    // code, forever. Runs on every roles:list call (cheap, and merges only
    // KEYS that don't exist yet in the stored JSON), so it self-heals the
    // next time any admin opens Roles & Permissions -- never touches a key
    // an admin already customized, since only missing keys are added.
    for (const row of existing) {
      const roleDef = DEFAULT_ROLES.find((r) => r.role_key === row.role_key);
      if (!roleDef) continue;
      let stored: Record<string, boolean>;
      try { stored = JSON.parse(row.permissions || '{}'); } catch { continue; }
      const defaults = roleDef.buildPermissions();
      let changed = false;
      for (const key of Object.keys(defaults)) {
        if (!(key in stored)) { stored[key] = defaults[key]; changed = true; }
      }
      if (!changed) continue;
      await base44.asServiceRole.entities.RolePermission.update(row.id, { permissions: JSON.stringify(stored) }).catch(() => {});
      await updateAllUsersWithRole(base44, row.role_key).catch(() => {});
    }
  } catch (e) { console.error('[permissions] seedDefaultRoles error:', e?.message || e); }
}

export async function updateUserPermissions(base44: any, userId: string, roleKey: string): Promise<void> {
  try {
    const rolePerms = await base44.asServiceRole.entities.RolePermission.filter({ role_key: roleKey }, 'display_order', 1);
    if (!rolePerms || !rolePerms.length) return;
    let perms: Record<string, boolean> = {};
    try { perms = JSON.parse(rolePerms[0].permissions || '{}'); } catch {}
    const overrides = await base44.asServiceRole.entities.UserPermissionOverride.filter({ user_id: userId }, '-created_date', 500);
    if (overrides && overrides.length) {
      for (const o of overrides) perms[o.permission_key] = o.allowed;
    }
    await base44.asServiceRole.entities.User.update(userId, { permissions: JSON.stringify(perms) });
  } catch (e) { console.error('[permissions] updateUserPermissions error:', e?.message || e); }
}

export async function updateAllUsersWithRole(base44: any, roleKey: string): Promise<void> {
  try {
    const rolePerms = await base44.asServiceRole.entities.RolePermission.filter({ role_key: roleKey }, 'display_order', 1);
    if (!rolePerms || !rolePerms.length) return;
    let rolePermissions: Record<string, boolean> = {};
    try { rolePermissions = JSON.parse(rolePerms[0].permissions || '{}'); } catch {}
    let skip = 0;
    while (skip < 5000) {
      let batch: any[] = [];
      try { batch = await base44.asServiceRole.entities.User.list('-created_date', 500, skip); } catch { break; }
      if (!batch || !batch.length) break;
      for (const user of batch.filter((u: any) => (u.role || 'user') === roleKey)) {
        let perms = { ...rolePermissions };
        try {
          const ov = await base44.asServiceRole.entities.UserPermissionOverride.filter({ user_id: user.id }, '-created_date', 500);
          if (ov && ov.length) for (const o of ov) perms[o.permission_key] = o.allowed;
        } catch {}
        try { await base44.asServiceRole.entities.User.update(user.id, { permissions: JSON.stringify(perms) }); }
        catch (e) { console.error('[permissions] update user failed:', user.id, e?.message || e); }
      }
      if (batch.length < 500) break;
      skip += 500;
    }
  } catch (e) { console.error('[permissions] updateAllUsersWithRole error:', e?.message || e); }
}