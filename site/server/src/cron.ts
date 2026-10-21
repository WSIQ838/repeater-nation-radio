// Standard 5-field cron (minute hour day-of-month month day-of-week), evaluated in UTC.
function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? Number(stepStr) : 1;
    let lo = min, hi = max;
    if (range !== '*') {
      const [a, b] = range.split('-');
      lo = Number(a);
      hi = b !== undefined ? Number(b) : (stepStr ? max : lo);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(step > 0)) throw new Error(`Bad cron field "${field}"`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export interface Cron { test(d: Date): boolean }
export function parseCron(expr: string): Cron {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`Cron needs 5 fields: "${expr}"`);
  const minute = parseField(f[0], 0, 59), hour = parseField(f[1], 0, 23);
  const dom = parseField(f[2], 1, 31), month = parseField(f[3], 1, 12);
  const dow = new Set([...parseField(f[4], 0, 7)].map((d) => d % 7));
  const domAny = f[2] === '*', dowAny = f[4] === '*';
  return {
    test(d: Date) {
      if (!minute.has(d.getUTCMinutes()) || !hour.has(d.getUTCHours()) || !month.has(d.getUTCMonth() + 1)) return false;
      const domOk = dom.has(d.getUTCDate()), dowOk = dow.has(d.getUTCDay());
      // Like Vixie cron: when both day fields are restricted, either may match.
      if (!domAny && !dowAny) return domOk || dowOk;
      return domOk && dowOk;
    },
  };
}
