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

    const editable = {
      name: data.name,
      callsign: String(data.callsign || '').toUpperCase(),
      frequency: Number(data.frequency),
      offset: data.offset == null ? undefined : Number(data.offset),
      tone: data.tone || undefined,
      input_tone: data.input_tone || undefined,
      mode: data.mode || 'Analog',
      access: data.access || 'Public',
      status: data.status || 'Online',
      coverage_radius: data.coverage_radius == null ? undefined : Number(data.coverage_radius),
      lat: Number(data.lat),
      lng: Number(data.lng),
      notes: data.notes || undefined,
      radio_service: data.radio_service === 'HAM' ? 'HAM' : 'GMRS',
    };

    if (action === 'create') {
      const created = await base44.asServiceRole.entities.Repeater.create({
        ...editable,
        created_by_id: user.id,
        verification: 'Pending',
        hidden: false,
      });
      return Response.json(created);
    }

    const id = String(data.id || '');
    if (!id) return Response.json({ error: 'repeater id required' }, { status: 400 });
    const existing = await base44.asServiceRole.entities.Repeater.get(id).catch(() => null);
    if (!existing) return Response.json({ error: 'Repeater not found' }, { status: 404 });

    const owner = existing.owner_user_id === user.id || existing.created_by_id === user.id;
    if (!isAdmin && !owner) return Response.json({ error: 'Not authorized' }, { status: 403 });

    if (action === 'update') {
      const updated = await base44.asServiceRole.entities.Repeater.update(id, editable);
      return Response.json(updated);
    }
    if (action === 'moderate') {
      if (!isAdmin) return Response.json({ error: 'Administrator authorization required' }, { status: 403 });
      const updated = await base44.asServiceRole.entities.Repeater.update(id, {
        verification: ['Verified','Pending','Needs Review','Rejected'].includes(data.verification) ? data.verification : existing.verification,
        hidden: typeof data.hidden === 'boolean' ? data.hidden : existing.hidden,
      });
      return Response.json(updated);
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[repeater-manage] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}