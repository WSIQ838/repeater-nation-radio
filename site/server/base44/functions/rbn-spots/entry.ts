import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { unzipSync } from 'npm:fflate@0.8.2';
import { Buffer } from 'node:buffer';

// ===== APP-SPECIFIC =====
// Reverse Beacon Network lookups for the RBN tool, built on RBN's public
// daily raw-data archives (https://www.reversebeacon.net/raw_data/). RBN has
// no query API, so this shows the most recent complete UTC day: which
// skimmers heard a callsign (or what a skimmer heard), with SNR and speed.
// The day's zip (~10 MB, ~65 MB CSV, ~1M spots) is downloaded at most once
// per day per instance and kept as raw bytes; each lookup is a native byte
// search for ",CALL," instead of parsing every row.
// ===== END APP-SPECIFIC =====

const UA = { 'User-Agent': 'RepeaterNation/1.0 (+https://repeaternation.com)' };
const MAX_ROWS = 1000;
const COLUMNS = ['callsign', 'de_pfx', 'de_cont', 'freq', 'band', 'dx', 'dx_pfx', 'dx_cont', 'mode', 'db', 'date', 'speed', 'tx_mode'];

let day: { date: string; data: Buffer } | null = null;
let loading: Promise<{ date: string; data: Buffer }> | null = null;

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

async function loadLatestDay() {
  // The newest archive is normally yesterday (UTC); fall back a day or two.
  for (let back = 1; back <= 3; back += 1) {
    const date = ymd(new Date(Date.now() - back * 86_400_000));
    if (day?.date === date) return day;
    const res = await fetch(`https://data.reversebeacon.net/rbn_history/${date}.zip`, { headers: UA });
    if (res.status === 404 || res.status === 403) continue;
    if (!res.ok) throw new Error(`RBN archive HTTP ${res.status}`);
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const csv = Object.values(files)[0];
    if (!csv) throw new Error('RBN archive was empty');
    day = { date, data: Buffer.from(csv.buffer, csv.byteOffset, csv.byteLength) };
    return day;
  }
  throw new Error('No recent RBN archive is available yet');
}

let lastCheck = 0;
const RECHECK_MS = 30 * 60 * 1000;

async function getDay() {
  const want = ymd(new Date(Date.now() - 86_400_000));
  // Until yesterday's archive is published, keep serving the older day and
  // only look for the new one every 30 minutes.
  if (day && (day.date === want || Date.now() - lastCheck < RECHECK_MS)) return day;
  if (!loading) {
    lastCheck = Date.now();
    loading = loadLatestDay().finally(() => { loading = null; });
  }
  return loading;
}

function search(data: Buffer, call: string, role: 'dx' | 'skimmer') {
  const needle = Buffer.from(role === 'dx' ? `,${call},` : `\n${call},`);
  const col = role === 'dx' ? 5 : 0;
  const rows = [];
  let pos = data.indexOf(needle);
  let total = 0;
  while (pos !== -1) {
    const start = role === 'skimmer' ? pos + 1 : data.lastIndexOf(10, pos) + 1;
    let end = data.indexOf(10, pos + 1);
    if (end === -1) end = data.length;
    const f = data.toString('utf8', start, end).replace(/\r$/, '').split(',');
    if (f[col] === call) {
      total += 1;
      if (rows.length < MAX_ROWS) {
        const r: Record<string, string> = {};
        COLUMNS.forEach((c, i) => { r[c] = f[i] ?? ''; });
        rows.push({
          skimmer: r.callsign, skimmerContinent: r.de_cont, frequencyKhz: Number(r.freq) || null, band: r.band,
          dx: r.dx, dxContinent: r.dx_cont, snr: Number(r.db), time: r.date ? `${r.date.replace(' ', 'T')}Z` : null,
          speed: Number(r.speed) || null, mode: r.tx_mode || r.mode,
        });
      }
    }
    pos = data.indexOf(needle, end);
  }
  return { rows, total };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Sign in to search the Reverse Beacon Network.' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const call = String(body.callsign || '').trim().toUpperCase();
    if (!/^[A-Z0-9/-]{3,15}$/.test(call)) return Response.json({ error: 'Enter a valid callsign.' }, { status: 400 });
    const role = body.role === 'skimmer' ? 'skimmer' : 'dx';
    const d = await getDay();
    const { rows, total } = search(d.data, call, role);
    return Response.json({ ok: true, callsign: call, role, day: `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`, total, rows });
  } catch (error) {
    console.error('[rbn-spots]', error?.message || error);
    return Response.json({ error: 'Reverse Beacon Network data is unavailable right now. Try again shortly.' }, { status: 502 });
  }
}
