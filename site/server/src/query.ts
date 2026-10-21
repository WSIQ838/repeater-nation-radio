// Compiles the Mongo-style filter objects the Base44 SDK accepted
// ({ field: value, field: { $in: [...] }, $or: [...] }) into SQL over the
// `records` table, and evaluates the same filters in JS for single records.
import { sql } from './db.ts';
import { HttpError } from './errors.ts';

export type Frag = any; // postgres.js PendingQuery used as a fragment

const TRUE = sql`TRUE`;
const FALSE = sql`FALSE`;

const TEXT_COLS = new Set(['id', 'created_by', 'created_by_id']);
const TS_COLS = new Set(['created_date', 'updated_date']);
const SEGMENT = /^[A-Za-z0-9_$-]+$/;

// Bound as typed JSON: postgres.js would JSON-encode a pre-serialized string a second time.
const json = (v: unknown) => sql.json(v as any);

function and(parts: Frag[]): Frag {
  if (!parts.length) return TRUE;
  if (parts.length === 1) return parts[0];
  return sql`(${parts.reduce((a, b) => sql`${a} AND ${b}`)})`;
}
function or(parts: Frag[]): Frag {
  if (!parts.length) return FALSE;
  if (parts.length === 1) return parts[0];
  return sql`(${parts.reduce((a, b) => sql`${a} OR ${b}`)})`;
}

function segments(path: string): string[] {
  const parts = path.split('.');
  for (const p of parts) if (!SEGMENT.test(p)) throw new HttpError(400, `Invalid field name: ${path}`);
  return parts;
}

// jsonb value at a path of the data column
function jsonAt(path: string): Frag {
  const parts = segments(path);
  return parts.length === 1
    ? sql`(data -> ${parts[0]})`
    : sql`(data #> ${'{' + parts.join(',') + '}'}::text[])`;
}

function nest(parts: string[], leaf: unknown): unknown {
  return parts.reduceRight((acc, key) => ({ [key]: acc }), leaf);
}

function isOperatorObject(v: any): boolean {
  return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
    && Object.keys(v).length > 0 && Object.keys(v).every((k) => k.startsWith('$'));
}

function toTs(v: unknown): string {
  const d = new Date(v as any);
  if (isNaN(d.getTime())) throw new HttpError(400, `Invalid date value: ${String(v)}`);
  return d.toISOString();
}

function eqExpr(path: string, v: any): Frag {
  if (v instanceof Date) v = v.toISOString();
  if (TEXT_COLS.has(path)) {
    return v === null || v === undefined ? sql`(${sql(path)} IS NULL)` : sql`(${sql(path)} = ${String(v)})`;
  }
  if (TS_COLS.has(path)) {
    return v === null || v === undefined ? FALSE : sql`(${sql(path)} = ${toTs(v)}::timestamptz)`;
  }
  const j = jsonAt(path);
  if (v === null || v === undefined) return sql`(${j} IS NULL OR ${j} = 'null'::jsonb)`;
  if (typeof v === 'object') return sql`(${j} = ${json(v)}::jsonb)`;
  // scalar: equal to the value, or an array that contains it (Mongo semantics).
  // Both probes are GIN-indexable containment checks.
  const parts = segments(path);
  return sql`(data @> ${json(nest(parts, v))}::jsonb OR data @> ${json(nest(parts, [v]))}::jsonb)`;
}

function cmpExpr(path: string, op: string, v: any): Frag {
  const sqlOp = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' }[op]!;
  const o = sql.unsafe(sqlOp);
  if (v instanceof Date) v = v.toISOString();
  if (TS_COLS.has(path)) return sql`(${sql(path)} ${o} ${toTs(v)}::timestamptz)`;
  if (TEXT_COLS.has(path)) return sql`(${sql(path)} COLLATE "C" ${o} ${String(v)})`;
  const j = jsonAt(path);
  if (typeof v === 'string') return sql`(jsonb_typeof(${j}) = 'string' AND (${j} #>> '{}') COLLATE "C" ${o} ${v})`;
  if (typeof v === 'number') return sql`(jsonb_typeof(${j}) = 'number' AND (${j} #>> '{}')::numeric ${o} ${v})`;
  if (typeof v === 'boolean') return sql`(jsonb_typeof(${j}) = 'boolean' AND ${j} ${o} ${json(v)}::jsonb)`;
  throw new HttpError(400, `Unsupported comparison value for ${path}`);
}

