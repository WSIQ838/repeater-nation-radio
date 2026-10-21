import { secrets } from 'base44:runtime';
import { getIp } from './adminGuard.ts';

// Auth + rate limiting for the public, API-key-authenticated v1 API
// (base44/functions/api-v1). Mirrors adminGuard.ts's requireAdmin shape:
// {value, error} where `error` is a ready Response the caller returns as-is.
//
// Rate limiting is backed by the ApiKeyUsage entity (fixed 60s window
// buckets), not in-memory counters -- public-member-directory's own
// module-level cache proves warm-instance memory *can* persist briefly,
// but that's used there only as a soft perf optimization, never a security
// boundary, since a cold start or a second warm instance would silently
// reset an in-memory-only limiter to zero. A DB-backed counter is the only
// one reliable enough to actually stop abuse. The read-then-increment here
// has a known benign race under concurrent requests -- it can only ever
// under-count, never over-count, which is the safe direction for an abuse
// guard (not a billing system).

const RATE_LIMITS: Record<string, number> = {
  standard: 60,
  elevated: 300,
};
const WINDOW_MS = 60_000;
const IP_FAILURE_LIMIT = 20; // failed/unauthenticated attempts per IP per window

function currentWindowStart(): string {
  const windowStartMs = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  return new Date(windowStartMs).toISOString();
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashApiKey(rawKey: string): Promise<string> {
  const pepper = secrets.get('API_KEY_PEPPER');
  if (!pepper) throw new Error('API_KEY_PEPPER not configured');
  return sha256Hex(`${pepper}.${rawKey}`);
}

// rn_live_ + 32 random bytes (256 bits) as hex. key_prefix (stored/shown in
// lists) is the fixed prefix + the first 8 hex chars -- enough to tell keys
// apart without ever displaying the rest again.
export function generateApiKey(): { rawKey: string; prefix: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const rawKey = `rn_live_${hex}`;
  return { rawKey, prefix: rawKey.slice(0, 16) };
}

export async function hashApiKeyForStorage(rawKey: string): Promise<string> {
  return hashApiKey(rawKey);
}

async function incrementBucket(base44: any, bucketKey: string, scope: 'key' | 'ip', apiKeyId?: string): Promise<number> {
  const existing = await base44.asServiceRole.entities.ApiKeyUsage.filter({ bucket_key: bucketKey }, '-created_date', 1).catch(() => []);
  const row = existing?.[0];
  if (row) {
    const next = (row.request_count || 0) + 1;
    await base44.asServiceRole.entities.ApiKeyUsage.update(row.id, { request_count: next }).catch(() => {});
    return next;
  }
  await base44.asServiceRole.entities.ApiKeyUsage.create({
    bucket_key: bucketKey,
    scope,
    api_key_id: apiKeyId || '',
    window_start: currentWindowStart(),
    request_count: 1,
  }).catch(() => {});
  return 1;
}

// Approximate, best-effort usage accounting on the ApiKey row itself,
// throttled to at most once per 60s per key per warm instance so the hot
// path never writes to ApiKey on every single request -- only ApiKeyUsage
// (a fresh row per key per minute, no contention) is written per-request.
const lastFlushMs = new Map<string, number>();
async function touchKeyUsage(base44: any, keyRecord: any, ip: string): Promise<void> {
  const last = lastFlushMs.get(keyRecord.id) || 0;
  const now = Date.now();
  if (now - last < 60_000) return;
  lastFlushMs.set(keyRecord.id, now);
  await base44.asServiceRole.entities.ApiKey.update(keyRecord.id, {
    last_used_at: new Date().toISOString(),
    last_used_ip: ip || keyRecord.last_used_ip || '',
    total_requests: (keyRecord.total_requests || 0) + 1,
  }).catch(() => {});
}

export interface RateInfo { limit: number; remaining: number; resetAt: number }

export async function requireApiKey(base44: any, req: Request): Promise<{ keyRecord: any; error: Response | null; rateInfo?: RateInfo }> {
  const authHeader = req.headers.get('authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const rawKey = (bearerMatch ? bearerMatch[1] : (req.headers.get('x-api-key') || '')).trim();
  const ip = getIp(req);

  if (!rawKey) {
    return { keyRecord: null, error: Response.json({ error: 'Missing API key. Pass it as `Authorization: Bearer <key>` or `x-api-key`.' }, { status: 401 }) };
  }

  // Pre-auth IP throttle, checked before any key lookup, to blunt a flood
  // of guessed/invalid keys from one source rather than let each one pay
  // for a full hash + DB lookup.
  const ipBucketKey = `ip:${ip || 'unknown'}:${currentWindowStart()}`;
  if (ip) {
    const ipRows = await base44.asServiceRole.entities.ApiKeyUsage.filter({ bucket_key: ipBucketKey }, '-created_date', 1).catch(() => []);
    if ((ipRows?.[0]?.request_count || 0) >= IP_FAILURE_LIMIT) {
      return { keyRecord: null, error: Response.json({ error: 'Too many requests from this address. Try again shortly.' }, { status: 429 }) };
    }
  }

  if (!/^rn_live_[0-9a-f]{64}$/.test(rawKey)) {
    if (ip) await incrementBucket(base44, ipBucketKey, 'ip');
    return { keyRecord: null, error: Response.json({ error: 'Invalid API key format' }, { status: 401 }) };
  }

  let keyHash: string;
  try {
    keyHash = await hashApiKey(rawKey);
  } catch (e) {
    console.error('[apiAuth] hashing unavailable:', (e as any)?.message || e);
    return { keyRecord: null, error: Response.json({ error: 'API authentication is temporarily unavailable' }, { status: 500 }) };
  }

  const rows = await base44.asServiceRole.entities.ApiKey.filter({ key_hash: keyHash }, '-created_date', 1).catch(() => []);
  const keyRecord = rows?.[0];
  if (!keyRecord || keyRecord.status !== 'active') {
    if (ip) await incrementBucket(base44, ipBucketKey, 'ip');
    return { keyRecord: null, error: Response.json({ error: 'Invalid or revoked API key' }, { status: 401 }) };
  }

  const limit = RATE_LIMITS[keyRecord.rate_limit_tier] || RATE_LIMITS.standard;
  const windowStartIso = currentWindowStart();
  const count = await incrementBucket(base44, `key:${keyRecord.id}:${windowStartIso}`, 'key', keyRecord.id);
  const resetAt = new Date(windowStartIso).getTime() + WINDOW_MS;
  if (count > limit) {
    return {
      keyRecord: null,
      error: Response.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } }
      ),
    };
  }

  touchKeyUsage(base44, keyRecord, ip).catch(() => {});

  return { keyRecord, error: null, rateInfo: { limit, remaining: Math.max(0, limit - count), resetAt } };
}

export function rateLimitHeaders(rateInfo?: RateInfo): Record<string, string> {
  if (!rateInfo) return {};
  return {
    'X-RateLimit-Limit': String(rateInfo.limit),
    'X-RateLimit-Remaining': String(rateInfo.remaining),
    'X-RateLimit-Reset': String(Math.ceil(rateInfo.resetAt / 1000)),
  };
}
