import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'create');
    const clubPage = body.page || {};
    const clubId = String(clubPage.club_id || body.club_id || '');

    if (!clubId) return Response.json({ error: 'club_id required' }, { status: 400 });

    const club = await base44.asServiceRole.entities.Club.get(clubId).catch(() => null);
    if (!club) return Response.json({ error: 'Club not found' }, { status: 404 });

    const isAdmin = ADMIN_ROLES.has(user.role) || ADMIN_ROLES.has(user._app_role);
    const isOwner = club.created_by_id === user.id;

    if (!isAdmin && !isOwner) return Response.json({ error: 'Only the club owner or an administrator can manage club pages.' }, { status: 403 });

    if (action === 'create') {
      const created = await base44.asServiceRole.entities.ClubPage.create({
        club_id: club.id,
        created_by_id: user.id,
        title: String(clubPage.title || '').trim(),
        body: String(clubPage.body || ''),
        page_type: clubPage.page_type || 'Info',
        content_format: clubPage.content_format || 'text',
        author_callsign: user.callsign || '',
        author_name: user.full_name || '',
        image_urls: Array.isArray(clubPage.image_urls) ? clubPage.image_urls : [],
        club_owner_id: club.created_by_id || user.id,
      });
      return Response.json(created);
    }

    const pageId = String(clubPage.id || body.page_id || '');
    if (!pageId) return Response.json({ error: 'page_id required' }, { status: 400 });
    const existing = await base44.asServiceRole.entities.ClubPage.get(pageId).catch(() => null);
    if (!existing || existing.club_id !== club.id) return Response.json({ error: 'Club page not found' }, { status: 404 });

    if (action === 'delete') {
      if (!isAdmin && existing.created_by_id !== user.id && !isOwner) return Response.json({ error: 'Not authorized' }, { status: 403 });
      await base44.asServiceRole.entities.ClubPage.delete(pageId);
      return Response.json({ ok: true });
    }

    if (action === 'update') {
      if (!isAdmin && existing.created_by_id !== user.id && !isOwner) return Response.json({ error: 'Not authorized' }, { status: 403 });
      const updated = await base44.asServiceRole.entities.ClubPage.update(pageId, {
        title: String(clubPage.title || '').trim(),
        body: String(clubPage.body || ''),
        page_type: clubPage.page_type || 'Info',
        content_format: clubPage.content_format || 'text',
        image_urls: Array.isArray(clubPage.image_urls) ? clubPage.image_urls : [],
      });
      return Response.json(updated);
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[club-page-manage] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}