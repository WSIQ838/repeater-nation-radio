// "Sign in with Google / Microsoft / Facebook / Apple". Each provider needs its own OAuth
// app; register this redirect URL with all of them:
//   {PUBLIC_URL}/api/auth/oauth/<provider>/callback
import { SignJWT, importPKCS8, decodeJwt } from 'jose';
import { config } from './config.ts';
import { loginOrCreateFromProvider } from './auth.ts';
import { HttpError } from './errors.ts';
import { randomToken, readBlob, signBlob } from './security.ts';

const env = (k: string) => (Deno.env.get(k) ?? '').trim();

interface Provider {
  authUrl: string;
  scope: string;
  extraAuthParams?: Record<string, string>;
  clientId: () => string;
  clientSecret: () => Promise<string> | string;
  profile: (tokens: any) => Promise<{ subject: string; email: string; name?: string; emailVerified: boolean }>;
}

const CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';

const providers: Record<string, Provider> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
    clientId: () => env('GOOGLE_CLIENT_ID'),
    clientSecret: () => env('GOOGLE_CLIENT_SECRET'),
    async profile(t) {
      const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${t.access_token}` } });
      const p = await r.json();
      return { subject: String(p.sub), email: String(p.email || ''), name: p.name, emailVerified: p.email_verified === true };
    },
  },
  microsoft: {
    authUrl: `https://login.microsoftonline.com/${env('MICROSOFT_TENANT') || 'common'}/oauth2/v2.0/authorize`,
    scope: 'openid email profile',
    extraAuthParams: { prompt: 'select_account' },
    clientId: () => env('MICROSOFT_CLIENT_ID'),
    clientSecret: () => env('MICROSOFT_CLIENT_SECRET'),
    async profile(t) {
      // The id_token comes straight from Microsoft's token endpoint over TLS, so its claims can be trusted.
      const c: any = decodeJwt(t.id_token);
      const email = String(c.email || c.preferred_username || '');
      // Work/school accounts can carry unverified e-mail claims; only trust consumer accounts
      // or tenants that mark the domain as verified.
      const verified = c.tid === CONSUMER_TENANT || c.xms_edov === true || c.xms_edov === 1 || c.email_verified === true;
      return { subject: `${c.tid}:${c.oid || c.sub}`, email, name: c.name, emailVerified: verified };
    },
  },
  facebook: {
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    scope: 'email,public_profile',
    clientId: () => env('FACEBOOK_CLIENT_ID'),
    clientSecret: () => env('FACEBOOK_CLIENT_SECRET'),
    async profile(t) {
      const r = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${encodeURIComponent(t.access_token)}`);
      const p = await r.json();
      // Facebook only returns an e-mail it has confirmed.
      return { subject: String(p.id), email: String(p.email || ''), name: p.name, emailVerified: !!p.email };
    },
  },
  apple: {
    authUrl: 'https://appleid.apple.com/auth/authorize',
    scope: 'name email',
    extraAuthParams: { response_mode: 'form_post' },
    clientId: () => env('APPLE_CLIENT_ID'),
    async clientSecret() {
      const key = await importPKCS8(env('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'), 'ES256');
      return await new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: env('APPLE_KEY_ID') })
        .setIssuer(env('APPLE_TEAM_ID')).setSubject(env('APPLE_CLIENT_ID')).setAudience('https://appleid.apple.com')
        .setIssuedAt().setExpirationTime('5m').sign(key);
    },
    async profile(t) {
      const c: any = decodeJwt(t.id_token);
      return { subject: String(c.sub), email: String(c.email || ''), emailVerified: c.email_verified === true || c.email_verified === 'true' };
    },
  },
};
const TOKEN_URLS: Record<string, string> = {
  google: 'https://oauth2.googleapis.com/token',
  microsoft: `https://login.microsoftonline.com/${env('MICROSOFT_TENANT') || 'common'}/oauth2/v2.0/token`,
  facebook: 'https://graph.facebook.com/v19.0/oauth/access_token',
  apple: 'https://appleid.apple.com/auth/token',
};

export function enabledProviders(): string[] {
  return Object.entries(providers).filter(([, p]) => p.clientId()).map(([k]) => k);
}

const secureCookie = config.publicUrl.startsWith('https://');
const redirectUri = (provider: string) => `${config.publicUrl}/api/auth/oauth/${provider}/callback`;

// Only ever send people back to this site.
function safeFrom(from: string | null): string {
  if (!from) return '/';
  try {
    const u = new URL(from, config.publicUrl);
    if (u.origin !== new URL(config.publicUrl).origin) return '/';
    return u.pathname + u.search + u.hash;
  } catch { return '/'; }
}

function fail(from: string, message: string) {
  const sep = from.includes('?') ? '&' : '?';
  return new Response(null, { status: 302, headers: { location: `${config.publicUrl}/login${sep}error=${encodeURIComponent(message)}` } });
}

export async function oauthStart(provider: string, url: URL): Promise<Response> {
  const p = providers[provider];
  if (!p || !p.clientId()) return fail('/', `Sign-in with ${provider[0].toUpperCase() + provider.slice(1)} isn't set up on this site yet. Use email and password instead.`);
  const nonce = randomToken(16);
  const state = await signBlob('oauth-state', { provider, nonce, from: safeFrom(url.searchParams.get('from') || url.searchParams.get('from_url')) });
  const params = new URLSearchParams({
    client_id: p.clientId(), redirect_uri: redirectUri(provider), response_type: 'code', scope: p.scope, state, ...(p.extraAuthParams || {}),
  });
  return new Response(null, {
    status: 302,
    headers: {
      location: `${p.authUrl}?${params}`,
      'set-cookie': `rn_oauth=${nonce}; Path=/api/auth/oauth; Max-Age=900; HttpOnly; ${secureCookie ? 'Secure; SameSite=None' : 'SameSite=Lax'}`,
    },
  });
}

export async function oauthCallback(provider: string, req: Request, url: URL): Promise<Response> {
  const p = providers[provider];
  if (!p || !p.clientId()) throw new HttpError(404, 'Unknown provider');
  let params = url.searchParams;
  if (req.method === 'POST') params = new URLSearchParams(await req.text()); // Apple form_post
  const state = await readBlob('oauth-state', params.get('state') || '');
  const cookieNonce = (req.headers.get('cookie') || '').match(/(?:^|;\s*)rn_oauth=([^;]+)/)?.[1];
  const from = state?.from || '/';
  if (!state || state.provider !== provider || !cookieNonce || cookieNonce !== state.nonce) return fail(from, 'Sign-in session expired. Please try again.');
  if (params.get('error') || !params.get('code')) return fail(from, 'Sign-in was cancelled.');

  try {
    const tokenRes = await fetch(TOKEN_URLS[provider], {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: params.get('code')!, redirect_uri: redirectUri(provider),
        client_id: p.clientId(), client_secret: await p.clientSecret(),
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokens.error_description || tokens.error || 'token exchange failed');
    const prof = await p.profile(tokens);
    if (!prof.email || !prof.emailVerified) return fail(from, `${provider[0].toUpperCase() + provider.slice(1)} did not share a verified email address, so we can't sign you in with it.`);
    const session = await loginOrCreateFromProvider(provider, prof.subject, { email: prof.email.toLowerCase(), name: prof.name });
    const dest = new URL(from, config.publicUrl);
    dest.searchParams.set('access_token', session.access_token);
    return new Response(null, {
      status: 302,
      headers: { location: dest.toString(), 'set-cookie': 'rn_oauth=; Path=/api/auth/oauth; Max-Age=0' },
    });
  } catch (e: any) {
    console.error(`[oauth:${provider}]`, e?.message || e);
    return fail(from, e instanceof HttpError ? e.message : 'Sign-in failed. Please try again.');
  }
}