function inExpr(path: string, list: any[]): Frag {
  if (!Array.isArray(list)) throw new HttpError(400, `$in on ${path} requires an array`);
  if (!list.length) return FALSE;
  const allStrings = list.every((x) => typeof x === 'string');
  if (TEXT_COLS.has(path)) {
    const strs = list.filter((x) => x !== null && x !== undefined).map(String);
    const hasNull = list.some((x) => x === null || x === undefined);
    const parts = [];
    if (strs.length) parts.push(sql`(${sql(path)} = ANY(${sql.array(strs)}::text[]))`);
    if (hasNull) parts.push(sql`(${sql(path)} IS NULL)`);
    return or(parts);
  }
  if (TS_COLS.has(path)) return or(list.map((x) => eqExpr(path, x)));
  if (allStrings && list.length > 6) {
    const j = jsonAt(path);
    return sql`((jsonb_typeof(${j}) = 'string' AND (${j} #>> '{}') = ANY(${sql.array(list)}::text[]))
      OR (jsonb_typeof(${j}) = 'array' AND ${j} ?| ${sql.array(list)}::text[]))`;
  }
  return or(list.map((x) => eqExpr(path, x)));
}

function fieldOps(path: string, ops: Record<string, any>): Frag {
  const parts: Frag[] = [];
  let regexSource: string | null = null;
  for (const [op, val] of Object.entries(ops)) {
    switch (op) {
      case '$eq': parts.push(eqExpr(path, val)); break;
      case '$ne': parts.push(sql`NOT ${eqExpr(path, val)}`); break;
      case '$in': parts.push(inExpr(path, val)); break;
      case '$nin': parts.push(sql`NOT ${inExpr(path, val)}`); break;
      case '$gt': case '$gte': case '$lt': case '$lte': parts.push(cmpExpr(path, op, val)); break;
      case '$exists': {
        const present = TEXT_COLS.has(path) ? sql`(${sql(path)} IS NOT NULL)`
          : TS_COLS.has(path) ? TRUE : sql`(${jsonAt(path)} IS NOT NULL AND ${jsonAt(path)} <> 'null'::jsonb)`;
        parts.push(val ? present : sql`NOT ${present}`);
        break;
      }
      case '$regex': regexSource = val instanceof RegExp ? val.source : String(val); break;
      case '$options': break; // read together with $regex below
      case '$all':
        if (TEXT_COLS.has(path) || TS_COLS.has(path)) throw new HttpError(400, '$all needs an array field');
        parts.push(sql`(${jsonAt(path)} @> ${json(val)}::jsonb)`);
        break;
      case '$not': parts.push(sql`NOT ${isOperatorObject(val) ? fieldOps(path, val) : eqExpr(path, val)}`); break;
      default: throw new HttpError(400, `Unsupported filter operator ${op}`);
    }
  }
  if (regexSource !== null) {
    const insensitive = String(ops.$options || '').includes('i');
    const target = TEXT_COLS.has(path) ? sql`${sql(path)}` : sql`(${jsonAt(path)} #>> '{}')`;
    parts.push(insensitive ? sql`(${target} ~* ${regexSource})` : sql`(${target} ~ ${regexSource})`);
  }
  return and(parts);
}

