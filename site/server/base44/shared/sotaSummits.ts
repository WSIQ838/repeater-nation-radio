// Shared SOTA summits-list handling for the admin upload (sota-summit-import)
// and the approval-gated monthly sync (sota-summits-sync): parse the SOTA
// summitslist.csv format and upsert rows into SotaSummit by summit_ref.

export const SUMMIT_RE = /^[A-Z0-9]{1,4}\/[A-Z0-9]{2}-\d{3}$/;
const FIELDS = ['name', 'association', 'association_name', 'region', 'region_name', 'altitude_m', 'altitude_ft', 'points', 'bonus_points', 'lat', 'lng', 'summit_status'];

const num = (v: unknown) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export type SummitRow = ReturnType<typeof cleanSummit> & {};

export function cleanSummit(r: Record<string, unknown>) {
  const ref = String(r.summit_ref || '').trim().toUpperCase();
  if (!SUMMIT_RE.test(ref)) return null;
  const [association, rest] = ref.split('/');
  return {
    summit_ref: ref,
    name: String(r.name || ref).slice(0, 200),
    association,
    association_name: String(r.association_name || '').slice(0, 120),
    region: rest.split('-')[0],
    region_name: String(r.region_name || '').slice(0, 120),
    altitude_m: num(r.altitude_m),
    altitude_ft: num(r.altitude_ft),
    points: num(r.points),
    bonus_points: num(r.bonus_points),
    lat: num(r.lat),
    lng: num(r.lng),
    summit_status: r.summit_status === 'inactive' ? 'inactive' : 'active',
  };
}

// Minimal CSV parser (quoted fields, doubled quotes, CRLF).
function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// summitslist.csv: a title line, then SummitCode, AssociationName, RegionName,
// SummitName, AltM, AltFt, GridRef1, GridRef2, Longitude, Latitude, Points,
// BonusPoints, ValidFrom, ValidTo, ... Summits past ValidTo are inactive.
export function parseSummitsList(text: string, prefixes: string[] = []) {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex((r) => r.some((c) => c.trim() === 'SummitCode'));
  if (headerAt < 0) throw new Error('Not a SOTA summits list (no SummitCode column)');
  const head = rows[headerAt].map((h) => h.trim());
  const col = (name: string) => head.indexOf(name);
  const idx = { ref: col('SummitCode'), assoc: col('AssociationName'), region: col('RegionName'), name: col('SummitName'), altM: col('AltM'), altFt: col('AltFt'),
    lng: col('Longitude'), lat: col('Latitude'), points: col('Points'), bonus: col('BonusPoints'), validTo: col('ValidTo') };
  const today = new Date();
  const wanted = prefixes.map((p) => p.trim().toUpperCase()).filter(Boolean);
  const out = [];
  for (const r of rows.slice(headerAt + 1)) {
    const ref = String(r[idx.ref] || '').trim().toUpperCase();
    if (!ref || (wanted.length && !wanted.some((p) => ref.startsWith(p)))) continue;
    const [d, m, y] = String(idx.validTo >= 0 ? r[idx.validTo] : '').split('/').map(Number);
    const expired = !!y && new Date(y, (m || 1) - 1, d || 1) < today;
    const clean = cleanSummit({
      summit_ref: ref, association_name: r[idx.assoc], region_name: r[idx.region], name: r[idx.name],
      altitude_m: r[idx.altM], altitude_ft: r[idx.altFt], lng: r[idx.lng], lat: r[idx.lat],
      points: r[idx.points], bonus_points: r[idx.bonus], summit_status: expired ? 'inactive' : 'active',
    });
    if (clean) out.push(clean);
  }
  return out;
}

// Upserts one batch (keep it to a few hundred rows): one $in read, one
// bulkCreate for new summits, and an update per changed summit.
export async function upsertSummits(base44: any, rawRows: Record<string, unknown>[], dryRun = false) {
  const rows = rawRows.map(cleanSummit).filter(Boolean) as NonNullable<ReturnType<typeof cleanSummit>>[];
  if (!rows.length) return { added: 0, updated: 0, unchanged: 0 };
  const refs = [...new Set(rows.map((r) => r.summit_ref))];
  const existing = await base44.asServiceRole.entities.SotaSummit.filter({ summit_ref: { $in: refs } }, undefined, refs.length);
  const byRef = new Map<string, any>((existing || []).map((s: any) => [s.summit_ref, s]));
  const now = new Date().toISOString();
  const toCreate: Record<string, unknown>[] = [];
  const toUpdate: [string, Record<string, unknown>][] = [];
  let unchanged = 0;
  for (const r of rows) {
    const cur = byRef.get(r.summit_ref);
    if (!cur) {
      toCreate.push({
        ...r, source: 'official', verification_status: 'approved', last_imported_date: now,
        search_keywords: [r.name, r.summit_ref, r.association_name, r.region_name].filter(Boolean).join(' '),
      });
      byRef.set(r.summit_ref, r);
      continue;
    }
    if (!cur.id) { unchanged += 1; continue; } // duplicate row earlier in this batch
    const patch: Record<string, unknown> = {};
    for (const k of FIELDS) if ((r as any)[k] != null && (r as any)[k] !== cur[k]) patch[k] = (r as any)[k];
    if (Object.keys(patch).length) toUpdate.push([cur.id, { ...patch, last_imported_date: now }]);
    else unchanged += 1;
  }
  if (!dryRun) {
    if (toCreate.length) await base44.asServiceRole.entities.SotaSummit.bulkCreate(toCreate);
    for (const [id, patch] of toUpdate) await base44.asServiceRole.entities.SotaSummit.update(id, patch);
  }
  return { added: toCreate.length, updated: toUpdate.length, unchanged };
}
