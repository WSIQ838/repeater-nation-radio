import { sql } from './db.ts';
import { config } from './config.ts';
import { HttpError } from './errors.ts';
import { sendMail } from './mail.ts';
import * as entities from './entities.ts';
import { Caller, userRole } from './rls.ts';
import { createUser, findUserByEmail, findUserById, patchUser } from './users.ts';
import { emitAuthEvent } from './bus.ts';
import { hashPassword, randomOtp, randomToken, rateLimited, sha256, signAccessToken, verifyAccessToken, verifyPassword } from './security.ts';

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// Resolve the signed-in user from the Authorization header (or a token the caller passes in).
export async function userFromToken(token: string | null): Promise<any | null> {
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  const [row] = await sql`SELECT c.token_version FROM credentials c WHERE c.user_id = ${claims.sub}`;
  if (row && Number(row.token_version) !== claims.v) return null; // password reset / sign-out-everywhere
  const user = await findUserById(claims.sub);
  if (!user || user.disabled === true) return null;
  return user;
}

export async function userFromRequest(req: Request): Promise<any | null> {
  return await userFromToken(bearer(req));
}

export const callerFor = (user: any | null): Caller => ({ user, service: false });

export function publicUser(u: any) {
  return { ...u, _app_role: u._app_role ?? u.role };
}

async function ensureCredentials(userId: string, email: string) {
  await sql`INSERT INTO credentials (user_id, email) VALUES (${userId}, ${email.toLowerCase()}) ON CONFLICT (user_id) DO NOTHING`;
}

async function issueOtp(userId: string, email: string, purposeLabel = 'verify your email') {
  const code = randomOtp();
  await sql`UPDATE credentials SET otp_hash = ${sha256(code)}, otp_expires = now() + interval '15 minutes', otp_attempts = 0 WHERE user_id = ${userId}`;
  await sendMail({
    to: email,
    subject: `Your Repeater Nation code: ${code}`,
    html: `<p>Use this code to ${purposeLabel}:</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold">${code}</p><p>It expires in 15 minutes. If you didn't request it, you can ignore this email.</p>`,
  }).catch((e) => console.error('[auth] OTP email failed:', e?.message || e));
}

async function sessionFor(userId: string) {
  const [cred] = await sql`SELECT token_version FROM credentials WHERE user_id = ${userId}`;
  const token = await signAccessToken(userId, Number(cred?.token_version ?? 0));
  const user = await findUserById(userId);
  return { access_token: token, user: publicUser(user) };
}

