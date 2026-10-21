import { createClientFromRequest } from "npm:@base44/sdk";

const POINTS = {
  contact: 5,
  uniqueContact: 5,
  checkin: 10,
  net: 15,
  streak: 5,
  potaActivation: 50,
  potaPark: 25,
  potaContact: 2,
  badge: 50,
  club: 10,
  clubCreated: 25,
  eventCreated: 10,
  profileComplete: 50,
  verified: 100,
  repeaterPhoto: 10,
  equipmentSubmission: 10,
  repeaterComment: 2,
  directCall: 2,
};

const MAX_CLUB_CREATION_XP_EVENTS = 5;
const MAX_MANUAL_EVENT_XP_EVENTS = 10;
const MAX_REPEATER_PHOTO_XP = 10;
const MAX_EQUIPMENT_SUBMISSION_XP = 20;
const MAX_REPEATER_COMMENT_XP_PER_DAY = 1;
const MAX_DIRECT_CALL_XP_PER_DAY = 3;

// 60-second cache so concurrent dashboard loads don't re-run the full computation.
const CACHE_MS = 60_000;
let cached: { at: number; body: any; period: string } | null = null;

function parseDate(value: any) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function inPeriod(value: any, period: string) {
  if (period === 'all') return true;
  const date = parseDate(value);
  if (!date) return false;
  const now = new Date();
  if (period === 'year') return date.getUTCFullYear() === now.getUTCFullYear();
  if (period === 'month') return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff && date.getTime() <= now.getTime();
}

function normalizedCallsign(value: any) {
  return String(value || '').trim().toUpperCase().replace(/\\s+/g, '');
}

function ensure(map: Map<string, any>, id: any) {
  if (!id) return null;
  const key = String(id);
  if (!map.has(key)) {
    map.set(key, {
      userId: key,
      displayName: 'Member',
      callsign: '',
      avatar: null,
      contacts: 0,
      uniqueContacts: new Set<string>(),
      checkins: 0,
      nets: 0,
      longestStreak: 0,
      potaActivations: 0,
      potaParks: new Set<string>(),
      potaContacts: 0,
      badges: 0,
      clubs: new Set<string>(),
      clubsCreated: 0,
      eventsCreated: 0,
      profileComplete: false,
      verified: false,
      manualXp: 0,
      repeaterPhotos: 0,
      equipmentSubmissions: 0,
      repeaterComments: 0,
      directCalls: 0,
    });
  }
  return map.get(key);
}

