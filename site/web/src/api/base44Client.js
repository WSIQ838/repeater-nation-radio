// Client for the self-hosted Repeater Nation backend. It keeps the shape the app was written
// against (base44.entities / auth / functions / integrations / actors), so pages are unchanged.
import { appParams, TOKEN_KEY } from '@/lib/app-params';

const store = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

// Errors look like the old SDK's: message from the server, plus .status, .data and .response.data.
function apiError(status, data, fallback) {
  const message = (data && (data.message || data.error)) || fallback || `Request failed (${status})`;
  const err = new Error(typeof message === 'string' ? message : fallback || 'Request failed');
  err.status = status;
  err.data = data;
  err.response = { status, data };
  err.originalError = { response: { status, data } };
  return err;
}

async function request(method, path, body, { raw = false } = {}) {
  const headers = {};
  const token = store.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch (e) {
    throw apiError(0, { error: 'Network error' }, 'Network error. Check your connection and try again.');
  }
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) throw apiError(res.status, typeof data === 'object' ? data : { error: text }, res.statusText);
  return raw ? { data, status: res.status } : data;
}

// ---------- realtime (entity.subscribe) ----------
const rt = { ws: null, open: false, subs: new Map(), retry: 0, timer: null };
function rtConnect() {
  if (rt.ws || typeof WebSocket === 'undefined') return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const token = store.get();
  const ws = new WebSocket(`${proto}://${location.host}/api/realtime${token ? `?token=${encodeURIComponent(token)}` : ''}`);
  rt.ws = ws;
  ws.onopen = () => { rt.open = true; rt.retry = 0; for (const entity of rt.subs.keys()) ws.send(JSON.stringify({ type: 'subscribe', entity })); };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'event') for (const cb of rt.subs.get(msg.entity) || []) { try { cb(msg.event); } catch (e) { console.error(e); } }
    } catch { /* ignore */ }
  };
  ws.onclose = () => {
    rt.ws = null; rt.open = false;
    if (!rt.subs.size) return;
    rt.timer = setTimeout(rtConnect, Math.min(30000, 1000 * 2 ** rt.retry++));
  };
}
function rtSubscribe(entity, cb) {
  if (!rt.subs.has(entity)) rt.subs.set(entity, new Set());
  rt.subs.get(entity).add(cb);
  if (rt.open) rt.ws.send(JSON.stringify({ type: 'subscribe', entity }));
  else rtConnect();
  return () => {
    const set = rt.subs.get(entity);
    if (!set) return;
    set.delete(cb);
    if (!set.size) {
      rt.subs.delete(entity);
      if (rt.open) rt.ws.send(JSON.stringify({ type: 'unsubscribe', entity }));
    }
    if (!rt.subs.size && rt.ws) { clearTimeout(rt.timer); rt.ws.close(); rt.ws = null; rt.open = false; }
  };
}

// ---------- entities ----------
const enc = encodeURIComponent;
function entityApi(name) {
  const base = `/api/entities/${enc(name)}`;
  return {
    list: (sort, limit, skip, fields) => request('POST', `${base}/query`, { q: {}, sort, limit, skip, fields }).then((r) => r.items),
    filter: (q = {}, sortOrOpts, limit, skip, fields) => {
      if (sortOrOpts && typeof sortOrOpts === 'object') return request('POST', `${base}/query`, { q, ...sortOrOpts });
      return request('POST', `${base}/query`, { q, sort: sortOrOpts, limit, skip, fields }).then((r) => r.items);
    },
    get: (id) => request('GET', `${base}/${enc(id)}`),
    create: (data) => request('POST', base, data),
    bulkCreate: (items) => request('POST', `${base}/bulk`, items),
    update: (id, data) => request('PUT', `${base}/${enc(id)}`, data),
    bulkUpdate: (items) => request('PUT', `${base}/bulk`, items),
    updateMany: (q, data) => request('POST', `${base}/update-many`, { q, data }),
    delete: (id) => request('DELETE', `${base}/${enc(id)}`),
    deleteMany: (q) => request('POST', `${base}/delete-many`, { q }),
    count: (q = {}) => request('POST', `${base}/count`, { q }).then((r) => r.count),
    subscribe: (cb) => rtSubscribe(name, cb),
  };
}
const entities = new Proxy({}, {
  get(cache, name) {
    if (typeof name !== 'string') return undefined;
    return (cache[name] ??= entityApi(name));
  },
});

