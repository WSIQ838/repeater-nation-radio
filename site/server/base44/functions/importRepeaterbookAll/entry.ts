import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { extractRows, buildRepeaterRecord } from '../../shared/repeaterbookParser.ts';
import { requireAdmin } from '../../shared/adminGuard.ts';
import { listAllByFilter } from '../../shared/filteredPagination.ts';

// ===== APP-SPECIFIC =====
// Imports GMRS repeaters for ALL states/territories from RepeaterBook.com in a
// single pass. Fetches each state's "View All Systems" page (in parallel
// batches), parses rows, dedupes against the full existing Repeater set by
// callsign+frequency, and bulk-creates new records WITHOUT coordinates (run
// the geocode-repeaters function afterward to backfill lat/lng). Admin-only.
// ===== END APP-SPECIFIC =====

const STATES = [
  ['01', 'AL', 'Alabama'], ['02', 'AK', 'Alaska'], ['04', 'AZ', 'Arizona'], ['05', 'AR', 'Arkansas'],
  ['06', 'CA', 'California'], ['09', 'CT', 'Connecticut'], ['08', 'CO', 'Colorado'], ['10', 'DE', 'Delaware'],
  ['11', 'DC', 'District of Columbia'], ['12', 'FL', 'Florida'], ['13', 'GA', 'Georgia'], ['15', 'HI', 'Hawaii'],
  ['16', 'ID', 'Idaho'], ['17', 'IL', 'Illinois'], ['18', 'IN', 'Indiana'], ['19', 'IA', 'Iowa'],
  ['20', 'KS', 'Kansas'], ['21', 'KY', 'Kentucky'], ['22', 'LA', 'Louisiana'], ['23', 'ME', 'Maine'],
  ['24', 'MD', 'Maryland'], ['25', 'MA', 'Massachusetts'], ['26', 'MI', 'Michigan'], ['27', 'MN', 'Minnesota'],
  ['28', 'MS', 'Mississippi'], ['29', 'MO', 'Missouri'], ['30', 'MT', 'Montana'], ['31', 'NE', 'Nebraska'],
  ['32', 'NV', 'Nevada'], ['33', 'NH', 'New Hampshire'], ['34', 'NJ', 'New Jersey'], ['35', 'NM', 'New Mexico'],
  ['36', 'NY', 'New York'], ['37', 'NC', 'North Carolina'], ['38', 'ND', 'North Dakota'], ['39', 'OH', 'Ohio'],
  ['40', 'OK', 'Oklahoma'], ['41', 'OR', 'Oregon'], ['42', 'PA', 'Pennsylvania'], ['44', 'RI', 'Rhode Island'],
  ['45', 'SC', 'South Carolina'], ['46', 'SD', 'South Dakota'], ['47', 'TN', 'Tennessee'], ['48', 'TX', 'Texas'],
  ['49', 'UT', 'Utah'], ['50', 'VT', 'Vermont'], ['51', 'VA', 'Virginia'], ['53', 'WA', 'Washington'],
  ['54', 'WV', 'West Virginia'], ['55', 'WI', 'Wisconsin'], ['56', 'WY', 'Wyoming'], ['72', 'PR', 'Puerto Rico'],
];

async function fetchStateRows(stateId, stateAbbr, stateName) {
  const url = `https://www.repeaterbook.com/gmrs/Display_SS.php?state_id=${encodeURIComponent(stateId)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' },
    });
    if (!res.ok) { console.error(`[importRepeaterbookAll] ${stateAbbr} HTTP ${res.status}`); return []; }
    const html = await res.text();
    return extractRows(html);
  } catch (e) {
    console.error(`[importRepeaterbookAll] ${stateAbbr} fetch error`, e?.message || e);
    return [];
  }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { caller, error } = await requireAdmin(base44);
    if (error) return error;

    // Only load GMRS repeaters for dedup (the HAM collection is 10k+ records and
    // irrelevant here). This cuts the dedup load from 24 pages to 1.
    const existingRows = await listAllByFilter(base44.asServiceRole.entities.Repeater, { radio_service: 'GMRS' }, { sort: '-rating', fields: ['callsign', 'frequency'] });
    const existingKeys = new Set((existingRows || []).map((r: any) => `${(r.callsign || '').toUpperCase()}|${r.frequency}`));

    // Fetch all states in parallel batches of 12 to stay well under the timeout.
    const allRows = [];
    const batchSize = 12;
    for (let i = 0; i < STATES.length; i += batchSize) {
      const slice = STATES.slice(i, i + batchSize);
      const results = await Promise.all(slice.map(([id, abbr, name]) => fetchStateRows(id, abbr, name)));
      results.forEach((rows, idx) => {
        const [, abbr, name] = slice[idx];
        for (const row of rows) allRows.push({ row, abbr, name });
      });
    }

    const toCreate = [];
    let skipped = 0;
    for (const { row, abbr, name } of allRows) {
      if (!row.callsign) { skipped++; continue; }
      const key = `${row.callsign.toUpperCase()}|${row.frequency}`;
      if (existingKeys.has(key)) { skipped++; continue; }
      existingKeys.add(key);
      toCreate.push(buildRepeaterRecord(row, abbr, name, null));
    }

    let imported = 0;
    for (let i = 0; i < toCreate.length; i += 500) {
      const slice = toCreate.slice(i, i + 500);
      const created = await base44.asServiceRole.entities.Repeater.bulkCreate(slice);
      imported += Array.isArray(created) ? created.length : slice.length;
    }

    return Response.json({
      states: STATES.length,
      total_rows: allRows.length,
      imported,
      skipped,
      existing_before: existingKeys.size - (allRows.length - skipped),
    });
  } catch (error) {
    console.error('[importRepeaterbookAll] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}