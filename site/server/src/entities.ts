import { sql } from './db.ts';
import { HttpError } from './errors.ts';
import { newId } from './ids.ts';
import { compileFilter, compileSort, matches } from './query.ts';
import { applyDefaults, getSchema } from './schema.ts';
import { Caller, recordAllowed, resolveRls, userRole, writableFields } from './rls.ts';
import { emitEntityEvent } from './bus.ts';

export interface QueryOpts {
  sort?: string | null;
  limit?: number | null;
  skip?: number | null;
  fields?: string[] | null;
  cursor?: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 5000;
const BUILTIN = ['id', 'created_date', 'updated_date', 'created_by', 'created_by_id'];
const ADMIN_ROLES = new Set(['admin', 'super_admin']);

export const isAdmin = (u: any) => ADMIN_ROLES.has(userRole(u));

export function serialize(row: any): any {
  const rec: any = { ...row.data, id: row.id };
  rec.created_date = new Date(row.created_date).toISOString();
  rec.updated_date = new Date(row.updated_date).toISOString();
  if (row.created_by) rec.created_by = row.created_by;
  if (row.created_by_id) rec.created_by_id = row.created_by_id;
  if (rec.is_sample === undefined) rec.is_sample = false;
  return rec;
}

function project(rec: any, fields?: string[] | null) {
  if (!fields || !fields.length) return rec;
  const out: any = { id: rec.id };
  for (const f of fields) if (f in rec) out[f] = rec[f];
  return out;
}

function assertEntity(entity: string) {
  if (!getSchema(entity)) throw new HttpError(404, `Entity ${entity} not found`);
}

// The User entity has no RLS block in its schema: admins see everyone, members see themselves.
function resolveFor(entity: string, op: 'read' | 'create' | 'update' | 'delete', caller: Caller) {
  if (entity === 'User' && !caller.service) {
    const u = caller.user;
    if (!u) return { allow: false } as const;
    if (isAdmin(u)) return { allow: true } as const;
    if (op === 'create' || op === 'delete') return { allow: false } as const;
    return { filter: { id: u.id } } as const;
  }
  return resolveRls(entity, op, caller);
}
function allowed(entity: string, op: 'read' | 'create' | 'update' | 'delete', caller: Caller, rec: any) {
  const r = resolveFor(entity, op, caller);
  if ('allow' in r) return r.allow;
  return matches(rec, r.filter);
}

function deny(op: string): never {
  throw new HttpError(403, `You do not have permission to ${op} this record`);
}

export async function query(entity: string, caller: Caller, q: any, opts: QueryOpts = {}) {
  assertEntity(entity);
  const r = resolveFor(entity, 'read', caller);
  if ('allow' in r && !r.allow) return { items: [], has_more: false, next_cursor: null };

  const limit = Math.min(Math.max(Number(opts.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  let skip = Math.max(Number(opts.skip) || 0, 0);
  if (opts.cursor) {
    const n = Number(atob(String(opts.cursor)).replace('o:', ''));
    if (Number.isFinite(n) && n >= 0) skip = n;
  }
  const predicate = compileFilter(q);
  const rlsPredicate = 'filter' in r ? compileFilter(r.filter) : sql`TRUE`;

  const rows = await sql`
    SELECT id, data, created_date, updated_date, created_by, created_by_id
    FROM records
    WHERE entity = ${entity} AND ${predicate} AND ${rlsPredicate}
    ORDER BY ${compileSort(opts.sort)}
    LIMIT ${limit + 1} OFFSET ${skip}`;
  const has_more = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => project(serialize(row), opts.fields));
  return { items, has_more, next_cursor: has_more ? btoa(`o:${skip + limit}`) : null };
}

export async function count(entity: string, caller: Caller, q: any): Promise<number> {
  assertEntity(entity);
  const r = resolveFor(entity, 'read', caller);
  if ('allow' in r && !r.allow) return 0;
  const rlsPredicate = 'filter' in r ? compileFilter(r.filter) : sql`TRUE`;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM records WHERE entity = ${entity} AND ${compileFilter(q)} AND ${rlsPredicate}`;
  return n;
}

export async function get(entity: string, caller: Caller, id: string) {
  assertEntity(entity);
  const [row] = await sql`SELECT id, data, created_date, updated_date, created_by, created_by_id FROM records WHERE entity = ${entity} AND id = ${String(id)}`;
  if (!row) throw new HttpError(404, `${entity} not found`);
  const rec = serialize(row);
  if (!allowed(entity, 'read', caller, rec)) throw new HttpError(404, `${entity} not found`);
  return rec;
}

function splitBuiltins(input: Record<string, any>, caller: Caller) {
  const data: Record<string, any> = {};
  const builtin: Record<string, any> = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (BUILTIN.includes(k)) { if (caller.service) builtin[k] = v; } else data[k] = v;
  }
  return { data, builtin };
}

export async function create(entity: string, caller: Caller, input: Record<string, any>) {
  assertEntity(entity);
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Body must be an object');
  const { data: raw, builtin } = splitBuiltins(input, caller);
  const data = applyDefaults(entity, raw);
  const id = builtin.id ? String(builtin.id) : newId();
  const user = caller.user;
  const createdById = caller.service ? (builtin.created_by_id ?? null) : (user?.id ?? null);
  const createdBy = caller.service ? (builtin.created_by ?? null) : (user?.email ?? null);
  const candidate = { ...data, id, created_by_id: createdById, created_by: createdBy };
  if (!allowed(entity, 'create', caller, candidate)) deny('create');

  const createdDate = builtin.created_date ? new Date(builtin.created_date) : new Date();
  const updatedDate = builtin.updated_date ? new Date(builtin.updated_date) : createdDate;
  const [row] = await sql`
    INSERT INTO records (entity, id, data, created_date, updated_date, created_by, created_by_id)
    VALUES (${entity}, ${id}, ${sql.json(data)}, ${createdDate}, ${updatedDate}, ${createdBy}, ${createdById})
    RETURNING id, data, created_date, updated_date, created_by, created_by_id`;
  const rec = serialize(row);
  emitEntityEvent({ entity, type: 'create', id, data: rec, timestamp: new Date().toISOString(), actor_id: user?.id ?? null });
  return rec;
}

export async function bulkCreate(entity: string, caller: Caller, items: Record<string, any>[]) {
  if (!Array.isArray(items)) throw new HttpError(400, 'bulkCreate expects an array');
  assertEntity(entity);
  // Check every row first so a rejected row doesn't leave a partial insert behind.
  const prepared = items.map((input) => {
    const { data: raw, builtin } = splitBuiltins(input, caller);
    const data = applyDefaults(entity, raw);
    const id = builtin.id ? String(builtin.id) : newId();
    const createdById = caller.service ? (builtin.created_by_id ?? null) : (caller.user?.id ?? null);
    const createdBy = caller.service ? (builtin.created_by ?? null) : (caller.user?.email ?? null);
    if (!allowed(entity, 'create', caller, { ...data, id, created_by_id: createdById, created_by: createdBy })) deny('create');
    const created = builtin.created_date ? new Date(builtin.created_date) : new Date();
    return { entity, id, data: sql.json(data) as any, created_date: created, updated_date: builtin.updated_date ? new Date(builtin.updated_date) : created, created_by: createdBy, created_by_id: createdById };
  });
  const out: any[] = [];
  for (let i = 0; i < prepared.length; i += 500) {
    const rows = await sql`INSERT INTO records ${sql(prepared.slice(i, i + 500))} RETURNING id, data, created_date, updated_date, created_by, created_by_id`;
    for (const row of rows) out.push(serialize(row));
  }
  for (const rec of out) emitEntityEvent({ entity, type: 'create', id: rec.id, data: rec, timestamp: new Date().toISOString(), actor_id: caller.user?.id ?? null });
  return out;
}

// Mongo-style update documents ($set, $unset, $inc, $push, $addToSet, $pull) or a plain partial object.
export function applyPatch(data: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const out = { ...data };
  const hasOps = Object.keys(patch).some((k) => k.startsWith('$'));
  if (!hasOps) return { ...out, ...patch };
  for (const [op, spec] of Object.entries(patch)) {
    if (!op.startsWith('$')) { out[op] = spec; continue; }
    for (const [field, val] of Object.entries(spec as Record<string, any>)) {
      switch (op) {
        case '$set': out[field] = val; break;
        case '$unset': delete out[field]; break;
        case '$inc': out[field] = (Number(out[field]) || 0) + Number(val); break;
        case '$push': out[field] = [...(Array.isArray(out[field]) ? out[field] : []), val]; break;
        case '$addToSet': {
          const arr = Array.isArray(out[field]) ? [...out[field]] : [];
          if (!arr.some((x) => JSON.stringify(x) === JSON.stringify(val))) arr.push(val);
          out[field] = arr; break;
        }
        case '$pull': out[field] = (Array.isArray(out[field]) ? out[field] : []).filter((x: any) => JSON.stringify(x) !== JSON.stringify(val)); break;
        default: throw new HttpError(400, `Unsupported update operator ${op}`);
      }
    }
  }
  return out;
}

async function updateOne(tx: any, entity: string, caller: Caller, id: string, patchIn: Record<string, any>) {
  const [row] = await tx`SELECT id, data, created_date, updated_date, created_by, created_by_id FROM records WHERE entity = ${entity} AND id = ${id} FOR UPDATE`;
  if (!row) throw new HttpError(404, `${entity} not found`);
  const before = serialize(row);
  if (!allowed(entity, 'update', caller, before)) deny('update');

  const { data: patchData, builtin } = splitBuiltins(patchIn, caller);
  const { allowed: okFields, denied } = writableFields(entity, caller, before, patchData);
  if (denied.length) console.warn(`[entities] ${entity}.${id}: ignored protected fields ${denied.join(', ')}`);
  const data = applyPatch(row.data, okFields);
  const createdBy = builtin.created_by ?? row.created_by;
  const createdById = builtin.created_by_id ?? row.created_by_id;
  const [saved] = await tx`
    UPDATE records SET data = ${sql.json(data)}, updated_date = now(), created_by = ${createdBy}, created_by_id = ${createdById}
    WHERE entity = ${entity} AND id = ${id}
    RETURNING id, data, created_date, updated_date, created_by, created_by_id`;
  return { before, after: serialize(saved) };
}

export async function update(entity: string, caller: Caller, id: string, patch: Record<string, any>) {
  assertEntity(entity);
  const res = await sql.begin((tx) => updateOne(tx, entity, caller, String(id), patch));
  emitEntityEvent({ entity, type: 'update', id: res.after.id, data: res.after, old_data: res.before, timestamp: new Date().toISOString(), actor_id: caller.user?.id ?? null });
  return res.after;
}

export async function bulkUpdate(entity: string, caller: Caller, items: Array<Record<string, any>>) {
  if (!Array.isArray(items)) throw new HttpError(400, 'bulkUpdate expects an array');
  assertEntity(entity);
  const out: any[] = [];
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    const results = await sql.begin(async (tx) => {
      const r = [];
      for (const item of chunk) {
        const { id, ...rest } = item || {};
        if (!id) throw new HttpError(400, 'bulkUpdate items need an id');
        r.push(await updateOne(tx, entity, caller, String(id), rest));
      }
      return r;
    });
    for (const res of results) {
      out.push(res.after);
      emitEntityEvent({ entity, type: 'update', id: res.after.id, data: res.after, old_data: res.before, timestamp: new Date().toISOString(), actor_id: caller.user?.id ?? null });
    }
  }
  return out;
}

async function matchingIds(entity: string, caller: Caller, q: any): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await query(entity, caller, q, { limit: 1000, sort: 'id', cursor, fields: ['id'] });
    for (const rec of page.items) ids.push(rec.id);
    if (!page.has_more) break;
    cursor = page.next_cursor;
  }
  return ids;
}

export async function updateMany(entity: string, caller: Caller, q: any, patch: Record<string, any>) {
  assertEntity(entity);
  // Snapshot the ids first so updates that change filter membership can't cause skips or loops.
  const ids = await matchingIds(entity, caller, q);
  for (const id of ids) await update(entity, caller, id, patch);
  return { updated: ids.length, success: true };
}

export async function remove(entity: string, caller: Caller, id: string) {
  assertEntity(entity);
  const res = await sql.begin(async (tx) => {
    const [row] = await tx`SELECT id, data, created_date, updated_date, created_by, created_by_id FROM records WHERE entity = ${entity} AND id = ${String(id)} FOR UPDATE`;
    if (!row) throw new HttpError(404, `${entity} not found`);
    const rec = serialize(row);
    if (!allowed(entity, 'delete', caller, rec)) deny('delete');
    await tx`DELETE FROM records WHERE entity = ${entity} AND id = ${String(id)}`;
    return rec;
  });
  emitEntityEvent({ entity, type: 'delete', id: res.id, data: res, timestamp: new Date().toISOString(), actor_id: caller.user?.id ?? null });
  return { success: true, id: res.id };
}

export async function deleteMany(entity: string, caller: Caller, q: any) {
  assertEntity(entity);
  const ids = await matchingIds(entity, caller, q);
  for (const id of ids) await remove(entity, caller, id);
  return { deleted: ids.length, success: true };
}

// Can this caller see this record? (realtime fan-out)
export function canRead(entity: string, caller: Caller, rec: any): boolean {
  return allowed(entity, 'read', caller, rec);
}