export function compileFilter(q: any): Frag {
  if (!q || typeof q !== 'object') return TRUE;
  const parts: Frag[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (k === '$or') {
      if (!Array.isArray(v)) throw new HttpError(400, '$or requires an array');
      parts.push(or((v as any[]).map(compileFilter)));
    } else if (k === '$and') {
      if (!Array.isArray(v)) throw new HttpError(400, '$and requires an array');
      parts.push(and((v as any[]).map(compileFilter)));
    } else if (k === '$nor') {
      if (!Array.isArray(v)) throw new HttpError(400, '$nor requires an array');
      parts.push(sql`NOT ${or((v as any[]).map(compileFilter))}`);
    } else if (k.startsWith('$')) {
      throw new HttpError(400, `Unsupported top-level operator ${k}`);
    } else if (isOperatorObject(v)) {
      parts.push(fieldOps(k, v as any));
    } else {
      parts.push(eqExpr(k, v));
    }
  }
  return and(parts);
}

// "-created_date" / "name" / "-a,b" (a leading "-" is descending). Mongo orders
// missing values first when ascending, which Postgres only does with NULLS FIRST.
export function compileSort(sort?: string | null): Frag {
  const spec = (typeof sort === 'string' && sort.trim()) ? sort : '-created_date';
  const parts: Frag[] = [];
  for (const raw of spec.split(/[,\s]+/).filter(Boolean)) {
    const desc = raw.startsWith('-');
    const field = raw.replace(/^[-+]/, '');
    const dir = sql.unsafe(desc ? 'DESC NULLS LAST' : 'ASC NULLS FIRST');
    if (TEXT_COLS.has(field) || TS_COLS.has(field)) parts.push(sql`${sql(field)} ${dir}`);
    else parts.push(sql`${jsonAt(field)} ${dir}`);
  }
  parts.push(sql`id ASC`);
  return parts.reduce((a, b) => sql`${a}, ${b}`);
}

// ---------- JS evaluation (single records: RLS checks, realtime fan-out) ----------

function getPath(rec: any, path: string): any {
  let cur = rec;
  for (const p of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}
function looseEq(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}
function eqMatch(actual: any, v: any): boolean {
  if (looseEq(actual, v)) return true;
  return Array.isArray(actual) && !Array.isArray(v) && actual.some((x) => looseEq(x, v));
}
function cmpMatch(actual: any, op: string, v: any): boolean {
  if (typeof actual !== typeof v || actual === null || actual === undefined) return false;
  return op === '$gt' ? actual > v : op === '$gte' ? actual >= v : op === '$lt' ? actual < v : actual <= v;
}

export function matches(rec: any, q: any): boolean {
  if (!q || typeof q !== 'object') return true;
  for (const [k, v] of Object.entries(q)) {
    if (k === '$or') { if (!(v as any[]).some((s) => matches(rec, s))) return false; continue; }
    if (k === '$and') { if (!(v as any[]).every((s) => matches(rec, s))) return false; continue; }
    if (k === '$nor') { if ((v as any[]).some((s) => matches(rec, s))) return false; continue; }
    const actual = getPath(rec, k);
    if (isOperatorObject(v)) {
      const ops = v as Record<string, any>;
      for (const [op, val] of Object.entries(ops)) {
        let ok = true;
        switch (op) {
          case '$eq': ok = eqMatch(actual, val); break;
          case '$ne': ok = !eqMatch(actual, val); break;
          case '$in': ok = (val as any[]).some((x) => eqMatch(actual, x)); break;
          case '$nin': ok = !(val as any[]).some((x) => eqMatch(actual, x)); break;
          case '$gt': case '$gte': case '$lt': case '$lte': ok = cmpMatch(actual, op, val); break;
          case '$exists': ok = (actual !== undefined && actual !== null) === !!val; break;
          case '$regex': ok = typeof actual === 'string' && new RegExp(val instanceof RegExp ? val.source : val, String(ops.$options || '')).test(actual); break;
          case '$options': break;
          case '$all': ok = Array.isArray(actual) && (val as any[]).every((x) => actual.some((a: any) => looseEq(a, x))); break;
          default: throw new HttpError(400, `Unsupported filter operator ${op}`);
        }
        if (!ok) return false;
      }
    } else if (!eqMatch(actual, v)) return false;
  }
  return true;
}
