import { shouldThrottle } from '../../shared/ipThrottle.ts';

// ===== APP-SPECIFIC =====
// Public solar / space-weather data for the Space Weather and HF Propagation
// tools. Combines N0NBH's hamqsl.com solar feed (SFI, sunspots, A/K index,
// calculated HF band conditions, VHF phenomena) with NOAA SWPC's planetary
// Kp history and R/S/G space-weather scales.
//
// Both sources update every few minutes at most, so the combined result is
// cached in memory for CACHE_MS: every visitor shares one upstream fetch, and
// these pages can't add meaningful load to the upstream services or this app.
// ===== END APP-SPECIFIC =====

const CACHE_MS = 10 * 60 * 1000;
const UA = { 'User-Agent': 'RepeaterNation/1.0 (+https://repeaternation.com)' };
let cached: { at: number; body: any } | null = null;

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
  const v = m ? m[1].trim() : '';
  return v && !/^no ?re?po?r?t$/i.test(v) ? v : null;
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchSolar() {
  const res = await fetch('https://www.hamqsl.com/solarxml.php', { headers: UA });
  if (!res.ok) throw new Error(`hamqsl ${res.status}`);
  const xml = await res.text();
  const bands: any[] = [];
  for (const m of xml.matchAll(/<band name="([^"]+)" time="(day|night)">([^<]*)<\/band>/gi)) {
    bands.push({ band: m[1], time: m[2].toLowerCase(), condition: m[3].trim() });
  }
  const vhf: any[] = [];
  for (const m of xml.matchAll(/<phenomenon name="([^"]+)" location="([^"]+)">([^<]*)<\/phenomenon>/gi)) {
    vhf.push({ name: m[1], location: m[2], condition: m[3].trim() });
  }
  return {
    updated: tag(xml, 'updated'),
    solarFlux: num(tag(xml, 'solarflux')),
    sunspots: num(tag(xml, 'sunspots')),
    aIndex: num(tag(xml, 'aindex')),
    kIndex: num(tag(xml, 'kindex')),
    xray: tag(xml, 'xray'),
    protonFlux: num(tag(xml, 'protonflux')),
    electronFlux: num(tag(xml, 'electonflux')),
    aurora: num(tag(xml, 'aurora')),
    auroraLatitude: num(tag(xml, 'latdegree')),
    solarWind: num(tag(xml, 'solarwind')),
    magneticField: num(tag(xml, 'magneticfield')),
    geomagField: tag(xml, 'geomagfield'),
    signalNoise: tag(xml, 'signalnoise'),
    muf: tag(xml, 'muf'),
    fof2: tag(xml, 'fof2'),
    bands,
    vhf,
  };
}

async function fetchKp() {
  const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { headers: UA });
  if (!res.ok) throw new Error(`swpc kp ${res.status}`);
  const rows: any[] = await res.json();
  // SWPC has served this as both an array of objects and a header row plus
  // arrays; accept either.
  const out: { time: string; kp: number }[] = [];
  for (const r of rows || []) {
    if (Array.isArray(r)) {
      if (r[0] === 'time_tag') continue;
      const kp = Number(r[1]);
      if (r[0] && Number.isFinite(kp)) out.push({ time: String(r[0]), kp });
    } else if (r && r.time_tag != null) {
      const kp = Number(r.Kp ?? r.kp);
      if (Number.isFinite(kp)) out.push({ time: String(r.time_tag), kp });
    }
  }
  return out.slice(-24); // last 3 days of 3-hour readings
}

async function fetchScales() {
  const res = await fetch('https://services.swpc.noaa.gov/products/noaa-scales.json', { headers: UA });
  if (!res.ok) throw new Error(`swpc scales ${res.status}`);
  const d: any = await res.json();
  const day = (k: string) => {
    const x = d?.[k];
    if (!x) return null;
    return {
      date: x.DateStamp || null,
      r: { scale: x.R?.Scale ?? null, text: x.R?.Text ?? null, minorProb: x.R?.MinorProb ?? null, majorProb: x.R?.MajorProb ?? null },
      s: { scale: x.S?.Scale ?? null, text: x.S?.Text ?? null, prob: x.S?.Prob ?? null },
      g: { scale: x.G?.Scale ?? null, text: x.G?.Text ?? null },
    };
  };
  return { current: day('0'), forecast: ['1', '2', '3'].map(day).filter(Boolean) };
}

export default async function(req: Request): Promise<Response> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Response.json(cached.body);
  const { throttled } = shouldThrottle(req, 20, 60_000);
  if (throttled) return Response.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const [solar, kp, scales] = await Promise.allSettled([fetchSolar(), fetchKp(), fetchScales()]);
  for (const r of [solar, kp, scales]) {
    if (r.status === 'rejected') console.error('[space-weather]', r.reason?.message || r.reason);
  }
  if (solar.status === 'rejected' && kp.status === 'rejected' && scales.status === 'rejected') {
    if (cached) return Response.json({ ...cached.body, stale: true });
    return Response.json({ error: 'Space-weather data is unavailable right now. Try again in a few minutes.' }, { status: 502 });
  }
  const body = {
    ok: true,
    fetchedAt: new Date().toISOString(),
    solar: solar.status === 'fulfilled' ? solar.value : null,
    kp: kp.status === 'fulfilled' ? kp.value : [],
    scales: scales.status === 'fulfilled' ? scales.value : null,
  };
  cached = { at: Date.now(), body };
  return Response.json(body);
}