function bodyEmail(b: any): string {
  const email = String(b?.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  return email;
}

function limit(req: Request, scope: string, email: string, max = 10, windowMs = 15 * 60_000) {
  if (rateLimited(`${scope}:${clientIp(req)}`, max * 3, windowMs) || rateLimited(`${scope}:${email}`, max, windowMs)) {
    throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  }
}

export async function register(req: Request, body: any) {
  const email = bodyEmail(body);
  const password = String(body?.password || '');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  limit(req, 'register', email);

  const existing = await findUserByEmail(email);
  if (existing) {
    const [cred] = await sql`SELECT email_verified FROM credentials WHERE user_id = ${existing.id}`;
    if (cred?.email_verified) throw new HttpError(409, 'An account with this email already exists. Try signing in.');
    // Unverified (or invited / migrated without a password): let the person set the password and verify.
    await ensureCredentials(existing.id, email);
    await sql`UPDATE credentials SET password_hash = ${await hashPassword(password)} WHERE user_id = ${existing.id}`;
    await issueOtp(existing.id, email);
    return json({ ok: true });
  }
  const user = await createUser({ email, full_name: body?.full_name });
  await ensureCredentials(user.id, email);
  await sql`UPDATE credentials SET password_hash = ${await hashPassword(password)} WHERE user_id = ${user.id}`;
  await issueOtp(user.id, email);
  return json({ ok: true });
}

export async function verifyOtp(req: Request, body: any) {
  const email = bodyEmail(body);
  const code = String(body?.otpCode ?? body?.otp_code ?? body?.code ?? '').trim();
  limit(req, 'otp', email, 12);
  const user = await findUserByEmail(email);
  const [cred] = user ? await sql`SELECT * FROM credentials WHERE user_id = ${user.id}` : [];
  if (!user || !cred || !cred.otp_hash) throw new HttpError(400, 'Invalid or expired code');
  if (Number(cred.otp_attempts) >= 5) throw new HttpError(429, 'Too many wrong codes. Request a new one.');
  if (new Date(cred.otp_expires).getTime() < Date.now() || sha256(code) !== cred.otp_hash) {
    await sql`UPDATE credentials SET otp_attempts = otp_attempts + 1 WHERE user_id = ${user.id}`;
    throw new HttpError(400, 'Invalid or expired code');
  }
  const wasVerified = cred.email_verified === true;
  await sql`UPDATE credentials SET email_verified = true, otp_hash = NULL, otp_expires = NULL, otp_attempts = 0 WHERE user_id = ${user.id}`;
  await patchUser(user.id, { is_verified: true });
  if (!wasVerified) emitAuthEvent({ event_type: 'signup', user_id: user.id, user });
  return json(await sessionFor(user.id));
}

export async function resendOtp(req: Request, body: any) {
  const email = bodyEmail(body);
  limit(req, 'resend', email, 5);
  const user = await findUserByEmail(email);
  if (user) {
    await ensureCredentials(user.id, email);
    await issueOtp(user.id, email);
  }
  return json({ ok: true }); // same answer whether or not the account exists
}

export async function login(req: Request, body: any) {
  const email = bodyEmail(body);
  const password = String(body?.password || '');
  limit(req, 'login', email);
  const user = await findUserByEmail(email);
  const [cred] = user ? await sql`SELECT * FROM credentials WHERE user_id = ${user.id}` : [];

  if (user && cred && !cred.password_hash && cred.email_verified) {
    throw new HttpError(401, 'This account has no password yet. Use "Forgot password" to set one, or sign in with Google, Microsoft, Facebook or Apple.', { error: 'password_not_set', message: 'This account has no password yet. Use "Forgot password" to set one, or sign in with Google, Microsoft, Facebook or Apple.' });
  }
  const ok = !!(cred && await verifyPassword(password, cred.password_hash));
  if (!user || !cred || !ok) throw new HttpError(401, 'Invalid email or password');
  if (!cred.email_verified) throw new HttpError(403, 'Please verify your email before logging in.');
  if (user.disabled === true) throw new HttpError(403, 'This account has been disabled.');
  emitAuthEvent({ event_type: 'login', user_id: user.id, user });
  return json(await sessionFor(user.id));
}

export async function resetPasswordRequest(req: Request, body: any) {
  const email = bodyEmail(body);
  limit(req, 'reset', email, 5);
  const user = await findUserByEmail(email);
  if (user) {
    await ensureCredentials(user.id, email);
    const token = randomToken(24);
    await sql`UPDATE credentials SET reset_hash = ${sha256(token)}, reset_expires = now() + interval '1 hour' WHERE user_id = ${user.id}`;
    const link = `${config.publicUrl}/reset-password?token=${token}`;
    await sendMail({
      to: email,
      subject: 'Reset your Repeater Nation password',
      html: `<p>Click the link below to choose a new password. It expires in 1 hour.</p><p><a href="${link}">${link}</a></p><p>If you didn't ask for this, you can ignore this email.</p>`,
    }).catch((e) => console.error('[auth] reset email failed:', e?.message || e));
  }
  return json({ ok: true });
}

export async function resetPassword(req: Request, body: any) {
  const token = String(body?.resetToken ?? body?.token ?? '');
  const newPassword = String(body?.newPassword ?? body?.password ?? '');
  if (newPassword.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  limit(req, 'resetconfirm', clientIp(req), 20);
  const [cred] = token ? await sql`SELECT user_id FROM credentials WHERE reset_hash = ${sha256(token)} AND reset_expires > now()` : [];
  if (!cred) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
  // Holding the e-mailed token proves control of the address, so this also verifies it.
  await sql`UPDATE credentials SET password_hash = ${await hashPassword(newPassword)}, reset_hash = NULL, reset_expires = NULL,
    email_verified = true, token_version = token_version + 1 WHERE user_id = ${cred.user_id}`;
  await patchUser(cred.user_id, { is_verified: true, force_password_reset: false });
  return json({ ok: true });
}

export async function me(user: any | null) {
  if (!user) throw new HttpError(401, 'Authentication required');
  return json(publicUser(user));
}

export async function updateMe(user: any | null, body: any) {
  if (!user) throw new HttpError(401, 'Authentication required');
  const { id: _id, email: _email, ...rest } = body || {};
  const updated = await entities.update('User', callerFor(user), user.id, rest);
  return json(publicUser(updated));
}

export async function inviteUser(user: any | null, body: any) {
  if (!user || !['admin', 'super_admin'].includes(userRole(user))) throw new HttpError(403, 'Admin access required');
  const email = bodyEmail(body);
  const role = String(body?.role || 'user');
  let target = await findUserByEmail(email);
  if (!target) target = await createUser({ email, role: ['admin', 'super_admin'].includes(role) ? role : 'user' });
  await ensureCredentials(target.id, email);
  await resetPasswordRequest(new Request(config.publicUrl), { email });
  return json({ ok: true, user_id: target.id });
}

// Called by social login once a provider has vouched for an e-mail address.
export async function loginOrCreateFromProvider(provider: string, subject: string, profile: { email: string; name?: string }) {
  const [link] = await sql`SELECT user_id FROM oauth_identities WHERE provider = ${provider} AND subject = ${subject}`;
  let user = link ? await findUserById(link.user_id) : null;
  let isNew = false;
  if (!user) {
    user = await findUserByEmail(profile.email);
    if (!user) {
      user = await createUser({ email: profile.email, full_name: profile.name, is_verified: true });
      isNew = true;
    }
    await ensureCredentials(user.id, profile.email);
    await sql`INSERT INTO oauth_identities (provider, subject, user_id) VALUES (${provider}, ${subject}, ${user.id}) ON CONFLICT DO NOTHING`;
  }
  if (user.disabled === true) throw new HttpError(403, 'This account has been disabled.');
  // The provider confirmed the address, so the account counts as verified.
  await sql`UPDATE credentials SET email_verified = true WHERE user_id = ${user.id}`;
  if (user.is_verified !== true) user = await patchUser(user.id, { is_verified: true });
  emitAuthEvent({ event_type: isNew ? 'signup' : 'login', user_id: user.id, user });
  return await sessionFor(user.id);
}
