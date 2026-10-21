// Shared RepeaterBook.com general (amateur/HAM) "Display_SS.php" HTML parser,
// for /repeaters/Display_SS.php?state_id=XX. This page has a different column
// layout than the GMRS-specific /gmrs/Display_SS.php page parsed by
// repeaterbookParser.ts, so it gets its own parser rather than reusing that one.

export function stripTags(s: any): string {
  return (s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// This page only reports offset direction (+/-/s), not a numeric split, so the
// input frequency is approximated from the output frequency's band using the
// conventional US ham repeater split for that band. Non-standard splits will
// be off; that's an inherent limit of scraping the public results page rather
// than the API's explicit "Input Freq" field.
function standardOffsetMhz(freqMhz: number): number {
  if (freqMhz >= 50 && freqMhz < 54) return 1.0; // 6m
  if (freqMhz >= 144 && freqMhz < 148) return 0.6; // 2m
  if (freqMhz >= 222 && freqMhz < 225) return 1.6; // 1.25m
  if (freqMhz >= 420 && freqMhz < 450) return 5.0; // 70cm
  if (freqMhz >= 902 && freqMhz < 928) return 12.0; // 33cm
  if (freqMhz >= 1240 && freqMhz < 1300) return 20.0; // 23cm
  return 0;
}

const DIGITAL_MODES = ['DMR', 'D-STAR', 'NXDN', 'P-25', 'M17', 'TETRA', 'FUSION'];

export interface HamRow {
  repeaterbookId: string;
  frequency: number;
  offsetSymbol: string;
  accessCode: string;
  location: string;
  county: string;
  callsign: string;
  access: 'Public' | 'Closed';
  modes: string[];
  status: 'Online' | 'Offline' | 'Maintenance';
}

// Parses the results table on a RepeaterBook general (amateur) state page.
// Column order (9 <td> per row): checkbox, frequency+offset, tone/access,
// location, county, callsign, use, modes, operational status.
export function extractHamRows(html: string): HamRow[] {
  const rows: HamRow[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRe = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const inner = m[1];
    const cells: { attrs: string; html: string }[] = [];
    let cm;
    tdRe.lastIndex = 0;
    while ((cm = tdRe.exec(inner)) !== null) cells.push({ attrs: cm[1] || '', html: cm[2] || '' });
    if (cells.length < 9) continue;

    const rptIdMatch = (cells[0].html.match(/data-rpt-id="(\d+)"/) || [])[1];
    const freqAttrMatch = cells[1].attrs.match(/data-sort="([\d.]+)"/);
    const frequency = freqAttrMatch ? parseFloat(freqAttrMatch[1]) : null;
    const callsign = stripTags(cells[5].html).toUpperCase();
    if (!rptIdMatch || !frequency || !callsign) continue;

    const offsetSymbol = stripTags((cells[1].html.split('</a>')[1] || ''));
    const accessCode = stripTags(cells[2].html);
    const location = stripTags(cells[3].html);
    const county = stripTags(cells[4].html);
    const use = stripTags(cells[6].html).toUpperCase();
    const modesAttr = (cells[7].attrs.match(/data-sort="([^"]*)"/) || [])[1] || '';
    const modes = modesAttr.split(/\s+/).filter(Boolean);
    const statusTitle = (cells[8].html.match(/title="([^"]+)"/) || [])[1] || '';

    rows.push({
      repeaterbookId: rptIdMatch,
      frequency,
      offsetSymbol,
      accessCode,
      location,
      county,
      callsign,
      access: use.includes('CLOSED') || use.includes('PRIVATE') ? 'Closed' : 'Public',
      modes,
      status: /not operational/i.test(statusTitle) ? 'Offline' : /testing|reduced/i.test(statusTitle) ? 'Maintenance' : 'Online',
    });
  }
  return rows;
}

// Builds a Repeater record object from a parsed HAM row (no coordinates).
export function buildHamRepeaterRecord(row: HamRow, stateAbbr: string, stateName: string, coords: { lat: number; lng: number } | null = null) {
  const digital = row.modes.filter((mode) => DIGITAL_MODES.includes(mode.toUpperCase()));
  const hasAnalog = row.modes.some((mode) => mode.toUpperCase() === 'FM');
  const mode = digital.length && hasAnalog ? 'Mixed' : digital.length ? 'Digital' : 'Analog';
  const std = standardOffsetMhz(row.frequency);
  const offset = row.offsetSymbol === '+' ? std : row.offsetSymbol === '-' ? -std : 0;

  return {
    name: `${row.location}, ${stateAbbr}`,
    callsign: row.callsign,
    frequency: row.frequency,
    offset,
    tone: row.accessCode || '',
    input_tone: row.accessCode || '',
    mode,
    access: row.access,
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null,
    status: row.status,
    owner: row.callsign,
    radio_service: 'HAM',
    verification: 'Pending',
    hidden: false,
    notes: [
      `County: ${row.county}`,
      `${row.location}, ${stateName}`,
      row.modes.length ? `Modes: ${row.modes.join(', ')}` : '',
      `Source: RepeaterBook.com (ID ${row.repeaterbookId}; approx. city-center coordinates; offset approximated from band standard)`,
    ].filter(Boolean).join(' · '),
  };
}
