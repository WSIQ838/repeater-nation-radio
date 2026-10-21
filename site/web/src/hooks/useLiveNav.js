import { useEffect, useMemo, useRef, useState } from 'react';
import { bearingBetween, projectOntoRoute } from '@/lib/geo';

// Continuous GPS tracking + route progress, shared by the Trip Planner's
// in-map "Start Navigation" mode and the GPS Navigation page's Driving Mode.
// A single watchPosition-based implementation so both pages compute distance
// remaining, ETA, and current step the exact same way.
//
// `route` is a routeInfo object from useTripRoute (`{ coords, distanceKm,
// durationMin, steps }`) or null/undefined for GPS-only tracking with no
// active route (heading/speed/accuracy still work).
export function useLiveNav({ enabled, route, onError } = {}) {
  const [location, setLocation] = useState(null);
  const [heading, setHeading] = useState(null);
  const [speedMph, setSpeedMph] = useState(null);
  const [accuracyM, setAccuracyM] = useState(null);
  const lastFixRef = useRef(null); // { lat, lng, t } for heading/speed fallback when the device doesn't report them

  const stepBoundariesKm = useMemo(() => {
    if (!route?.steps?.length) return [];
    let cum = 0;
    return route.steps.map((s) => (cum += (s.distance || 0) / 1000));
  }, [route]);

  useEffect(() => {
    if (!enabled) {
      setLocation(null);
      setHeading(null);
      setSpeedMph(null);
      setAccuracyM(null);
      lastFixRef.current = null;
      return;
    }
    if (!navigator.geolocation) {
      onError?.('GPS is not available on this device');
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const now = pos.timestamp || Date.now();
        const last = lastFixRef.current;

        setLocation([lat, lng]);
        setAccuracyM(Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null);

        // Prefer the device's own heading/speed (available on phones while
        // moving); fall back to deriving them from the last two fixes.
        if (Number.isFinite(pos.coords.heading)) {
          setHeading(pos.coords.heading);
        } else if (last) {
          setHeading(bearingBetween(last.lat, last.lng, lat, lng));
        }

        if (Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0) {
          setSpeedMph(pos.coords.speed * 2.23694);
        } else if (last && now > last.t) {
          const dtHr = (now - last.t) / 3600000;
          const dKm = Math.sqrt((lat - last.lat) ** 2 + (lng - last.lng) ** 2) * 111.32;
          setSpeedMph(dtHr > 0 ? (dKm / dtHr) * 0.621371 : 0);
        }

        lastFixRef.current = { lat, lng, t: now };
      },
      () => onError?.('Could not get your GPS location'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
    // watchPosition should only restart when `enabled` toggles, not on every onError identity change.
  }, [enabled]);

  const progress = useMemo(() => {
    if (!location || !route?.coords?.length) return null;
    const { routeKm } = projectOntoRoute(route.coords, location[0], location[1]);
    let stepIndex = stepBoundariesKm.findIndex((boundaryKm) => routeKm < boundaryKm);
    if (stepIndex === -1) stepIndex = Math.max(0, route.steps.length - 1);
    const remainingKm = Math.max(0, route.distanceKm - routeKm);
    const remainingMin = route.distanceKm > 0 ? route.durationMin * (remainingKm / route.distanceKm) : 0;
    return { routeKm, remainingKm, remainingMin, stepIndex };
  }, [location, route, stepBoundariesKm]);

  return { location, heading, speedMph, accuracyM, progress };
}
