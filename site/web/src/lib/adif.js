// ADIF (Amateur Data Interchange Format, https://adif.org) parsing and
// writing for the logbook. Only the .adi text format is handled; it is what
// LoTW, QRZ, eQSL, N1MM, WSJT-X and most loggers export and import.

const GMRS_MIN_MHZ = 462.0;

// ADIF QSL enumerations <-> the ContactLog QSL fields.
const VIA_FROM_ADIF = { B: 'Bureau', D: 'Direct', E: 'Electronic', M: 'Manager' };
const VIA_TO_ADIF = Object.fromEntries(Object.entries(VIA_FROM_ADIF).map(([k, v]) => [v, k]));
const SENT_FROM_ADIF = { Y: 'Sent', Q: 'Queued', R: 'Queued', N: 'No' };
const SENT_TO_ADIF = { Sent: 'Y', Queued: 'Q', No: 'N' };
const RCVD_FROM_ADIF = { Y: 'Received', R: 'Requested', N: 'No' };
const RCVD_TO_ADIF = { Received: 'Y', Requested: 'R', No: 'N' };
const adifDateOnly = (d) => (/^\d{8}$/.test(String(d || '')) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null);
const GMRS_MAX_MHZ = 467.8;

// ADIF band enumeration (MHz ranges), used when a record has a frequency but
// no BAND field, and when exporting.
const BANDS = [
  ['2190m', 0.1357, 0.1378], ['630m', 0.472, 0.479], ['160m', 1.8, 2.0], ['80m', 3.5, 4.0],
  ['60m', 5.06, 5.45], ['40m', 7.0, 7.3], ['30m', 10.1, 10.15], ['20m', 14.0, 14.35],
  ['17m', 18.068, 18.168], ['15m', 21.0, 21.45], ['12m', 24.89, 24.99], ['10m', 28.0, 29.7],
  ['6m', 50, 54], ['4m', 70, 71], ['2m', 144, 148], ['1.25m', 222, 225], ['70cm', 420, 450],
  ['33cm', 902, 928], ['23cm', 1240, 1300],
];

export function bandForFrequency(mhz) {
  const f = Number(mhz);
  if (!Number.isFinite(f)) return null;
  const hit = BANDS.find(([, lo, hi]) => f >= lo && f <= hi);
  return hit ? hit[0] : null;
}

export function isGmrsFrequency(mhz) {
  const f = Number(mhz);
  return Number.isFinite(f) && f >= GMRS_MIN_MHZ && f <= GMRS_MAX_MHZ;
}

// Maidenhead grid (4 or 6 chars) to the centre of that square.
export function gridToLatLng(grid) {
  const g = String(grid || '').trim().toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?/.test(g)) return null;
  let lng = (g.charCodeAt(0) - 65) * 20 - 180 + Number(g[2]) * 2;
  let lat = (g.charCodeAt(1) - 65) * 10 - 90 + Number(g[3]);
  if (g.length >= 6 && /[A-X]{2}/.test(g.slice(4, 6))) {
    lng += (g.charCodeAt(4) - 65) * (2 / 24) + 1 / 24;
    lat += (g.charCodeAt(5) - 65) * (1 / 24) + 1 / 48;
  } else {
    lng += 1;
    lat += 0.5;
  }
  return { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 };
}

// Coordinates to a Maidenhead locator (4 chars by default, 6 with precision 6).
export function latLngToGrid(lat, lng, precision = 4) {
  const la = Number(lat); const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  const x = Math.min(lo + 180, 359.9999); const y = Math.min(la + 90, 179.9999);
  let g = String.fromCharCode(65 + Math.floor(x / 20)) + String.fromCharCode(65 + Math.floor(y / 10))
    + Math.floor((x % 20) / 2) + Math.floor(y % 10);
  if (precision >= 6) {
    g += String.fromCharCode(97 + Math.floor((x % 2) * 12)) + String.fromCharCode(97 + Math.floor((y % 1) * 24));
  }
  return g;
}

// Parses ADIF text into { header, records }, each a map of lower-case field
// name -> string value. Field lengths are honoured, so values may contain '<'.
export function parseAdif(text) {
  const src = String(text || '');
  const records = [];
  let header = {};
  let current = {};
  let i = 0;
  // Everything before <EOH> is the header; a file without one is all records.
  let inHeader = /<eoh>/i.test(src);
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) break;
    const gt = src.indexOf('>', lt);
    if (gt === -1) break;
    const spec = src.slice(lt + 1, gt);
    const [rawName, rawLen] = spec.split(':');
    const name = String(rawName || '').trim().toLowerCase();
    i = gt + 1;
    if (name === 'eoh') { header = current; current = {}; inHeader = false; continue; }
    if (name === 'eor') {
      if (!inHeader && Object.keys(current).length) records.push(current);
      current = {};
      continue;
    }
    const len = Number.parseInt(rawLen, 10);
    if (!name || !Number.isFinite(len) || len < 0) continue;
    current[name] = src.substr(i, len);
    i += len;
  }
  return { header, records };
}

