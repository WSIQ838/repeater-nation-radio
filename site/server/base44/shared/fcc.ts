// Shared FCC ULS callsign lookup used by verifyCallsign and the admin FCC tools.
// Primary source: api.ulsf.cc. Fallback: OpenCallbook's documented FCC ULS dataset API.
// Shared FCC ULS callsign lookup used by verifyCallsign and the admin FCC tools.
// OpenCallbook is a documented public API backed by the FCC ULS weekly public release.
// The official FCC License View API is used as a second source when needed.
const OPENCALLBOOK_API = 'https://opencallbook.com/api/v1/licenses/';
const FCC_API = 'https://data.fcc.gov/api/license-view/basicSearch/getLicenses';
const TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

// Database date-time fields reject plain dates like "2034-06-12" and a rejected field can silently
// abort a whole update (including callsign_verified). Always hand callers a full ISO date-time,
// or null when the provider's value can't be parsed.
function toIsoDateTime(v: any): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeRecord(raw: any, callsign: string) {
  // Providers return slightly different wrappers. Unwrap the actual license
  // object before reading fields so a successful lookup cannot become
  // "Pending" simply because the API added a data/licenses wrapper.
  const record = raw?.license ||
    raw?.data?.license ||
    (Array.isArray(raw?.data) ? raw.data[0] : null) ||
    raw?.data ||
    raw || {};

  // FCC License View uses callSign, radioServiceCode, status/statusDesc,
  // licenseeName and expiredDate. Other ULS mirrors use snake_case names.
  const statusRaw = record.statusDesc ?? record.status ?? record.license_status ?? record.statusDisplay ?? record.status_code;
  const serviceRaw = record.radioServiceCode ??
    record.radio_service_code ??
    record.service ??
    record.service_code ??
    record.serviceCode ??
    record.serviceDesc ??
    record.service_description ??
    record.serviceName ??
    record.service_name ??
    record.radioServiceName;
  const statusCode = typeof statusRaw === 'object' ? String(statusRaw.code || statusRaw.value || '') : String(statusRaw || '');
  const serviceCode = typeof serviceRaw === 'object' ? String(serviceRaw.code || serviceRaw.value || '') : String(serviceRaw || '');
  const statusLabel = typeof statusRaw === 'object' ? String(statusRaw.label || statusRaw.name || statusCode) : String(statusRaw || '');
  const serviceLabel = typeof serviceRaw === 'object' ? String(serviceRaw.label || serviceRaw.name || serviceCode) : String(serviceRaw || '');

  // FCC ULS uses ZA for GMRS. OpenCallbook normalizes GMRS to service=GM.
  // Accept both representations plus the textual service name.
  const isGmrs = ['ZA', 'GM'].includes(serviceCode.trim().toUpperCase()) ||
    ['ZA', 'GM'].includes(String(record.service || record.service_code || '').trim().toUpperCase()) ||
    /general mobile radio service|\bgmrs\b/i.test(serviceLabel) ||
    /general mobile radio service|\bgmrs\b/i.test(String(
      record.radioService ||
      record.radio_service ||
      record.service_name ||
      record.serviceName ||
      ''
    )) ||
    ['ZA', 'GM'].includes(String(record.class || record.licenseClass || '').trim().toUpperCase());

  // Amateur radio: ULS service codes HA (Amateur) and HV (Amateur Vanity); OpenCallbook
  // labels the same service AM. A HAM license verifies a member just like a GMRS one.
  const AMATEUR_CODES = ['HA', 'HV', 'AM'];
  const isHam = !isGmrs && (
    AMATEUR_CODES.includes(serviceCode.trim().toUpperCase()) ||
    AMATEUR_CODES.includes(String(record.service || record.service_code || '').trim().toUpperCase()) ||
    /\bamateur\b/i.test(serviceLabel) ||
    /\bamateur\b/i.test(String(
      record.radioService ||
      record.radio_service ||
      record.service_name ||
      record.serviceName ||
      ''
    ))
  );
  const radioService = isGmrs ? 'GMRS' : isHam ? 'HAM' : null;

  // FCC normally represents an active license as status A / Active.
  const isActive = statusCode.trim().toUpperCase() === 'A' ||
    /active|granted/i.test(statusLabel);

  const rowCallsign = String(
    record.callSign || record.callsign || record.call_sign || record.license_call_sign || ''
  ).trim().toUpperCase();

  const resolvedCallsign = rowCallsign || callsign;
  const licensee = record.licenseeName ||
    record.licensee_name ||
    (typeof record.licensee === 'object' ? record.licensee.name : record.licensee) ||
    record.name ||
    record.full_name ||
    record.entityName ||
    null;

  return {
    valid: true,
    verified: isActive && !!radioService,
    fccReachable: true,
    found: true,
    // 'GMRS' | 'HAM' | null (a license we found but that is neither, e.g. commercial).
    radioService,
    operatorClass: isHam
      ? (record.operator_class || record.operatorClass || record.licenseClass || null)
      : null,
    callsign: resolvedCallsign,
    licensee,
    country: record.country || record.country_name || (isGmrs || isHam ? 'United States' : null),
    status: statusLabel || null,
    service: serviceLabel || serviceCode || null,
    expiration: toIsoDateTime(record.expired_date || record.expiredDate || record.expiry_date || record.expirationDate ||
      record.expiration_date || record.expiration || record.expires || record.expires_at),
    grantDate: toIsoDateTime(record.grantDate || record.grant_date || record.grantedDate),
    frn: record.frn || record.FRN || record.frn_number || null,
    address: {
      street: record.address || record.street || record.street_address ||
        (typeof record.licensee === 'object' ? record.licensee.street_address : null) || null,
      city: record.city || (typeof record.licensee === 'object' ? record.licensee.city : null) || null,
      state: record.state || (typeof record.licensee === 'object' ? record.licensee.state : null) || null,
      zip: record.zip || record.zipCode || record.zip_code ||
        (typeof record.licensee === 'object' ? record.licensee.zip_code : null) || null,
    },
    record,
    fccRecordUrl: (record.uniqueSystemIdentifier || record.lic_key || record.license_key || record.licenseKey)
      ? 'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp'
      : 'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp',
    message: isActive && radioService
      ? (isHam ? 'Amateur radio callsign verified with the FCC.' : 'Callsign verified with the FCC.')
      : radioService
        ? `Callsign found, but license status is "${statusLabel || 'unknown'}".`
        : `Callsign found, but it is not a GMRS or amateur radio license (service: ${serviceLabel || serviceCode || 'unknown'}).`
  };
}

