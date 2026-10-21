import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Create the Base44 client once and share it across the entire app.
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl,
  options: {
    // createClient destructures a nested `options` object for these two --
    // NOT top-level config keys (confirmed by reading @base44/sdk's actual
    // source: `const { ..., options, ... } = config` then later
    // `options?.onError`/`options?.actorsTransport`). A prior version of
    // this file set `onError` at the top level, which the SDK silently
    // never reads -- so that "fix" was completely inert the whole time it
    // was live, which is exactly why no actor/mint error was ever actually
    // surfaced despite the dedicated listener wired up for it elsewhere.
    //
    // Without a working onError, the SDK's own error logging is a no-op in
    // a production build (NODE_ENV-gated), and actor connection-token mint
    // failures are ONLY EVER reported through this callback -- there is no
    // other path, no thrown exception app code sees, nothing.
    onError: (err) => {
      console.error('[Base44 SDK]', err?.status, err?.message, err);
      const url = err?.originalError?.config?.url || '';
      const actorMatch = url.match(/\/actors\/([^/]+)\/connection-token/);
      if (actorMatch) {
        window.dispatchEvent(new CustomEvent('rn:actor-mint-error', {
          detail: { actorName: decodeURIComponent(actorMatch[1]), status: err?.status, message: err?.message },
        }));
      }
    },
    // The actors module's default "direct-first, proxy-fallback" mint path
    // treats several failure statuses (405/409/422/503 -- see
    // node_modules/@base44/sdk/dist/modules/actors.js's
    // PROXY_FALLBACK_STATUSES) as an EXPECTED, silent case for an actor
    // class the direct path doesn't yet serve, and falls back to the
    // legacy proxy transport automatically -- without ever calling
    // onError, by design. If that fallback isn't actually working
    // correctly for a just-added actor class specifically, it would look
    // exactly like total silence with zero trace anywhere, which matches
    // everything observed here. The SDK's own comment states the proxy
    // "serves migrated actors too, so falling back is always safe" --
    // forcing it directly for every actor connection sidesteps whatever
    // gap exists in the automatic fallback, at the cost of always using
    // the older (but unconditionally supported) transport.
    actorsTransport: 'proxy',
  },
});

// The SDK auth endpoint is relatively expensive and many pages only need the
// same current-user object. Deduplicate simultaneous calls and briefly reuse
// the result so navigating between pages does not trigger another round trip.
const originalMe = base44.auth.me.bind(base44.auth);
let cachedUser = null;
let cachedAt = 0;
let pendingUser = null;
const AUTH_CACHE_MS = 15000;

base44.auth.me = async (...args) => {
  const now = Date.now();
  if (cachedUser && now - cachedAt < AUTH_CACHE_MS) return cachedUser;
  if (pendingUser) return pendingUser;

  pendingUser = originalMe(...args)
    .then((user) => {
      cachedUser = user;
      cachedAt = Date.now();
      return user;
    })
    .finally(() => {
      pendingUser = null;
    });

  return pendingUser;
};

// Mutations can change the current user's data. After updateMe the cached
// user is updated with what was saved rather than dropped: the activity
// heartbeat saves last_active on every page open, and dropping the cache there
// made the page's own auth.me() fetch the user a second time. Logout still
// clears it, and the normal SDK behavior is otherwise untouched.
const originalUpdateMe = base44.auth.updateMe?.bind(base44.auth);
if (originalUpdateMe) {
  base44.auth.updateMe = async (...args) => {
    const result = await originalUpdateMe(...args);
    const saved = result && typeof result === 'object' && result.id ? result : {};
    if (cachedUser && (!saved.id || saved.id === cachedUser.id)) {
      cachedUser = { ...cachedUser, ...(args[0] || {}), ...saved };
      cachedAt = Date.now();
    } else {
      cachedUser = null;
      cachedAt = 0;
    }
    return result;
  };
}

const originalLogout = base44.auth.logout.bind(base44.auth);
base44.auth.logout = (...args) => {
  cachedUser = null;
  cachedAt = 0;
  pendingUser = null;
  return originalLogout(...args);
};
