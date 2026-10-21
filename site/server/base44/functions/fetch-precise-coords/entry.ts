import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { listAll, requireAdmin } from '../../shared/adminGuard.ts';

// ===== APP-SPECIFIC =====
// Replaces approximate city-center coordinates with precise GPS coordinates
// fetched from each repeater's RepeaterBook detail page. Finds repeaters whose
// notes contain "approx. city-center coordinates", extracts the RepeaterBook
// ID and state from the record, fetches the GMRS detail page, parses the GPS
// coordinates from the HTML, and bulk-updates. Admin-only. Rate-limited at
// 1.1s per request (RepeaterBook courtesy) — ~80 lookups fit in the function
// timeout. Call repeatedly until `remaining` is 0.
// ===== END APP-SPECIFIC =====

const STATE_ABBR_TO_ID: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09',
  DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17',
  IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24',
  MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31',
  NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38',
  OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46',
  TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54',
  WI: '55', WY: '56', PR: '72',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_FETCH_PER_CALL = 80;

function parseRepeaterbookId(notes: string): string | null {
  const m = (notes || '').match(/ID\s+(\d+)/);
  return m ? m[1] : null;
}

function parseStateAbbr(name: string): string | null {
  const parts = (name || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const last = parts[parts.length - 1].toUpperCase();
  return /^[A-Z]{2}$/.test(last) ? last : null;
}

function parseGPS(html: string): { lat: number; lng: number } | null {
  const m = html.match(/GPS\*?:<\/i><\/td>\s*<td>\s*<i>\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*<\/i>/i);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < 17 || lat > 72 || lng < -180 || lng > -64) return null;
  return { lat, lng };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const { error } = await requireAdmin(base44);
    if (error) return error;

    const all = await listAll(base44.asServiceRole.entities.Repeater);
    const approximate = (all || []).filter((r) => {
      const n = r.notes || '';
      return n.includes('approx. city-center coordinates') || n.includes('city-center coordinates pending');
    });

    let precise = 0;
    let noGps = 0;
    let fetchErrors = 0;
    let skipped = 0;
    const toUpdate: Array<{ id: string; lat?: number; lng?: number; notes: string }> = [];
    let lookups = 0;

    for (const r of approximate) {
      if (lookups >= MAX_FETCH_PER_CALL) break;
      const rbId = parseRepeaterbookId(r.notes);
      const stateAbbr = parseStateAbbr(r.name);
      const stateId = stateAbbr ? STATE_ABBR_TO_ID[stateAbbr] : null;
      if (!rbId || !stateId) {
        // Can't look up — mark as checked so it's not retried
        skipped++;
        toUpdate.push({ id: r.id, notes: (r.notes || '').replace('approx. city-center coordinates', 'city-center coordinates (RepeaterBook ID unparseable)') });
        continue;
      }

      lookups++;
      try {
        const url = `https://www.repeaterbook.com/gmrs/details.php?state_id=${stateId}&ID=${rbId}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' },
        });
        if (!res.ok) { fetchErrors++; await sleep(1100); continue; }
        const html = await res.text();
        const coords = parseGPS(html);
        if (coords) {
          const newNotes = (r.notes || '').replace('approx. city-center coordinates', 'precise coordinates from RepeaterBook');
          toUpdate.push({ id: r.id, lat: coords.lat, lng: coords.lng, notes: newNotes });
          precise++;
        } else {
          // Detail page exists but no GPS data — mark so it's not retried
          toUpdate.push({ id: r.id, notes: (r.notes || '').replace('approx. city-center coordinates', 'city-center coordinates (no precise GPS on RepeaterBook)') });
          noGps++;
        }
      } catch (e) {
        fetchErrors++;
      }
      await sleep(1100);
    }

    if (toUpdate.length) {
      await base44.asServiceRole.entities.Repeater.bulkUpdate(toUpdate);
    }

    return Response.json({
      total_approximate: approximate.length,
      lookups,
      precise,
      no_gps: noGps,
      fetch_errors: fetchErrors,
      skipped,
      updated: toUpdate.length,
      remaining: Math.max(0, approximate.length - toUpdate.length),
    });
  } catch (error) {
    console.error('[fetch-precise-coords] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}