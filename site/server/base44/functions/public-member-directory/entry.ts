import { createClientFromRequest } from 'npm:@base44/sdk';

const CACHE_MS = 60_000;
let cached: { at: number; body: any } | null = null;
let inflight: Promise<Response> | null = null;

const HIDDEN_STATUSES = new Set(['deleted', 'banned', 'suspended', 'investigation']);

const PROFILE_FIELDS = [
  'display_name', 'callsign', 'license_status', 'license_number',
  'avatar_url', 'banner_url', 'bio', 'location', 'city', 'state',
  'created_by_id', 'created_date', 'updated_date',
];

// Load all Profile records via filter + cursor pagination (1000/page) with
// field projection — replaces the old list(sort, 100, skip) approach.
async function loadProfiles(db) {
  const all = [];
  let cursor;
  while (true) {
    const opts: any = { sort: '-updated_date', limit: 1000, fields: PROFILE_FIELDS };
    if (cursor) opts.cursor = cursor;
    const page = await db.entities.Profile.filter({}, opts);
    all.push(...(page.items || []));
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return all;
}

// User does not support the cursor form, so we use the positional list with
// 500/page (was 100) to reduce API calls 5x.
async function loadUsers(db) {
  const all = [];
  const pageSize = 500;
  let skip = 0;
  while (true) {
    const batch = await db.entities.User.list('-created_date', pageSize, skip);
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < pageSize) break;
    skip += pageSize;
    if (skip >= 10000) break;
  }
  return all;
}

async function safeProfiles(db) {
  try {
    return await loadProfiles(db);
  } catch (error) {
    console.error('[public-member-directory] Profile load failed:', error?.message || error);
    return [];
  }
}

async function safeUsers(db) {
  try {
    return await loadUsers(db);
  } catch (error) {
    console.error('[public-member-directory] User load failed:', error?.message || error);
    return [];
  }
}

async function safeCount(db, entity, query) {
  try {
    return await db.entities[entity].count(query || {});
  } catch (error) {
    console.error('[public-member-directory] ' + entity + ' count failed:', error?.message || error);
    return 0;
  }
}

async function handle(req) {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const [profiles, users] = await Promise.all([
      safeProfiles(db),
      safeUsers(db),
    ]);

    if (!profiles.length && !users.length) {
      throw new Error('Unable to load member records from User or Profile');
    }

    const profileByUserId = new Map(
      profiles
        .filter((p) => p?.created_by_id)
        .map((p) => [String(p.created_by_id), p])
    );

    const userById = new Map(
      users
        .filter((u) => u?.id)
        .map((u) => [String(u.id), u])
    );

    const memberIds = new Set([
      ...profiles.map((p) => p?.created_by_id ? String(p.created_by_id) : ''),
      ...users.map((u) => u?.id ? String(u.id) : ''),
    ]);

    const members = Array.from(memberIds)
      .filter(Boolean)
      .map((userId) => {
        const u = userById.get(userId);
        const p = profileByUserId.get(userId);

        if (u && HIDDEN_STATUSES.has(u.account_status || 'active')) return null;

        const verified = u?.callsign_verified === true || p?.license_status === 'Active';

        return {
          id: p?.id || 'user-' + userId,
          created_by_id: userId,
          display_name: p?.display_name || u?.full_name || 'Operator',
          callsign: p?.callsign || u?.callsign || '',
          license_status: verified ? 'Active' : (p?.license_status || 'Unverified'),
          license_service: u?.license_service || (verified ? 'GMRS' : ''),
          license_number: p?.license_number || '',
          avatar_url: p?.avatar_url || '',
          banner_url: p?.banner_url || '',
          bio: p?.bio || '',
          location: p?.location || '',
          city: p?.city || '',
          state: p?.state || '',
          created_date: p?.created_date || u?.created_date,
          updated_date: p?.updated_date || u?.updated_date || u?.created_date,
          has_profile: !!p,
        };
      })
      .filter(Boolean);

    const publicStats = (await base44.entities.PublicSiteStats.list('-updated_date', 1).catch(() => []))[0];

    let statsData;
    if (publicStats) {
      let cachedStats = {};
      try {
        cachedStats = JSON.parse(publicStats.updated_at || publicStats.description || publicStats.stats_json || '{}');
      } catch (_) {}
      statsData = {
        potaActivations: Number(cachedStats.potaActivations ?? publicStats.pota_activations ?? 0),
        clubs: Number(cachedStats.clubs ?? publicStats.clubs ?? 0),
        qsoLogs: Number(cachedStats.qsoLogs ?? publicStats.qso_logs ?? 0),
        gmrsRepeaters: Number(cachedStats.repeaters ?? publicStats.gmrs_repeaters ?? 0),
        hamRepeaters: Number(cachedStats.hamRepeaters ?? publicStats.ham_repeaters ?? 0),
        nets: Number(cachedStats.nets ?? publicStats.nets ?? 0),
      };
    } else {
      // Use count() instead of loading entire collections — 6 lightweight calls
      // that return a single number each, no records transferred.
      const [potaActivations, clubs, qsoLogs, gmrsRepeaters, hamRepeaters, nets] = await Promise.all([
        safeCount(db, 'PotaActivation', {}),
        safeCount(db, 'Club', {}),
        safeCount(db, 'ContactLog', {}),
        safeCount(db, 'Repeater', { radio_service: { $ne: 'HAM' } }),
        safeCount(db, 'Repeater', { radio_service: 'HAM' }),
        safeCount(db, 'NetControlSession', {}),
      ]);
      statsData = { potaActivations, clubs, qsoLogs, gmrsRepeaters, hamRepeaters, nets };
    }

    const body = {
      members,
      count: members.length,
      stats: {
        members: members.length,
        potaActivations: statsData.potaActivations,
        clubs: statsData.clubs,
        qsoLogs: statsData.qsoLogs,
        repeaters: statsData.gmrsRepeaters,
        hamRepeaters: statsData.hamRepeaters,
        nets: statsData.nets,
      },
    };

    cached = { at: Date.now(), body };
    return Response.json(body);
  } catch (error) {
    console.error('[public-member-directory] fatal error:', error?.message || error);
    return Response.json(
      { error: 'Unable to load member directory' },
      { status: 500 }
    );
  }
}

export default async function(req) {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return Response.json(cached.body);
  }

  if (!inflight) {
    inflight = handle(req).finally(() => {
      inflight = null;
    });
  }

  const res = await inflight;
  return res.clone();
}