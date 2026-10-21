// Parser for the FCC ULS bulk-data format (HD.dat / EN.dat), used by both the
// full-database importer and the daily-transaction updater.
//
// Verified directly against real FCC files fetched from data.fcc.gov (not
// assumed from memory): https://data.fcc.gov/download/pub/uls/complete/l_gmrs.zip,
// l_amat.zip, and the daily transaction files at
// https://data.fcc.gov/download/pub/uls/daily/l_gm_<mon|tue|wed|thu|fri|sat|sun>.zip
// (GMRS) and l_am_<...>.zip (Amateur). Both the complete dumps and the daily
// transaction files use the identical pipe-delimited, CRLF-terminated record
// format joined by `unique_system_identifier` -- the same field is not unique
// across services (GMRS and HAM number from the same FCC sequence), so every
// caller must key on (radio_service_code, unique_system_identifier) together,
// never unique_system_identifier alone.
//
// HD.dat (License Header) fields used here, 0-indexed after the record type:
//   1 unique_system_identifier, 4 call_sign, 5 license_status,
//   6 radio_service_code, 7 grant_date, 8 expired_date, 9 cancellation_date
// EN.dat (Entity) fields used here (indices confirmed against real records --
// an initial off-by-one guess here was caught by testing against actual
// downloaded FCC lines before this was wired into anything):
//   1 unique_system_identifier, 4 call_sign, 5 entity_type (only 'L' --
//   Licensee -- is a real license holder; other codes are contacts etc.),
//   7 entity_name, 15 street_address, 16 city, 17 state, 18 zip, 22 frn

export interface ParsedFccRecord {
  callsign: string;
  normalizedCallsign: string;
  uniqueSystemIdentifier: string;
  ulsFileNumber: string;
  licenseKey: string;
  radioServiceCode: string;
  radioService: 'GMRS' | 'HAM' | null;
  licenseStatusCode: string;
  licenseStatus: 'active' | 'expired' | 'cancelled' | 'terminated' | 'other';
  grantDate: string;
  expirationDate: string;
  cancellationDate: string;
  lastActionDate: string;
  licenseeName: string;
  city: string;
  state: string;
  zip: string;
  frn: string;
}

function toIsoDate(mmddyyyy: string): string {
  const m = String(mmddyyyy || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : '';
}

function normalizeRadioServiceCode(code: string): 'GMRS' | 'HAM' | null {
  const c = code.trim().toUpperCase();
  if (c === 'ZA') return 'GMRS';
  if (c === 'HA' || c === 'HV') return 'HAM';
  return null;
}

// FCC status codes: A=Active, C=Cancelled, E=Expired, T=Terminated. Other
// single-letter codes exist in the full ULS but are rare for GMRS/amateur and
// are bucketed as 'other' rather than guessed at.
function normalizeStatus(code: string, expirationDate: string, cancellationDate: string): ParsedFccRecord['licenseStatus'] {
  const c = code.trim().toUpperCase();
  if (cancellationDate) return 'cancelled';
  if (c === 'C') return 'cancelled';
  if (c === 'T') return 'terminated';
  if (c === 'E') return 'expired';
  if (c === 'A') {
    if (expirationDate && new Date(expirationDate).getTime() < Date.now()) return 'expired';
    return 'active';
  }
  return 'other';
}

// Splits raw .dat text into lines, tolerating both CRLF and bare LF, and
// dropping blank lines rather than treating them as malformed rows.
function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/).filter((l) => l.length > 0);
}

interface HdRow {
  callsign: string;
  licenseStatusCode: string;
  radioServiceCode: string;
  grantDate: string;
  expirationDate: string;
  cancellationDate: string;
  lastActionDate: string;
  ulsFileNumber: string;
}

interface EnRow {
  callsign: string;
  licenseeName: string;
  city: string;
  state: string;
  zip: string;
  frn: string;
}

