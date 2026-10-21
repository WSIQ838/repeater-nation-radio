import { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { haversineKm, bearingBetween, bearingToCompass } from '@/lib/geo';

const MI_KM = 1.60934;
const AUTO_FALLBACK_MI = 25; // used for repeaters with no coverage_radius when Automatic Range is on
const AUTO_FETCH_RADIUS_MI = 100; // outer bound fetched once, then filtered per-repeater's own coverage

// HAM digital-voice/linking technology tokens the query-repeaters function
// already knows how to match against RepeaterBook-imported notes text.
// 'FM' isn't a distinct entity field — it maps to the plain Analog mode.
const TECH_TO_FILTER = {
  DMR: { tech: 'DMR' },
  'D-STAR': { tech: 'D-STAR' },
  YSF: { tech: 'FUSION' },
  P25: { tech: 'P25' },
  NXDN: { tech: 'NXDN' },
  M17: { tech: 'M17' },
  FM: { mode: 'Analog' },
};

// Live GPS-position-based repeater detection: distinct from the Trip
// Planner's route/stop-based `nearby` list (useTripRoute). This is what
// answers "what's near me right now" while driving, so it must stay cheap —
// bounding-box queries only, refetched only when the user has moved far
// enough or a filter changed, never on every GPS tick.
export function useNearbyRepeaters({ location, enabled = true, radiusMi = 25, autoRange = false, service = 'ALL', tech = '' }) {
  const [repeaters, setRepeaters] = useState([]);
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef(null); // { lat, lng, radiusMi, autoRange, service, tech }
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!enabled || !location) { setRepeaters([]); return; }
    const [lat, lng] = location;

    const last = lastFetchRef.current;
    const paramsChanged = !last || last.radiusMi !== radiusMi || last.autoRange !== autoRange || last.service !== service || last.tech !== tech;
    const fetchRadiusMi = autoRange ? AUTO_FETCH_RADIUS_MI : radiusMi;
    const movedKm = last ? haversineKm(last.lat, last.lng, lat, lng) : Infinity;
    // Refetch once the user has covered ~1/4 of the search radius, or a filter changed.
    if (!paramsChanged && movedKm < (fetchRadiusMi * MI_KM) * 0.25) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      lastFetchRef.current = { lat, lng, radiusMi, autoRange, service, tech };
      setLoading(true);
      try {
        const radiusKm = fetchRadiusMi * MI_KM;
        const pad = radiusKm / 111;
        const box = { north: lat + pad, south: lat - pad, east: lng + pad, west: lng - pad };
        const techFilter = tech ? TECH_TO_FILTER[tech] : null;
        const services = service === 'ALL' ? ['GMRS', 'HAM'] : [service];
        // A technology/FM filter only applies to HAM repeaters (GMRS has no digital-voice tagging).
        const servicesToQuery = techFilter?.tech ? services.filter((s) => s === 'HAM') : services;
        const responses = await Promise.all(servicesToQuery.map((svc) => base44.functions.invoke('query-repeaters', {
          ...box,
          service: svc,
          filters: techFilter || {},
          paginate: false,
          limit: 1000,
        })));
        const merged = responses.flatMap((res) => res.data.repeaters || []);
        const seen = new Set();
        const withDistance = [];
        for (const r of merged) {
          if (!r?.id || seen.has(r.id) || r.lat == null || r.lng == null) continue;
          seen.add(r.id);
          const distanceKm = haversineKm(lat, lng, r.lat, r.lng);
          const coverageMi = r.coverage_radius || AUTO_FALLBACK_MI;
          if (autoRange ? distanceKm > coverageMi * MI_KM : distanceKm > radiusKm) continue;
          const bearingDeg = bearingBetween(lat, lng, r.lat, r.lng);
          withDistance.push({
            repeater: r,
            distanceMi: distanceKm / MI_KM,
            bearingDeg,
            compass: bearingToCompass(bearingDeg),
          });
        }
        withDistance.sort((a, b) => a.distanceMi - b.distanceMi);
        setRepeaters(withDistance);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [location, enabled, radiusMi, autoRange, service, tech]);

  return useMemo(() => ({ repeaters, loading }), [repeaters, loading]);
}
