// Row-level security: the entity JSON files carry rules like
//   { "$or": [ { "created_by_id": "{{user.id}}" }, { "user_condition": { "role": "admin" } } ] }
// Rules are resolved against the caller up front (user_condition and {{user.*}} become
// constants), leaving a plain filter on the record that is then compiled to SQL for
// reads and evaluated in JS for writes and realtime events.
import { getSchema } from './schema.ts';
import { matches } from './query.ts';

export type Op = 'read' | 'create' | 'update' | 'delete';
export interface Caller {
  user: any | null;      // null = anonymous
  service?: boolean;     // service role: bypasses RLS
}
export type Resolved = { allow: true } | { allow: false } | { filter: any };

export const userRole = (u: any): string => u?.role || u?._app_role || '';

const TEMPLATE = /^\{\{\s*user\.([A-Za-z0-9_.]+)\s*\}\}$/;

function sub(value: any, user: any): any {
  if (typeof value === 'string') {
    const m = value.match(TEMPLATE);
    if (!m) return value;
    if (!user) return undefined;
    let cur = user;
    for (const p of m[1].split('.')) cur = cur?.[p];
    return cur;
  }
  if (Array.isArray(value)) return value.map((v) => sub(v, user));
  return value;
}

function userCondition(cond: Record<string, any>, user: any): boolean {
  if (!user) return false;
  for (const [k, expected] of Object.entries(cond)) {
    const actual = k === 'role' ? userRole(user) : user[k];
    const exp = sub(expected, user);
    if (exp && typeof exp === 'object' && !Array.isArray(exp) && Array.isArray(exp.$in)) {
      if (!exp.$in.includes(actual)) return false;
    } else if (Array.isArray(exp)) {
      if (!exp.includes(actual)) return false;
    } else if (actual !== exp) return false;
  }
  return true;
}

// Resolve one rule object to true | false | a record filter.
function resolveRule(rule: any, user: any): Resolved {
  if (rule === true) return { allow: true };
  if (rule === false) return { allow: false };
  if (!rule || typeof rule !== 'object' || !Object.keys(rule).length) return { allow: true };

  const filters: any[] = [];
  for (const [key, val] of Object.entries(rule)) {
    if (key === 'user_condition') {
      if (!userCondition(val as any, user)) return { allow: false };
    } else if (key === '$or') {
      const alts: any[] = [];
      let anyAllowed = false;
      for (const item of val as any[]) {
        const r = resolveRule(item, user);
        if ('allow' in r) { if (r.allow) { anyAllowed = true; break; } } else alts.push(r.filter);
      }
      if (anyAllowed) continue;
      if (!alts.length) return { allow: false };
      filters.push(alts.length === 1 ? alts[0] : { $or: alts });
    } else if (key === '$and') {
      for (const item of val as any[]) {
        const r = resolveRule(item, user);
        if ('allow' in r) { if (!r.allow) return { allow: false }; } else filters.push(r.filter);
      }
    } else {
      const field = key.startsWith('data.') ? key.slice(5) : key;
      const v = sub(val, user);
      // {{user.id}} for an anonymous caller (or a user lacking the attribute) can never match.
      if (v === undefined && typeof val === 'string' && TEMPLATE.test(val)) return { allow: false };
      filters.push({ [field]: v });
    }
  }
  if (!filters.length) return { allow: true };
  return { filter: filters.length === 1 ? filters[0] : { $and: filters } };
}

export function resolveRls(entity: string, op: Op, caller: Caller): Resolved {
  if (caller.service) return { allow: true };
  const schema = getSchema(entity);
  if (!schema) return { allow: false };
  const rls = schema.rls;
  const rule = rls ? rls[op] : undefined;
  // No rule: reads are open (content such as forums, events and repeaters is public);
  // writes with no rule are refused.
  if (rule === undefined || rule === null) return op === 'read' ? { allow: true } : { allow: false };
  return resolveRule(rule, caller.user);
}

// Does the caller pass `op` for this concrete record?
export function recordAllowed(entity: string, op: Op, caller: Caller, record: any): boolean {
  const r = resolveRls(entity, op, caller);
  if ('allow' in r) return r.allow;
  return matches(record, r.filter);
}

// Field-level write rules (used on User: role, callsign, ... are admin-only).
export function writableFields(entity: string, caller: Caller, record: any, data: Record<string, any>) {
  if (caller.service) return { allowed: data, denied: [] as string[] };
  const schema = getSchema(entity);
  const allowed: Record<string, any> = {};
  const denied: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    const rule = schema?.properties?.[k]?.rls?.write;
    if (rule === undefined) { allowed[k] = v; continue; }
    const r = resolveRule(rule, caller.user);
    const ok = 'allow' in r ? r.allow : matches(record, r.filter);
    if (ok) allowed[k] = v; else denied.push(k);
  }
  return { allowed, denied };
}
