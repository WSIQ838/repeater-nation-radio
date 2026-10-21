import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const DEFAULT_URL = 'https://pota.app/all_parks_ext.csv';

// US state names + abbreviations for best-effort state extraction from locationDesc.
const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
  ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];

function extractState(desc) {
  if (!desc) return '';
  const s = desc.toLowerCase();
  for (const [abbr, name] of US_STATES) {
    if (s.includes('-' + abbr.toLowerCase()) || s.includes(' ' + name.toLowerCase() + ' ') || s.includes(name.toLowerCase() + ',') || s === name.toLowerCase() || s.startsWith(name.toLowerCase())) {
      return abbr;
    }
  }
  // Match trailing "-XX" pattern like "US-MN"
  const m = desc.match(/-([A-Z]{2})\b/);
  if (m) return m[1];
  return '';
}

// Minimal CSV parser that handles quoted fields, embedded commas, and doubled quotes.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip CR */ }
      else field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function findCol(headers, names) {
  const lower = headers.map((h) => (h || '').trim().toLowerCase());
  for (const n of names) {
    const idx = lower.findIndex((h) => h === n.toLowerCase());
    if (idx >= 0) return idx;
  }
  for (const n of names) {
    const idx = lower.findIndex((h) => h.includes(n.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden — administrators only' }, { status: 403 });
    }

    let body = {};
    try { body = await req.json(); } catch { /* no body */ }
    const sourceUrl = (body.sourceUrl && String(body.sourceUrl).trim()) || DEFAULT_URL;
    const dryRun = !!body.dryRun;
    const limit = body.limit ? parseInt(body.limit, 10) : 0;

    const startedAt = new Date().toISOString();
    const t0 = Date.now();

    const resp = await fetch(sourceUrl, { redirect: 'follow' });
    if (!resp.ok) {
      return Response.json({ error: 'Failed to fetch POTA source (' + resp.status + ')' }, { status: 502 });
    }
    const text = await resp.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      return Response.json({ error: 'No park rows found in source' }, { status: 422 });
    }

    const headers = rows[0].map((h) => (h || '').trim());
    const colRef = findCol(headers, ['parkReference', 'park_ref', 'reference', 'ref']);
    const colName = findCol(headers, ['parkName', 'park_name', 'name']);
    const colLat = findCol(headers, ['latitude', 'lat']);
    const colLng = findCol(headers, ['longitude', 'lon', 'lng', 'long']);
    const colLoc = findCol(headers, ['locationDesc', 'location_desc', 'location', 'locationName', 'location_name', 'entityName', 'entity']);
    const colActive = findCol(headers, ['active', 'isActive']);
    const colGrid = findCol(headers, ['grid', 'gridSquare', 'grid_square']);

    if (colRef < 0 || colName < 0) {
      return Response.json({ error: 'CSV missing required columns (reference / name)' }, { status: 422 });
    }

    // Load all existing official parks into a lookup by uppercase park_number.
    const existing = {};
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.PotaPark.list('-created_date', 1000, skip);
      if (!batch || !batch.length) break;
      for (const p of batch) {
        if (p.park_number) existing[String(p.park_number).toUpperCase()] = p;
      }
      if (batch.length < 1000) break;
      skip += 1000;
    }

    const toCreate = [];
    const toUpdate = [];
    const seenRefs = new Set();
    const errors = [];
    const now = new Date().toISOString();
    let unchanged = 0;
    let processed = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const ref = (r[colRef] || '').trim();
      const name = (r[colName] || '').trim();
      if (!ref || !name) continue;
      if (!ref.toUpperCase().startsWith('US-')) continue; // United States only
      if (limit && processed >= limit) break;
      processed++;
      seenRefs.add(ref.toUpperCase());

      const lat = colLat >= 0 ? parseFloat(r[colLat]) : NaN;
      const lng = colLng >= 0 ? parseFloat(r[colLng]) : NaN;
      const locationDesc = colLoc >= 0 ? (r[colLoc] || '').trim() : '';
      const activeRaw = colActive >= 0 ? (r[colActive] || '').trim().toLowerCase() : '';
      const grid = colGrid >= 0 ? (r[colGrid] || '').trim() : '';
      const state = extractState(locationDesc);
      const potaStatus = activeRaw === 'false' ? 'inactive' : 'active';

      const parkData = {
        name,
        park_number: ref,
        lat: !isNaN(lat) ? lat : null,
        lng: !isNaN(lng) ? lng : null,
        location: locationDesc,
        state,
        source: 'official',
        verification_status: 'approved',
        pota_status: potaStatus,
        last_synced_date: now,
        search_keywords: [name, ref, locationDesc, grid, state].filter(Boolean).join(' '),
      };

      const ex = existing[ref.toUpperCase()];
      if (ex) {
        const changed =
          (ex.name !== parkData.name) ||
          (parkData.lat != null && (ex.lat !== parkData.lat)) ||
          (parkData.lng != null && (ex.lng !== parkData.lng)) ||
          (ex.location !== parkData.location) ||
          (ex.state !== parkData.state) ||
          (ex.pota_status !== parkData.pota_status);
        if (changed) {
          toUpdate.push({ id: ex.id, ...parkData });
        } else {
          unchanged++;
        }
      } else {
        toCreate.push(parkData);
      }
    }

    let added = toCreate.length;
    let updated = toUpdate.length;
    let removed = 0;

    if (!dryRun) {
      // Bulk create new parks (batches of 500).
      for (let i = 0; i < toCreate.length; i += 500) {
        try {
          await base44.asServiceRole.entities.PotaPark.bulkCreate(toCreate.slice(i, i + 500));
        } catch (e) {
          errors.push('bulkCreate batch failed: ' + (e.message || e));
        }
      }
      // Bulk update changed parks.
      for (let i = 0; i < toUpdate.length; i += 500) {
        try {
          await base44.asServiceRole.entities.PotaPark.bulkUpdate(toUpdate.slice(i, i + 500));
        } catch (e) {
          errors.push('bulkUpdate batch failed: ' + (e.message || e));
        }
      }
      // Flag parks no longer in the source as inactive (preserve activation history).
      // Only meaningful on a full run: when `limit` truncated the import, seenRefs
      // only covers the first `limit` rows, so every official park past that point
      // would otherwise look "no longer in the source" and get wrongly deactivated.
      if (!limit) {
        const toFlagInactive = [];
        for (const refKey of Object.keys(existing)) {
          if (!seenRefs.has(refKey)) {
            const p = existing[refKey];
            if (p.source === 'official' && p.pota_status !== 'inactive') {
              toFlagInactive.push({ id: p.id, pota_status: 'inactive', last_synced_date: now });
            }
          }
        }
        removed = toFlagInactive.length;
        for (let i = 0; i < toFlagInactive.length; i += 500) {
          try {
            await base44.asServiceRole.entities.PotaPark.bulkUpdate(toFlagInactive.slice(i, i + 500));
          } catch (e) {
            errors.push('flag-inactive batch failed: ' + (e.message || e));
          }
        }
      }
    } else if (!limit) {
      removed = Object.keys(existing).filter((k) => !seenRefs.has(k) && existing[k].source === 'official' && existing[k].pota_status !== 'inactive').length;
    }

    const durationMs = Date.now() - t0;
    const total = added + updated + unchanged;

    if (!dryRun) {
      try {
        await base44.asServiceRole.entities.PotaSyncRun.create({
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          source: sourceUrl,
          status: errors.length ? 'completed' : 'completed',
          dry_run: false,
          parks_added: added,
          parks_updated: updated,
          parks_unchanged: unchanged,
          parks_removed: removed,
          parks_total: total,
          errors: errors.join('\n').slice(0, 5000),
          error_count: errors.length,
          triggered_by_name: user.full_name || user.email || 'Admin',
          duration_ms: durationMs,
        });
      } catch (e) {
        errors.push('Failed to record sync run: ' + (e.message || e));
      }
    }

    return Response.json({
      status: 'completed',
      source: sourceUrl,
      dry_run: dryRun,
      parks_added: added,
      parks_updated: updated,
      parks_unchanged: unchanged,
      parks_removed: removed,
      parks_total: total,
      errors: errors.slice(0, 20),
      error_count: errors.length,
      duration_ms: durationMs,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}