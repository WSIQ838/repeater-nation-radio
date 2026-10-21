import { bandForFrequency } from '@/lib/adif';

// Shared SOTA helpers. Nothing here talks to SOTA's servers: the SOTA API's
// terms don't allow AI-written software to connect without the SOTA team's
// prior approval, so members upload the generated SOTA CSV themselves.
export const SUMMIT_RE = /^[A-Z0-9]{1,4}\/[A-Z0-9]{2}-\d{3}$/;
export const MODES = ['CW', 'SSB', 'FM', 'DATA', 'AM'];
// An activation counts (and scores points) with contacts with at least four
// different stations from the summit on one UTC day.
export const QUALIFY = 4;

export const STATUS_TONE = { Upcoming: 'primary', Active: 'success', Completed: 'muted', Cancelled: 'danger' };

// SOTA CSV bands are written as the band's lower frequency, e.g. "14MHz".
const SOTA_BAND = {
  '160m': '1.8MHz', '80m': '3.5MHz', '60m': '5MHz', '40m': '7MHz', '30m': '10MHz', '20m': '14MHz', '17m': '18MHz',
  '15m': '21MHz', '12m': '24MHz', '10m': '28MHz', '6m': '50MHz', '4m': '70MHz', '2m': '144MHz', '1.25m': '220MHz',
  '70cm': '433MHz', '33cm': '902MHz', '23cm': '1240MHz',
};

export const modeOf = (c) => String(c.notes || '').match(/^Mode:\s*([^\n/]+)/m)?.[1]?.trim().toUpperCase() || 'SSB';
export const utcDay = (iso) => String(iso || '').slice(0, 10);
export const cleanRef = (v) => String(v || '').trim().toUpperCase();
export const summitLocation = (s) => [s?.region_name, s?.state].filter(Boolean).join(', ') || s?.association_name || '';
export const uniqueCalls = (contacts) => new Set((contacts || []).map((c) => String(c.callsign || '').toUpperCase())).size;

export function csvLine(c, myCall) {
  const d = new Date(c.date);
  const p = (n) => String(n).padStart(2, '0');
  const date = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}`;
  const time = `${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  const band = SOTA_BAND[c.band || bandForFrequency(c.frequency)] || (c.frequency ? `${c.frequency}MHz` : '');
  const mode = modeOf(c) === 'FT8' || modeOf(c) === 'RTTY' ? 'DATA' : modeOf(c);
  const notes = String(c.signal_report || '').replace(/[,\r\n]/g, ' ');
  return ['V2', (c.callsign_used || myCall || '').toUpperCase(), c.my_sota_ref || '', date, time, band, mode, c.callsign, c.sota_ref || '', notes].join(',');
}

export function downloadCsv(name, contacts, myCall) {
  const lines = contacts.slice().sort((x, y) => Date.parse(x.date) - Date.parse(y.date)).map((c) => csvLine(c, myCall));
  const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export const SOTA_LINKS = [
  { href: 'https://www.sotadata.org.uk/', label: 'SOTA database' },
  { href: 'https://sotawatch.sota.org.uk/', label: 'SOTAwatch spots' },
  { href: 'https://www.sotamaps.org/', label: 'Summit maps' },
];

// HF through UHF — most SOTA activity is on HF (40/20/17 m) and 2 m.
export const SOTA_BANDS = [
  { id: '160m', range: '1.8–2.0 MHz' }, { id: '80m', range: '3.5–4.0 MHz' }, { id: '60m', range: '5.3–5.4 MHz' },
  { id: '40m', range: '7.0–7.3 MHz' }, { id: '30m', range: '10.1–10.15 MHz' }, { id: '20m', range: '14.0–14.35 MHz' },
  { id: '17m', range: '18.068–18.168 MHz' }, { id: '15m', range: '21.0–21.45 MHz' }, { id: '12m', range: '24.89–24.99 MHz' },
  { id: '10m', range: '28.0–29.7 MHz' }, { id: '6m', range: '50–54 MHz' }, { id: '2m', range: '144–148 MHz' },
  { id: '1.25m', range: '222–225 MHz' }, { id: '70cm', range: '420–450 MHz' },
];
