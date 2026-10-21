import { base44 } from '@/api/base44Client';
import { forgetConfig } from '@/lib/configCache';

// Central client for the secure admin-api gateway. Every call is verified
// server-side for the admin role; the frontend never trusts its own state.
//
// Admin pages can mount/remount during navigation and React development checks.
// Keep identical in-flight requests shared so one UI action cannot create a
// burst of duplicate gateway calls and trip Base44 rate limits.
const inFlightAdminRequests = new Map();

function requestKey(action, payload) {
  try {
    return `${action}:${JSON.stringify(payload || {})}`;
  } catch {
    return `${action}:uncacheable`;
  }
}

export async function adminApi(action, payload = {}) {
  const key = requestKey(action, payload);
  if (inFlightAdminRequests.has(key)) {
    return inFlightAdminRequests.get(key);
  }

  // `action` goes last so a payload key can never overwrite the routing key.
  const request = base44.functions
    .invoke('admin-api', { ...payload, action })
    .then((res) => {
      // Sidebar order, tool/radio switches and social links are cached in the
      // browser for a few minutes (lib/configCache); a saved change should
      // show for the admin who made it straight away.
      if (action === 'settings:update') forgetConfig('nav', 'tools', 'site');
      return res.data;
    })
    .finally(() => {
      inFlightAdminRequests.delete(key);
    });

  inFlightAdminRequests.set(key, request);
  return request;
}

const inFlightRoleRequests = new Map();

export async function rolesApi(action, payload = {}) {
  const key = requestKey(action, payload);
  if (inFlightRoleRequests.has(key)) {
    return inFlightRoleRequests.get(key);
  }

  const request = base44.functions
    .invoke('manage-roles', { ...payload, action })
    .then((res) => res.data)
    .finally(() => {
      inFlightRoleRequests.delete(key);
    });

  inFlightRoleRequests.set(key, request);
  return request;
}