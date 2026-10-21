// ===== APP-SPECIFIC =====
// Public digital-voice network directories for the operator tools. Each
// upstream list is fetched at most once per cache window and shared by
// every visitor, then trimmed to what the pages display:
//   brandmeister -- BrandMeister DMR repeaters on the US master (3102)  1 h
//   xlx          -- XLX multi-mode (D-STAR/DMR/YSF) reflector list       1 h
//   allstar      -- AllStarLink node directory, searched server-side    6 h
//   allstar_node -- live status for one AllStarLink node                 1 min
//   echolink     -- EchoLink repeaters, links and conferences online    5 min
//   wiresx       -- Yaesu WIRES-X active node list                       1 h
// ===== END APP-SPECIFIC =====

const UA = { 'User-Agent': 'RepeaterNation/1.0 (+https://repeaternation.com)' };
const HOUR = 3600_000;
const cache = new Map<string, { at: number; value: any }>();

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  try {
    const value = await load();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    if (hit) return hit.value; // serve stale data rather than nothing
    throw e;
  }
}

async function text(url: string) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.text();
}

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").trim();

// "N:10 39' 49"" -> 10.663
function dms(v: string): number | null {
  const m = decode(v || '').match(/^([NSEW]):\s*(\d+)\s+(\d+)'\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const val = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600;
  return Math.round((/[SW]/i.test(m[1]) ? -val : val) * 10000) / 10000;
}

async function brandmeister() {
  const res = await fetch('https://api.brandmeister.network/v2/device/byMaster/3102', { headers: UA });
  if (!res.ok) throw new Error(`brandmeister ${res.status}`);
  const rows: any[] = await res.json();
  const cutoff = Date.now() - 7 * 24 * HOUR;
  const repeaters = (rows || [])
    .filter((d) => d.lat && d.lng && d.tx && d.rx && d.tx !== d.rx)
    .filter((d) => !d.last_seen || Date.parse(`${String(d.last_seen).replace(' ', 'T')}Z`) > cutoff)
    .map((d) => ({ id: d.id, callsign: d.callsign, tx: d.tx, rx: d.rx, cc: d.colorcode, lat: d.lat, lng: d.lng, city: d.city || '', hardware: d.hardware || '', lastSeen: d.last_seen || null }));
  return { repeaters };
}

async function xlx() {
  const xml = await text('http://xlxapi.rlx.lu/api.php?do=GetReflectorList');
  const now = Date.now() / 1000;
  const reflectors = [];
  for (const m of xml.matchAll(/<reflector>([\s\S]*?)<\/reflector>/g)) {
    const get = (t: string) => decode(m[1].match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1] || '');
    const last = Number(get('lastcontact'));
    reflectors.push({ name: get('name'), country: get('country'), comment: get('comment'), dashboard: get('dashboardurl'), online: Number.isFinite(last) && now - last < 1800 });
  }
  return { reflectors };
}

async function allstarDirectory() {
  const body = await text('https://allmondb.allstarlink.org/');
  return body.split(/\r?\n/).map((l) => l.split('|')).filter((f) => f.length >= 4 && /^\d+$/.test(f[0]))
    .map(([node, callsign, description, location]) => ({ node, callsign, description, location }));
}

async function allstarNode(node: string) {
  const res = await fetch(`https://stats.allstarlink.org/api/stats/${node}`, { headers: UA });
  if (!res.ok) throw new Error(`allstar stats ${res.status}`);
  const d: any = await res.json();
  const s = d?.stats?.data || {};
  return {
    node,
    keyed: !!s.keyed,
    linkedNodes: (s.linkedNodes || []).map((n: any) => (typeof n === 'object' ? n.name ?? n.node ?? '' : String(n))).filter(Boolean).slice(0, 200),
    totalKeyups: Number(s.totalkeyups) || 0,
    uptimeSeconds: Number(s.apprptuptime) || null,
    updated: d?.stats?.updated_at || null,
  };
}

async function echolink() {
  const html = await text('https://www.echolink.org/logins.jsp');
  const nodes = [];
  for (const m of html.matchAll(/<tr>\s*<td>([^<]+)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td>/g)) {
    const call = decode(m[1]);
    const type = /^\*.*\*$/.test(call) ? 'conference' : /-R$/i.test(call) ? 'repeater' : /-L$/i.test(call) ? 'link' : 'user';
    if (type === 'user') continue; // only nodes, not individual operators
    nodes.push({ call, location: decode(m[2]), status: decode(m[3]), time: decode(m[4]), node: decode(m[5]), type });
  }
  return { nodes };
}

async function wiresx() {
  const html = await text('https://www.yaesu.com/jp/en/wires-x/id/active_node.php');
  const nodes = [];
  for (const m of html.matchAll(/dataList\[\d+\]\s*=\s*\{([^}]*)\};/g)) {
    const f: Record<string, string> = {};
    for (const kv of m[1].matchAll(/(\w+):"((?:[^"\\]|\\.)*)"/g)) f[kv[1]] = decode(kv[2]);
    nodes.push({
      id: f.id?.replace(/^-+|-+$/g, '') || '', dtmf: f.dtmf_id || '', callsign: f.call_sign || '', mode: f.ana_dig || '',
      city: f.city || '', state: f.state || '', country: f.country || '', freq: f.freq || '', squelch: f.sql || '',
      lat: dms(f.lat || ''), lng: dms(f.lon || ''), comment: f.comment || '',
    });
  }
  return { nodes };
}

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    if (action === 'brandmeister') return Response.json({ ok: true, ...(await cached('bm', HOUR, brandmeister)) });
    if (action === 'xlx') return Response.json({ ok: true, ...(await cached('xlx', HOUR, xlx)) });
    if (action === 'echolink') return Response.json({ ok: true, ...(await cached('echolink', 5 * 60_000, echolink)) });
    if (action === 'wiresx') return Response.json({ ok: true, ...(await cached('wiresx', HOUR, wiresx)) });
    if (action === 'allstar') {
      const all = await cached('allstar', 6 * HOUR, allstarDirectory);
      const q = String(body.query || '').trim().toLowerCase().slice(0, 60);
      const nodes = q
        ? all.filter((n) => n.node === q || n.callsign.toLowerCase().includes(q) || n.description.toLowerCase().includes(q) || n.location.toLowerCase().includes(q)).slice(0, 200)
        : [];
      return Response.json({ ok: true, total: all.length, nodes });
    }
    if (action === 'allstar_node') {
      const node = String(body.node || '').trim();
      if (!/^\d{3,7}$/.test(node)) return Response.json({ error: 'Enter a valid node number.' }, { status: 400 });
      return Response.json({ ok: true, ...(await cached(`asn:${node}`, 60_000, () => allstarNode(node))) });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[digital-radio]', error?.message || error);
    return Response.json({ error: 'That directory is unavailable right now. Try again shortly.' }, { status: 502 });
  }
}
