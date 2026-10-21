import { extname, join, normalize, resolve } from '@std/path';
import { config, requireConfig } from './config.ts';
import { migrate, sql } from './db.ts';
import { loadSchemas, entityNames, getSchema } from './schema.ts';
import { HttpError } from './errors.ts';
import * as entities from './entities.ts';
import * as auth from './auth.ts';
import { json, userFromRequest, callerFor, clientIp } from './auth.ts';
import { enabledProviders, oauthCallback, oauthStart } from './oauth.ts';
import { invokeFunction, functionExists, listFunctions } from './functions.ts';
import { actorSocket } from './actorhost.ts';
import { realtimeSocket, startRealtime } from './realtime.ts';
import { loadWorkflows, runWorkflowByName, startWorkflows, workflowNames } from './workflows.ts';
import { saveUpload, serveUpload } from './files.ts';
import { userRole } from './rls.ts';
import { sendMail } from './mail.ts';

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,x-api-key,x-app-id,x-rn-sdr-secret,stripe-signature',
  'access-control-max-age': '86400',
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};

async function readJson(req: Request): Promise<any> {
  const text = await req.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Request body must be valid JSON'); }
}

const FN_ROUTES = [
  /^\/api\/functions\/([^/]+)\/?$/,
  /^\/functions\/([^/]+)\/?$/,
  /^\/api\/apps\/[^/]+\/functions\/([^/]+)\/?$/, // old Base44 URL shape: keeps API-key clients and webhooks working
];

async function handleApi(req: Request, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = req.method;
  let m: RegExpMatchArray | null;

  if (path === '/api/health') {
    await sql`SELECT 1`;
    return json({ ok: true, entities: entityNames().length, functions: listFunctions().length });
  }

  for (const re of FN_ROUTES) {
    if ((m = path.match(re))) {
      const name = decodeURIComponent(m[1]);
      if (!functionExists(name)) throw new HttpError(404, `Function ${name} not found`);
      return await invokeFunction(name, req);
    }
  }

  if (path === '/api/public-settings' || /^\/api\/apps\/public\/prod\/public-settings\/by-id\//.test(path)) {
    return json({ id: config.appId, name: 'Repeater Nation', public_settings: { requires_auth: false }, auth_providers: enabledProviders() });
  }

  // ---- auth ----
  if (path === '/api/auth/providers') return json({ providers: enabledProviders() });
  if (method === 'POST' && path === '/api/auth/register') return await auth.register(req, await readJson(req));
  if (method === 'POST' && path === '/api/auth/verify-otp') return await auth.verifyOtp(req, await readJson(req));
  if (method === 'POST' && path === '/api/auth/resend-otp') return await auth.resendOtp(req, await readJson(req));
  if (method === 'POST' && path === '/api/auth/login') return await auth.login(req, await readJson(req));
  if (method === 'POST' && path === '/api/auth/reset-password-request') return await auth.resetPasswordRequest(req, await readJson(req));
  if (method === 'POST' && path === '/api/auth/reset-password') return await auth.resetPassword(req, await readJson(req));
  if (method === 'POST' && path === '/api/auth/invite') return await auth.inviteUser(await userFromRequest(req), await readJson(req));
  if (path === '/api/auth/me') {
    const user = await userFromRequest(req);
    if (method === 'GET') return await auth.me(user);
    if (method === 'PUT' || method === 'PATCH') return await auth.updateMe(user, await readJson(req));
  }
  if ((m = path.match(/^\/api\/auth\/oauth\/([a-z]+)\/(start|callback)$/))) {
    return m[2] === 'start' ? await oauthStart(m[1], url) : await oauthCallback(m[1], req, url);
  }

  // ---- entities ----
  if ((m = path.match(/^\/api\/entities\/([A-Za-z0-9_]+)(?:\/([^/]+))?$/)) || (m = path.match(/^\/api\/entities\/([A-Za-z0-9_]+)\/(query|count|bulk|update-many|delete-many)$/))) {
    const entity = m[1];
    const seg = m[2];
    const caller = callerFor(await userFromRequest(req));
    if (!getSchema(entity)) throw new HttpError(404, `Entity ${entity} not found`);
    if (method === 'POST' && seg === 'query') {
      const b = await readJson(req);
      return json(await entities.query(entity, caller, b.q ?? b.query ?? {}, { sort: b.sort, limit: b.limit, skip: b.skip, fields: b.fields, cursor: b.cursor }));
    }
    if (method === 'POST' && seg === 'count') return json({ count: await entities.count(entity, caller, (await readJson(req)).q ?? {}) });
    if (method === 'POST' && seg === 'bulk') return json(await entities.bulkCreate(entity, caller, await readJson(req)));
    if (method === 'PUT' && seg === 'bulk') return json(await entities.bulkUpdate(entity, caller, await readJson(req)));
    if (method === 'POST' && seg === 'update-many') { const b = await readJson(req); return json(await entities.updateMany(entity, caller, b.q ?? {}, b.data ?? {})); }
    if (method === 'POST' && seg === 'delete-many') return json(await entities.deleteMany(entity, caller, (await readJson(req)).q ?? {}));
    if (method === 'POST' && !seg) return json(await entities.create(entity, caller, await readJson(req)), 201);
    if (seg && method === 'GET') return json(await entities.get(entity, caller, decodeURIComponent(seg)));
    if (seg && (method === 'PUT' || method === 'PATCH')) return json(await entities.update(entity, caller, decodeURIComponent(seg), await readJson(req)));
    if (seg && method === 'DELETE') return json(await entities.remove(entity, caller, decodeURIComponent(seg)));
  }

  // ---- integrations ----
  if (method === 'POST' && path === '/api/integrations/core/upload-file') {
    const user = await userFromRequest(req);
    if (!user) throw new HttpError(401, 'Sign in to upload files');
    if (auth_rate(req, user.id)) throw new HttpError(429, 'Too many uploads. Please wait a moment.');
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Send the file as multipart field "file"');
    return json(await saveUpload(file, user.id));
  }
  if (method === 'POST' && path === '/api/integrations/core/send-email') {
    const user = await userFromRequest(req);
    if (!user || !['admin', 'super_admin'].includes(userRole(user))) throw new HttpError(403, 'Admin access required');
    return json(await sendMail(await readJson(req)));
  }

  // ---- workflows (manual runs; e.g. publish-changelog after a deploy) ----
  if ((m = path.match(/^\/api\/workflows\/([^/]+)\/run$/)) && method === 'POST') {
    const user = await userFromRequest(req);
    if (!user || !['admin', 'super_admin'].includes(userRole(user))) throw new HttpError(403, 'Admin access required');
    const ok = await runWorkflowByName(decodeURIComponent(m[1]), await readJson(req));
    if (!ok) throw new HttpError(404, `Workflow not found. Available: ${workflowNames().join(', ')}`);
    return json({ ok: true });
  }

  // ---- websockets ----
  if (path === '/api/realtime') return await realtimeSocket(req, url);
  if ((m = path.match(/^\/api\/actors\/([^/]+)\/([^/]+)$/))) return await actorSocket(req, decodeURIComponent(m[1]), decodeURIComponent(m[2]), url);

  if (path.startsWith('/api/')) throw new HttpError(404, 'Not found');
  return null;
}

