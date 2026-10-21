// Grid-based clustering for repeater markers.
// Groups nearby repeaters into clusters at low zoom levels to keep the DOM light.
export function clusterRepeaters(repeaters, zoom) {
  if (zoom >= 8) return { clusters: [], markers: repeaters };

  // Grid cell size based on zoom (degrees).
  // zoom 4 → ~3.1°, zoom 5 → ~1.6°, zoom 6 → ~0.8°, zoom 7 → ~0.4°
  const cellSize = 50 / Math.pow(2, zoom);

  const grid = new Map();
  for (const r of repeaters) {
    if (r.lat == null || r.lng == null) continue;
    const cellLat = Math.floor(r.lat / cellSize);
    const cellLng = Math.floor(r.lng / cellSize);
    const key = `${cellLat},${cellLng}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(r);
  }

  const clusters = [];
  const markers = [];
  for (const items of grid.values()) {
    if (items.length > 1) {
      const avgLat = items.reduce((s, r) => s + r.lat, 0) / items.length;
      const avgLng = items.reduce((s, r) => s + r.lng, 0) / items.length;
      clusters.push({ lat: avgLat, lng: avgLng, count: items.length, items });
    } else {
      markers.push(items[0]);
    }
  }

  return { clusters, markers };
}