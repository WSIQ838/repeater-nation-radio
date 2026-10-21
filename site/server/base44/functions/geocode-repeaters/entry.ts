import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { listAll, requireAdmin } from '../../shared/adminGuard.ts';

// ===== APP-SPECIFIC =====
// Backfills lat/lng for Repeater records missing coordinates by geocoding the
// city/state parsed from the repeater name (format "City, [Landmark,] ST")
// via OpenStreetMap Nominatim. Admin-only. Uses an in-call city cache so
// repeat cities are instant, and caps geocode lookups per call (Nominatim's
// 1 req/sec limit means ~90 lookups fit in the function timeout) — call
// repeatedly until `remaining` is 0. Skips records that already have coords
// or whose name can't be parsed.
// ===== END APP-SPECIFIC =====

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_GEOCODE_PER_CALL = 90;

async function geocode(city, stateAbbr, cache, counter) {
  const key = `${city.toLowerCase()}|${stateAbbr.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  if (counter.n >= MAX_GEOCODE_PER_CALL) return null;
  counter.n += 1;
  try {
    const q = encodeURIComponent(`${city}, ${stateAbbr}, USA`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${q}`, {
      headers: { 'User-Agent': 'WaveSyncGMRS/1.0 (gmrs community platform)' },
    });
    const data = await res.json();
    const hit = data && data[0];
    let coords = hit ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) } : null;
    if (coords && (coords.lat < 17 || coords.lat > 72 || coords.lng < -180 || coords.lng > -64)) coords = null;
    cache.set(key, coords);
  } catch (e) {
    cache.set(key, null);
  }
  await sleep(1100);
  return cache.get(key);
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const { error } = await requireAdmin(base44);
    if (error) return error;

    const all = await listAll(base44.asServiceRole.entities.Repeater);
    const missing = (all || []).filter((r) => r.lat == null || r.lng == null);

    const cache = new Map();
    const counter = { n: 0 };
    let updated = 0;
    let noParse = 0;
    let noResult = 0;
    let capped = false;

    for (const r of missing) {
      if (counter.n >= MAX_GEOCODE_PER_CALL) { capped = true; break; }
      const name = (r.name || '').trim();
      const parts = name.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) { noParse++; continue; }
      const city = parts[0];
      const stateAbbr = parts[parts.length - 1].toUpperCase();
      if (stateAbbr.length !== 2) { noParse++; continue; }

      const coords = await geocode(city, stateAbbr, cache, counter);
      if (!coords) { noResult++; continue; }
      await base44.asServiceRole.entities.Repeater.update(r.id, { lat: coords.lat, lng: coords.lng });
      updated++;
    }

    return Response.json({
      total_missing: missing.length,
      updated,
      no_parse: noParse,
      no_result: noResult,
      geocode_lookups: counter.n,
      capped,
      remaining: Math.max(0, missing.length - updated - noParse),
    });
  } catch (error) {
    console.error('[geocode-repeaters] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}