// Parses HD.dat into a map keyed by unique_system_identifier. Malformed lines
// (too few pipe-delimited fields, or missing a callsign) are counted and
// skipped rather than aborting the whole file.
export function parseHdDat(text: string): { rows: Map<string, HdRow>; malformed: number; scanned: number } {
  const rows = new Map<string, HdRow>();
  let malformed = 0;
  let scanned = 0;
  for (const line of splitLines(text)) {
    const f = line.split('|');
    if (f[0] !== 'HD') continue;
    scanned++;
    const usi = (f[1] || '').trim();
    const callsign = (f[4] || '').trim().toUpperCase();
    if (!usi || !callsign || f.length < 44) { malformed++; continue; }
    rows.set(usi, {
      callsign,
      licenseStatusCode: (f[5] || '').trim(),
      radioServiceCode: (f[6] || '').trim(),
      grantDate: toIsoDate(f[7] || ''),
      expirationDate: toIsoDate(f[8] || ''),
      cancellationDate: toIsoDate(f[9] || ''),
      lastActionDate: toIsoDate(f[43] || ''),
      ulsFileNumber: (f[2] || '').trim(),
    });
  }
  return { rows, malformed, scanned };
}

// Parses EN.dat into a map keyed by unique_system_identifier. Only
// entity_type 'L' (Licensee) rows are kept -- EN.dat also carries contact,
// attorney, and other non-licensee entity types that would misattribute the
// license if not filtered out.
export function parseEnDat(text: string): { rows: Map<string, EnRow>; malformed: number; scanned: number } {
  const rows = new Map<string, EnRow>();
  let malformed = 0;
  let scanned = 0;
  for (const line of splitLines(text)) {
    const f = line.split('|');
    if (f[0] !== 'EN') continue;
    scanned++;
    const usi = (f[1] || '').trim();
    if (!usi || f.length < 19) { malformed++; continue; }
    if ((f[5] || '').trim().toUpperCase() !== 'L') continue; // not a licensee row
    rows.set(usi, {
      callsign: (f[4] || '').trim().toUpperCase(),
      licenseeName: (f[7] || '').trim(),
      city: (f[16] || '').trim(),
      state: (f[17] || '').trim(),
      zip: (f[18] || '').trim().slice(0, 5),
      frn: (f[22] || '').trim(),
    });
  }
  return { rows, malformed, scanned };
}

// Joins parsed HD + EN rows into normalized records ready for FccLicense.
// A license with no matching EN row still produces a record (callsign,
// status, service, dates) -- just without a licensee name/address -- since
// verification only strictly needs the HD side.
export function joinHdEn(
  hd: Map<string, HdRow>,
  en: Map<string, EnRow>
): { records: ParsedFccRecord[]; skipped: number } {
  const records: ParsedFccRecord[] = [];
  let skipped = 0;
  for (const [usi, h] of hd) {
    const radioService = normalizeRadioServiceCode(h.radioServiceCode);
    if (!radioService) { skipped++; continue; } // not GMRS or amateur -- shouldn't occur in these source files, but never misfile a record
    const e = en.get(usi);
    records.push({
      callsign: h.callsign,
      normalizedCallsign: h.callsign,
      uniqueSystemIdentifier: usi,
      ulsFileNumber: h.ulsFileNumber,
      licenseKey: h.radioServiceCode + ':' + usi,
      radioServiceCode: h.radioServiceCode,
      radioService,
      licenseStatusCode: h.licenseStatusCode,
      licenseStatus: normalizeStatus(h.licenseStatusCode, h.expirationDate, h.cancellationDate),
      grantDate: h.grantDate,
      expirationDate: h.expirationDate,
      cancellationDate: h.cancellationDate,
      lastActionDate: h.lastActionDate,
      licenseeName: e?.licenseeName || '',
      city: e?.city || '',
      state: e?.state || '',
      zip: e?.zip || '',
      frn: e?.frn || '',
    });
  }
  return { records, skipped };
}

// Extracts the FCC's own "File Creation Date" from the zip's `counts` file,
// e.g. "File Creation Date: Sun Sep 20 10:55:30 EDT 2026" -> that Date's ISO
// string. Used as the daily-update idempotency key (a file already recorded
// as processed under this date is skipped unless forced).
export function parseCountsCreationDate(countsText: string): string {
  const m = String(countsText || '').match(/File Creation Date:\s*(.+)/);
  if (!m) return '';
  const d = new Date(m[1].trim());
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