function isoFromAdif(date, time) {
  const d = String(date || '').trim();
  if (!/^\d{8}$/.test(d)) return null;
  const t = String(time || '0000').trim().padEnd(6, '0').slice(0, 6);
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
}

// One ADIF record -> a ContactLog payload, or { error } when it can't be used.
export function adifRecordToContact(rec) {
  const callsign = String(rec.call || '').trim().toUpperCase();
  if (!callsign) return { error: 'missing CALL' };
  const date = isoFromAdif(rec.qso_date, rec.time_on);
  if (!date) return { error: 'missing or invalid QSO_DATE' };
  const freq = Number.parseFloat(rec.freq);
  const frequency = Number.isFinite(freq) ? freq : undefined;
  const service = String(rec.app_repeaternation_service || '').toUpperCase() === 'GMRS' || isGmrsFrequency(freq) ? 'GMRS' : 'HAM';
  const band = rec.band ? String(rec.band).toLowerCase() : bandForFrequency(freq);
  const mode = [rec.mode, rec.submode].filter(Boolean).join(' / ');
  // Our own exports carry the signal report as "Signal: ..." in COMMENT.
  const ownSignal = String(rec.comment || '').match(/^Signal:\s*(.+)$/);
  const rst = ownSignal ? ownSignal[1].trim()
    : [rec.rst_sent && `Sent ${rec.rst_sent}`, rec.rst_rcvd && `Rcvd ${rec.rst_rcvd}`].filter(Boolean).join(', ');
  const notes = [mode && `Mode: ${mode}`, ownSignal ? null : rec.comment, rec.notes].filter(Boolean).join('\n');
  const lat = fromAdifCoord(rec.lat);
  const lng = fromAdifCoord(rec.lon);
  const loc = lat != null && lng != null ? { lat, lng } : gridToLatLng(rec.gridsquare);
  const contact = {
    date,
    callsign,
    radio_service: service,
    mode: String(rec.app_repeaternation_mode || '') === 'Repeater' ? 'Repeater' : 'Simplex',
    ...(service === 'HAM' && band ? { band } : {}),
    ...(frequency != null ? { frequency } : {}),
    ...(rec.name ? { contact_name: rec.name.trim() } : {}),
    ...(rec.station_callsign || rec.operator ? { callsign_used: String(rec.station_callsign || rec.operator).trim().toUpperCase() } : {}),
    ...(rst ? { signal_report: rst } : {}),
    ...(rec.qth ? { city: rec.qth.trim() } : {}),
    ...(rec.state ? { state: rec.state.trim() } : {}),
    ...(rec.cnty ? { county: rec.cnty.trim() } : {}),
    ...(rec.tx_pwr ? { power_level: `${rec.tx_pwr} W` } : {}),
    ...(rec.my_rig ? { radio_used: rec.my_rig.trim() } : {}),
    ...(rec.my_antenna ? { antenna: rec.my_antenna.trim() } : {}),
    ...(notes ? { notes } : {}),
    ...(SENT_FROM_ADIF[String(rec.qsl_sent || '').toUpperCase()] ? { qsl_sent: SENT_FROM_ADIF[String(rec.qsl_sent).toUpperCase()] } : {}),
    ...(VIA_FROM_ADIF[String(rec.qsl_sent_via || '').toUpperCase()] ? { qsl_sent_via: VIA_FROM_ADIF[String(rec.qsl_sent_via).toUpperCase()] } : {}),
    ...(adifDateOnly(rec.qslsdate) ? { qsl_sent_date: adifDateOnly(rec.qslsdate) } : {}),
    ...(RCVD_FROM_ADIF[String(rec.qsl_rcvd || '').toUpperCase()] ? { qsl_received: RCVD_FROM_ADIF[String(rec.qsl_rcvd).toUpperCase()] } : {}),
    ...(VIA_FROM_ADIF[String(rec.qsl_rcvd_via || '').toUpperCase()] ? { qsl_received_via: VIA_FROM_ADIF[String(rec.qsl_rcvd_via).toUpperCase()] } : {}),
    ...(adifDateOnly(rec.qslrdate) ? { qsl_received_date: adifDateOnly(rec.qslrdate) } : {}),
    ...(rec.contest_id ? { contest_name: rec.contest_id.trim() } : {}),
    ...(rec.app_qrzlog_logid ? { qrz_logid: String(rec.app_qrzlog_logid).trim() } : {}),
    ...(rec.sota_ref ? { sota_ref: String(rec.sota_ref).trim().toUpperCase() } : {}),
    ...(rec.my_sota_ref ? { my_sota_ref: String(rec.my_sota_ref).trim().toUpperCase() } : {}),
    ...(rec.stx_string || rec.stx ? { contest_exchange_sent: String(rec.stx_string || rec.stx).trim() } : {}),
    ...(rec.srx_string || rec.srx ? { contest_exchange_rcvd: String(rec.srx_string || rec.srx).trim() } : {}),
    ...(loc ? loc : {}),
  };
  return { contact };
}

