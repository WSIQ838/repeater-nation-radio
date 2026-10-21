import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

// Community summit submissions and moderation for the SOTA tool, mirroring
// pota-park-manage: members submit summits (pending review), owners edit
// their own, admins moderate.

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
// Fields a member may set on a summit; counters, moderation and import
// bookkeeping are server-controlled.
const MEMBER_FIELDS = ['name', 'summit_ref', 'association', 'association_name', 'region', 'region_name', 'altitude_m', 'altitude_ft',
  'points', 'bonus_points', 'lat', 'lng', 'state', 'county', 'description', 'access_notes', 'sota_url', 'supporting_info',
  'photo_urls', 'search_keywords'];
const pick = (data: Record<string, unknown>) => Object.fromEntries(MEMBER_FIELDS.filter((k) => k in data).map((k) => [k, data[k]]));

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'create');
    const data = body.data || {};
    const isAdmin = ADMIN_ROLES.has(user.role) || ADMIN_ROLES.has(user._app_role);

    if (action === 'create') {
      const ref = String(data.summit_ref || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{1,4}\/[A-Z0-9]{2}-\d{3}$/.test(ref)) return Response.json({ error: 'Summit reference must look like W7W/KG-001' }, { status: 400 });
      const dupe = await base44.asServiceRole.entities.SotaSummit.filter({ summit_ref: ref }, undefined, 1).catch(() => []);
      if (dupe?.length) return Response.json({ error: `${ref} is already in the directory`, existing_id: dupe[0].id }, { status: 409 });
      data.summit_ref = ref;
      const created = await base44.asServiceRole.entities.SotaSummit.create({
        ...pick(data),
        created_by_id: user.id,
        source: 'community',
        verification_status: 'pending',
        summit_status: 'active',
        submitted_by_name: user.full_name || '',
        submitted_at: new Date().toISOString(),
      });
      return Response.json(created);
    }

    const id = String(data.id || '');
    if (!id) return Response.json({ error: 'summit id required' }, { status: 400 });
    const existing = await base44.asServiceRole.entities.SotaSummit.get(id).catch(() => null);
    if (!existing) return Response.json({ error: 'Summit not found' }, { status: 404 });
    const owner = existing.created_by_id === user.id;
    if (!isAdmin && !owner) return Response.json({ error: 'Not authorized' }, { status: 403 });

    if (action === 'update') {
      const editable = isAdmin ? { ...data } : pick(data);
      delete editable.id;
      delete editable.verification_status;
      delete editable.source;
      delete editable.created_by_id;
      delete editable.submitted_by_name;
      delete editable.submitted_at;
      if (editable.summit_ref) editable.summit_ref = String(editable.summit_ref).trim().toUpperCase();
      const updated = await base44.asServiceRole.entities.SotaSummit.update(id, editable);
      return Response.json(updated);
    }
    if (action === 'moderate') {
      if (!isAdmin) return Response.json({ error: 'Administrator authorization required' }, { status: 403 });
      const updated = await base44.asServiceRole.entities.SotaSummit.update(id, {
        verification_status: ['approved','pending','under_review','rejected'].includes(data.verification_status) ? data.verification_status : existing.verification_status,
        source: existing.source,
        review_notes: data.review_notes ?? existing.review_notes,
      });
      return Response.json(updated);
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[sota-summit-manage] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}