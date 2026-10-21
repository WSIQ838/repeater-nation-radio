export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Project a point onto a polyline route. Returns { routeKm, pointKm }:
//  routeKm — cumulative distance along the route at the closest point (for ordering)
//  pointKm — distance from the point to the closest point on the route
export function projectOntoRoute(coords, lat, lng) {
  if (!coords || coords.length < 2) return { routeKm: 0, pointKm: Infinity };
  let cum = 0;
  let best = { routeKm: 0, pointKm: Infinity };
  for (let i = 1; i < coords.length; i++) {
    const [lat1, lng1] = coords[i - 1];
    const [lat2, lng2] = coords[i];
    const segLen = haversineKm(lat1, lng1, lat2, lng2);
    // Approximate projection in equirectangular space (fine for short segments)
    const x1 = lng1 * Math.cos((lat1 * Math.PI) / 180);
    const y1 = lat1;
    const x2 = lng2 * Math.cos((lat2 * Math.PI) / 180);
    const y2 = lat2;
    const px = lng * Math.cos((lat * Math.PI) / 180);
    const py = lat;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const segSq = dx * dx + dy * dy;
    let t = segSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / segSq : 0;
    t = Math.max(0, Math.min(1, t));
    const projLat = lat1 + t * (lat2 - lat1);
    const projLng = lng1 + t * (lng2 - lng1);
    const dist = haversineKm(lat, lng, projLat, projLng);
    const routeKm = cum + segLen * t;
    if (dist < best.pointKm) best = { routeKm, pointKm: dist };
    cum += segLen;
  }
  return best;
}

// Initial bearing (degrees, 0-360, 0 = true north) from point 1 to point 2.
export function bearingBetween(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// 8-point compass label for a bearing in degrees.
export function bearingToCompass(deg) {
  if (deg == null || !Number.isFinite(deg)) return '';
  return COMPASS_POINTS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}