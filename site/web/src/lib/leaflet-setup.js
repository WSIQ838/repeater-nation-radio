import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { signalTier } from '@/lib/signalReport';

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Callsign badge pin used for individual contacts/check-ins on a map (Logbook,
// POTA contacts, Net Control check-ins). The background color is driven by the
// signal report so the map reads as a quick signal-strength overview at a glance.
export const callsignIcon = (callsign, signalReport) => {
  const tier = signalTier(signalReport);
  const label = escapeHtml(callsign || '?').toUpperCase();
  return L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));">
      <div style="padding:3px 7px;border-radius:7px;background:${tier.bg};border:2px solid #fff;color:${tier.fg};font-size:11px;font-weight:700;line-height:1.4;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${label}</div>
      <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${tier.bg};margin-top:-1px;"></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

// Host / co-host badge pins for Net Control's live map — same callsign-badge
// shape as callsignIcon, but with a fixed color and role glyph (instead of a
// signal-report color) so hosts stand out from regular checked-in stations.
const roleCallsignIcon = (callsign, bg, border, glyph) => {
  const label = escapeHtml(callsign || '?').toUpperCase();
  return L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));">
      <div style="padding:3px 7px;border-radius:7px;background:${bg};border:2px solid ${border};color:#fff;font-size:11px;font-weight:700;line-height:1.4;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;display:flex;align-items:center;gap:3px;">${glyph} ${label}</div>
      <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${bg};margin-top:-1px;"></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

export const hostIcon = (callsign) => roleCallsignIcon(callsign, '#b45309', '#fbbf24', '👑');
export const coHostIcon = (callsign) => roleCallsignIcon(callsign, '#7c3aed', '#fff', '🎧');

const pin = (bg, glyph) =>
  L.divIcon({
    className: '',
    html: `<div style="transform: translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;">
      <div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${bg};border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;line-height:1;">${glyph}</div>
      <div style="width:2px;height:6px;background:${bg};"></div>
    </div>`,
    iconSize: [28, 34],
    iconAnchor: [0, 0],
  });

export const repeaterIcon = pin('#f97316', '📡');
export const clubIcon = pin('#22c55e', '⚑');
export const eventIcon = pin('#a855f7', '★');
export const netControlIcon = pin('#2563eb', '📻');
export const potaIcon = pin('#16a34a', '🌲');
export const sotaIcon = pin('#9333ea', '⛰');
export const sdrIcon = pin('#0ea5e9', '📶');

export const userLocationIcon = L.divIcon({
  className: 'gmrs-loc-marker',
  html: '<div class="gmrs-loc-dot"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Directional "you are here" marker for GPS Navigation: an arrow rotated to
// the current heading (falls back to a plain dot when heading is unknown,
// e.g. the device hasn't reported motion yet).
export const headingArrowIcon = (headingDeg) => {
  if (headingDeg == null || !Number.isFinite(headingDeg)) return userLocationIcon;
  return L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-50%) rotate(${headingDeg}deg);width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
      <svg width="30" height="30" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.45));">
        <circle cx="12" cy="12" r="10" fill="#2563eb" fill-opacity="0.18" />
        <path d="M12 2 L19 20 L12 16 L5 20 Z" fill="#2563eb" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" />
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

// Numbered route-stop marker ("A"/"B" for start/end, N for intermediate
// stops) shared by the Trip Planner map and the GPS Navigation map so a route
// looks the same on both screens.
export const waypointIcon = (n, type) => {
  const color = type === 'start' ? '#22c55e' : type === 'end' ? '#ef4444' : type === 'repeater' ? '#f97316' : '#3b82f6';
  const label = type === 'start' ? 'A' : type === 'end' ? 'B' : n;
  return L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [0, 0],
  });
};

export const clusterIcon = (count) =>
  L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-50%);width:38px;height:38px;border-radius:50%;background:#ea580c;border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">${count}</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