// Load all records via filter + cursor pagination (1000/page) with field projection.
// Replaces the old loadAll which used list(sort, 500, skip) — half the API calls
// and far less data transferred per call.
async function loadFiltered(entity: any, fields: string[], sort = '-created_date') {
  const all: any[] = [];
  let cursor: string | undefined;
  while (true) {
    const opts: any = { sort, limit: 1000, fields };
    if (cursor) opts.cursor = cursor;
    const page = await entity.filter({}, opts);
    all.push(...(page.items || []));
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return all;
}

async function safeLoad(entity: any, fields: string[], sort = '-created_date') {
  try {
    return await loadFiltered(entity, fields, sort);
  } catch (error) {
    console.error('[leaderboard-xp] load failed:', error?.message || error);
    return [];
  }
}

async function compute(req: Request, period: string) {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  const [
    profiles,
    contacts,
    callsigns,
    streaks,
    streakBadges,
    userBadges,
    pota,
    memberships,
    clubs,
    events,
    adjustments,
    netCheckins,
    repeaterPhotos,
    equipmentSubmissions,
    repeaterComments,
    directCalls,
  ] = await Promise.all([
    safeLoad(db.entities.Profile, ['display_name', 'callsign', 'avatar_url', 'location', 'city', 'state', 'created_by_id'], '-updated_date'),
    safeLoad(db.entities.ContactLog, ['date', 'callsign', 'callsign_used', 'created_by_id', 'pota_activation_id'], '-date'),
    safeLoad(db.entities.Callsign, ['primary_user_id', 'display_callsign', 'normalized_callsign', 'license_status', 'verification_status', 'suspended'], '-verified_at'),
    safeLoad(db.entities.NetStreak, ['user_id', 'total_checkins', 'total_nets_attended', 'longest_streak'], '-last_checkin_date'),
    safeLoad(db.entities.ClubStreakBadge, ['user_id', 'longest_streak', 'awarded_at'], '-awarded_at'),
    safeLoad(db.entities.UserBadge, ['user_id', 'awarded_at'], '-awarded_at'),
    safeLoad(db.entities.PotaActivation, ['created_by_id', 'status', 'scheduled_date', 'park_id'], '-scheduled_date'),
    safeLoad(db.entities.Membership, ['member_callsign', 'club_id', 'status', 'created_date'], '-created_date'),
    safeLoad(db.entities.Club, ['created_by_id', 'created_date'], '-created_date'),
    safeLoad(db.entities.Event, ['created_by_id', 'date', 'source_type'], '-date'),
    safeLoad(db.entities.XpAdjustment, ['user_id', 'amount', 'created_date'], '-created_date'),
    safeLoad(db.entities.NetControlCheckIn, ['callsign', 'check_in_time', 'status', 'session_id'], '-check_in_time'),
    safeLoad(db.entities.RepeaterPhoto, ['submitted_by_id', 'created_by_id', 'status', 'approved_date', 'created_date'], '-created_date'),
    safeLoad(db.entities.EquipmentSubmission, ['created_by_id', 'status', 'updated_date', 'created_date'], '-created_date'),
    safeLoad(db.entities.RepeaterComment, ['created_by_id', 'created_date', 'repeater_id'], '-created_date'),
    safeLoad(db.entities.RadioDirectCall, ['caller_user_id', 'recipient_user_id', 'status', 'started_at'], '-started_at'),
  ]);

  const byUser = new Map<string, any>();
  const userByCallsign = new Map<string, string>();

  for (const p of profiles || []) {
    const id = p?.created_by_id || p?.user_id;
    const r = ensure(byUser, id);
    if (!r) continue;
    r.displayName = p.display_name || p.callsign || r.displayName;
    r.callsign = p.callsign || r.callsign;
    r.avatar = p.avatar_url || r.avatar;
    r.profileComplete = !!(p.display_name && (p.location || (p.city && p.state)) && p.avatar_url);
    const profileCallsign = normalizedCallsign(p.callsign);
    if (profileCallsign) userByCallsign.set(profileCallsign, String(id));
  }

  const verifiedUsers = new Set<string>();
  for (const c of callsigns || []) {
    const id = c?.primary_user_id;
    const status = String(c?.license_status || '').toLowerCase();
    const verification = String(c?.verification_status || '').toLowerCase();
    if (id && status === 'active' && verification === 'verified' && c?.suspended !== true) {
      verifiedUsers.add(String(id));
      const r = ensure(byUser, id);
      if (r && !r.callsign) r.callsign = c.display_callsign || c.normalized_callsign || '';
    }
  }
  for (const [id] of byUser) {
    if (verifiedUsers.has(id)) byUser.get(id).verified = true;
  }

  for (const c of contacts || []) {
    const r = ensure(byUser, c?.created_by_id);
    if (!r || !inPeriod(c?.date, period)) continue;
    r.contacts += 1;
    const call = normalizedCallsign(c?.callsign || c?.callsign_used);
    if (call) r.uniqueContacts.add(call);
  }

  const periodNetSessionsByUser = new Map<string, Set<string>>();
  for (const c of netCheckins || []) {
    const call = normalizedCallsign(c?.callsign);
    const userId = userByCallsign.get(call);
    if (!userId || !inPeriod(c?.check_in_time, period) || c?.status === 'no_show') continue;
    const r = ensure(byUser, userId);
    if (!r) continue;
    r.checkins += 1;
    if (!periodNetSessionsByUser.has(userId)) periodNetSessionsByUser.set(userId, new Set());
    periodNetSessionsByUser.get(userId).add(String(c.session_id || ''));
  }
  for (const [userId, sessionIds] of periodNetSessionsByUser) {
    const r = ensure(byUser, userId);
    if (r) r.nets += [...sessionIds].filter(Boolean).length;
  }

  if (period === 'all') {
    for (const s of streaks || []) {
      const r = ensure(byUser, s?.user_id);
      if (!r) continue;
      r.checkins = Math.max(r.checkins, Number(s?.total_checkins || 0));
      r.nets = Math.max(r.nets, Number(s?.total_nets_attended || 0));
      r.longestStreak = Math.max(r.longestStreak, Number(s?.longest_streak || 0));
    }
  } else {
    for (const b of streakBadges || []) {
      const r = ensure(byUser, b?.user_id);
      if (r && inPeriod(b?.awarded_at, period)) {
        r.longestStreak = Math.max(r.longestStreak, Number(b?.longest_streak || 0));
      }
    }
  }

  for (const b of streakBadges || []) {
    if (period === 'all') {
      const r = ensure(byUser, b?.user_id);
      if (r) r.longestStreak = Math.max(r.longestStreak, Number(b?.longest_streak || 0));
    }
  }

  for (const b of userBadges || []) {
    const r = ensure(byUser, b?.user_id);
    if (!r || !inPeriod(b?.awarded_at, period)) continue;
    r.badges += 1;
  }

  const activationIdsInPeriod = new Set<string>();
  for (const p of pota || []) {
    const r = ensure(byUser, p?.created_by_id);
    if (!r || p?.status === 'Cancelled' || !inPeriod(p?.scheduled_date, period)) continue;
    r.potaActivations += 1;
    if (p?.park_id) r.potaParks.add(String(p.park_id));
    if (p?.id) activationIdsInPeriod.add(String(p.id));
  }
  for (const c of contacts || []) {
    const r = ensure(byUser, c?.created_by_id);
    if (!r || !inPeriod(c?.date, period) || !c?.pota_activation_id) continue;
    if (activationIdsInPeriod.has(String(c.pota_activation_id))) r.potaContacts += 1;
  }

  for (const m of memberships || []) {
    if (m?.status === 'Expired' || !inPeriod(m?.created_date, period)) continue;
    const r = ensure(byUser, userByCallsign.get(normalizedCallsign(m?.member_callsign)));
    if (r && m?.club_id) r.clubs.add(String(m.club_id));
  }

  const createdClubsByUser = new Map<string, number>();
  for (const c of clubs || []) {
    const userId = c?.created_by_id;
    const r = ensure(byUser, userId);
    if (!r || !inPeriod(c?.created_date, period)) continue;
    const count = (createdClubsByUser.get(String(userId)) || 0) + 1;
    createdClubsByUser.set(String(userId), count);
    if (count <= MAX_CLUB_CREATION_XP_EVENTS) r.clubsCreated += 1;
  }

  const createdEventsByUser = new Map<string, number>();
  for (const e of events || []) {
    const r = ensure(byUser, e?.created_by_id);
    if (!r || !inPeriod(e?.date, period)) continue;
    const sourceType = String(e?.source_type || '').toLowerCase();
    if (['pota_activation', 'net_control'].includes(sourceType)) continue;
    const count = (createdEventsByUser.get(String(e.created_by_id)) || 0) + 1;
    createdEventsByUser.set(String(e.created_by_id), count);
    if (count <= MAX_MANUAL_EVENT_XP_EVENTS) r.eventsCreated += 1;
  }

  for (const a of adjustments || []) {
    const r = ensure(byUser, a?.user_id);
    if (r && inPeriod(a?.created_date, period)) r.manualXp += Number(a?.amount || 0);
  }

  const photoCounts = new Map<string, number>();
  for (const p of repeaterPhotos || []) {
    const userId = p?.submitted_by_id || p?.created_by_id;
    const r = ensure(byUser, userId);
    if (!r || p?.status !== 'Approved' || !inPeriod(p?.approved_date || p?.created_date, period)) continue;
    const count = (photoCounts.get(String(userId)) || 0) + 1;
    photoCounts.set(String(userId), count);
    if (count <= MAX_REPEATER_PHOTO_XP) r.repeaterPhotos += 1;
  }

  const equipmentCounts = new Map<string, number>();
  for (const s of equipmentSubmissions || []) {
    const r = ensure(byUser, s?.created_by_id);
    if (!r || s?.status !== 'Approved' || !inPeriod(s?.updated_date || s?.created_date, period)) continue;
    const count = (equipmentCounts.get(String(s.created_by_id)) || 0) + 1;
    equipmentCounts.set(String(s.created_by_id), count);
    if (count <= MAX_EQUIPMENT_SUBMISSION_XP) r.equipmentSubmissions += 1;
  }

  const commentKeys = new Set<string>();
  for (const c of repeaterComments || []) {
    const r = ensure(byUser, c?.created_by_id);
    const date = parseDate(c?.created_date);
    if (!r || !date || !inPeriod(c?.created_date, period) || !c?.repeater_id) continue;
    const day = date.toISOString().slice(0, 10);
    const key = String(c.created_by_id) + '|' + String(c.repeater_id) + '|' + day;
    if (commentKeys.has(key)) continue;
    commentKeys.add(key);
    r.repeaterComments += 1;
  }

  const callKeys = new Set<string>();
  for (const c of directCalls || []) {
    if (c?.status !== 'ended' || !inPeriod(c?.started_at, period)) continue;
    for (const userId of [c?.caller_user_id, c?.recipient_user_id]) {
      const r = ensure(byUser, userId);
      const date = parseDate(c?.started_at);
      if (!r || !date) continue;
      const day = date.toISOString().slice(0, 10);
      const key = String(userId) + '|' + day;
      if (callKeys.has(key)) continue;
      callKeys.add(key);
      const dayCount = [...callKeys].filter((value) => value.startsWith(String(userId) + '|' + day)).length;
      if (dayCount <= MAX_DIRECT_CALL_XP_PER_DAY) r.directCalls += 1;
    }
  }

  for (const r of byUser.values()) {
    if (period !== 'all') {
      r.profileComplete = false;
      r.verified = false;
    }
  }

  const rows = [...byUser.values()].map((r) => {
    const uniqueContacts = r.uniqueContacts.size;
    const xp = Math.max(0,
      r.contacts * POINTS.contact +
      uniqueContacts * POINTS.uniqueContact +
      r.checkins * POINTS.checkin +
      r.nets * POINTS.net +
      r.longestStreak * POINTS.streak +
      r.potaActivations * POINTS.potaActivation +
      r.potaParks.size * POINTS.potaPark +
      r.potaContacts * POINTS.potaContact +
      r.badges * POINTS.badge +
      r.clubs.size * POINTS.club +
      r.clubsCreated * POINTS.clubCreated +
      r.eventsCreated * POINTS.eventCreated +
      (r.profileComplete ? POINTS.profileComplete : 0) +
      (r.verified ? POINTS.verified : 0) +
      r.manualXp +
      r.repeaterPhotos * POINTS.repeaterPhoto +
      r.equipmentSubmissions * POINTS.equipmentSubmission +
      r.repeaterComments * POINTS.repeaterComment +
      r.directCalls * POINTS.directCall
    );
    return {
      userId: r.userId,
      displayName: r.displayName,
      callsign: r.callsign,
      avatar: r.avatar,
      contacts: r.contacts,
      uniqueContacts,
      checkins: r.checkins,
      nets: r.nets,
      longestStreak: r.longestStreak,
      potaActivations: r.potaActivations,
      potaParks: r.potaParks.size,
      potaContacts: r.potaContacts,
      badges: r.badges,
      clubsCount: r.clubs.size,
      clubsCreated: r.clubsCreated,
      eventsCreated: r.eventsCreated,
      profileComplete: r.profileComplete,
      verified: r.verified,
      manualXp: r.manualXp,
      repeaterPhotos: r.repeaterPhotos,
      equipmentSubmissions: r.equipmentSubmissions,
      repeaterComments: r.repeaterComments,
      directCalls: r.directCalls,
      xp,
      level: Math.max(1, Math.floor(Math.sqrt(xp / 25)) + 1),
    };
  }).filter((r) => r.xp > 0 || r.displayName !== 'Member');

  return {
    period,
    points: POINTS,
    limits: {
      clubCreationXpEvents: MAX_CLUB_CREATION_XP_EVENTS,
      manualEventXpEvents: MAX_MANUAL_EVENT_XP_EVENTS,
    },
    rows,
  };
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const period = ['all', 'year', 'month', 'week'].includes(body?.period) ? body.period : 'all';

    if (cached && Date.now() - cached.at < CACHE_MS && cached.period === period) {
      return Response.json(cached.body);
    }

    const result = await compute(req, period);
    cached = { at: Date.now(), body: result, period };
    return Response.json(result);
  } catch (error) {
    console.error('leaderboard-xp failed', error);
    return Response.json({ error: 'Leaderboard calculation failed.' }, { status: 500 });
  }
});