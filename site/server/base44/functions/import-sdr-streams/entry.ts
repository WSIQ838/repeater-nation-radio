import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { requireAdmin, listAll, writeAudit, checkCallerPermission } from '../../shared/adminGuard.ts';

// Imports SDR web-receiver listings from rx-tx.info's public map page. That
// page has no API -- each point is a hidden <div data-lat data-lng> in the
// rendered HTML (a Drupal "geolocation" view), so we fetch the page and
// parse those divs directly. The site carries an all-rights-reserved
// copyright notice, so every imported record keeps a source_name/source_url
// attribution back to the original listing rather than presenting the data
// as our own.
const SOURCE_URL = 'https://rx-tx.info/table-sdr-points?freq_of=&freq_to=&band=All&country=4&title=&url=&qth=&type=All';
const MAP_SOURCE_URL = 'https://rx-tx.info/map-sdr-points';
const SOURCE_NAME = 'rx-tx.info';

// Reused from sync-pota-parks's US state matching approach: match a full
// state name appearing in the free-text location suffix rx-tx.info gives us
// (e.g. "Half Moon Bay, California").
const US_STATES: [string, string][] = [
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

function extractStateAbbr(locSuffix: string): string {
  if (!locSuffix) return '';
  const s = locSuffix.toLowerCase();
  for (const [abbr, name] of US_STATES) {
    if (s.includes(name.toLowerCase())) return abbr;
  }
  return '';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

interface RxTxPoint {
  name: string;
  url: string;
  lat: number;
  lng: number;
  country: string;
  city: string;
  locSuffix: string;
  type: string;
  frequencyInfo: string;
}

interface RxTxTableInfo {
  url: string;
  frequencyInfo: string;
  type: string;
  location: string;
}

function parseRxTxTableHtml(html: string): Map<string, RxTxTableInfo> {
  const out = new Map<string, RxTxTableInfo>();
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html))) {
    const rowHtml = row[1];
    const linkMatches = [...rowHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    if (!linkMatches.length) continue;
    const link = linkMatches.find((m) => /^https?:\/\//i.test(decodeEntities(m[1]))) || linkMatches[0];
    const url = decodeEntities(link[1]).trim();
    if (!url) continue;
    const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => decodeEntities(stripTags(m[1])).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const text = cells.join(' · ');
    const freq = cells.find((x) => /\d+(?:\.\d+)?\s*(?:k?hz|mhz|ghz)/i.test(x)) || '';
    const type = cells.find((x) => /kiwi|openwebrx|websdr|sdr/i.test(x)) || '';
    const location = cells.find((x) => /,\s*[A-Z]{2}(?:\s|$)/.test(x)) || '';
    out.set(url.toLowerCase(), { url, frequencyInfo: freq || text, type, location });
  }
  return out;
}

// Each point is rendered as:
//   <div ... class="geolocation-location js-hide" ... data-lat="X" data-lng="Y" ...>
//     <span property="geo">...</span>
//     <div class="location-content"><div class="views-field views-field-nothing">
//       <h3>NAME | LOCATION</h3>
//       <a href="URL">URL</a><br />
//       GRID: (lat, lng)<br />
//       <b>CC</b>: CITY<br />
//       RECEIVER TYPE
//     </div></div>
//   </div>
function parseRxTxHtml(html: string, tableInfo = new Map<string, RxTxTableInfo>()): RxTxPoint[] {
  const rowRe = /data-views-row-index="\d+" class="geolocation-location js-hide" id="[^"]+" data-lat="([^"]+)" data-lng="([^"]+)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  const out: RxTxPoint[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const lat = Number.parseFloat(m[1]);
    const lng = Number.parseFloat(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const content = m[3];
    const h3m = content.match(/<h3>([\s\S]*?)<\/h3>/i);
    if (!h3m) continue;
    const titleRaw = decodeEntities(stripTags(h3m[1])).trim();
    const rest = content.slice((h3m.index || 0) + h3m[0].length);

    const urlm = rest.match(/<a href="([^"]+)"/i);
    const url = urlm ? decodeEntities(urlm[1]).trim() : '';
    if (!url || !titleRaw) continue;

    const plain = rest
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map((line) => decodeEntities(line).trim())
      .filter(Boolean);

    let country = '';
    let city = '';
    let type = '';
    for (const line of plain) {
      const countryMatch = line.match(/^([A-Z]{2}):\s*(.*)$/);
      if (countryMatch) { country = countryMatch[1]; city = countryMatch[2].trim(); continue; }
      if (/^[A-Za-z0-9]{4,6}:\s*\(/.test(line)) continue; // grid/coordinate line
      if (line === url) continue;
      type = line; // last remaining line is the receiver kind, e.g. "KiwiSDR"
    }

    let name = titleRaw;
    let locSuffix = '';
    const pipeIdx = titleRaw.lastIndexOf('|');
    if (pipeIdx >= 0) {
      name = titleRaw.slice(0, pipeIdx).trim();
      locSuffix = titleRaw.slice(pipeIdx + 1).trim();
    }

    const info = tableInfo.get(url.toLowerCase());
    out.push({
      name: name || titleRaw,
      url,
      lat,
      lng,
      country,
      city,
      locSuffix,
      type: info?.type || type,
      frequencyInfo: info?.frequencyInfo || '',
    });
  }
  return out;
}

export default async function(req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  const { caller, error } = await requireAdmin(base44);
  if (error) return error;
  const permError = await checkCallerPermission(base44, caller, 'tools.manage');
  if (permError) return permError;

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dryRun;
    const countries = Array.isArray(body.countries) && body.countries.length
      ? body.countries.map((c: unknown) => String(c).toUpperCase())
      : ['US'];

    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    };
    // RX-TX.info may return 403 for automated requests to its table view.
    // The public map contains the receiver listings plus coordinates, so use
    // it as the import source and avoid making the protected table endpoint
    // a dependency of the Repeater Nation importer.
    const mapResp = await fetch(MAP_SOURCE_URL, { redirect: 'follow', headers: fetchHeaders });
    if (!mapResp.ok) {
      return Response.json({ error: `Failed to fetch ${SOURCE_NAME} map (${mapResp.status})` }, { status: 502 });
    }
    const mapHtml = await mapResp.text();
    const points = parseRxTxHtml(mapHtml);
    if (!points.length) {
      return Response.json({ error: 'No SDR points found on the source page -- its layout may have changed.' }, { status: 422 });
    }

    const matching = points.filter((p) => countries.includes(p.country));

    const existing = await listAll(base44.asServiceRole.entities.SdrStream, '-created_date', 500, 20000);
    const existingUrls = new Set(
      existing
        .filter((s: any) => s.source_name === SOURCE_NAME)
        .map((s: any) => String(s.stream_url || '').toLowerCase())
    );

    const toCreate: any[] = [];
    let skippedExisting = 0;
    const nowIso = new Date().toISOString();
    for (const p of matching) {
      const key = p.url.toLowerCase();
      if (existingUrls.has(key)) { skippedExisting++; continue; }
      existingUrls.add(key);
      toCreate.push({
        name: p.name,
        stream_url: p.url,
        description: p.type ? `${p.type} receiver. Imported from ${SOURCE_NAME}.` : `Imported from ${SOURCE_NAME}.`,
        frequency_info: p.frequencyInfo || '',
        city: p.city,
        state: extractStateAbbr(p.locSuffix),
        lat: p.lat,
        lng: p.lng,
        radio_service: 'Other',
        verification_status: 'approved',
        submitted_by_name: `${SOURCE_NAME} import`,
        submitted_at: nowIso,
        source_name: SOURCE_NAME,
        source_url: SOURCE_URL,
      });
    }

    let created = 0;
    if (!dryRun) {
      for (let i = 0; i < toCreate.length; i += 500) {
        await base44.asServiceRole.entities.SdrStream.bulkCreate(toCreate.slice(i, i + 500));
      }
      created = toCreate.length;

      await writeAudit(base44, {
        admin_id: caller.id,
        admin_name: caller.full_name || caller.email || '',
        action: 'sdr_import_rxtx',
        category: 'tools',
        target_type: 'SdrStream',
        target_label: `Import from ${SOURCE_NAME}`,
        meta: { countries, candidates: matching.length, created, skipped_existing: skippedExisting },
      });
    }

    return Response.json({
      status: 'completed',
      dry_run: dryRun,
      source: SOURCE_URL,
      map_source: MAP_SOURCE_URL,
      countries,
      total_points_on_page: points.length,
      matching_country: matching.length,
      created: dryRun ? toCreate.length : created,
      skipped_existing: skippedExisting,
    });
  } catch (e: any) {
    console.error('[import-sdr-streams] error:', e?.message || e);
    return Response.json({ error: e?.message || 'Import failed' }, { status: 500 });
  }
}