const uploadHits = new Map<string, number[]>();
function auth_rate(_req: Request, userId: string): boolean {
  const now = Date.now();
  const recent = (uploadHits.get(userId) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  uploadHits.set(userId, recent);
  return recent.length > 30;
}

// Built frontend (vite build output) with SPA fallback to index.html.
const webRoot = resolve(config.webDir);
async function serveStatic(url: URL): Promise<Response> {
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (rel.endsWith('/')) rel += 'index.html';
  let file = join(webRoot, rel);
  if (!file.startsWith(webRoot)) return new Response('Not found', { status: 404 });
  let stat = await Deno.stat(file).catch(() => null);
  const isAsset = /\.[a-z0-9]{2,5}$/i.test(rel);
  if (!stat?.isFile) {
    if (isAsset) return new Response('Not found', { status: 404 });
    file = join(webRoot, 'index.html');
    stat = await Deno.stat(file).catch(() => null);
    if (!stat?.isFile) return new Response('Frontend not built. Run the web build or use the Docker image.', { status: 503 });
  }
  const ext = extname(file).toLowerCase();
  const headers: Record<string, string> = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
  };
  if (file.includes('/assets/')) headers['cache-control'] = 'public, max-age=31536000, immutable';
  else if (ext === '.html' || file.endsWith('sw.js') || file.endsWith('version.json')) headers['cache-control'] = 'no-cache';
  else headers['cache-control'] = 'public, max-age=3600';
  return new Response(await Deno.readFile(file), { headers });
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    if (url.pathname.startsWith('/uploads/')) return await serveUpload(url.pathname.slice('/uploads/'.length));
    const api = await handleApi(req, url);
    if (api) {
      if (api.status !== 101) for (const [k, v] of Object.entries(CORS)) if (!api.headers.has(k)) api.headers.set(k, v);
      return api;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    return await serveStatic(url);
  } catch (e: any) {
    if (e instanceof HttpError) return json(e.data, e.status, CORS);
    console.error(`[http] ${req.method} ${url.pathname} failed (${clientIp(req)}):`, e?.stack || e);
    return json({ error: 'Internal server error', message: 'Internal server error' }, 500, CORS);
  }
}

if (import.meta.main) {
  requireConfig();
  loadSchemas();
  loadWorkflows();
  await migrate();
  startRealtime();
  startWorkflows();
  Deno.serve({ port: config.port, onListen: ({ port }) => console.log(`Repeater Nation listening on :${port} (${config.publicUrl})`) }, handler);
}

export { handler };
