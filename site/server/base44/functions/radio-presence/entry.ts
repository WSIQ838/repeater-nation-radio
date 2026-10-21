import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { RoomServiceClient } from 'npm:livekit-server-sdk@2';
import { secrets } from 'base44:runtime';
import { readRadioRows } from '../../shared/radioLookup.ts';

function svc() {
  const url = secrets.get('LIVEKIT_URL');
  const key = secrets.get('LIVEKIT_API_KEY');
  const secret = secrets.get('LIVEKIT_API_SECRET');
  if (!url || !key || !secret) throw new Error('Voice provider is not configured');
  return new RoomServiceClient(url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://'), key, secret);
}
function meta(p) {
  // Radio connections join with a per-connection identity (radioSessionId);
  // the member's account id rides in the metadata issue-radio-session writes.
  try { const m = JSON.parse(p.metadata || '{}'); return { userId: m.userId || null, callsign: m.callsign || null, displayName: m.displayName || p.name || 'Member' }; }
  catch { return { userId: null, callsign: null, displayName: p.name || 'Member' }; }
}
// Every open radio widget polls this, so it is one of the app's busiest
// functions. Channels and zones change rarely: keep them for a minute per
// instance instead of reading both tables on every poll. The LiveKit room
// list is shared by all callers for a few seconds; per-caller filtering
// (role, self) still happens on every request.
const CONFIG_TTL_MS = 60_000;
const ROOMS_TTL_MS = 4_000;
let config: { at: number; channelRows: any[]; zoneRows: any[] } | null = null;
let roomCache: { at: number; list: { name: string; participants: any[] }[] } | null = null;
let roomsLoading: Promise<{ name: string; participants: any[] }[]> | null = null;

// Controllers (dispatchers) mark themselves online in DispatchPresence each time
// the console polls dispatch-chat; a row counts for CONTROLLER_ONLINE_MS, the
// same window dispatch-chat uses. Shared by all callers for a few seconds.
const CONTROLLER_ONLINE_MS = 25_000;
const CONTROLLERS_TTL_MS = 5_000;
let controllerCache: { at: number; count: number } | null = null;

async function getControllersOnline(base44: any): Promise<number> {
  if (controllerCache && Date.now() - controllerCache.at < CONTROLLERS_TTL_MS) return controllerCache.count;
  const rows = await base44.asServiceRole.entities.DispatchPresence.list('-last_seen', 100).catch(() => null);
  if (!Array.isArray(rows)) return controllerCache?.count ?? 0;
  const cutoff = Date.now() - CONTROLLER_ONLINE_MS;
  const count = new Set(rows.filter((r: any) => Date.parse(r.last_seen || '') >= cutoff).map((r: any) => r.user_id)).size;
  controllerCache = { at: Date.now(), count };
  return count;
}

async function getRadioConfig(base44: any) {
  if (config && Date.now() - config.at < CONFIG_TTL_MS) return config;
  // readRadioRows retries and falls back to the caller's own read, so a
  // failed service-role read no longer empties the member list.
  const [channelRows, zoneRows] = await Promise.all([
    readRadioRows(base44, 'RadioChannel', {}, 'number', 500),
    readRadioRows(base44, 'RadioZone', {}, 'display_order', 200),
  ]);
  // null means no read answered; don't cache an outage.
  if (channelRows === null || zoneRows === null) return { at: 0, channelRows: channelRows || config?.channelRows || [], zoneRows: zoneRows || config?.zoneRows || [] };
  config = { at: Date.now(), channelRows, zoneRows };
  return config;
}

async function getRoomSnapshot(livekit: RoomServiceClient) {
  if (roomCache && Date.now() - roomCache.at < ROOMS_TTL_MS) return roomCache.list;
  if (!roomsLoading) {
    roomsLoading = (async () => {
      // Only inspect active LiveKit rooms. Empty rooms have no presence to return.
      const all = await livekit.listRooms();
      const list = [];
      for (const room of all || []) {
        const name = String(room.name || '');
        if (!name.startsWith('radio-') || Number(room.numParticipants || 0) <= 0) continue;
        list.push({ name, participants: (await livekit.listParticipants(name).catch(() => [])) || [] });
      }
      roomCache = { at: Date.now(), list };
      return list;
    })().finally(() => { roomsLoading = null; });
  }
  return roomsLoading;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const livekit = svc();
    const role = me.role || 'user';
    const staff = role === 'admin' || role === 'super_admin';
    const roleRank = { user: 0, moderator: 1, admin: 2, super_admin: 2 };

    const { channelRows, zoneRows } = await getRadioConfig(base44);
    const channelMap = new Map((channelRows || []).map((c) => [c.id, c]));
    const zoneMap = new Map((zoneRows || []).map((z) => [z.id, z]));
    const canSeeChannel = (channel) => {
      if (!channel || channel.enabled === false || channel.admin_only && !staff) return false;
      const zone = zoneMap.get(channel.zone_id);
      return !!zone && zone.enabled !== false && (roleRank[zone.min_role] || 0) <= (roleRank[role] || 0);
    };

    const [rooms, controllersOnline] = await Promise.all([getRoomSnapshot(livekit), getControllersOnline(base44)]);
    const users = new Map();
    const busyUserIds = new Set();
    for (const { name, participants } of rooms) {
      if (name.startsWith('radio-direct-')) {
        for (const p of participants || []) {
          if (!/^rn-(monitor|dispatch|feed)-/.test(String(p.identity || ''))) busyUserIds.add(p.identity);
        }
        continue;
      }
      const channelId = name.slice(6);
      const channel = channelMap.get(channelId);
      if (!canSeeChannel(channel)) continue;
      for (const p of participants || []) {
        if (/^rn-(monitor|feed)-/.test(String(p.identity || ''))) continue;
        const m = meta(p);
        // One entry per member account (they may have the app and the website
        // on at once), never the caller, and always the account id: direct
        // calls look the recipient up by account.
        const userId = m.userId || p.identity;
        if (userId === me.id || users.has(userId)) continue;
        users.set(userId, { userId, callsign: m.callsign, displayName: m.displayName, channelId });
      }
    }
    return Response.json({ ok: true, users: [...users.values()], busyUserIds: [...busyUserIds], controllersOnline });
  } catch (e) {
    console.error('[radio-presence]', e?.message || e);
    return Response.json({ error: 'Could not read radio presence' }, { status: 500 });
  }
}