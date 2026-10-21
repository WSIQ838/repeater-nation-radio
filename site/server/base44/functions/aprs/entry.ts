import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { secrets } from 'base44:runtime';

// ===== APP-SPECIFIC =====
// APRS positions and weather for the APRS tool, via the aprs.fi API
// (https://aprs.fi/page/api). Needs a site-wide aprs.fi API key in the
// APRS_FI_API_KEY secret (free: create an aprs.fi account, then copy the key
// from "My account"). Without it the tool reports "not configured" instead
// of failing. aprs.fi asks API users to identify their app, link back to
// aprs.fi, and not over-poll, so results are cached per lookup for 60 s and
// lookups require a signed-in member.
// ===== END APP-SPECIFIC =====

const UA = 'RepeaterNation/1.0 (+https://repeaternation.com)';
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; body: any }>();

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Sign in to look up APRS stations.' }, { status: 401 });

    const key = secrets.get('APRS_FI_API_KEY');
    if (!key) return Response.json({ ok: false, notConfigured: true, error: 'APRS lookups are not set up on this site yet.' });

    const body = await req.json().catch(() => ({}));
    const what = body.what === 'wx' ? 'wx' : 'loc';
    const names = [...new Set(String(body.names || '').toUpperCase().split(/[\s,]+/).filter((n) => /^[A-Z0-9-]{3,12}$/.test(n)))].slice(0, 20);
    if (!names.length) return Response.json({ error: 'Enter one or more callsigns, e.g. W1AW or W1AW-9.' }, { status: 400 });

    const cacheKey = `${what}:${names.sort().join(',')}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS) return Response.json(hit.body);

    const url = `https://api.aprs.fi/api/get?name=${encodeURIComponent(names.join(','))}&what=${what}&apikey=${encodeURIComponent(key)}&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`aprs.fi HTTP ${res.status}`);
    const d: any = await res.json();
    if (d?.result !== 'ok') {
      console.error('[aprs] aprs.fi error', d?.code, d?.description);
      return Response.json({ ok: false, error: d?.code === 'apikey-wrong' ? 'The site\'s aprs.fi API key was rejected.' : 'aprs.fi could not answer that lookup.' }, { status: 502 });
    }
    const entries = (d.entries || []).map((e: any) => (what === 'wx'
      ? { name: e.name, time: e.time ? new Date(Number(e.time) * 1000).toISOString() : null, temp: e.temp ?? null, humidity: e.humidity ?? null, pressure: e.pressure ?? null, windDirection: e.wind_direction ?? null, windSpeed: e.wind_speed ?? null, windGust: e.wind_gust ?? null, rain1h: e.rain_1h ?? null }
      : {
        name: e.name, srccall: e.srccall || e.name, lat: Number(e.lat), lng: Number(e.lng),
        time: e.lasttime ? new Date(Number(e.lasttime) * 1000).toISOString() : (e.time ? new Date(Number(e.time) * 1000).toISOString() : null),
        comment: e.comment || '', status: e.status || '', speed: e.speed != null ? Number(e.speed) : null, course: e.course != null ? Number(e.course) : null,
        altitude: e.altitude != null ? Number(e.altitude) : null, symbol: e.symbol || '', path: e.path || '',
      }));
    const out = { ok: true, what, names, found: entries.length, entries };
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { at: Date.now(), body: out });
    return Response.json(out);
  } catch (error) {
    console.error('[aprs]', error?.message || error);
    return Response.json({ error: 'aprs.fi is unavailable right now. Try again shortly.' }, { status: 502 });
  }
}
