import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ===== APP-SPECIFIC =====
// Unified repeater query supporting two modes:
// 1. Directory mode (paginate=true): server-side equality filters + in-memory text
//    search/state/city/callsign/tone/distance filtering, then pagination. Returns
//    only the requested page + total count so the browser never downloads the
//    full database.
// 2. Map mode (paginate=false, default): bounds-bounded query returning all
//    matching repeaters up to a limit, for map rendering + clustering.
// ===== END APP-SPECIFIC =====

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      north, south, east, west,
      filters = {},
      service = 'GMRS',
      page = 1,
      pageSize = 50,
      sort = '-rating',
      search = '',
      lat: centerLat,
      lng: centerLng,
      paginate = false,
      favorite_ids,
      limit: rawLimit,
    } = body;

    // Build database query with equality filters (server-side).
    // Applying the requested radio service here is important for map callers:
    // otherwise a map limit could be consumed by records from the other service
    // before the final in-memory service filter runs, hiding valid repeaters.
    // Treat missing hidden values as visible. Some imported/legacy repeaters do not
    // have the hidden field populated, and those records must remain in the directory.
    const query: Record<string, any> = {};
    const requestedService = String(service || 'GMRS').toUpperCase();
    // Legacy repeaters with no radio_service value are treated as GMRS throughout
    // the app, so keep them in the GMRS query as well as explicitly tagged GMRS rows.
    query.radio_service = requestedService === 'HAM'
      ? 'HAM'
      : { $in: ['GMRS', null, ''] };

    // Bounds filter (optional — for map mode)
    if (north != null && south != null && east != null && west != null) {
      query.lat = { $gte: south, $lte: north };
      query.lng = { $gte: west, $lte: east };
    }

    // Equality filters (applied server-side)
    if (filters.status) query.status = filters.status;
    if (filters.mode) query.mode = filters.mode;
    if (filters.access) query.access = filters.access;
    if (filters.verification) query.verification = filters.verification;
    if (filters.frequency != null && filters.frequency !== '') {
      query.frequency = Number(filters.frequency);
    }

    // HAM band filters use the repeater's frequency in MHz. The filter is
    // applied after service separation so HAM bands never affect GMRS results.
    // Favorites filter (server-side via $in)
    if (Array.isArray(favorite_ids) && favorite_ids.length > 0) {
      query.id = { $in: favorite_ids };
    }

    // Server-side sort mapping
    const serverSortMap: Record<string, string> = {
      callsign: 'callsign',
      frequency: 'frequency',
      '-frequency': '-frequency',
      updated: '-updated_date',
      '-updated': '-updated_date',
      verification: 'verification',
      rating: '-rating',
      '-rating': '-rating',
    };
    const serverSort = serverSortMap[sort] || '-rating';

    // Fetch matching records (server-side equality filters)
    // Never cap the directory at an arbitrary 2,000/5,000 records. The repeater
    // database can be larger than that, and an edited repeater must not disappear
    // simply because it falls past the first request. Fetch in safe 500-record pages.
    const batchSize = 500;
    const requestedLimit = paginate ? 5000 : (Number.isFinite(Number(rawLimit)) && Number(rawLimit) > 0 ? Math.floor(Number(rawLimit)) : Number.POSITIVE_INFINITY);
    let repeaters: any[] = [];
    let skip = 0;

    while (true) {
      const batch = await base44.asServiceRole.entities.Repeater.filter(
        query,
        serverSort,
        batchSize,
        skip
      );
      if (!batch?.length) break;
      repeaters = repeaters.concat(batch);
      skip += batch.length;

      // Map callers may request a bounded result set. Directory requests are
      // handled separately below and are not capped by the map limit.
      if (!paginate && repeaters.length >= requestedLimit && requestedLimit < 5000) {
        repeaters = repeaters.slice(0, requestedLimit);
        break;
      }
      if (batch.length < batchSize) break;
    }

    // The public directory should never expose explicitly hidden repeaters.
    repeaters = repeaters.filter((r: any) => r?.hidden !== true);

    // Keep GMRS and amateur-radio directories separate. Legacy records without
    // radio_service remain GMRS for backward compatibility. The same service
    // constraint is already applied server-side above, and this final guard keeps
    // the contract safe for legacy/null data returned by the entity layer.
    repeaters = repeaters.filter((r: any) => (r?.radio_service || 'GMRS').toUpperCase() === requestedService);

    // In-memory text search across callsign, name, frequency, state, city, notes
    if (search) {
      const q = String(search).toLowerCase().trim();
      repeaters = repeaters.filter((r: any) => {
        const name = (r.name || '').toLowerCase();
        const callsign = (r.callsign || '').toLowerCase();
        const freq = String(r.frequency || '');
        const notes = (r.notes || '').toLowerCase();
        const parts = (r.name || '').split(',');
        const city = parts[0] ? parts[0].trim().toLowerCase() : '';
        const state = parts.length > 1 ? parts[parts.length - 1].trim().toLowerCase() : '';
        return name.includes(q) || callsign.includes(q) || freq.includes(q) ||
          state.includes(q) || city.includes(q) || notes.includes(q);
      });
    }

    if (requestedService === 'HAM' && filters.band) {
      // Must stay in sync with HAM_BANDS in src/components/map/MapFilterBar.jsx.
      const HAM_BANDS: Record<string, [number, number]> = {
        '10m': [28, 29.7],
        '6m': [50, 54],
        '2m': [144, 148],
        '1.25m': [222, 225],
        '70cm': [420, 450],
        '33cm': [902, 928],
        '23cm': [1240, 1300],
      };
      const range = HAM_BANDS[String(filters.band)];
      if (range) {
        repeaters = repeaters.filter((r: any) => {
          const freq = Number(r.frequency);
          return Number.isFinite(freq) && freq >= range[0] && freq <= range[1];
        });
      }
    }

    // Digital voice / linking technology filter (HAM only). The Repeater entity
    // has no dedicated field for this, so it matches against the notes text the
    // RepeaterBook importers write it into. The two importers spell some
    // technologies differently (e.g. "P25" vs "P-25", "YSF" vs "Fusion"), so
    // each filter value checks every spelling variant.
    if (requestedService === 'HAM' && filters.tech) {
      const HAM_TECH_TOKENS: Record<string, string[]> = {
        'DMR': ['DMR'],
        'D-STAR': ['D-STAR'],
        'NXDN': ['NXDN'],
        'P25': ['P25', 'P-25'],
        'M17': ['M17'],
        'TETRA': ['TETRA'],
        'FUSION': ['FUSION', 'YSF'],
        'WIRESX': ['WIRES-X', 'WIRESX'],
        'ECHOLINK': ['ECHOLINK'],
        'ALLSTAR': ['ALLSTAR'],
        'IRLP': ['IRLP'],
      };
      const tokens = HAM_TECH_TOKENS[String(filters.tech)];
      if (tokens) {
        repeaters = repeaters.filter((r: any) => {
          const notes = (r.notes || '').toUpperCase();
          return tokens.some((t) => notes.includes(t));
        });
      }
    }

    // In-memory state filter (parsed from name suffix)
    if (filters.state) {
      const st = String(filters.state).toUpperCase();
      repeaters = repeaters.filter((r: any) => {
        const parts = (r.name || '').split(',');
        const rState = parts.length > 1 ? parts[parts.length - 1].trim().toUpperCase() : '';
        return rState === st;
      });
    }

    // In-memory city filter (parsed from name prefix)
    if (filters.city) {
      const c = String(filters.city).toLowerCase().trim();
      repeaters = repeaters.filter((r: any) => {
        const parts = (r.name || '').split(',');
        const rCity = parts[0] ? parts[0].trim().toLowerCase() : '';
        return rCity.includes(c);
      });
    }

    // In-memory callsign filter
    if (filters.callsign) {
      const cs = String(filters.callsign).toLowerCase().trim();
      repeaters = repeaters.filter((r: any) => (r.callsign || '').toLowerCase().includes(cs));
    }

    // In-memory tone/access-code filter. A substring match rather than exact
    // equality, since HAM tone values can carry extra context beyond a plain
    // CTCSS number (e.g. "CC 3 103.5", "NAC 293 210.7", "D205"), and an exact
    // match would silently hide every one of those from a plain "103.5" search.
    if (filters.tone) {
      const t = String(filters.tone).toUpperCase().trim();
      repeaters = repeaters.filter((r: any) =>
        (r.tone || '').toUpperCase().includes(t) || (r.input_tone || '').toUpperCase().includes(t)
      );
    }

    // Distance filter (from a center point)
    if (filters.radius && centerLat != null && centerLng != null) {
      const radiusKm = Number(filters.radius) * 1.609;
      repeaters = repeaters.filter((r: any) =>
        r.lat != null && r.lng != null && haversineKm(centerLat, centerLng, r.lat, r.lng) <= radiusKm
      );
    }

    // In-memory sorting for options not handled server-side
    if (sort === 'distance' && centerLat != null && centerLng != null) {
      repeaters.sort((a: any, b: any) =>
        haversineKm(centerLat, centerLng, a.lat, a.lng) - haversineKm(centerLat, centerLng, b.lat, b.lng)
      );
    } else if (sort === 'state' || sort === 'city') {
      repeaters.sort((a: any, b: any) => {
        const partsA = (a.name || '').split(',');
        const partsB = (b.name || '').split(',');
        const valA = sort === 'state'
          ? (partsA.length > 1 ? partsA[partsA.length - 1].trim() : '')
          : (partsA[0] ? partsA[0].trim() : '');
        const valB = sort === 'state'
          ? (partsB.length > 1 ? partsB[partsB.length - 1].trim() : '')
          : (partsB[0] ? partsB[0].trim() : '');
        return valA.localeCompare(valB);
      });
    }

    const total = repeaters.length;

    // Map mode: return all matching (no pagination)
    if (!paginate) {
      return Response.json({ repeaters, count: repeaters.length, total });
    }

    // Directory mode: paginate
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(Math.max(1, Number(pageSize) || 50), 200);
    const start = (p - 1) * ps;
    const paginated = repeaters.slice(start, start + ps);

    return Response.json({
      repeaters: paginated,
      count: paginated.length,
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.ceil(total / ps),
    });
  } catch (error) {
    console.error('query-repeaters error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
