// The jq-flavoured subset the workflow definitions use:
//   "${ .trigger.entity_id }"
//   "${ .trigger.data.source == \"community\" }"
//   "${ .trigger.data.created_by_id != null and .trigger.data.created_by_id != \"\" }"
type Tok = { t: 'path' | 'str' | 'num' | 'kw' | 'op' | 'lp' | 'rp'; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { out.push({ t: 'lp', v: c }); i++; continue; }
    if (c === ')') { out.push({ t: 'rp', v: c }); i++; continue; }
    if (c === '"') {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== '"') { if (src[j] === '\\') j++; s += src[j]; j++; }
      out.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '>=', '<='].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if (c === '>' || c === '<') { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '.') { const m = src.slice(i).match(/^\.[A-Za-z0-9_.\[\]]*/)!; out.push({ t: 'path', v: m[0] }); i += m[0].length; continue; }
    const num = src.slice(i).match(/^-?\d+(\.\d+)?/);
    if (num) { out.push({ t: 'num', v: num[0] }); i += num[0].length; continue; }
    const kw = src.slice(i).match(/^[A-Za-z_]+/);
    if (kw) { out.push({ t: 'kw', v: kw[0] }); i += kw[0].length; continue; }
    throw new Error(`Unexpected character "${c}" in expression: ${src}`);
  }
  return out;
}

function getPath(root: any, path: string): any {
  let cur = root;
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (cur === null || cur === undefined) return null;
    cur = cur[part];
  }
  return cur === undefined ? null : cur;
}

export function evalExpr(src: string, ctx: Record<string, unknown>): unknown {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const isKw = (v: string) => peek()?.t === 'kw' && peek().v === v;

  function primary(): any {
    const t = next();
    if (!t) throw new Error(`Unexpected end of expression: ${src}`);
    if (t.t === 'path') return getPath(ctx, t.v);
    if (t.t === 'str') return t.v;
    if (t.t === 'num') return Number(t.v);
    if (t.t === 'lp') { const v = or(); next(); return v; }
    if (t.t === 'kw') {
      if (t.v === 'null') return null;
      if (t.v === 'true') return true;
      if (t.v === 'false') return false;
      if (t.v === 'not') return !primary();
    }
    throw new Error(`Unsupported expression: ${src}`);
  }
  function cmp(): any {
    const l = primary();
    if (peek()?.t === 'op') {
      const op = next().v; const r = primary();
      switch (op) {
        case '==': return JSON.stringify(l) === JSON.stringify(r);
        case '!=': return JSON.stringify(l) !== JSON.stringify(r);
        case '>': return l > r; case '<': return l < r; case '>=': return l >= r; default: return l <= r;
      }
    }
    return l;
  }
  function and(): any { let v = cmp(); while (isKw('and')) { next(); const r = cmp(); v = v && r; } return v; }
  function or(): any { let v = and(); while (isKw('or')) { next(); const r = and(); v = v || r; } return v; }
  return or();
}

// "${ expr }" alone keeps the value's type; text with embedded ${ } is interpolated.
export function resolveTemplates(value: any, ctx: Record<string, unknown>): any {
  if (typeof value === 'string') {
    const whole = value.match(/^\$\{\s*([\s\S]*?)\s*\}$/);
    if (whole) return evalExpr(whole[1], ctx);
    return value.replace(/\$\{\s*([\s\S]*?)\s*\}/g, (_m, e) => String(evalExpr(e, ctx) ?? ''));
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplates(v, ctx));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTemplates(v, ctx)]));
  return value;
}