// ---------- auth ----------
let cachedUser = null, cachedAt = 0, pendingUser = null;
const AUTH_CACHE_MS = 15000;
const clearUserCache = () => { cachedUser = null; cachedAt = 0; pendingUser = null; };

const auth = {
  // De-duplicates simultaneous calls and briefly reuses the result (pages all ask for the user).
  async me() {
    if (cachedUser && Date.now() - cachedAt < AUTH_CACHE_MS) return cachedUser;
    if (pendingUser) return pendingUser;
    pendingUser = request('GET', '/api/auth/me')
      .then((u) => { cachedUser = u; cachedAt = Date.now(); return u; })
      .finally(() => { pendingUser = null; });
    return pendingUser;
  },
  async isAuthenticated() {
    if (!store.get()) return false;
    try { await auth.me(); return true; } catch { return false; }
  },
  async updateMe(data) {
    const saved = await request('PUT', '/api/auth/me', data);
    if (cachedUser && saved?.id === cachedUser.id) { cachedUser = { ...cachedUser, ...saved }; cachedAt = Date.now(); } else clearUserCache();
    return saved;
  },
  setToken(token) { store.set(token); clearUserCache(); },
  logout(redirectUrl) {
    store.set(null); clearUserCache();
    if (redirectUrl && typeof window !== 'undefined') window.location.href = '/login';
  },
  redirectToLogin(returnUrl) {
    let to = '/login';
    try {
      const u = new URL(returnUrl || window.location.href, window.location.origin);
      if (u.origin === window.location.origin && u.pathname !== '/login') to = `/login?returnTo=${enc(u.pathname + u.search)}`;
    } catch { /* fall through */ }
    window.location.href = to;
  },
  loginWithProvider(provider, fromUrl) {
    const from = fromUrl || '/dashboard';
    window.location.href = `/api/auth/oauth/${enc(provider)}/start?from=${enc(from)}`;
  },
  async loginViaEmailPassword(email, password) {
    const r = await request('POST', '/api/auth/login', { email, password });
    auth.setToken(r.access_token);
    return r;
  },
  register: ({ email, password, full_name }) => request('POST', '/api/auth/register', { email, password, full_name }),
  verifyOtp: ({ email, otpCode }) => request('POST', '/api/auth/verify-otp', { email, otpCode }),
  resendOtp: (email) => request('POST', '/api/auth/resend-otp', { email }),
  resetPasswordRequest: (email) => request('POST', '/api/auth/reset-password-request', { email }),
  resetPassword: ({ resetToken, newPassword }) => request('POST', '/api/auth/reset-password', { resetToken, newPassword }),
  inviteUser: (email, role) => request('POST', '/api/auth/invite', { email, role }),
};

// ---------- functions / integrations ----------
const functions = {
  // Resolves like axios did: { data, status }.
  invoke: (name, data) => request('POST', `/api/functions/${enc(name)}`, data ?? {}, { raw: true }),
};

async function upload({ file }) {
  const form = new FormData();
  form.append('file', file);
  return request('POST', '/api/integrations/core/upload-file', form);
}
const integrations = { Core: { UploadFile: upload, UploadPublicFile: upload } };

// ---------- actors (live rooms) ----------
function actorConnect(actor, room, { id } = {}) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const token = store.get();
  const qs = new URLSearchParams({ ...(token ? { token } : {}), ...(id ? { id } : {}) });
  const ws = new WebSocket(`${proto}://${location.host}/api/actors/${enc(actor)}/${enc(room)}?${qs}`);
  const listeners = new Set();
  const queue = [];
  ws.onopen = () => { while (queue.length) ws.send(queue.shift()); };
  ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); listeners.forEach((cb) => cb(m)); } catch { /* ignore */ } };
  return {
    subscribe(cb) { listeners.add(cb); return { unsubscribe: () => listeners.delete(cb) }; },
    send(msg) { const s = JSON.stringify(msg); ws.readyState === WebSocket.OPEN ? ws.send(s) : queue.push(s); },
    close() { listeners.clear(); try { ws.close(); } catch { /* closed */ } },
  };
}
const actors = new Proxy({}, { get: (_t, actor) => (room) => ({ connect: (opts) => actorConnect(String(actor), room, opts) }) });

export const base44 = { entities, auth, functions, integrations, actors, appId: appParams.appId };
export default base44;