// GMRS licenses are only ever confirmable via this provider or the official
// FCC API below (see the routing comment at the bottom of this file), so
// unlike the amateur-only fallbacks this one gets its own retry/backoff
// instead of failing permanently on a single transient timeout or rate
// limit -- the same resilience officialFccLookup already had.
async function openCallbookLookup(callsign: string) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(OPENCALLBOOK_API + encodeURIComponent(callsign), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RepeaterNation/1.0 (+https://repeaternation.com)',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.status === 404) {
        return {
          valid: true,
          verified: false,
          fccReachable: true,
          found: false,
          callsign,
          httpStatus: 404,
          message: 'Callsign not found in the FCC ULS database. Double-check your callsign and try again.',
        };
      }

      if (res.ok) {
        const json = await res.json();
        const candidates = Array.isArray(json)
          ? json
          : (Array.isArray(json?.licenses) ? json.licenses :
            Array.isArray(json?.data) ? json.data :
            Array.isArray(json?.data?.licenses) ? json.data.licenses :
            json?.license ? [json.license] :
            json?.data?.license ? [json.data.license] :
            json ? [json] : []);

        const raw = candidates.find((row: any) => {
          const value = row?.callSign || row?.callsign || row?.call_sign || row?.license_call_sign;
          return String(value || '').trim().toUpperCase() === callsign;
        }) || candidates[0];

        if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) return normalizeRecord(raw, callsign);
        return null; // Unexpected response shape -- not worth retrying.
      }
      // Any other status (5xx, 429, ...) is treated as transient below.
    } catch {
      // Network error / timeout -- treated as transient below.
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
  return null;
}