function field(name, value) {
  if (value == null || value === '') return '';
  const v = String(value);
  return `<${name}:${v.length}>${v} `;
}

function adifDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const p = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`,
  };
}

// ContactLog rows -> ADIF text. GMRS contacts keep their service in an
// application-defined field so a re-import restores them as GMRS.
export function contactsToAdif(contacts, { programVersion = '1.0' } = {}) {
  const now = adifDate(new Date().toISOString());
  const head = [
    'Repeater Nation logbook export',
    field('ADIF_VER', '3.1.4'),
    field('PROGRAMID', 'RepeaterNation'),
    field('PROGRAMVERSION', programVersion),
    field('CREATED_TIMESTAMP', `${now.date} ${now.time}`),
    '<EOH>',
  ].join('\n');
  const body = (contacts || []).map((c) => {
    const { date, time } = adifDate(c.date);
    const modeMatch = String(c.notes || '').match(/^Mode:\s*([^\n/]+)(?:\s*\/\s*([^\n]+))?/m);
    const mode = modeMatch ? modeMatch[1].trim().toUpperCase() : 'FM';
    const submode = modeMatch?.[2]?.trim().toUpperCase();
    const isGmrs = (c.radio_service || '').toUpperCase() === 'GMRS' || isGmrsFrequency(c.frequency);
    const band = !isGmrs ? (c.band || bandForFrequency(c.frequency)) : null;
    const notes = String(c.notes || '').replace(/^Mode:.*$/m, '').trim();
    return [
      field('CALL', c.callsign),
      field('QSO_DATE', date),
      field('TIME_ON', time),
      field('FREQ', c.frequency != null ? Number(c.frequency).toString() : ''),
      field('BAND', band),
      field('MODE', mode),
      field('SUBMODE', submode),
      field('NAME', c.contact_name),
      field('STATION_CALLSIGN', c.callsign_used),
      field('QTH', c.city),
      field('STATE', c.state),
      field('CNTY', c.county),
      field('LAT', c.lat != null ? toAdifLat(c.lat) : ''),
      field('LON', c.lng != null ? toAdifLon(c.lng) : ''),
      field('TX_PWR', String(c.power_level || '').match(/[\d.]+/)?.[0]),
      field('MY_RIG', c.radio_used),
      field('MY_ANTENNA', c.antenna),
      field('COMMENT', c.signal_report ? `Signal: ${c.signal_report}` : ''),
      field('NOTES', notes.replace(/\r?\n/g, ' ')),
      field('APP_REPEATERNATION_SERVICE', isGmrs ? 'GMRS' : 'HAM'),
      field('APP_REPEATERNATION_MODE', c.mode),
      field('QSL_SENT', SENT_TO_ADIF[c.qsl_sent]),
      field('QSL_SENT_VIA', VIA_TO_ADIF[c.qsl_sent_via]),
      field('QSLSDATE', c.qsl_sent_date ? String(c.qsl_sent_date).slice(0, 10).replace(/-/g, '') : ''),
      field('QSL_RCVD', RCVD_TO_ADIF[c.qsl_received]),
      field('QSL_RCVD_VIA', VIA_TO_ADIF[c.qsl_received_via]),
      field('QSLRDATE', c.qsl_received_date ? String(c.qsl_received_date).slice(0, 10).replace(/-/g, '') : ''),
      field('SOTA_REF', c.sota_ref),
      field('MY_SOTA_REF', c.my_sota_ref),
      field('CONTEST_ID', c.contest_name),
      field('STX_STRING', c.contest_exchange_sent),
      field('SRX_STRING', c.contest_exchange_rcvd),
      '<EOR>',
    ].join('').replace(/ <EOR>$/, '<EOR>');
  });
  return `${head}\n${body.join('\n')}\n`;
}

function toAdifCoord(value, pos, neg, degDigits) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return `${v < 0 ? neg : pos}${String(deg).padStart(degDigits, '0')} ${min.toFixed(3).padStart(6, '0')}`;
}
// ADIF location "XDDD MM.MMM" -> signed decimal degrees.
function fromAdifCoord(value) {
  const m = String(value || '').trim().match(/^([NSEW])\s*(\d{1,3})\s+(\d{1,2}(?:\.\d+)?)$/i);
  if (!m) return null;
  const v = Number(m[2]) + Number(m[3]) / 60;
  return Math.round((/[SW]/i.test(m[1]) ? -v : v) * 10000) / 10000;
}
const toAdifLat = (v) => toAdifCoord(v, 'N', 'S', 3);
const toAdifLon = (v) => toAdifCoord(v, 'E', 'W', 3);
