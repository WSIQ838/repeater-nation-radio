import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { RoomServiceClient, DataPacket_Kind } from 'npm:livekit-server-sdk@2';
import { secrets } from 'base44:runtime';

// Control console backend. Every action requires a control account (admin / super_admin / moderator).
//   roster     everyone connected to a radio channel, with the channel they are on
//   locations  last position of each member who is sharing location (last few minutes only)
//   move       tell one radio to switch to another channel (the radio app does the switching)
const STAFF = ['admin', 'super_admin', 'moderator'];
const bad = ['suspended', 'banned', 'investigation', 'deleted'];
const LOCATION_MAX_AGE_MS = 3 * 60 * 1000;

function svc() {
  const url = secrets.get('LIVEKIT_URL'), key = secrets.get('LIVEKIT_API_KEY'), secret = secrets.get('LIVEKIT_API_SECRET');
  if (!url || !key || !secret) throw new Error('Voice provider is not configured');
  return new RoomServiceClient(url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://'), key, secret);
}
function meta(p: any) {
  try {
    const m = JSON.parse(p.metadata || '{}');
    return { userId: m.userId || null, callsign: m.radioCallsign || m.callsign || null, displayName: m.displayName || p.name || 'Member' };
  } catch { return { userId: null, callsign: null, displayName: p.name || 'Member' }; }
}
const isListener = (p: any) => /^rn-(monitor|dispatch|feed)-/.test(String(p.identity || ''));

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (!STAFF.includes(String(me.role || '')) || bad.includes(me.account_status)) {
      return Response.json({ error: 'Control access required' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'roster') {
      const livekit = svc();
      const rooms = (await livekit.listRooms()) || [];
      const users: any[] = [];
      for (const room of rooms) {
        const name = String(room.name || '');
        if (!name.startsWith('radio-') || name.startsWith('radio-direct-') || Number(room.numParticipants || 0) <= 0) continue;
        const channelId = name.slice(6);
        for (const p of (await livekit.listParticipants(name).catch(() => [])) || []) {
          if (isListener(p)) continue;
          const m = meta(p);
          // Members share their status (Available, Busy, At Scene...) as a participant attribute.
          const status = String((p.attributes && p.attributes.status) || '').trim().slice(0, 40) || null;
          users.push({ identity: p.identity, userId: m.userId, callsign: m.callsign, displayName: m.displayName, channelId, status });
        }
      }
      return Response.json({ ok: true, users });
    }

    if (action === 'locations') {
      const rows = (await base44.asServiceRole.entities.RadioLocation.list('-updated_date', 500).catch(() => null));
      if (!rows) return Response.json({ error: 'Could not read locations' }, { status: 503 });
      const cutoff = Date.now() - LOCATION_MAX_AGE_MS;
      const locations = rows
        .filter((r: any) => Date.parse(r.reported_at || r.updated_date || '') >= cutoff)
        .map((r: any) => ({ userId: r.user_id, callsign: r.callsign || null, displayName: r.display_name || null, lat: r.lat, lng: r.lng, accuracy: r.accuracy ?? null, heading: r.heading ?? null, channelId: r.channel_id || null, reportedAt: r.reported_at || r.updated_date }));
      return Response.json({ ok: true, locations });
    }

    if (action === 'move') {
      const identity = String(body.identity || '').trim();
      const fromId = String(body.from_channel_id || '').trim();
      const toId = String(body.to_channel_id || '').trim();
      if (!identity || !fromId || !toId) return Response.json({ error: 'identity, from_channel_id and to_channel_id are required' }, { status: 400 });
      const target = (await base44.asServiceRole.entities.RadioChannel.filter({ id: toId }, undefined, 1).catch(() => []))?.[0]
        || await base44.asServiceRole.entities.RadioChannel.get(toId).catch(() => null);
      if (!target || target.enabled === false) return Response.json({ error: 'Destination channel not found' }, { status: 404 });
      const livekit = svc();
      const room = `radio-${fromId}`;
      const present = ((await livekit.listParticipants(room).catch(() => [])) || []).find((p: any) => p.identity === identity && !isListener(p));
      if (!present) return Response.json({ error: 'That radio is no longer on the channel' }, { status: 404 });
      await livekit.sendData(room, new TextEncoder().encode(JSON.stringify({ channel_id: toId })), DataPacket_Kind.RELIABLE, { destinationIdentities: [identity], topic: 'dispatch-move' });
      const m = meta(present);
      await base44.asServiceRole.entities.AuditLog.create({ admin_id: me.id, admin_name: me.full_name || me.email || 'Dispatch', action: 'radio.dispatch.move', category: 'admin', target_type: 'User', target_id: m.userId || identity, target_label: m.callsign || m.displayName, after: JSON.stringify({ from: fromId, to: toId }) }).catch(() => {});
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[radio-dispatch]', e?.message || e);
    return Response.json({ error: e?.message || 'Dispatch request failed' }, { status: 500 });
  }
}