export async function officialFccLookup(callsign: string) {
  const requestVariants = [
    // Current License View implementations document callSign/service filters.
    { callSign: callsign, service: 'ZA' },
    { callSign: callsign, service: 'HA' },
    // Legacy License View API documented search interface.
    { searchValue: callsign },
  ];

  // A clean 200 with zero matching rows on one variant used to be treated as
  // a final "not found" answer immediately, which never gave the later
  // variants a chance to run -- if an earlier variant's params aren't ones
  // this endpoint actually recognizes (e.g. callSign/service, versus the
  // documented searchValue), every lookup would short-circuit "not found" on
  // that variant without ever trying the one that would have matched. Only
  // conclude "not found" after every variant has had a chance to match.
  let sawCleanEmptyResponse = false;

  for (const params of requestVariants) {
    try {
      const url = new URL(FCC_API);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      url.searchParams.set('format', 'json');
      url.searchParams.set('pageSize', '100');

      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RepeaterNation/1.0 (+https://repeaternation.com)',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) continue;

      const json = await res.json();
      const licenses =
        json?.Licenses?.License ??
        json?.licenses?.License ??
        json?.licenses?.license ??
        json?.licenses ??
        json?.License ??
        json?.license ??
        json?.data?.Licenses?.License ??
        json?.data?.licenses ??
        json?.data ??
        [];

      const rows = Array.isArray(licenses) ? licenses : [licenses];

      // Never accept the first search result blindly. The FCC search can
      // return multiple licenses; the callsign must match exactly.
      const raw = rows.find((row: any) => {
        const rowCallsign = String(
          row?.callSign ??
          row?.callsign ??
          row?.call_sign ??
          row?.license_call_sign ??
          ''
        ).trim().toUpperCase();
        return rowCallsign === callsign;
      });

      if (raw && typeof raw === 'object') return normalizeRecord(raw, callsign);

      // A successful FCC response with no exact callsign match on THIS
      // variant means nothing on its own -- another variant might still be
      // the one this endpoint actually honors. Keep trying the rest before
      // concluding anything.
      if (res.status >= 200 && res.status < 300 && rows.length === 0) {
        sawCleanEmptyResponse = true;
      }
    } catch {
      // Try the next FCC request variant.
    }
  }

  // Every variant that got a clean response found zero matching rows, and
  // none errored out or timed out -- that's a real "not found", not the FCC
  // service being unavailable.
  if (sawCleanEmptyResponse) {
    return {
      valid: true,
      verified: false,
      fccReachable: true,
      found: false,
      callsign,
      message: 'Callsign not found in the FCC ULS database. Double-check your callsign and try again.',
    };
  }

  return null;
}

// callook.info is a free US amateur-radio callbook built on the same FCC data. It is ONLY used
// as a backup when OpenCallbook is unreachable, and ONLY to CONFIRM an active amateur license.
// It says INVALID for GMRS callsigns (and for anything it doesn't cover), so a negative answer
// proves nothing and is never trusted: it can help verify a member, never reject one.
function callookDateToIso(s: any): string | null {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

async function callookLookup(callsign: string) {
  try {
    const res = await fetch(`https://callook.info/${encodeURIComponent(callsign)}/json`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RepeaterNation/1.0 (+https://repeaternation.com)',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (String(j?.status || '').toUpperCase() !== 'VALID') return null;

    // Amateur licenses lapse but stay listed through a grace period, during which the holder
    // may not operate. Only accept a license whose expiry date is clearly still in the future.
    const expiration = callookDateToIso(j?.otherInfo?.expiryDate);
    if (!expiration || new Date(expiration).getTime() < Date.now()) return null;

    const line2 = String(j?.address?.line2 || '');
    const loc = line2.match(/^(.*?),\s*([A-Z]{2})\s*(\d{5})?/);
    return {
      valid: true,
      verified: true,
      fccReachable: true,
      found: true,
      radioService: 'HAM',
      operatorClass: j?.current?.operClass || null,
      callsign: String(j?.current?.callsign || callsign).toUpperCase(),
      licensee: j?.name || null,
      status: 'Active',
      service: 'Amateur',
      expiration: toIsoDateTime(expiration),
      grantDate: toIsoDateTime(callookDateToIso(j?.otherInfo?.grantDate)),
      frn: j?.otherInfo?.frn || null,
      address: {
        street: j?.address?.line1 || null,
        city: loc?.[1] || null,
        state: loc?.[2] || null,
        zip: loc?.[3] || null,
      },
      record: j,
      fccRecordUrl: j?.otherInfo?.ulsUrl || 'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp',
      message: 'Amateur radio callsign verified with the FCC.',
    };
  } catch {
    return null;
  }
}

async function hamDbLookup(callsign: string) {
  try {
    const url = `https://api.hamdb.org/${encodeURIComponent(callsign)}/json/RepeaterNation`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'RepeaterNation/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const status = String(json?.hamdb?.messages?.status || json?.messages?.status || '').toUpperCase();
    const record = json?.hamdb?.callsign;

    if (status === 'NOT_FOUND' || !record) {
      return { found: false, source: 'HamDB', providerReachable: true };
    }

    const rowCallsign = String(record.call || '').trim().toUpperCase();
    if (rowCallsign !== callsign) return { found: false, source: 'HamDB', providerReachable: true };

    const statusCode = String(record.status || '').trim().toUpperCase();
    const expiration = toIsoDateTime(record.expires);
    const active = (!expiration || new Date(expiration).getTime() >= Date.now()) &&
      (!statusCode || statusCode === 'A' || /active|valid/i.test(statusCode));

    return {
      valid: true,
      verified: active,
      fccReachable: true,
      found: true,
      radioService: 'HAM',
      operatorClass: record.class || null,
      callsign: rowCallsign,
      licensee: [record.fname, record.name, record.suffix].filter(Boolean).join(' ') || null,
      country: record.country || null,
      status: statusCode === 'A' ? 'Active' : (statusCode || 'Active'),
      service: 'Amateur',
      expiration,
      grantDate: null,
      frn: null,
      address: {
        street: record.addr1 || null,
        city: record.addr2 || null,
        state: record.state || null,
        zip: record.zip || null,
      },
      record,
      verificationSource: 'HamDB',
      verificationMethod: 'international_callbook',
      message: active
        ? (record.country ? `Amateur radio callsign found in HamDB (${record.country}).` : 'Amateur radio callsign found in HamDB.')
        : 'Amateur radio callsign is listed by HamDB but is not currently active.',
    };
  } catch (error) {
    console.error('[HamDB] lookup failed:', error?.message || error);
    return null;
  }
}
function xmlValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : null;
}

async function hamQthPublicLookup(callsign: string) {
  try {
    const res = await fetch(`https://www.hamqth.com/${encodeURIComponent(callsign)}`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'RepeaterNation/1.0 (+https://repeaternation.com)',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const escapedCall = callsign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const callMatch = html.match(new RegExp(`(?:>|")${escapedCall}(?:<|\\s)`, 'i'));
    if (!callMatch) return null;

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();

    const countryMatch = text.match(/Country:\s*([^|]+?)(?:\s+Grid:|\s+Email:|\s+Licensed since:)/i);
    const qthMatch = text.match(/QTH:\s*([^|]+?)(?:\s+Country:|\s+Grid:)/i);
    const nameMatch = text.match(/Name:\s*([^|]+?)(?:\s+QTH:|\s+Country:)/i);

    const country = nameMatch && countryMatch ? countryMatch[1].trim() : countryMatch?.[1]?.trim() || null;
    const licensee = nameMatch?.[1]?.trim() || null;
    const qth = qthMatch?.[1]?.trim() || null;

    return {
      valid: true,
      verified: true,
      fccReachable: true,
      found: true,
      radioService: 'HAM',
      operatorClass: null,
      callsign,
      licensee,
      country,
      status: 'Active',
      service: 'Amateur',
      expiration: null,
      grantDate: null,
      frn: null,
      address: { street: null, city: qth, state: null, zip: null },
      record: { country, licensee, qth },
      verificationSource: 'HamQTH',
      verificationMethod: 'international_callbook',
      message: country
        ? `Amateur radio callsign found in HamQTH (${country}).`
        : 'Amateur radio callsign found in HamQTH.',
    };
  } catch {
    return null;
  }
}

async function hamQthLookup(callsign: string) {
  const username = String(Deno.env.get('HAMQTH_USERNAME') || '').trim();
  const password = String(Deno.env.get('HAMQTH_PASSWORD') || '').trim();
  if (!username || !password) return null;

  try {
    const login = await fetch(
      `https://www.hamqth.com/xml.php?u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}`,
      {
        headers: {
          Accept: 'application/xml,text/xml',
          'User-Agent': 'RepeaterNation/1.0 (+https://repeaternation.com)',
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!login.ok) return null;

    const loginXml = await login.text();
    const sessionId = xmlValue(loginXml, 'session_id');
    if (!sessionId) return null;

    const res = await fetch(
      `https://www.hamqth.com/xml.php?id=${encodeURIComponent(sessionId)}&callsign=${encodeURIComponent(callsign)}&prg=RepeaterNation`,
      {
        headers: {
          Accept: 'application/xml,text/xml',
          'User-Agent': 'RepeaterNation/1.0 (+https://repeaternation.com)',
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return null;

    const xml = await res.text();
    if (/<error>[^<]*callsign not found/i.test(xml)) {
      return { found: false, source: 'HamQTH', providerReachable: true };
    }

    const rowCallsign = String(xmlValue(xml, 'callsign') || '').trim().toUpperCase();
    if (!rowCallsign || rowCallsign !== callsign) return null;

    const country = xmlValue(xml, 'country') || xmlValue(xml, 'adr_country');
    const licensee = xmlValue(xml, 'adr_name') || xmlValue(xml, 'nick');
    const licenseYear = xmlValue(xml, 'lic_year');

    return {
      valid: true,
      verified: true,
      fccReachable: true,
      found: true,
      radioService: 'HAM',
      operatorClass: null,
      callsign: rowCallsign,
      licensee,
      country,
      status: 'Active',
      service: 'Amateur',
      expiration: null,
      grantDate: licenseYear ? toIsoDateTime(`${licenseYear}-01-01`) : null,
      frn: null,
      address: {
        street: xmlValue(xml, 'adr_street1'),
        city: xmlValue(xml, 'adr_city') || xmlValue(xml, 'qth'),
        state: xmlValue(xml, 'us_state'),
        zip: xmlValue(xml, 'adr_zip'),
      },
      record: { country, licensee, licenseYear },
      verificationSource: 'HamQTH',
      verificationMethod: 'international_callbook',
      message: country
        ? `Amateur radio callsign found in HamQTH (${country}).`
        : 'Amateur radio callsign found in HamQTH.',
    };
  } catch {
    return null;
  }
}

// Local-database-first lookup against the FccLicense table populated by
// fcc-import (full dumps) and fcc-daily-update (daily transactions). Returns
// null -- never a negative result -- when the callsign has no local row, so
// callers always fall through to the existing online-provider chain for any
// callsign not yet imported (including immediately after a brand-new grant,
// before the next daily update has run). A local row, when present, IS
// treated as authoritative: it comes from the FCC's own bulk data, not a
// third-party mirror, so there is no need to also hit the flaky online
// providers just to confirm what the FCC itself already told us directly.
// This never turns "not found locally" into a negative verification result
// -- that would defeat the entire purpose of keeping the online fallback.
async function localFccLookup(base44: any, callsign: string): Promise<any> {
  let rows: any[] = [];
  try {
    rows = await base44.asServiceRole.entities.FccLicense.filter(
      { normalized_callsign: callsign },
      '-last_checked_at',
      5
    );
  } catch (e) {
    // Local DB unreachable/misconfigured -- fall through to online providers
    // exactly as if the callsign simply weren't in the local table yet.
    console.error('[fcc] localFccLookup failed, falling back to online providers:', (e as any)?.message || e);
    return null;
  }
  if (!rows || rows.length === 0) return null;

  // Prefer an active record if one of the (rare, but possible on a
  // reassigned/renewed callsign) multiple rows is active; otherwise fall
  // back to the most recently checked row.
  const row = rows.find((r: any) => r.active === true) || rows[0];

  const isActive = row.active === true || row.license_status === 'active';
  const statusLabel = row.license_status
    ? row.license_status.charAt(0).toUpperCase() + row.license_status.slice(1)
    : (isActive ? 'Active' : 'Unknown');

  return {
    valid: true,
    verified: isActive,
    fccReachable: true,
    found: true,
    radioService: row.radio_service || null,
    operatorClass: null,
    callsign: row.callsign || callsign,
    licensee: row.licensee_name || null,
    country: 'United States',
    status: statusLabel,
    service: row.radio_service === 'GMRS' ? 'GMRS' : row.radio_service === 'HAM' ? 'Amateur' : null,
    expiration: toIsoDateTime(row.expiration_date),
    grantDate: toIsoDateTime(row.grant_date),
    frn: row.frn || null,
    address: {
      street: null,
      city: row.city || null,
      state: row.state || null,
      zip: row.zip || null,
    },
    record: row,
    fccRecordUrl: 'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp',
    verificationSource: 'FCC ULS (local database)',
    verificationMethod: 'local_fcc_db',
    message: isActive
      ? (row.radio_service === 'HAM' ? 'Amateur radio callsign verified with the FCC (local database).' : 'Callsign verified with the FCC (local database).')
      : `Callsign found in the local FCC database, but license status is "${statusLabel}".`,
  };
}

// One callsign: 3-8 letters and digits with at least one of each (W1AW, KD9UNT,
// WRQF238, VE3ABC). Anything else -- two callsigns typed into one box, "(GMRS)"
// labels, spaces -- can't be looked up, and without this check every provider
// misses it and the result reads as a lookup outage, which sign-up lets through.
export function isCallsignFormat(callsign: string): boolean {
  const cs = String(callsign || '').trim().toUpperCase();
  return /^[A-Z0-9]{3,8}$/.test(cs) && /[A-Z]/.test(cs) && /\d/.test(cs);
}

export async function ulsLookup(base44: any, callsign: string): Promise<any> {
  callsign = String(callsign || '').trim().toUpperCase();

  if (!isCallsignFormat(callsign)) {
    return {
      valid: false,
      verified: false,
      fccReachable: true,
      found: false,
      callsign,
      message: 'Enter one callsign, letters and numbers only (for example WRQF238 or KD9UNT). You can add more callsigns after you sign up.',
    };
  }

  // Local FCC ULS database first (see localFccLookup above) -- only a hit
  // short-circuits the rest of this function; a miss falls through to the
  // exact same online-provider chain that ran before the local database
  // existed, so a callsign not yet imported (or a not-yet-populated local
  // table) verifies exactly as it always has.
  try {
    const local = await localFccLookup(base44, callsign);
    if (local?.found) return local;
  } catch (e) {
    console.error('[fcc] localFccLookup threw, continuing to online providers:', (e as any)?.message || e);
  }

  // International prefixes should be checked against the international
  // callbook before spending time on U.S.-only providers.
  const likelyInternational = /^(F|TK|G|M|2|VE|VA|VK|ZL|DL|OE|HB|I|EA|CT|ON|PA|SM|LA|OH|SP|OK|OM|HA|YU|9A|S5|ZS|JA|JH|PY|LU|CE|CX|XE|TI|HK|DU|HS|VU|9M|A6|A7|A9|5B|TA)/.test(callsign);

  let openCallbook: any = null;
  let officialResult: any = null;
  let callook: any = null;
  let hamDb: any = null;
  let hamQth: any = null;

  if (likelyInternational) {
    hamQth = await hamQthLookup(callsign);
    if (hamQth?.found) return hamQth;

    // HamQTH's public callbook page is available without an API account.
    // Use it as a callbook fallback when API credentials are not configured.
    hamQth = await hamQthPublicLookup(callsign);
    if (hamQth?.found) return hamQth;

    hamDb = await hamDbLookup(callsign);
    if (hamDb?.found) return hamDb;
  }

  // U.S. sources and fallbacks.
  openCallbook = await openCallbookLookup(callsign);
  if (openCallbook?.found) return openCallbook;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const official = await officialFccLookup(callsign);
    if (official) {
      officialResult = official;
      if (official.found) return official;
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }

  callook = await callookLookup(callsign);
  if (callook) return callook;

  if (!likelyInternational) {
    hamDb = await hamDbLookup(callsign);
    if (hamDb?.found) return hamDb;

    hamQth = await hamQthLookup(callsign);
    if (hamQth?.found) return hamQth;
  }

  // GMRS licenses only ever live in OpenCallbook / the official FCC ULS —
  // callook, HamDB, and HamQTH are amateur-only and correctly report "not
  // found" for every GMRS callsign, which is not a real negative result, it's
  // those providers simply not covering that service. Symmetrically, for a
  // foreign callsign the US-only sources (OpenCallbook, official FCC) will
  // quickly and correctly say "not found" without that meaning anything
  // about the actual foreign license. Counting either kind of irrelevant
  // "not found" toward "a provider responded" (as this used to, lumping all
  // five together) let a lookup silently read as "not found" whenever the
  // providers that could actually cover this callsign's service both hit a
  // rate limit or timeout, even though nothing about the callsign itself was
  // checked. Judge availability only against the providers relevant to this
  // callsign's likely service.
  const usProvidersUnavailable = !openCallbook && !officialResult;
  const hamProvidersUnavailable = !callook && !hamDb && !hamQth;
  const providersUnavailable = likelyInternational ? hamProvidersUnavailable : usProvidersUnavailable;
  if (providersUnavailable) {
    return {
      valid: true,
      verified: false,
      fccReachable: false,
      callsign,
      error: 'License lookup providers unavailable',
      message: 'The license lookup services are temporarily unavailable. The account was not marked invalid.',
    };
  }

  return {
    valid: true,
    verified: false,
    fccReachable: true,
    found: false,
    callsign,
    message: 'Callsign was not found by the available license and amateur-radio callbook providers.',
  };
}
