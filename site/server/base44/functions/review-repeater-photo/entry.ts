import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json();
    const photoId = String(body?.photo_id || '');
    const status = String(body?.status || '');
    if (!photoId || !['Approved', 'Rejected'].includes(status)) {
      return Response.json({ error: 'photo_id and a valid status are required' }, { status: 400 });
    }

    const photo = await base44.asServiceRole.entities.RepeaterPhoto.get(photoId).catch(() => null);
    if (!photo) return Response.json({ error: 'Photo not found' }, { status: 404 });

    const repeater = await base44.asServiceRole.entities.Repeater.get(photo.repeater_id).catch(() => null);
    if (!repeater) return Response.json({ error: 'Repeater not found' }, { status: 404 });

    const ownerId = repeater.owner_user_id || repeater.created_by_id;
    const isAdmin = me.role === 'admin' || me.role === 'super_admin' || me._app_role === 'admin' || me._app_role === 'super_admin';
    if (!isAdmin && me.id !== ownerId) {
      return Response.json({ error: 'Only the repeater owner or an admin can review photos.' }, { status: 403 });
    }

    const updated = await base44.asServiceRole.entities.RepeaterPhoto.update(photoId, {
      status,
      approved_by_id: me.id,
      approved_date: new Date().toISOString(),
    });

    const submitterId = photo.created_by_id || photo.submitted_by_id;
    if (submitterId && submitterId !== me.id) {
      await base44.asServiceRole.entities.UserNotification.create({
        user_id: submitterId,
        title: status === 'Approved' ? 'Repeater Photo Approved' : 'Repeater Photo Rejected',
        message: status === 'Approved'
          ? 'Your photo for ' + (photo.repeater_name || repeater.name || 'a repeater') + ' was approved.'
          : 'Your photo for ' + (photo.repeater_name || repeater.name || 'a repeater') + ' was rejected.',
        type: status === 'Approved' ? 'system' : 'alert',
        sender_name: me.full_name || me.callsign || 'Repeater owner',
        link_url: '/repeaters/' + photo.repeater_id,
        link_label: 'View Repeater',
        description: 'repeater_photo:' + photo.id + ':' + status.toLowerCase(),
      }).catch((e) => console.error('[review-repeater-photo] notification failed:', e?.message || e));
    }

    return Response.json(updated);
  } catch (error) {
    console.error('[review-repeater-photo] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}