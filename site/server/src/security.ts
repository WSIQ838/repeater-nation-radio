import { scrypt as nodeScrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.ts';

const N = 16384, r = 8, p = 1, KEYLEN = 64;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((res, rej) => nodeScrypt(password, salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, , , , saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('hex');
export function randomOtp(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, '0');
}

const secretKey = () => new TextEncoder().encode(config.jwtSecret);

export async function signAccessToken(userId: string, tokenVersion: number, days = 30): Promise<string> {
  return await new SignJWT({ v: tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<{ sub: string; v: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return { sub: payload.sub, v: Number((payload as any).v ?? 0) };
  } catch {
    return null;
  }
}

// Short-lived signed blobs (OAuth state, etc.), tied to a purpose so they can't be swapped.
export async function signBlob(purpose: string, claims: Record<string, unknown>, ttl = '15m'): Promise<string> {
  return await new SignJWT({ ...claims, purpose }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(ttl).sign(secretKey());
}
export async function readBlob(purpose: string, token: string): Promise<Record<string, any> | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    return payload.purpose === purpose ? (payload as any) : null;
  } catch {
    return null;
  }
}

// Fixed-window in-memory limiter for the unauthenticated auth endpoints.
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return false; }
  h.n++;
  return h.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, 60_000).unref?.();
