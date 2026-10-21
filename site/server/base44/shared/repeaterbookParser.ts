// Shared RepeaterBook.com GMRS "View All Systems" HTML parser.
// Used by importRepeaterbookState and importRepeaterbookAll so the parsing
// logic lives in one place.

export function stripTags(s) {
  return (s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTone(text) {
  const parts = (text || '').split('/').map((p) => p.trim());
  return { out: parts[0] || '', in: parts[1] || '' };
}

// Parses the results table on a RepeaterBook GMRS state page into row objects.
export function extractRows(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const inner = m[1];
    const cells = [];
    let cm;
    while ((cm = tdRe.exec(inner)) !== null) cells.push(cm[1]);
    if (cells.length < 9) continue;
    const freqCell = cells[1] || '';
    const idMatch = freqCell.match(/ID=(\d+)/);
    const freq = parseFloat(stripTags(freqCell));
    if (!freq || !idMatch) continue;
    const { out, in: inTone } = parseTone(stripTags(cells[2]));
    const location = stripTags(cells[5]);
    const county = stripTags(cells[6]);
    const callsign = stripTags(cells[7]);
    const use = stripTags(cells[8]).toUpperCase();
    const statusHtml = cells[9] || '';
    let status = 'Online';
    if (/offair/i.test(statusHtml)) status = 'Offline';
    else if (/yellow_dot/i.test(statusHtml)) status = 'Maintenance';
    rows.push({
      repeaterbookId: idMatch[1],
      frequency: freq,
      outTone: out,
      inTone,
      location,
      county,
      callsign,
      access: use.includes('CLOSED') ? 'Closed' : 'Public',
      status,
    });
  }
  return rows;
}

// Builds a Repeater record object from a parsed row (no coordinates).
export function buildRepeaterRecord(row, stateAbbr, stateName, coords = null) {
  return {
    name: `${row.location}, ${stateAbbr}`,
    callsign: row.callsign,
    frequency: row.frequency,
    offset: 5,
    tone: row.outTone || '',
    input_tone: row.inTone || '',
    mode: 'Analog',
    access: row.access,
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null,
    status: row.status,
    owner: row.callsign,
    notes: `County: ${row.county} · ${row.location}, ${stateName} · Source: RepeaterBook.com (ID ${row.repeaterbookId}; approx. city-center coordinates)`,
  };
}