import { useEffect, useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { haversineKm, projectOntoRoute } from '@/lib/geo';
import { fetchRoute } from '@/lib/routing';

// The single shared trip/route data model used by both the Trip Planner page
// and the GPS Navigation page. Neither page should fetch OSRM routes, load/save
// Trip records, or manage stops on its own — both call this hook so a route
// built in one place is exactly the route the other place sees.
//
// Backed by the existing Trip entity (base44.entities.Trip): a saved trip's
// `id` is the shared key between pages (Trip Planner -> "Start GPS Navigation"
// passes ?tripId=<id>; GPS -> "Edit Trip" links back the same way).

const genStopId = () => `stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyTrip = () => ({
  id: null,
  name: '',
  description: '',
  start_date: '',
  end_date: '',
  search_radius_km: 30,
  start_address: '',
  end_address: '',
  round_trip: false,
  stops: [],
  optimization_method: 'manual',
  notes: '',
});

const parseWaypoints = (s) => {
  try {
    const a = JSON.parse(s);
    if (!Array.isArray(a)) return [];
    return a.map((w) => ({
      id: w.id || genStopId(),
      label: w.label || 'Stop',
      lat: w.lat,
      lng: w.lng,
      type: w.type || 'stop',
      repeater_id: w.repeater_id,
      address: w.address,
    }));
  } catch {
    return [];
  }
};

const tripFromRecord = (t) => ({
  id: t.id,
  name: t.name || '',
  description: t.description || '',
  start_date: t.start_date || '',
  end_date: t.end_date || '',
  search_radius_km: t.search_radius_km || 30,
  start_address: t.start_address || '',
  end_address: t.end_address || '',
  round_trip: t.round_trip || false,
  stops: parseWaypoints(t.waypoints),
  optimization_method: t.optimization_method || 'manual',
  notes: t.notes || '',
});

export function useTripRoute() {
  const { toast } = useToast();
  const [trips, setTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [repeaters, setRepeaters] = useState([]);
  const [serviceFilter, setServiceFilter] = useState('BOTH');
  const [trip, setTrip] = useState(emptyTrip());
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [saving, setSaving] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [isCustomRoute, setIsCustomRoute] = useState(false);

  const [geocoding, setGeocoding] = useState(null); // 'start' | 'end' | 'stop' | null

  const [alongRoute, setAlongRoute] = useState(null);
  const [alongRouteLoading, setAlongRouteLoading] = useState(false);
  const [alongRouteCorridorMi, setAlongRouteCorridorMi] = useState(10);

  const radiusKm = Number(trip.search_radius_km) || 30;

  const allPoints = useMemo(() => {
    const pts = [];
    if (startPoint) pts.push({ ...startPoint, type: 'start', id: '__start__' });
    trip.stops.forEach((s) => pts.push(s));
    if (trip.round_trip && startPoint) {
      pts.push({ ...startPoint, type: 'start', id: '__start_end__' });
    } else if (endPoint) {
      pts.push({ ...endPoint, type: 'end', id: '__end__' });
    }
    return pts;
  }, [startPoint, endPoint, trip.stops, trip.round_trip]);

  useEffect(() => {
    base44.entities.Trip.list('-updated_date', 100)
      .then((t) => setTrips(t || []))
      .catch(() => toast({ title: 'Could not load trips', variant: 'destructive' }))
      .finally(() => setTripsLoading(false));
    // Intentionally runs once on mount only.
  }, []);

  // Fetch the driving route through the current waypoints. Both Trip Planner's
  // map and GPS Navigation read this same `routeInfo` — no page fetches OSRM itself.
  useEffect(() => {
    if (allPoints.length < 2) { setRouteInfo(null); return; }
    let cancelled = false;
    setRouteLoading(true);
    fetchRoute(allPoints).then((r) => {
      if (!cancelled) setRouteInfo(r);
    }).finally(() => !cancelled && setRouteLoading(false));
    return () => { cancelled = true; };
  }, [allPoints]);

  // Fetch repeaters within the bounding box of the current stops (for the
  // "Repeaters in Range" panel). GPS Navigation's live "Nearby Repeaters" panel
  // uses its own position-based query (useNearbyRepeaters) — this one is
  // route/stop-based and intentionally kept separate (see requirement: don't
  // mix route repeaters with live-position repeaters).
  useEffect(() => {
    if (!allPoints.length) { setRepeaters([]); return; }
    const lats = allPoints.map((w) => w.lat);
    const lngs = allPoints.map((w) => w.lng);
    const pad = Math.max(radiusKm / 111, 0.5);
    let cancelled = false;
    const services = serviceFilter === 'BOTH' ? ['GMRS', 'HAM'] : [serviceFilter];
    Promise.all(services.map((service) => base44.functions.invoke('query-repeaters', {
      north: Math.max(...lats) + pad,
      south: Math.min(...lats) - pad,
      east: Math.max(...lngs) + pad,
      west: Math.min(...lngs) - pad,
      service,
      paginate: false,
    }))).then((responses) => {
      const merged = responses.flatMap((res) => res.data.repeaters || []);
      const seen = new Set();
      const combined = merged.filter((r) => {
        if (!r?.id || seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      if (!cancelled) setRepeaters(combined);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [allPoints, radiusKm, serviceFilter]);

  const nearby = useMemo(() => {
    if (!allPoints.length) return [];
    const routeCoords = routeInfo?.coords;
    const result = [];
    for (const r of repeaters) {
      if (!r.lat || !r.lng) continue;
      let minDist = Infinity;
      let stop = null;
      for (const w of allPoints) {
        const d = haversineKm(w.lat, w.lng, r.lat, r.lng);
        if (d < minDist) { minDist = d; stop = w; }
      }
      let routeKm = null;
      let routeDist = null;
      if (routeCoords) {
        const proj = projectOntoRoute(routeCoords, r.lat, r.lng);
        if (proj.pointKm <= radiusKm) { routeKm = proj.routeKm; routeDist = proj.pointKm; }
      }
      if (minDist <= radiusKm || routeDist != null) {
        result.push({ repeater: r, distance: minDist, stop, routeKm, routeDist });
      }
    }
    return result.sort((a, b) => {
      if (a.routeKm != null && b.routeKm != null) return a.routeKm - b.routeKm;
      if (a.routeKm != null) return -1;
      if (b.routeKm != null) return 1;
      return a.distance - b.distance;
    });
  }, [allPoints, repeaters, radiusKm, routeInfo]);

  const addedRepeaterIds = useMemo(() => {
    const ids = new Set();
    trip.stops.forEach((s) => { if (s.repeater_id) ids.add(s.repeater_id); });
    return ids;
  }, [trip.stops]);

  const geocode = useCallback(async (addr, type) => {
    if (!addr.trim()) return false;
    setGeocoding(type);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`,
        { headers: { Accept: 'application/json' } }
      );
      const data = await res.json();
      if (data && data[0]) {
        const point = { label: addr.trim(), lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        if (type === 'start') {
          setStartPoint(point);
          setTrip((t) => ({ ...t, start_address: addr.trim() }));
        } else if (type === 'end') {
          setEndPoint(point);
          setTrip((t) => ({ ...t, end_address: addr.trim() }));
        } else {
          const stop = { id: genStopId(), label: addr.trim(), lat: point.lat, lng: point.lng, type: 'stop', address: addr.trim() };
          setTrip((t) => ({ ...t, stops: [...t.stops, stop] }));
          setIsCustomRoute(true);
        }
        return true;
      }
      toast({ title: 'Address not found', variant: 'destructive' });
      return false;
    } catch {
      toast({ title: 'Could not geocode address', variant: 'destructive' });
      return false;
    } finally {
      setGeocoding(null);
    }
  }, [toast]);

  const addMapStop = useCallback((lat, lng) => {
    setTrip((t) => ({ ...t, stops: [...t.stops, { id: genStopId(), label: `Stop ${t.stops.length + 1}`, lat, lng, type: 'stop' }] }));
    setIsCustomRoute(true);
  }, []);

  const addRepeaterStop = useCallback((r) => {
    const stop = {
      id: genStopId(),
      label: r.name || r.callsign || 'Repeater',
      lat: r.lat,
      lng: r.lng,
      type: 'repeater',
      repeater_id: r.id,
    };
    setTrip((t) => ({ ...t, stops: [...t.stops, stop] }));
    setIsCustomRoute(true);
  }, []);

  const removeStop = useCallback((stopIndex) => {
    setTrip((t) => ({ ...t, stops: t.stops.filter((_, i) => i !== stopIndex) }));
    setIsCustomRoute(true);
  }, []);

  const moveStop = useCallback((from, to) => {
    setTrip((t) => {
      if (to < 0 || to >= t.stops.length) return t;
      const newStops = [...t.stops];
      const [moved] = newStops.splice(from, 1);
      newStops.splice(to, 0, moved);
      return { ...t, stops: newStops };
    });
    setIsCustomRoute(true);
  }, []);

  const reorderStops = useCallback((from, to) => {
    setTrip((t) => {
      const newStops = [...t.stops];
      const [moved] = newStops.splice(from, 1);
      newStops.splice(to, 0, moved);
      return { ...t, stops: newStops };
    });
    setIsCustomRoute(true);
  }, []);

  const handleMapRemove = useCallback((allPointsIndex) => {
    const pt = allPoints[allPointsIndex];
    if (!pt) return;
    if (pt.type === 'start' && pt.id === '__start__') {
      setStartPoint(null);
      setTrip((t) => ({ ...t, start_address: '' }));
    } else if (pt.type === 'end') {
      setEndPoint(null);
      setTrip((t) => ({ ...t, end_address: '' }));
    } else if (pt.type !== 'start') {
      const stopIndex = trip.stops.findIndex((s) => s.id === pt.id);
      if (stopIndex >= 0) removeStop(stopIndex);
    }
  }, [allPoints, trip.stops, removeStop]);

  const applyOptimizedRoute = useCallback((optimizedOrder, method) => {
    const optimizedStops = optimizedOrder
      .map((idx) => allPoints[idx])
      .filter((p) => p && p.type !== 'start' && p.type !== 'end');
    // Stops excluded from optimization (via the "Include Custom Stops"/"Include
    // Repeaters" toggles) never appear in optimizedOrder at all -- mapping it
    // directly to the new stop list would silently drop them from the trip
    // instead of leaving them in place. Walk the original order and only
    // replace the stops that were actually optimized, keeping excluded ones put.
    const optimizedIds = new Set(optimizedStops.map((s) => s.id));
    let cursor = 0;
    const newStops = trip.stops.map((original) => (
      optimizedIds.has(original.id) ? optimizedStops[cursor++] : original
    ));
    setTrip((t) => ({ ...t, stops: newStops, optimization_method: method }));
    setIsCustomRoute(false);
    toast({ title: 'Optimized route applied' });
  }, [allPoints, trip.stops, toast]);

  const save = useCallback(async () => {
    if (!trip.name.trim()) {
      toast({ title: 'Trip name is required', variant: 'destructive' });
      return null;
    }
    setSaving(true);
    const payload = {
      name: trip.name.trim(),
      description: trip.description,
      start_date: trip.start_date,
      end_date: trip.end_date,
      search_radius_km: radiusKm,
      waypoints: JSON.stringify(trip.stops),
      start_address: trip.start_address,
      end_address: trip.end_address,
      start_lat: startPoint?.lat || null,
      start_lng: startPoint?.lng || null,
      end_lat: endPoint?.lat || null,
      end_lng: endPoint?.lng || null,
      round_trip: trip.round_trip,
      optimization_method: isCustomRoute ? 'manual' : trip.optimization_method,
      route_distance_km: routeInfo?.distanceKm || null,
      route_duration_min: routeInfo?.durationMin || null,
      notes: trip.notes,
    };
    try {
      let id = trip.id;
      if (trip.id) {
        await base44.entities.Trip.update(trip.id, payload);
        toast({ title: 'Trip updated' });
      } else {
        const created = await base44.entities.Trip.create(payload);
        id = created.id;
        toast({ title: 'Trip saved' });
        setTrip((t) => ({ ...t, id }));
      }
      const t = await base44.entities.Trip.list('-updated_date', 100);
      setTrips(t || []);
      return id;
    } catch {
      toast({ title: 'Could not save trip', variant: 'destructive' });
      return null;
    } finally {
      setSaving(false);
    }
  }, [trip, startPoint, endPoint, isCustomRoute, radiusKm, routeInfo, toast]);

  const applyTripRecord = useCallback((t) => {
    setTrip(tripFromRecord(t));
    setStartPoint(t.start_lat != null ? { label: t.start_address || 'Start', lat: t.start_lat, lng: t.start_lng } : null);
    setEndPoint(t.end_lat != null ? { label: t.end_address || 'End', lat: t.end_lat, lng: t.end_lng } : null);
    setIsCustomRoute(false);
    setAlongRoute(null);
  }, []);

  const loadTrip = useCallback((t) => applyTripRecord(t), [applyTripRecord]);

  const loadTripById = useCallback(async (id) => {
    if (!id) return false;
    try {
      const t = await base44.entities.Trip.get(id);
      if (!t) return false;
      applyTripRecord(t);
      return true;
    } catch {
      toast({ title: 'Could not load that trip', variant: 'destructive' });
      return false;
    }
  }, [applyTripRecord, toast]);

  const newTrip = useCallback(() => {
    setTrip(emptyTrip());
    setStartPoint(null);
    setEndPoint(null);
    setIsCustomRoute(false);
    setAlongRoute(null);
  }, []);

  const removeTrip = useCallback(async (id) => {
    try {
      await base44.entities.Trip.delete(id);
      setTrips((ts) => ts.filter((t) => t.id !== id));
      if (trip.id === id) newTrip();
    } catch {
      toast({ title: 'Could not delete trip', variant: 'destructive' });
    }
  }, [trip.id, newTrip, toast]);

  // On-demand corridor search: repeaters near the *planned route line* (not
  // just near a stop), independent of the continuous per-stop `nearby` list.
  // Fetched fresh at the requested corridor width rather than reusing
  // `repeaters` — the stop-bounding-box fetch above may be narrower than a
  // wide corridor request.
  const findRepeatersAlongRoute = useCallback(async (corridorMi) => {
    if (!routeInfo?.coords?.length) return;
    setAlongRouteCorridorMi(corridorMi);
    setAlongRouteLoading(true);
    try {
      const corridorKm = corridorMi * 1.60934;
      const lats = routeInfo.coords.map((c) => c[0]);
      const lngs = routeInfo.coords.map((c) => c[1]);
      const pad = Math.max(corridorKm / 111, 0.5);
      const services = serviceFilter === 'BOTH' ? ['GMRS', 'HAM'] : [serviceFilter];
      const responses = await Promise.all(services.map((service) => base44.functions.invoke('query-repeaters', {
        north: Math.max(...lats) + pad,
        south: Math.min(...lats) - pad,
        east: Math.max(...lngs) + pad,
        west: Math.min(...lngs) - pad,
        service,
        paginate: false,
      })));
      const merged = responses.flatMap((res) => res.data.repeaters || []);
      const seen = new Set();
      const results = [];
      for (const r of merged) {
        if (!r?.id || seen.has(r.id) || r.lat == null || r.lng == null) continue;
        seen.add(r.id);
        const { routeKm, pointKm } = projectOntoRoute(routeInfo.coords, r.lat, r.lng);
        if (pointKm <= corridorKm) results.push({ repeater: r, routeKm, routeDist: pointKm });
      }
      results.sort((a, b) => a.routeKm - b.routeKm);
      setAlongRoute(results);
    } catch {
      toast({ title: 'Could not search repeaters along route', variant: 'destructive' });
    } finally {
      setAlongRouteLoading(false);
    }
  }, [routeInfo, serviceFilter, toast]);

  const clearAlongRoute = useCallback(() => setAlongRoute(null), []);

  return {
    trips, tripsLoading,
    trip, setTrip,
    startPoint, setStartPoint,
    endPoint, setEndPoint,
    saving, save,
    loadTrip, loadTripById, newTrip, removeTrip,
    isCustomRoute, setIsCustomRoute,
    radiusKm,
    allPoints,
    routeInfo, routeLoading,
    serviceFilter, setServiceFilter,
    repeaters, nearby, addedRepeaterIds,
    geocode, geocoding,
    addMapStop, addRepeaterStop, removeStop, moveStop, reorderStops, handleMapRemove,
    applyOptimizedRoute,
    alongRoute, alongRouteLoading, alongRouteCorridorMi, findRepeatersAlongRoute, clearAlongRoute,
  };
}
