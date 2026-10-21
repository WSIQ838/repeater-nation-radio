// Shared in-memory per-IP throttle for public backend functions that proxy
// upstream APIs (weather, space-weather, emergency-intel, radio-data, etc.).
// Prevents one source from cascading a flood of unique requests into the
// upstream provider and triggering its rate limit, which would degrade the
// tool for everyone.
//
// This is a SOFT guard -- it resets on cold start or a second warm instance.
// That's acceptable here because the purpose is to blunt floods, not to act
// as a security boundary (the DB-backed limiter in apiAuth.ts does that for
// the public API). The response caches these functions already maintain do
// the heavy lifting for repeated identical requests; this catches the case
// of many DIFFERENT requests from one source.

const _buckets = new Map<string, { count: number; windowStart: number }>();

/**
 * Returns true if the IP has exceeded the limit within the window (i.e. the
 * caller should return 429). Increments the counter either way.
 */
export function ipThrottled(
  ip: string,
  limit: number,
  windowMs: number,
): boolean {
  if (!ip) return false; // no IP to track -- don't block
  const now = Date.now();
  const bucket = _buckets.get(ip);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    _buckets.set(ip, { count: 1, windowStart: now });
    // Opportunistic cleanup: drop expired entries so the map can't grow
    // without bound under a rotating-IP attack.
    if (_buckets.size > 2000) {
      for (const [k, v] of _buckets) {
        if (now - v.windowStart >= windowMs) _buckets.delete(k);
      }
    }
    return false;
  }
  bucket.count++;
  return bucket.count > limit;
}

/** Convenience: extract IP + throttle in one call. */
export function shouldThrottle(
  req: Request,
  limit: number,
  windowMs: number,
): { throttled: boolean; ip: string } {
  const fwd = (req as any)?.headers?.get?.('x-forwarded-for');
  const ip = fwd ? String(fwd).split(',')[0].trim() : '';
  return { throttled: ipThrottled(ip, limit, windowMs), ip };
}