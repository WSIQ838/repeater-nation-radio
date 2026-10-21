import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { requireApiKey, rateLimitHeaders } from '../../shared/apiAuth.ts';
import { RESOURCE_CONFIG, RESOURCE_KEYS } from '../../shared/apiV1Resources.ts';

// ===== APP-SPECIFIC =====
// Public, read-only v1 API for third-party developers -- authenticated via
// an API key (base44/functions/api-key-manage issues/revokes these), not
// the cookie-session auth every other function in this app uses. One
// gateway function dispatching on a `resource` param, mirroring admin-api's
// proven action-dispatch shape rather than one function per resource, so
// the auth guard/rate limiter/paging logic lives in exactly one place.
//
// Every row returned has already been through that resource's
// publicFilter (only rows meant to be public) and toPublic (PII/internal
// id fields stripped) -- see apiV1Resources.ts for exactly what's excluded
// per resource and why.
// ===== END APP-SPECIFIC =====

const BATCH_SIZE = 500;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const { keyRecord, error, rateInfo } = await requireApiKey(base44, req);
    if (error) return error;

    const url = new URL(req.url);
    let params: Record<string, any> = {};
    if (req.method === 'POST') {
      params = await req.json().catch(() => ({}));
    } else {
      for (const [k, v] of url.searchParams.entries()) params[k] = v;
    }

    const resource = String(params.resource || '');
    const config = RESOURCE_CONFIG[resource];
    if (!config) {
      return Response.json(
        { error: `Unknown resource "${resource}". Available: ${RESOURCE_KEYS.join(', ')}` },
        { status: 400, headers: rateLimitHeaders(rateInfo) }
      );
    }

    const skip = Math.max(0, Number(params.skip) || 0);
    const pageSize = Math.min(Math.max(1, Number(params.pageSize) || 50), 200);

    let all: any[] = [];
    let cursor = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities[config.entity].list(config.defaultSort, BATCH_SIZE, cursor);
      if (!batch?.length) break;
      all = all.concat(batch);
      cursor += batch.length;
      if (batch.length < BATCH_SIZE) break;
      if (all.length > 50_000) break; // sane upper bound for a single public request
    }

    const filtered = all.filter((r: any) => {
      try { return config.publicFilter(r); } catch { return false; }
    });
    const total = filtered.length;
    const page = filtered.slice(skip, skip + pageSize).map((r: any) => {
      try { return config.toPublic(r); } catch { return null; }
    }).filter(Boolean);

    return Response.json(
      { data: page, count: page.length, skip, pageSize, total },
      { headers: rateLimitHeaders(rateInfo) }
    );
  } catch (error) {
    console.error('[api-v1] error:', (error as any)?.message || error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
