import { base44 } from '@/api/base44Client';

// Client for the self-service API key gateway (api-key-manage). Every call
// is re-verified server-side against the caller's own account -- the
// frontend never trusts its own state. See adminClient.js's adminApi for
// the same calling convention used across the app's other gateways.
export async function apiKeyApi(action, payload = {}) {
  const res = await base44.functions.invoke('api-key-manage', { ...payload, action });
  return res.data;
}
