import { base44 } from '@/api/base44Client';

// Site settings that every page open used to fetch (sidebar order, tool and
// radio switches, social links, merch settings) change rarely but cost a
// request each on every full page load. This keeps the last answer for a few
// minutes in localStorage, shared by the browser's tabs, and shares one
// request between components that ask at the same time.
//
// An admin screen that changes one of these calls forgetConfig() after saving,
// so the admin sees the change straight away; other members pick it up within
// TTL_MS on their next page open.
const TTL_MS = 5 * 60 * 1000;
const PREFIX = 'rn.cfg:';
const pending = new Map();

export function cachedConfig(key, fetcher, ttlMs = TTL_MS) {
  if (pending.has(key)) return pending.get(key);
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw) {
      const { at, value } = JSON.parse(raw);
      if (Date.now() - at < ttlMs) return Promise.resolve(value);
    }
  } catch { /* storage unavailable or corrupt: fetch instead */ }
  const promise = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      try { localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value })); } catch { /* not stored */ }
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

export function forgetConfig(...keys) {
  for (const key of keys) {
    pending.delete(key);
    try { localStorage.removeItem(PREFIX + key); } catch { /* nothing stored */ }
  }
}

// get-nav-config's answer ({ nav_order }) and get-tools-config's config object.
export const loadNavConfig = () =>
  cachedConfig('nav', () => base44.functions.invoke('get-nav-config').then((r) => r?.data || {}));
export const loadToolsConfig = () =>
  cachedConfig('tools', () => base44.functions.invoke('get-tools-config').then((r) => (r?.data || r)?.config || {}));
