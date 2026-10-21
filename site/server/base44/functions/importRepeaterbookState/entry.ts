import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/adminGuard.ts';
import { extractRows, buildRepeaterRecord } from '../../shared/repeaterbookParser.ts';
import { listAllByFilter } from '../../shared/filteredPagination.ts';

// ===== APP-SPECIFIC =====
// Imports GMRS repeaters for a given state from RepeaterBook.com's public
// "View All Systems" page. Parses the results table (frequency, tones, city,
// county, owner callsign, open/closed, status), geocodes each unique city via
// OpenStreetMap Nominatim for approximate city-center coordinates, dedupes
// against existing repeaters by callsign+frequency, and bulk-creates Repeater
// records as service role. Admin-only.
// ===== END APP-SPECIFIC =====

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(city, stateAbbr, cache, counter, maxGeocode) {
  const key = `${city.toLowerCase()}|${stateAbbr.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  if (counter.n >= maxGeocode) return null;
  counter.n += 1;
  try {
    const q = encodeURIComponent(`${city}, ${stateAbbr}, USA`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${q}`, {
      headers: { 'User-Agent': 'WaveSyncGMRS/1.0 (gmrs community platform)' },
    });
    const data = await res.json();
    const hit = data && data[0];
    let coords = hit ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) } : null;
    // Validate: reject coordinates outside US bounds (incl. PR & AK/HI)
    if (coords && (coords.lat < 17 || coords.lat > 72 || coords.lng < -180 || coords.lng > -64)) {
      coords = null;
    }
    cache.set(key, coords);
  } catch (e) {
    cache.set(key, null);
  }
  await sleep(1100);
  return cache.get(key);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { caller, error } = await requireAdmin(base44);
    if (error) return error;

    const body = await req.json().catch(() => ({}));
    const stateId = String(body?.state_id || '').trim();
    const stateAbbr = String(body?.state_abbr || '').trim();
    const stateName = String(body?.state_name || '').trim();
    if (!stateId || !stateAbbr) {
      return Response.json({ error: 'state_id and state_abbr are required' }, { status: 400 });
    }

    const url = `https://www.repeaterbook.com/gmrs/Display_SS.php?state_id=${encodeURIComponent(stateId)}`;
    const htmlRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
    });
    if (!htmlRes.ok) {
      console.error('[importRepeaterbookState] RepeaterBook HTTP', htmlRes.status);
      return Response.json({ error: `RepeaterBook request failed (${htmlRes.status})` }, { status: 502 });
    }
    const html = await htmlRes.text();
    const rows = extractRows(html);
    if (!rows.length) {
      return Response.json({ error: 'No repeaters found on the RepeaterBook page for this state.' }, { status: 404 });
    }

    // Only load GMRS repeaters for dedup — the HAM collection is 10k+ records
    // and irrelevant here, so loading it wastes time and API calls.
    const existing = await listAllByFilter(base44.asServiceRole.entities.Repeater, { radio_service: 'GMRS' }, { sort: '-rating', fields: ['callsign', 'frequency'] });
    const existingKeys = new Set((existing || []).map((r) => `${(r.callsign || '').toUpperCase()}|${r.frequency}`));

    const geoCache = new Map();
    const counter = { n: 0 };
    const maxGeocode = 45;

    const toCreate = [];
    let skipped = 0;
    let noCoords = 0;

    for (const row of rows) {
      if (!row.callsign) { skipped++; continue; }
      const key = `${row.callsign.toUpperCase()}|${row.frequency}`;
      if (existingKeys.has(key)) { skipped++; continue; }
      existingKeys.add(key);
      const primaryCity = (row.location.split(',')[0] || row.location).trim();
      const coords = await geocode(primaryCity, stateAbbr, geoCache, counter, maxGeocode);
      if (!coords) noCoords++;
      toCreate.push(buildRepeaterRecord(row, stateAbbr, stateName, coords));
    }

    let imported = 0;
    if (toCreate.length) {
      const created = await base44.asServiceRole.entities.Repeater.bulkCreate(toCreate);
      imported = Array.isArray(created) ? created.length : (created?.length || toCreate.length);
    }

    return Response.json({
      state: stateName,
      total: rows.length,
      imported,
      skipped,
      no_coords: noCoords,
    });
  } catch (error) {
    console.error('[importRepeaterbookState] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}