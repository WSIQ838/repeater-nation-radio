import { checkPermission } from './permissions.ts';

// Shared admin authorization + audit helpers used by admin backend functions.
// Every admin request must pass through requireAdmin before touching data.

export async function requireAdmin(base44: any): Promise<{ caller: any; error: Response | null }> {
  let caller: any = null;
  try {
    caller = await base44.auth.me();
  } catch (err) {
    console.error('[admin] auth failed:', err?.message || err);
    return { caller: null, error: Response.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  if (!caller) {
    return { caller: null, error: Response.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  // Enrich: ensure role is set from _app_role if missing (me() may not return custom role field)
  if (!caller.role && caller._app_role) caller.role = caller._app_role;
  if (caller.account_status === 'suspended') {
    return { caller: null, error: Response.json({ error: 'Account suspended' }, { status: 403 }) };
  }
  // Administrator and super-admin roles always have admin panel access.
  // This prevents stale/missing RolePermission rows from locking out a real administrator.
  if (caller.role === 'admin' || caller._app_role === 'admin' || caller.role === 'super_admin' || caller._app_role === 'super_admin') return { caller, error: null };
  // All other roles must have the admin.view permission (checked via the
  // centralized permission system: role permissions + individual overrides).
  const hasAccess = await checkPermission(base44, caller, 'admin.view');
  if (!hasAccess) {
    console.error('[admin] non-admin attempt:', caller?.id, caller?.role);
    return { caller: null, error: Response.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { caller, error: null };
}

export async function writeAudit(base44: any, entry: any): Promise<void> {
  // Callers pass objects or pre-serialized JSON strings; never double-encode.
  const enc = (v: any) => (v ? (typeof v === 'string' ? v : JSON.stringify(v)) : '');
  try {
    await base44.asServiceRole.entities.AuditLog.create({
      admin_id: entry.admin_id || '',
      admin_name: entry.admin_name || '',
      action: entry.action || '',
      category: entry.category || 'admin',
      target_type: entry.target_type || '',
      target_id: entry.target_id || '',
      target_label: entry.target_label || '',
      before: enc(entry.before),
      after: enc(entry.after),
      ip: entry.ip || '',
      meta: enc(entry.meta),
      ...(entry.description ? { description: String(entry.description).slice(0, 1000) } : {}),
    });
  } catch (e) {
    console.error('[audit] write failed:', e?.message || e);
  }
}

// Pages through an entity's collection so counts, lookups and duplicate
// checks stay correct once a collection grows past a single request's
// 500-record cap. Uses cursor pagination (filter + next_cursor) which is
// O(n) -- each page costs the same regardless of how deep we are. Falls
// back to legacy offset list() for entities that don't support the cursor
// form (notably User, where count/aggregate/cursor are unavailable).
// Usage: const users = await listAll(base44.asServiceRole.entities.User);
export async function listAll(entity: any, sort = '-created_date', pageSize = 500, maxRecords = 20000): Promise<any[]> {
  // Try cursor pagination first (O(n), preferred for all standard entities).
  try {
    const out: any[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < maxRecords; i += pageSize) {
      const opts: any = { sort, limit: pageSize };
      if (cursor) opts.cursor = cursor;
      const page = await entity.filter({}, opts);
      const items = page?.items || page || [];
      if (!items.length) break;
      out.push(...items);
      if (page?.has_more === false || !page?.next_cursor) break;
      cursor = page.next_cursor;
      if (items.length < pageSize) break;
    }
    return out;
  } catch (cursorErr) {
    // User entity (and any entity without cursor support) rejects filter+cursor.
    // Fall back to offset-based list() -- O(n²) but the only option there.
    const out: any[] = [];
    for (let skip = 0; skip < maxRecords; skip += pageSize) {
      const batch = await entity.list(sort, pageSize, skip);
      if (!batch || batch.length === 0) break;
      out.push(...batch);
      if (batch.length < pageSize) break;
    }
    return out;
  }
}

// entity.get(id) has been observed to spuriously return null for records
// that .list()/.filter() can find -- seen and fixed the same way in
// admin-api's user lookup and manage-roles' role lookup. Any function that
// needs a reliable single-record lookup by id should use this instead of
// calling entity.get(id) directly.
export async function getByIdWithFallback(entity: any, id: string, sort = '-created_date'): Promise<any | null> {
  const direct = await entity.get(id).catch(() => null);
  if (direct) return direct;
  const all = await listAll(entity, sort, 500).catch(() => []);
  return (all || []).find((r: any) => r.id === id) || null;
}

export function getIp(req: Request): string {
  const fwd = (req as any)?.headers?.get?.('x-forwarded-for');
  if (fwd) return String(fwd).split(',')[0].trim();
  return '';
}

export async function requireSuperAdmin(base44: any): Promise<{ caller: any; error: Response | null }> {
  const { caller, error } = await requireAdmin(base44);
  if (error) return { caller, error };
  if (caller.role !== 'super_admin' && caller._app_role !== 'super_admin') {
    return { caller: null, error: Response.json({ error: 'Super Admin access required' }, { status: 403 }) };
  }
  return { caller, error: null };
}

export async function requirePermission(base44: any, key: string): Promise<{ caller: any; error: Response | null }> {
  const { caller, error } = await requireAdmin(base44);
  if (error) return { caller, error };
  const has = await checkPermission(base44, caller, key);
  if (!has) {
    return { caller: null, error: Response.json({ error: `Permission denied: ${key}` }, { status: 403 }) };
  }
  return { caller, error: null };
}

// Lightweight per-action permission check for callers already verified by requireAdmin.
// Returns an error Response if the caller lacks the permission, or null if allowed.
// Use this inside action switches to enforce per-action authorization beyond admin.view.
export async function checkCallerPermission(base44: any, caller: any, key: string): Promise<Response | null> {
  const has = await checkPermission(base44, caller, key);
  if (!has) {
    return Response.json({ error: `Permission denied: ${key}` }, { status: 403 });
  }
  return null;
}