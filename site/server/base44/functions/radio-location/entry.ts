import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';

// Members who switch on location sharing report their position here. One row per member.
//   report   store my position; visibility 'dispatch' (staff only, exact) or 'members' (also shown to
//            other members who are sharing with members themselves, blurred to about 100 m)
//   stop     remove my position
//   members  other members' positions, only for a caller who is sharing with members too
// The entity's own rules let only dispatch (admin / super_admin) read rows directly.
const bad = ['suspended', 'banned', 'investigation', 'deleted'];
const MEMBER_MAX_AGE_MS = 3 * 60 * 1000;
const blur = (n: number) => Math.round(n * 1000) / 1000; // 3 decimals is about 110 m

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (bad.includes(me.account_status)) return Response.json({ error: 'Your account cannot use the radio right now' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const rows = (await base44.asServiceRole.entities.RadioLocation.filter({ user_id: me.id }, '-updated_date', 10).catch(() => [])) || [];

    if (action === 'stop') {
      await Promise.all(rows.map((r: any) => base44.asServiceRole.entities.RadioLocation.delete(r.id).catch(() => {})));
      return Response.json({ ok: true });
    }

    if (action === 'report') {
      const lat = Number(body.lat), lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return Response.json({ error: 'Invalid position' }, { status: 400 });
      }
      const num = (v: any) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : undefined);
      const data = {
        user_id: me.id,
        callsign: String(me.callsign || '').trim().toUpperCase() || undefined,
        display_name: me.full_name || me.email || 'Member',
        lat, lng,
        accuracy: num(body.accuracy),
        heading: num(body.heading),
        channel_id: String(body.channel_id || '').slice(0, 64) || undefined,
        visibility: body.visibility === 'members' ? 'members' : 'dispatch',
        reported_at: new Date().toISOString(),
      };
      if (rows[0]) {
        await base44.asServiceRole.entities.RadioLocation.update(rows[0].id, data);
        await Promise.all(rows.slice(1).map((r: any) => base44.asServiceRole.entities.RadioLocation.delete(r.id).catch(() => {})));
      } else {
        await base44.asServiceRole.entities.RadioLocation.create(data);
      }
      return Response.json({ ok: true });
    }

    if (action === 'members') {
      // You only see other members while you are sharing with members too.
      const mine = rows[0];
      const sharing = !!mine && mine.visibility === 'members' && Date.now() - Date.parse(mine.reported_at || mine.updated_date || '') < MEMBER_MAX_AGE_MS;
      if (!sharing) return Response.json({ ok: true, locked: true, locations: [] });
      const all = await base44.asServiceRole.entities.RadioLocation.filter({ visibility: 'members' }, '-updated_date', 300).catch(() => null);
      if (!all) return Response.json({ error: 'Could not read locations' }, { status: 503 });
      const cutoff = Date.now() - MEMBER_MAX_AGE_MS;
      const locations = all
        .filter((r: any) => r.user_id !== me.id && Date.parse(r.reported_at || r.updated_date || '') >= cutoff)
        .map((r: any) => ({ key: r.id, callsign: r.callsign || null, displayName: r.display_name || 'Member', lat: blur(r.lat), lng: blur(r.lng), reportedAt: r.reported_at || r.updated_date }));
      return Response.json({ ok: true, locked: false, locations });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[radio-location]', e?.message || e);
    return Response.json({ error: 'Could not update location' }, { status: 500 });
  }
}
