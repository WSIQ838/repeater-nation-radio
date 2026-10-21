// Shared OSRM driving-route fetch used by both the Trip Planner map and the
// GPS Navigation screen, so the two screens never run two different routing
// implementations against the same trip.

export const maneuverText = (m, name) => {
  if (!m) return name || 'Continue';
  const road = name ? ` on ${name}` : '';
  const mod = m.modifier || '';
  switch (m.type) {
    case 'depart': return `Depart${road ? ` from${road}` : ''}`;
    case 'arrive': return `Arrive${road ? ` at${road}` : ''}`;
    case 'turn':
      return `Turn ${mod || 'straight'}${road}`;
    case 'merge':
      return `Merge ${mod || 'right'}${road}`;
    case 'on ramp':
      return `Take ramp ${mod || 'right'}${road}`;
    case 'off ramp':
      return `Take exit ${mod || 'right'}${road}`;
    case 'fork':
      return `Keep ${mod || 'straight'}${road}`;
    case 'end of road':
      return `At end of road, turn ${mod || 'straight'}${road}`;
    case 'continue':
      return `Continue${road}`;
    case 'roundabout':
    case 'rotary':
      return `Enter roundabout${road}`;
    default:
      return `${m.type || 'Continue'}${road}`;
  }
};

// Fetches a driving route through an ordered list of { lat, lng } waypoints.
// Returns { coords, distanceKm, durationMin, steps } or null (too few points,
// no route found, or a network error). `steps` carries per-maneuver
// instruction/distance(m)/duration(s)/road name, plus the coordinate the step
// starts at, so callers can match a live GPS fix to a step without re-fetching.
export async function fetchRoute(waypoints, { signal } = {}) {
  if (!waypoints || waypoints.length < 2) return null;
  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url, { signal });
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;
    const r0 = data.routes[0];
    const geom = r0.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const steps = (r0.legs || []).flatMap((leg) =>
      (leg.steps || []).map((s) => ({
        instruction: maneuverText(s.maneuver, s.name),
        road: s.name || '',
        distance: s.distance,
        duration: s.duration,
        lat: s.maneuver?.location?.[1],
        lng: s.maneuver?.location?.[0],
      }))
    );
    return { coords: geom, distanceKm: r0.distance / 1000, durationMin: r0.duration / 60, steps };
  } catch {
    return null;
  }
}
