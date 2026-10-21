import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { AccessToken } from 'npm:livekit-server-sdk@2';
import { secrets } from 'base44:runtime';

// Stream channels: listen-only channels that carry an audio feed (a scanner, an SDR, a line-in).
//   request   { name, description }       any signed-in member asks for a stream channel
//   mine      {}                          the caller's own requests and the channels they own
//   pending   {}                          control (admin / super_admin / moderator): requests waiting for approval
//   approve   { request_id, zone_id, name? }  control: creates the listen-only channel for the member
//   reject    { request_id, reason? }     control: turns the request down
//   token     { channel_id, label? }      a publish token for a listen-only channel; admins, or the member who owns it
// The identity of a feed starts with rn-feed-, so feeds never show up in rosters or presence lists.
const STAFF = ['admin', 'super_admin'];
const CONTROL = ['admin', 'super_admin', 'moderator'];
const bad = ['suspended', 'banned', 'investigation', 'deleted'];
const MAX_PENDING = 3;

const cap = (s: any, n: number) => String(s ?? '').trim().slice(0, n);

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (bad.includes(me.account_status)) return Response.json({ error: 'Your account cannot use this right now' }, { status: 403 });
    const db = base44.asServiceRole.entities;
    const role = String(me.role || '');
    const isControl = CONTROL.includes(role), isAdmin = STAFF.includes(role);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const who = (me.full_name || me.email || 'Member');

    if (action === 'request') {
      const name = cap(body.name, 40);
      if (name.length < 2) return Response.json({ error: 'Give the stream channel a name.' }, { status: 400 });
      const mineOpen = (await db.FeedChannelRequest.filter({ requester_user_id: me.id, status: 'pending' }, undefined, 20).catch(() => [])) || [];
      if (mineOpen.length >= MAX_PENDING) return Response.json({ error: `You already have ${MAX_PENDING} requests waiting for approval.` }, { status: 429 });
      const r = await db.FeedChannelRequest.create({
        requester_user_id: me.id, requester_name: cap(who, 60), requester_callsign: cap(me.callsign, 20),
        name, description: cap(body.description, 300), status: 'pending',
      });
      return Response.json({ ok: true, id: r.id });
    }

    if (action === 'mine') {
      const requests = ((await db.FeedChannelRequest.filter({ requester_user_id: me.id }, '-created_date', 50).catch(() => [])) || [])
        .map((r: any) => ({ id: r.id, name: r.name, description: r.description || '', status: r.status, reason: r.reason || '', channelId: r.channel_id || null, at: r.created_date }));
      const owned = ((await db.RadioChannel.filter({ feed_owner_user_id: me.id }, undefined, 100).catch(() => [])) || [])
        .map((c: any) => ({ id: c.id, name: c.name, number: c.number, zoneId: c.zone_id }));
      return Response.json({ ok: true, requests, channels: owned });
    }

    if (action === 'pending') {
      if (!isControl) return Response.json({ error: 'Control access required' }, { status: 403 });
      const rows = (await db.FeedChannelRequest.filter({ status: 'pending' }, 'created_date', 100).catch(() => [])) || [];
      return Response.json({ ok: true, requests: rows.map((r: any) => ({ id: r.id, name: r.name, description: r.description || '', requester: r.requester_name || 'Member', callsign: r.requester_callsign || '', userId: r.requester_user_id, at: r.created_date })) });
    }

    if (action === 'approve' || action === 'reject') {
      if (!isControl) return Response.json({ error: 'Control access required' }, { status: 403 });
      const reqRow = await db.FeedChannelRequest.get(String(body.request_id || '')).catch(() => null);
      if (!reqRow) return Response.json({ error: 'Request not found' }, { status: 404 });
      if (reqRow.status !== 'pending') return Response.json({ error: `That request was already ${reqRow.status}.` }, { status: 409 });
      const now = new Date().toISOString();
      if (action === 'reject') {
        await db.FeedChannelRequest.update(reqRow.id, { status: 'rejected', decided_by: me.id, decided_at: now, reason: cap(body.reason, 200) });
        await db.AuditLog.create({ admin_id: me.id, admin_name: cap(who, 60), action: 'radio.feed.reject', category: 'admin', target_type: 'FeedChannelRequest', target_id: reqRow.id, target_label: reqRow.name }).catch(() => {});
        return Response.json({ ok: true });
      }
      const zoneId = String(body.zone_id || '').trim();
      const zone = zoneId ? await db.RadioZone.get(zoneId).catch(() => null) : null;
      if (!zone) return Response.json({ error: 'Choose the zone the stream channel goes in.' }, { status: 400 });
      const name = cap(body.name, 40) || reqRow.name;
      const existing = (await db.RadioChannel.filter({ zone_id: zoneId }, '-number', 200).catch(() => [])) || [];
      const number = existing.reduce((m: number, c: any) => Math.max(m, Number(c.number) || 0), 0) + 1;
      const channel = await db.RadioChannel.create({
        zone_id: zoneId, name, number, enabled: true, listen_only: true, feed_owner_user_id: reqRow.requester_user_id,
        description: cap(reqRow.description, 300),
      });
      await db.FeedChannelRequest.update(reqRow.id, { status: 'approved', channel_id: channel.id, decided_by: me.id, decided_at: now });
      await db.AuditLog.create({ admin_id: me.id, admin_name: cap(who, 60), action: 'radio.feed.approve', category: 'admin', target_type: 'RadioChannel', target_id: channel.id, target_label: name, after: JSON.stringify({ requester: reqRow.requester_user_id, zone: zoneId }) }).catch(() => {});
      return Response.json({ ok: true, channelId: channel.id });
    }

    if (action === 'token') {
      const channelId = String(body.channel_id || '').trim();
      if (!channelId) return Response.json({ error: 'channel_id is required' }, { status: 400 });
      const channel = await db.RadioChannel.get(channelId).catch(() => null);
      if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 });
      const owner = channel.feed_owner_user_id && channel.feed_owner_user_id === me.id;
      if (!isAdmin && !owner) return Response.json({ error: 'Only an admin or the owner of this stream channel can connect a feed.' }, { status: 403 });
      const zone = channel.zone_id ? await db.RadioZone.get(channel.zone_id).catch(() => null) : null;
      if (channel.listen_only !== true && zone?.listen_only !== true) {
        return Response.json({ error: 'Make the channel (or its zone) listen only before connecting a feed.' }, { status: 409 });
      }
      const url = secrets.get('LIVEKIT_URL'), key = secrets.get('LIVEKIT_API_KEY'), secret = secrets.get('LIVEKIT_API_SECRET');
      if (!url || !key || !secret) return Response.json({ error: 'Voice provider is not configured' }, { status: 503 });
      const label = cap(body.label || channel.name || 'Feed', 40) || 'Feed';
      const identity = `rn-feed-${channel.id}-${crypto.randomUUID().slice(0, 8)}`;
      const roomName = `radio-${channel.id}`;
      const ttlHours = 24;
      const at = new AccessToken(key, secret, {
        identity, name: label, ttl: `${ttlHours}h`,
        metadata: JSON.stringify({ displayName: label, sessionType: 'feed', canTransmit: true, userId: null }),
      });
      at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canPublishData: false, canSubscribe: false });
      const token = await at.toJwt();
      await db.AuditLog.create({ admin_id: me.id, admin_name: cap(who, 60), action: 'radio.feed.token', category: 'admin', target_type: 'RadioChannel', target_id: channel.id, target_label: channel.name, after: JSON.stringify({ identity, label, ttlHours, owner: !!owner }) }).catch(() => {});
      return Response.json({ ok: true, url, roomName, identity, label, token, expiresInHours: ttlHours });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[radio-feed]', e?.message || e);
    return Response.json({ error: e?.message || 'Feed request failed' }, { status: 500 });
  }
}
