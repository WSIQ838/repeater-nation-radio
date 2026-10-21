import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin, writeAudit } from '../../shared/adminGuard.ts';
import { extractHamRows, buildHamRepeaterRecord } from '../../shared/repeaterbookHamHtmlParser.ts';
import { listAllByFilter } from '../../shared/filteredPagination.ts';

// ===== APP-SPECIFIC =====
// Imports HAM (amateur radio) repeaters for a given state from RepeaterBook.com's
// public "/repeaters/Display_SS.php" results page — the same public-page approach
// already used by importRepeaterbookState for GMRS, applied to the general/amateur
// section instead. This does not require the RepeaterBook API app token, so it
// works independently of that credential's status. Single state, admin-triggered;
// intentionally not looped across all states automatically.
// ===== END APP-SPECIFIC =====

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geocode(city: string, stateAbbr: string, cache: Map<string, any>, counter: { n: number }, maxGeocode: number) {
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

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  const { caller, error } = await requireAdmin(base44);
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const stateId = String(body?.state_id || '').trim();
    const stateAbbr = String(body?.state_abbr || '').trim();
    const stateName = String(body?.state_name || '').trim();
    if (!stateId || !stateAbbr) {
      return Response.json({ error: 'state_id and state_abbr are required' }, { status: 400 });
    }

    const url = `https://www.repeaterbook.com/repeaters/Display_SS.php?state_id=${encodeURIComponent(stateId)}`;
    const htmlRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
    });
    if (!htmlRes.ok) {
      console.error('[importRepeaterbookHamState] RepeaterBook HTTP', htmlRes.status);
      return Response.json({ error: `RepeaterBook request failed (${htmlRes.status})` }, { status: 502 });
    }
    const html = await htmlRes.text();
    const rows = extractHamRows(html);
    if (!rows.length) {
      return Response.json({ error: 'No HAM repeaters found on the RepeaterBook page for this state.' }, { status: 404 });
    }

    // Only load HAM repeaters for dedup — loading the GMRS collection too is
    // wasteful. Uses cursor pagination for efficiency.
    const existing = await listAllByFilter(base44.asServiceRole.entities.Repeater, { radio_service: 'HAM' }, { sort: '-created_date', fields: ['callsign', 'frequency', 'lat', 'lng'] });
    const existingByKey = new Map<string, any>();
    for (const r of existing) {
      existingByKey.set(`${String(r.callsign || '').toUpperCase()}|${r.frequency}`, r);
    }

    const geoCache = new Map<string, any>();
    const counter = { n: 0 };
    const maxGeocode = 45;

    const toCreate: any[] = [];
    const toUpdate: { id: string; record: any }[] = [];
    let skipped = 0;
    let noCoords = 0;

    for (const row of rows) {
      const key = `${row.callsign}|${row.frequency}`;
      const current = existingByKey.get(key);
      const primaryCity = (row.location.split(',')[0] || row.location).trim();
      const coords = current ? { lat: current.lat, lng: current.lng } : await geocode(primaryCity, stateAbbr, geoCache, counter, maxGeocode);
      if (!coords) noCoords++;
      const record = buildHamRepeaterRecord(row, stateAbbr, stateName, coords);

      if (current) {
        toUpdate.push({ id: current.id, record });
      } else {
        toCreate.push(record);
      }
    }

    let created = 0;
    if (toCreate.length) {
      const createdRecords = await base44.asServiceRole.entities.Repeater.bulkCreate(toCreate);
      created = Array.isArray(createdRecords) ? createdRecords.length : (createdRecords?.length || toCreate.length);
    }

    let updated = 0;
    for (const { id, record } of toUpdate) {
      await base44.asServiceRole.entities.Repeater.update(id, record);
      updated++;
    }

    await writeAudit(base44, {
      admin_id: caller.id,
      admin_name: caller.name || caller.email || '',
      action: 'repeaterbook_ham_state_import',
      category: 'repeaters',
      target_type: 'Repeater',
      target_label: `HAM RepeaterBook state import — ${stateName || stateId}`,
      meta: { state_id: stateId, total: rows.length, created, updated, skipped, no_coords: noCoords },
    });

    return Response.json({
      state: stateName,
      total: rows.length,
      imported: created,
      updated,
      skipped,
      no_coords: noCoords,
    });
  } catch (error: any) {
    console.error('[importRepeaterbookHamState] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}