import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { shouldThrottle } from '../../shared/ipThrottle.ts';

// ===== APP-SPECIFIC =====
// Public amateur-radio data for the operator tools, proxied and cached so
// every visitor shares upstream requests:
//   dx   -- latest DX cluster spots (HamQTH)                    cache 60 s
//   tle  -- amateur-satellite + ISS orbital elements (CelesTrak) cache 6 h
//   wspr -- WSPR spots to/from one callsign (wspr.live)          cache 5 min / call
//   psk  -- PSK Reporter reception reports for one callsign      cache 5 min / call
// PSK Reporter asks each callsign be queried at most once every five
// minutes, and the per-callsign lookups require a logged-in member so the
// function can't be used to hammer those services anonymously.
// ===== END APP-SPECIFIC =====

const UA = { 'User-Agent': 'RepeaterNation/1.0 (+https://repeaternation.com)' };
const cache = new Map<string, { at: number; body: any }>();

function cached(key: string, ttl: number) {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < ttl ? hit.body : null;
}
function store(key: string, body: any) {
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), body });
  return body;
}

function cleanCall(v: unknown): string | null {
  const c = String(v || '').trim().toUpperCase();
  return /^[A-Z0-9/]{3,15}$/.test(c) ? c : null;
}

async function dxSpots() {
  const res = await fetch('https://www.hamqth.com/dxc_csv.php?limit=100', { headers: UA });
  if (!res.ok) throw new Error(`hamqth ${res.status}`);
  const text = await res.text();
  const spots = [];
  for (const line of text.split(/\r?\n/)) {
    const f = line.split('^');
    if (f.length < 9 || !f[2]) continue;
    const [hhmm, date] = String(f[4] || '').split(' ');
    const time = /^\d{4}$/.test(hhmm || '') && /^\d{4}-\d{2}-\d{2}$/.test(date || '')
      ? `${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z` : null;
    spots.push({
      spotter: f[0], frequencyKhz: Number(f[1]) || null, dx: f[2], comment: f[3] || '',
      time, continent: f[7] || '', band: (f[8] || '').toLowerCase(), country: f[9] || '',
    });
  }
  return { spots };
}

async function tle() {
  const [amateur, iss] = await Promise.all([
    fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle', { headers: UA }),
    fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle', { headers: UA }),
  ]);
  if (!amateur.ok) throw new Error(`celestrak ${amateur.status}`);
  const parse = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
    const out = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      if (lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 ')) {
        out.push({ name: lines[i].trim(), line1: lines[i + 1], line2: lines[i + 2] });
      }
    }
    return out;
  };
  const sats = parse(await amateur.text());
  if (iss.ok) {
    for (const s of parse(await iss.text())) {
      if (!sats.some((x) => x.line1.slice(2, 7) === s.line1.slice(2, 7))) sats.unshift({ ...s, name: 'ISS (ZARYA)' });
    }
  }
  return { satellites: sats, fetchedAt: new Date().toISOString() };
}

async function wspr(call: string, hours: number) {
  const q = `SELECT time, band, tx_sign, tx_loc, rx_sign, rx_loc, frequency, snr, distance, power
    FROM wspr.rx WHERE (tx_sign = '${call}' OR rx_sign = '${call}') AND time > now() - INTERVAL ${hours} HOUR
    ORDER BY time DESC LIMIT 300 FORMAT JSON`;
  const res = await fetch(`https://db1.wspr.live/?query=${encodeURIComponent(q)}`, { headers: UA });
  if (!res.ok) throw new Error(`wspr.live ${res.status}`);
  const d: any = await res.json();
  return {
    spots: (d?.data || []).map((r: any) => ({
      time: r.time ? `${String(r.time).replace(' ', 'T')}Z` : null,
      tx: r.tx_sign, txLoc: r.tx_loc, rx: r.rx_sign, rxLoc: r.rx_loc,
      frequencyHz: Number(r.frequency) || null, snr: Number(r.snr), distanceKm: Number(r.distance), powerDbm: Number(r.power),
    })),
  };
}

function attrs(s: string) {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

async function psk(call: string, direction: 'sent' | 'heard') {
  const who = direction === 'sent' ? 'senderCallsign' : 'receiverCallsign';
  const url = `https://retrieve.pskreporter.info/query?${who}=${encodeURIComponent(call)}&flowStartSeconds=-3600&rronly=1&noactive=1`;
  const res = await fetch(url, { headers: UA });
  if (res.status === 503 || res.status === 429) throw new Error('PSK Reporter is busy; try again in a few minutes.');
  if (!res.ok) throw new Error(`pskreporter ${res.status}`);
  const xml = await res.text();
  const reports = [];
  for (const m of xml.matchAll(/<receptionReport\s([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    reports.push({
      sender: a.senderCallsign, senderLocator: a.senderLocator || '',
      receiver: a.receiverCallsign, receiverLocator: a.receiverLocator || '',
      frequencyHz: Number(a.frequency) || null, mode: a.mode || '', snr: a.sNR != null ? Number(a.sNR) : null,
      time: a.flowStartSeconds ? new Date(Number(a.flowStartSeconds) * 1000).toISOString() : null,
      receiverCountry: a.receiverDXCC || '', senderCountry: a.senderDXCC || '',
    });
  }
  return { reports: reports.slice(0, 500) };
}

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // Public dx/tle paths are cached, but throttle per-IP to prevent one
    // source from forcing unique upstream fetches (cache misses on params
    // we don't key by). wspr/psk are already auth-gated + per-callsign cached.
    if (action === 'dx' || action === 'tle') {
      const { throttled } = shouldThrottle(req, 30, 60_000);
      if (throttled) return Response.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
    }

    if (action === 'dx') {
      return Response.json(cached('dx', 60_000) || store('dx', { ok: true, ...(await dxSpots()) }));
    }
    if (action === 'tle') {
      return Response.json(cached('tle', 6 * 3600_000) || store('tle', { ok: true, ...(await tle()) }));
    }

    if (action === 'wspr' || action === 'psk') {
      const base44 = createClientFromRequest(req);
      const me = await base44.auth.me().catch(() => null);
      if (!me) return Response.json({ error: 'Sign in to look up a callsign.' }, { status: 401 });
      const call = cleanCall(body.callsign);
      if (!call) return Response.json({ error: 'Enter a valid callsign.' }, { status: 400 });
      if (action === 'wspr') {
        const hours = [1, 6, 24].includes(Number(body.hours)) ? Number(body.hours) : 24;
        const key = `wspr:${call}:${hours}`;
        return Response.json(cached(key, 5 * 60_000) || store(key, { ok: true, callsign: call, ...(await wspr(call, hours)) }));
      }
      const direction = body.direction === 'heard' ? 'heard' : 'sent';
      const key = `psk:${call}:${direction}`;
      return Response.json(cached(key, 5 * 60_000) || store(key, { ok: true, callsign: call, direction, ...(await psk(call, direction)) }));
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error?.message || 'Data source unavailable';
    console.error('[radio-data]', message);
    return Response.json({ error: /busy/i.test(message) ? message : 'That data source is unavailable right now. Try again shortly.' }, { status: 502 });
  }
}