// Preview card details (title, description, picture, site name) for a link
// someone posted. Public, because posts are public; results are cached for a
// week so each link is fetched rarely. See shared/linkPreview.ts for the
// safety rules on what the server will fetch.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizeUrl, fetchPreview } from '../../shared/linkPreview.ts';

const TTL_MS = 7 * 86400_000;
const FAIL_TTL_MS = 6 * 3600_000;
const hits = new Map<string, number[]>();
// Fresh (uncached) fetches per caller per 10 minutes, per warm instance.
function throttled(key: string, limit = 40, windowMs = 10 * 60_000) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= limit) { hits.set(key, list); return true; }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return false;
}
const pick = (r: any) => (r?.ok ? { ok: true, url: r.url, final_url: r.final_url || r.url, title: r.title || '', description: r.description || '', image: r.image || '', site_name: r.site_name || '' } : { ok: false, url: r?.url });

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const url = normalizeUrl(body?.url);
    if (!url) return Response.json({ ok: false, error: 'bad_url' }, { status: 400 });

    const cached = (await db.entities.LinkPreview.filter({ url }, '-fetched_at', 1).catch(() => []))?.[0];
    const age = cached ? Date.now() - Date.parse(cached.fetched_at || 0) : Infinity;
    if (cached && age < (cached.ok ? TTL_MS : FAIL_TTL_MS)) return Response.json(pick(cached), { headers: { 'Cache-Control': 'public, max-age=3600' } });

    const user = await base44.auth.me().catch(() => null);
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    if (throttled(user?.id || ip || 'anon')) return Response.json({ ok: false, error: 'busy' }, { status: 429 });

    let record: any;
    try {
      const p = await fetchPreview(url);
      record = { url, ok: !!(p.title || p.description), ...p, fetched_at: new Date().toISOString() };
    } catch (e: any) {
      record = { url, ok: false, title: '', description: '', image: '', site_name: '', final_url: '', fetched_at: new Date().toISOString() };
      console.log('link-preview: no preview', url, e?.message || e);
    }
    if (cached) await db.entities.LinkPreview.update(cached.id, record).catch(() => {});
    else await db.entities.LinkPreview.create(record).catch(() => {});
    return Response.json(pick(record), { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch (err: any) {
    console.error('link-preview error', err?.message || err);
    return Response.json({ ok: false, error: 'unexpected' }, { status: 500 });
  }
}
