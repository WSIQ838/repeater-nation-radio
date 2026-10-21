// Shared Stripe Connect helpers used by the stripe-* backend functions.
// Platform fee = the percentage of each membership fee the app keeps; the rest
// routes to the club owner's connected Stripe account. Change this to adjust the cut.
import { secrets } from 'base44:runtime';

export const PLATFORM_FEE_PERCENT = 5;

// App base URL for Stripe return/cancel links. Prefer the platform-injected
// X-Base44-App-Url header (correct behind custom domains), fall back to the
// WIX_CHECKOUT_APP_URL secret (the same app URL already wired for payments).
export function appUrlFromReq(req: Request): string {
  return req.headers.get('x-base44-app-url') || secrets.get('WIX_CHECKOUT_APP_URL') || '';
}

// Minimal Stripe REST API helper (no external SDK dependency).
export async function stripeFetch(path: string, init: any = {}): Promise<any> {
  const key = secrets.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (init.stripeAccount) headers['Stripe-Account'] = init.stripeAccount;
  if (init.headers) Object.assign(headers, init.headers);
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body || undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err: any = new Error(data?.error?.message || `Stripe API ${res.status}`);
    err.status = res.status;
    err.stripeError = data?.error;
    throw err;
  }
  return data;
}

// Encodes a nested object into Stripe's application/x-www-form-urlencoded format.
export function toForm(obj: any): string {
  const params = new URLSearchParams();
  const encode = (val: any, prefix: string) => {
    if (val === undefined || val === null) return;
    if (Array.isArray(val)) {
      val.forEach((item, i) => encode(item, `${prefix}[${i}]`));
    } else if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) encode(v, `${prefix}[${k}]`);
    } else {
      params.append(prefix, String(val));
    }
  };
  for (const [k, v] of Object.entries(obj)) encode(v, k);
  return params.toString();
}

// Verifies a Stripe webhook signature (HMAC-SHA256 over `t.body`), tolerant of
// Web Crypto's async SubtleCrypto. Rejects if missing/invalid/stale.
// Constant-time string comparison so a mismatch can't be timed byte-by-byte
// to recover the expected HMAC signature.
function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (i < a.length ? a.charCodeAt(i) : 0) ^ (i < b.length ? b.charCodeAt(i) : 0);
  }
  return diff === 0;
}

export async function verifyStripeSignature(body: string, sigHeader: string, secret: string): Promise<boolean> {
  if (!sigHeader || !secret) return false;
  const parts: Record<string, string> = {};
  for (const piece of sigHeader.split(',')) {
    const idx = piece.indexOf('=');
    if (idx > 0) parts[piece.slice(0, idx).trim()] = piece.slice(idx + 1);
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${body}`));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!timingSafeEqual(expected, v1)) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  return age < 300;
}