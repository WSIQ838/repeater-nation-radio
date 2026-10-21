// Reads a web page's preview details (title, description, picture) the way
// chat apps do, for the preview card under a posted link.
//
// Safety, because the URL comes from whoever posted it:
// - http(s) only, standard ports only, no IP-address hosts, no localhost or
//   internal-looking names, and (where the runtime allows DNS lookups) no
//   host that resolves to a private address;
// - every redirect is re-checked the same way (at most 3);
// - only HTML is read, at most 1 MB, with an 8-second time limit;
// - only text and absolute http(s) picture URLs come back, never page code.

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (compatible; RepeaterNationBot/1.0; +https://repeaternation.com)';
const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.intranet', '.lan', '.home', '.corp', '.private', '.test', '.invalid', '.example'];

export function normalizeUrl(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 2048) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  u.hash = '';
  return u.toString();
}

function privateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:');
}

// Throws when a URL must not be fetched.
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('bad_url'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad_protocol');
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('bad_port');
  if (u.username || u.password) throw new Error('credentials');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host) || host.includes(':')) throw new Error('bad_host');
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new Error('bad_host');
  const resolve = (globalThis as any).Deno?.resolveDns;
  if (typeof resolve === 'function') {
    for (const type of ['A', 'AAAA']) {
      let addrs: string[] = [];
      try { addrs = await resolve(host, type); } catch { /* no record of this type, or lookups unavailable */ }
      if (addrs.some(privateIp)) throw new Error('private_address');
    }
  }
  return u;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+[0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const clean = (s: string | undefined, max: number) => (s ? decode(s).replace(/\s+/g, ' ').trim().slice(0, max) : '');

function metaTags(head: string) {
  const out: Record<string, string> = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    const key = (attr('property') || attr('name') || attr('itemprop'));
    const val = attr('content');
    if (!key || !val) continue;
    const k = (key[2] ?? key[3] ?? key[4] ?? '').toLowerCase();
    const v = val[2] ?? val[3] ?? val[4] ?? '';
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

export function parsePreview(html: string, pageUrl: string) {
  const head = html.slice(0, MAX_BYTES);
  const m = metaTags(head);
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const abs = (v: string | undefined) => {
    if (!v) return '';
    try {
      const u = new URL(decode(v.trim()), pageUrl);
      return ['http:', 'https:'].includes(u.protocol) ? u.toString().slice(0, 2048) : '';
    } catch { return ''; }
  };
  const host = (() => { try { return new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  return {
    title: clean(m['og:title'] || m['twitter:title'] || titleTag, 200),
    description: clean(m['og:description'] || m['twitter:description'] || m['description'], 300),
    image: abs(m['og:image:secure_url'] || m['og:image'] || m['og:image:url'] || m['twitter:image'] || m['twitter:image:src']),
    site_name: clean(m['og:site_name'] || m['application-name'], 80) || host,
  };
}

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
    // Preview tags live in <head>; stop once it's over or the cap is hit.
    const tail = new TextDecoder().decode(value.slice(-2048));
    if (size >= MAX_BYTES || /<\/head>|<body[\s>]/i.test(tail)) break;
  }
  try { await reader.cancel(); } catch { /* already closed */ }
  const all = new Uint8Array(Math.min(size, MAX_BYTES));
  let at = 0;
  for (const c of chunks) { const n = Math.min(c.length, all.length - at); all.set(c.subarray(0, n), at); at += n; if (at >= all.length) break; }
  return new TextDecoder().decode(all);
}

export async function fetchPreview(rawUrl: string) {
  let current = rawUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const u = await assertPublicUrl(current);
      const res = await fetch(u.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1', 'Accept-Language': 'en-US,en;q=0.8' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        try { await res.body?.cancel(); } catch { /* ignore */ }
        current = new URL(res.headers.get('location')!, u).toString();
        continue;
      }
      if (!res.ok) { try { await res.body?.cancel(); } catch { /* ignore */ } throw new Error(`http_${res.status}`); }
      const type = (res.headers.get('content-type') || '').toLowerCase();
      if (!/text\/html|application\/xhtml\+xml/.test(type)) { try { await res.body?.cancel(); } catch { /* ignore */ } throw new Error('not_html'); }
      const html = await readLimited(res);
      return { final_url: u.toString(), ...parsePreview(html, u.toString()) };
    }
    throw new Error('too_many_redirects');
  } finally {
    clearTimeout(timer);
  }
}
