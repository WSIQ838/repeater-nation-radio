import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { writeAudit, getIp, getByIdWithFallback } from '../../shared/adminGuard.ts';
import { checkPermission } from '../../shared/permissions.ts';
import { generateApiKey, hashApiKeyForStorage } from '../../shared/apiAuth.ts';

// ===== APP-SPECIFIC =====
// Self-service management of a member's own public-API keys (see
// base44/functions/api-v1 for the API those keys unlock). Member-scoped,
// not admin-scoped -- any authenticated, non-suspended caller can reach
// this function and act on their OWN keys; `create` additionally requires
// the apikeys.create permission (granted to the member role by default,
// withheld from unverified accounts -- see permissions.ts). Admin-wide
// oversight (list/revoke *any* key) lives in admin-api's apikeys:* actions
// instead, not here.
// ===== END APP-SPECIFIC =====

const MAX_ACTIVE_KEYS = 5;

// Bump this if the Developer Terms change materially -- a member who
// agreed to an older version can be re-prompted by comparing it against
// their stored dev_api_agreed_version. Keep in sync with the copy shown
// client-side in ApiAccessCard.jsx.
const DEV_API_TERMS_VERSION = 'v1';

function publicKey(row: any) {
  const { key_hash, ...rest } = row;
  return rest;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (caller.account_status && ['suspended', 'banned', 'investigation', 'deleted'].includes(caller.account_status)) {
      return Response.json({ error: 'Your account cannot manage API keys right now' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const ip = getIp(req);
    const actorName = caller.full_name || caller.email || 'member';

    if (action === 'agree') {
      await base44.asServiceRole.entities.User.update(caller.id, {
        dev_api_agreed: true,
        dev_api_agreed_at: new Date().toISOString(),
        dev_api_agreed_version: DEV_API_TERMS_VERSION,
      });
      await writeAudit(base44, {
        admin_id: caller.id, admin_name: actorName,
        action: 'apikey.devModeAgree', category: 'api',
        target_type: 'User', target_id: caller.id, target_label: actorName,
        ip, meta: { version: DEV_API_TERMS_VERSION }, description: 'Agreed to Developer API Terms',
      });
      return Response.json({ ok: true });
    }

    if (action === 'list') {
      const rows = await base44.asServiceRole.entities.ApiKey.filter({ owner_user_id: caller.id }, '-created_date', 100).catch(() => []);
      return Response.json({ ok: true, keys: (rows || []).map(publicKey) });
    }

    if (action === 'create') {
      const has = await checkPermission(base44, caller, 'apikeys.create');
      if (!has) return Response.json({ error: 'You are not authorized to create API keys.' }, { status: 403 });

      // Never trust a client-side checkbox for this -- re-verify the
      // account's own stored agreement before minting a key, regardless of
      // what the request claims.
      if (caller.dev_api_agreed !== true) {
        return Response.json({ error: 'You must agree to the Developer API Terms before creating an API key.', code: 'dev_terms_required' }, { status: 403 });
      }

      const label = String(body.label || '').trim().slice(0, 100);
      if (!label) return Response.json({ error: 'A label is required.' }, { status: 400 });

      const existing = await base44.asServiceRole.entities.ApiKey.filter(
        { owner_user_id: caller.id, status: 'active' }, '-created_date', 20
      ).catch(() => []);
      if ((existing || []).length >= MAX_ACTIVE_KEYS) {
        return Response.json({ error: `You can have at most ${MAX_ACTIVE_KEYS} active API keys. Revoke one first.` }, { status: 400 });
      }

      const { rawKey, prefix } = generateApiKey();
      const keyHash = await hashApiKeyForStorage(rawKey);
      const created = await base44.asServiceRole.entities.ApiKey.create({
        owner_user_id: caller.id,
        owner_callsign: caller.callsign || '',
        owner_name: actorName,
        label,
        key_prefix: prefix,
        key_hash: keyHash,
        status: 'active',
        scopes: ['read:public'],
        rate_limit_tier: 'standard',
        total_requests: 0,
      });

      await writeAudit(base44, {
        admin_id: caller.id, admin_name: actorName,
        action: 'apikey.create', category: 'api',
        target_type: 'ApiKey', target_id: created.id, target_label: label,
        ip, description: `Created API key "${label}"`,
      });

      // The raw key is only ever available in this one response -- the
      // caller must copy it now, since only its hash is ever stored.
      return Response.json({ ok: true, key: { ...publicKey(created), raw_key: rawKey } });
    }

    if (action === 'rename') {
      const id = String(body.id || '');
      const label = String(body.label || '').trim().slice(0, 100);
      if (!id || !label) return Response.json({ error: 'id and label are required.' }, { status: 400 });
      const row = await getByIdWithFallback(base44.asServiceRole.entities.ApiKey, id);
      if (!row || row.owner_user_id !== caller.id) return Response.json({ error: 'API key not found.' }, { status: 404 });
      const updated = await base44.asServiceRole.entities.ApiKey.update(id, { label });
      return Response.json({ ok: true, key: publicKey(updated) });
    }

    if (action === 'revoke') {
      const id = String(body.id || '');
      if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
      const row = await getByIdWithFallback(base44.asServiceRole.entities.ApiKey, id);
      if (!row) return Response.json({ error: 'API key not found.' }, { status: 404 });
      const isOwner = row.owner_user_id === caller.id;
      const isAdmin = caller.role === 'admin' || caller.role === 'super_admin' || caller._app_role === 'admin' || caller._app_role === 'super_admin';
      if (!isOwner && !isAdmin) return Response.json({ error: 'Not authorized to revoke this key.' }, { status: 403 });

      const updated = await base44.asServiceRole.entities.ApiKey.update(id, {
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: isOwner ? 'self' : caller.id,
        revoked_reason: String(body.reason || '').slice(0, 500),
      });

      await writeAudit(base44, {
        admin_id: caller.id, admin_name: actorName,
        action: 'apikey.revoke', category: 'api',
        target_type: 'ApiKey', target_id: id, target_label: row.label,
        ip, description: isOwner ? 'Self-revoked API key' : `Admin revoked another member's API key`,
      });

      return Response.json({ ok: true, key: publicKey(updated) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[api-key-manage] error:', (error as any)?.message || error);
    return Response.json({ error: 'Could not process API key request' }, { status: 500 });
  }
}
