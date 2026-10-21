// Posts client-side entity events (POTA park submissions, repeater
// submissions) to Discord. Invoked by entity-trigger workflows because
// these records are created directly from the app UI, not from a backend
// function. Filters out bulk imports so only genuine user submissions post.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { postDiscordNotification } from '../../shared/discordWebhook.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const type = String(body.type || '');
    const entityId = String(body.entity_id || '');
    if (!type || !entityId) return Response.json({ skipped: true, reason: 'missing_args' });

    if (type === 'pota_submission') {
      const park = await base44.asServiceRole.entities.PotaPark.get(entityId).catch(() => null);
      if (!park) return Response.json({ skipped: true, reason: 'not_found' });
      if (park.discord_notified_at) return Response.json({ skipped: true, reason: 'already_notified' });
      if (park.source !== 'community') return Response.json({ skipped: true, reason: 'not_community' });
      await postDiscordNotification(base44, 'pota_submission', 'pota_submission', {
        submitted_by_name: park.submitted_by_name || 'A member',
        park_name: park.name || '',
        park_number: park.park_number || '—',
        location: park.location || [park.city, park.state].filter(Boolean).join(', ') || '—',
        verification_status: park.verification_status || 'pending',
      }, {
        fields: [
          { name: 'Park Name', value: String(park.name).slice(0, 1024) || '—', inline: true },
          { name: 'Park Number', value: park.park_number || '—', inline: true },
          { name: 'Location', value: park.location || [park.city, park.state].filter(Boolean).join(', ') || '—', inline: true },
          { name: 'Status', value: park.verification_status || 'pending', inline: true },
        ],
      });
      await base44.asServiceRole.entities.PotaPark.update(entityId, { discord_notified_at: new Date().toISOString() }).catch(() => {});
      return Response.json({ ok: true });
    }

    if (type === 'repeater_submission') {
      const repeater = await base44.asServiceRole.entities.Repeater.get(entityId).catch(() => null);
      if (!repeater) return Response.json({ skipped: true, reason: 'not_found' });
      if (repeater.discord_notified_at) return Response.json({ skipped: true, reason: 'already_notified' });
      // Skip bulk imports — only user-submitted repeaters have a created_by_id.
      if (!repeater.created_by_id) return Response.json({ skipped: true, reason: 'import' });
      await postDiscordNotification(base44, 'repeater_submission', 'repeater_submission', {
        repeater_name: repeater.name || '',
        callsign: repeater.callsign || '—',
        frequency: repeater.frequency != null ? `${repeater.frequency} MHz` : '—',
        verification: repeater.verification || 'Pending',
      }, {
        fields: [
          { name: 'Name', value: String(repeater.name).slice(0, 1024) || '—', inline: true },
          { name: 'Callsign', value: repeater.callsign || '—', inline: true },
          { name: 'Frequency', value: repeater.frequency != null ? `${repeater.frequency} MHz` : '—', inline: true },
          { name: 'Verification', value: repeater.verification || 'Pending', inline: true },
        ],
      });
      await base44.asServiceRole.entities.Repeater.update(entityId, { discord_notified_at: new Date().toISOString() }).catch(() => {});
      return Response.json({ ok: true });
    }

    return Response.json({ skipped: true, reason: 'unknown_type' });
  } catch (error) {
    console.error('[discord-entity-notify] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}