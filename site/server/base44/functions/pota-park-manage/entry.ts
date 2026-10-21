import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

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
      const created = await base44.asServiceRole.entities.PotaPark.create({
        ...data,
        created_by_id: user.id,
        source: 'community',
        verification_status: 'pending',
        pota_status: 'active',
        submitted_by_name: user.full_name || '',
        submitted_at: new Date().toISOString(),
      });
      return Response.json(created);
    }

    const id = String(data.id || '');
    if (!id) return Response.json({ error: 'park id required' }, { status: 400 });
    const existing = await base44.asServiceRole.entities.PotaPark.get(id).catch(() => null);
    if (!existing) return Response.json({ error: 'Park not found' }, { status: 404 });
    const owner = existing.created_by_id === user.id;
    if (!isAdmin && !owner) return Response.json({ error: 'Not authorized' }, { status: 403 });

    if (action === 'update') {
      const editable = { ...data };
      delete editable.id;
      delete editable.verification_status;
      delete editable.source;
      delete editable.created_by_id;
      delete editable.submitted_by_name;
      delete editable.submitted_at;
      const updated = await base44.asServiceRole.entities.PotaPark.update(id, editable);
      return Response.json(updated);
    }
    if (action === 'moderate') {
      if (!isAdmin) return Response.json({ error: 'Administrator authorization required' }, { status: 403 });
      const updated = await base44.asServiceRole.entities.PotaPark.update(id, {
        verification_status: ['approved','pending','under_review','rejected'].includes(data.verification_status) ? data.verification_status : existing.verification_status,
        source: existing.source,
        review_notes: data.review_notes ?? existing.review_notes,
      });
      return Response.json(updated);
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[pota-park-manage] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}