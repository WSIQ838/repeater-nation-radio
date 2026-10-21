// Channel and zone lookups for the radio functions (issue-radio-session, radio-ptt).
//
// Service-role reads have been failing intermittently (seen 2026-10-04: about
// half of all asServiceRole reads errored or came back empty, site-wide), and
// getByIdWithFallback swallows those failures, so every radio session and PTT
// press reported "Channel not found" for channels that exist. RadioChannel and
// RadioZone are readable by everyone (rls.read = {}), so the caller's own
// client can read them as well. Try both, and a few times, before concluding a
// record is really missing.

const RETRY_MS = [150, 400, 900];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sources(base44: any, name: string): any[] {
  const out: any[] = [];
  try { if (base44?.asServiceRole?.entities?.[name]) out.push(base44.asServiceRole.entities[name]); } catch { /* no service role */ }
  try { if (base44?.entities?.[name]) out.push(base44.entities[name]); } catch { /* no caller client */ }
  return out;
}

async function withRetries(base44: any, name: string, readOne: (entity: any) => Promise<any>): Promise<any | null> {
  const entities = sources(base44, name);
  for (let attempt = 0; attempt <= RETRY_MS.length; attempt++) {
    for (const entity of entities) {
      const found = await readOne(entity).catch(() => null);
      if (found) return found;
    }
    if (attempt < RETRY_MS.length) await sleep(RETRY_MS[attempt]);
  }
  console.warn(`[radioLookup] ${name} not found after ${RETRY_MS.length + 1} tries`);
  return null;
}

// A radio record by id: a direct read, then the small list (these entities
// hold a handful of rows), first as the service role, then as the caller.
export function findRadioRecord(base44: any, name: 'RadioChannel' | 'RadioZone', id: string, sort: string): Promise<any | null> {
  if (!id) return Promise.resolve(null);
  return withRetries(base44, name, async (entity) => {
    const direct = await entity.get(id).catch(() => null);
    if (direct && (!direct.id || direct.id === id)) return direct;
    const rows = await entity.list(sort, 500).catch(() => null);
    return (rows || []).find((r: any) => r.id === id) || null;
  });
}

// Rows matching a filter on an everyone-readable radio entity. Returns the
// first non-empty answer from either source; an empty list only once two reads
// have answered empty (a failing read can come back empty instead of
// erroring); null when no read answered at all. Callers must treat null as
// "unknown" and never create a record on it.
export async function readRadioRows(base44: any, name: string, query: Record<string, unknown>, sort: string, limit: number): Promise<any[] | null> {
  const entities = sources(base44, name);
  let emptyAnswers = 0;
  for (let attempt = 0; attempt <= RETRY_MS.length; attempt++) {
    for (const entity of entities) {
      const rows = await entity.filter(query, sort, limit).catch(() => null);
      if (!Array.isArray(rows)) continue;
      if (rows.length) return rows;
      if (++emptyAnswers >= 2) return [];
    }
    if (attempt < RETRY_MS.length) await sleep(RETRY_MS[attempt]);
  }
  console.warn(`[radioLookup] ${name} read failed after ${RETRY_MS.length + 1} tries`);
  return null;
}

// The enabled channel with this number in this zone, for an older or stale
// channel id the client still holds.
export function findRadioChannelByNumber(base44: any, zoneId: string, number: number): Promise<any | null> {
  return withRetries(base44, 'RadioChannel', async (entity) => {
    const rows = await entity.filter({ zone_id: zoneId, number }, 'number', 5).catch(() => null);
    return (rows || []).find((c: any) => c.enabled !== false) || null;
  });
}
