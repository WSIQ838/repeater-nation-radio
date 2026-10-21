// Roles & Permissions management API.
// Handles role CRUD, permission matrix editing, user overrides, and audit logging.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { requireAdmin, writeAudit, getIp, listAll } from '../../shared/adminGuard.ts';
import {
  PERMISSION_CATEGORIES, PERMISSION_TYPES, allPermissionKeys,
  seedDefaultRoles, updateUserPermissions, updateAllUsersWithRole,
} from '../../shared/permissions.ts';

// RolePermission.get(id) has been observed to spuriously miss records that
// .list()/.filter() can find (the same platform quirk admin-api's user
// lookup already works around) -- fall back to a full-list scan by id
// before concluding a role genuinely doesn't exist.
async function getRolePermissionById(base44: any, id: string): Promise<any | null> {
  const direct = await base44.asServiceRole.entities.RolePermission.get(id).catch(() => null);
  if (direct) return direct;
  const all = await listAll(base44.asServiceRole.entities.RolePermission, 'display_order', 100).catch(() => []);
  return (all || []).find((r: any) => r.id === id) || null;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const { caller, error } = await requireAdmin(base44);
    if (error) return error;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const ip = getIp(req);
    const admin = { id: caller.id, name: caller.full_name || caller.email || 'admin' };
    const isSuperAdmin = caller.role === 'super_admin' || caller._app_role === 'super_admin';

    // Per-action permission requirements beyond the base admin.view gate.
    // All role/override management actions require settings.manage.
    const ROLE_ACTION_PERMISSIONS: Record<string, string> = {
      'roles:create': 'settings.manage',
      'roles:update': 'settings.manage',
      'roles:delete': 'settings.manage',
      'roles:duplicate': 'settings.manage',
      'roles:savePermissions': 'settings.manage',
      'roles:setEnabled': 'settings.manage',
      'overrides:set': 'settings.manage',
      'overrides:clear': 'settings.manage',
    };
    const requiredPerm = ROLE_ACTION_PERMISSIONS[action];
    if (requiredPerm) {
      const { checkPermission } = await import('../../shared/permissions.ts');
      const has = await checkPermission(base44, caller, requiredPerm);
      if (!has) {
        return Response.json({ error: `Permission denied: ${requiredPerm}` }, { status: 403 });
      }
    }

    switch (action) {
      case 'catalog': {
        return Response.json({ categories: PERMISSION_CATEGORIES, types: PERMISSION_TYPES, allKeys: allPermissionKeys() });
      }

      case 'roles:list': {
        await seedDefaultRoles(base44);
        let roles = await base44.asServiceRole.entities.RolePermission.list('display_order', 100);
        const users = await listAll(base44.asServiceRole.entities.User);
        const counts: Record<string, number> = {};
        for (const u of (users || [])) { const r = u.role || 'user'; counts[r] = (counts[r] || 0) + 1; }
        roles = (roles || []).map((r: any) => ({
          id: r.id, role_key: r.role_key, role_name: r.role_name, description: r.description,
          is_system: r.is_system, is_protected: r.is_protected, enabled: r.enabled,
          display_order: r.display_order, user_count: counts[r.role_key] || 0, permissions: r.permissions,
        }));
        return Response.json({ roles });
      }

      case 'roles:create': {
        const role_name = String(body.role_name || '').trim();
        const description = String(body.description || '').trim();
        if (!role_name) return Response.json({ error: 'Role name required' }, { status: 400 });
        const role_key = role_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        const existing = await base44.asServiceRole.entities.RolePermission.filter({ role_key }, 'display_order', 1);
        if (existing && existing.length) return Response.json({ error: 'A role with this name already exists' }, { status: 400 });
        const all = await base44.asServiceRole.entities.RolePermission.list('display_order', 100);
        const maxOrder = Math.max(0, ...(all || []).map((r: any) => r.display_order || 0));
        const r = await base44.asServiceRole.entities.RolePermission.create({
          role_key, role_name, description, permissions: JSON.stringify({}),
          is_system: false, is_protected: false, enabled: true, display_order: maxOrder + 1, user_count: 0,
        });
        await writeAudit(base44, { admin_id: admin.id, admin_name: admin.name, action: 'role.create', category: 'settings', target_type: 'RolePermission', target_id: r.id, target_label: role_name, after: { role_key, role_name }, ip });
        return Response.json({ role: r });
      }

      case 'roles:update': {
        const id = String(body.id || '');
        const role_name = String(body.role_name || '').trim();
        const description = String(body.description !== undefined ? body.description : '');
        if (!id) return Response.json({ error: 'id required' }, { status: 400 });
        const before = await getRolePermissionById(base44, id);
        if (!before) return Response.json({ error: 'Role not found' }, { status: 404 });
        if (before.is_protected && !isSuperAdmin) return Response.json({ error: 'Only Super Admins can modify protected roles' }, { status: 403 });
        const updates: any = {};
        if (role_name) updates.role_name = role_name;
        if (body.description !== undefined) updates.description = description;
        await base44.asServiceRole.entities.RolePermission.update(id, updates);
        await writeAudit(base44, { admin_id: admin.id, admin_name: admin.name, action: 'role.update', category: 'settings', target_type: 'RolePermission', target_id: id, target_label: before.role_name, before: { role_name: before.role_name, description: before.description }, after: updates, ip });
        return Response.json({ ok: true });
      }

      case 'roles:delete': {
        const id = String(body.id || '');
        if (!id) return Response.json({ error: 'id required' }, { status: 400 });
        const before = await getRolePermissionById(base44, id);
        if (!before) return Response.json({ error: 'Role not found' }, { status: 404 });
        if (before.is_system) return Response.json({ error: 'System roles cannot be deleted' }, { status: 400 });
        if (before.is_protected && !isSuperAdmin) return Response.json({ error: 'Only Super Admins can delete protected roles' }, { status: 403 });
        const users = await listAll(base44.asServiceRole.entities.User);
        const count = (users || []).filter((u: any) => (u.role || 'user') === before.role_key).length;
        if (count > 0) return Response.json({ error: `Cannot delete role with ${count} assigned user(s). Reassign them first.` }, { status: 400 });
        await base44.asServiceRole.entities.RolePermission.delete(id);
        await writeAudit(base44, { admin_id: admin.id, admin_name: admin.name, action: 'role.delete', category: 'settings', target_type: 'RolePermission', target_id: id, target_label: before.role_name, ip });
        return Response.json({ ok: true });
      }

      case 'roles:duplicate': {
        const id = String(body.id || '');
        const new_name = String(body.new_name || '').trim();
        if (!id || !new_name) return Response.json({ error: 'id and new_name required' }, { status: 400 });
        const source = await getRolePermissionById(base44, id);
        if (!source) return Response.json({ error: 'Source role not found' }, { status: 404 });
        const role_key = new_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        const existing = await base44.asServiceRole.entities.RolePermission.filter({ role_key }, 'display_order', 1);
        if (existing && existing.length) return Response.json({ error: 'A role with this name already exists' }, { status: 400 });
        const all = await base44.asServiceRole.entities.RolePermission.list('display_order', 100);
        const maxOrder = Math.max(0, ...(all || []).map((r: any) => r.display_order || 0));
        const r = await base44.asServiceRole.entities.RolePermission.create({
          role_key, role_name: new_name, description: `Copy of ${source.role_name}`,
          permissions: source.permissions || '{}', is_system: false, is_protected: false,
          enabled: true, display_order: maxOrder + 1, user_count: 0,
        });
        await writeAudit(base44, { admin_id: admin.id, admin_name: admin.name, action: 'role.duplicate', category: 'settings', target_type: 'RolePermission', target_id: r.id, target_label: new_name, after: { role_key, source: source.role_name }, ip });
        return Response.json({ role: r });
      }

      case 'roles:savePermissions': {
        const id = String(body.id || '');
        const permissions = body.permissions;
        if (!id || !permissions) return Response.json({ error: 'id and permissions required' }, { status: 400 });
        const before = await getRolePermissionById(base44, id);
        if (!before) return Response.json({ error: 'Role not found' }, { status: 404 });
        if (before.is_protected && !isSuperAdmin) return Response.json({ error: 'Only Super Admins can modify protected role permissions' }, { status: 403 });
        const permsStr = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);
        await base44.asServiceRole.entities.RolePermission.update(id, { permissions: permsStr });
        await updateAllUsersWithRole(base44, before.role_key);
        await writeAudit(base44, { admin_id: admin.id, admin_name: admin.name, action: 'role.save_permissions', category: 'settings', target_type: 'RolePermission', target_id: id, target_label: before.role_name, before: { permissions: before.permissions }, after: { permissions: permsStr }, ip });
        return Response.json({ ok: true });
      }

      case 'roles:setEnabled': {
        const id = String(body.id || '');
        const enabled = body.enabled;
        if (!id || enabled === undefined) return Response.json({ error: 'id and enabled required' }, { status: 400 });
        const before = await getRolePermissionById(base44, id);
        if (!before) return Response.json({ error: 'Role not found' }, { status: 404 });
        if (before.is_protected && !isSuperAdmin) return Response.json({ error: 'Only Super Admins can modify protected roles' }, { status: 403 });
        await base44.asServiceRole.entities.RolePermission.update(id, { enabled: !!enabled });
        await writeAudit(base44, { admin_id: admin.id, admin_name: admin.name, action: enabled ? 'role.enable' : 'role.disable', category: 'settings', target_type: 'RolePermission', target_id: id, target_label: before.role_name, before: { enabled: before.enabled }, after: { enabled: !!enabled }, ip });
        return Response.json({ ok: true });
      }

      case 'overrides:list': {
        const user_id = String(body.user_id || '');
        if (!user_id) return Response.json({ error: 'user_id required' }, { status: 400 });
        const overrides = await base44.asServiceRole.entities.UserPermissionOverride.filter({ user_id }, '-created_date', 500);
        return Response.json({ overrides: overrides || [] });
      }

      case 'overrides:set': {
        const user_id = String(body.user_id || '');
        const permission_key = String(body.permission_key || '');
        const allowed = body.allowed;
        if (!user_id || !permission_key || allowed === undefined) return Response.json({ error: 'user_id, permission_key, and allowed required' }, { status: 400 });
        const user = await base44.asServiceRole.entities.User.get(user_id).catch(() => null);
        if (!user) return Response.json({ error: 'User not found' }, { status: 404 });
        const existing = await base44.asServiceRole.entities.UserPermissionOverride.filter({ user_id, permission_key }, '-created_date', 1);
        if (existing && existing.length) {
          await base44.asServiceRole.entities.UserPermissionOverride.update(existing[0].id, { allowed: !!allowed, set_by_id: admin.id, set_by_name: admin.name });
        } else {
          await base44.asServiceRole.entities.UserPermissionOverride.create({
            user_id, user_name: user.full_name || user.email || '', permission_key, allowed: !!allowed,
            set_by_id: admin.id, set_by_name: admin.name,
          });
        }
        await updateUserPermissions(base44, user_id, user.role || 'user');
        await writeAudit(base44, { admin_id: admin.id, admin_name: admin.name, action: 'override.set', category: 'settings', target_type: 'User', target_id: user_id, target_label: user.full_name || user.email || user_id, after: { permission_key, allowed }, ip });
        return Response.json({ ok: true });
      }

      case 'overrides:clear': {
        const id = String(body.id || '');
        if (!id) return Response.json({ error: 'id required' }, { status: 400 });
        const before = await base44.asServiceRole.entities.UserPermissionOverride.get(id).catch(() => null);
        if (!before) return Response.json({ error: 'Override not found' }, { status: 404 });
        await base44.asServiceRole.entities.UserPermissionOverride.delete(id);
        const user = await base44.asServiceRole.entities.User.get(before.user_id).catch(() => null);
        if (user) await updateUserPermissions(base44, before.user_id, user.role || 'user');
        await writeAudit(base44, { admin_id: admin.id, admin_name: admin.name, action: 'override.clear', category: 'settings', target_type: 'UserPermissionOverride', target_id: id, target_label: `${before.user_name} — ${before.permission_key}`, before: { allowed: before.allowed }, ip });
        return Response.json({ ok: true });
      }

      case 'audit:list': {
        let audit = await base44.asServiceRole.entities.AuditLog.list('-created_date', 200);
        audit = (audit || []).filter((a: any) => {
          const act = a.action || '';
          return act.startsWith('role.') || act.startsWith('override.');
        }).map((a: any) => ({
          id: a.id, admin_name: a.admin_name, action: a.action, target_label: a.target_label,
          before: a.before, after: a.after, created_date: a.created_date,
        }));
        return Response.json({ audit });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[manage-roles] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}