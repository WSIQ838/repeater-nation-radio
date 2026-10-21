import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { repeaterIcon, userLocationIcon, headingArrowIcon, waypointIcon } from '@/lib/leaflet-setup';
import { Loader2 } from 'lucide-react';
import { formatFreq } from '@/utils';

function ClickHandler({ onAdd }) {
  useMapEvents({ click: (e) => onAdd(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FlyTo({ waypoints }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (waypoints.length) {
      const bounds = L.latLngBounds(waypoints.map((w) => [w.lat, w.lng]));
      map.fitBounds(bounds.pad(0.2), { maxZoom: 11 });
    }
  }, [waypoints.length]);
  return null;
}

// Recenters the map on the live GPS dot while navigating: once on the first fix,
// then again whenever the caller bumps recenterSignal (a "Recenter" button click).
function RecenterOnNav({ location, recenterSignal }) {
  const map = useMap();
  const firstFix = useRef(true);
  useEffect(() => {
    if (!location) return;
    if (firstFix.current) {
      firstFix.current = false;
      map.flyTo(location, 16, { duration: 0.8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!location]);

  useEffect(() => {
    if (!recenterSignal || !location) return;
    map.flyTo(location, 16, { duration: 0.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal]);

  return null;
}

// Presentational only: the route (OSRM), the live GPS fix, and repeater data
// are all owned by useTripRoute/useLiveNav in the parent page now, so this
// map draws exactly the same `route` object the GPS Navigation screen draws —
// one routing implementation, not two.
export default function TripPlannerMap({
  waypoints, radiusKm, nearby, onAdd, onRemove, route,
  navigating, liveLocation, liveHeading, recenterSignal,
}) {
  const [initCenter, setInitCenter] = useState(null);

  // One-shot geolocation just to center the map before any waypoints exist.
  useEffect(() => {
    const fallback = [39.5, -98.35];
    if (waypoints.length) { setInitCenter([waypoints[0].lat, waypoints[0].lng]); return; }
    if (!navigator.geolocation) { setInitCenter(fallback); return; }
    let done = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        setInitCenter([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {
        if (done) return;
        done = true;
        setInitCenter(fallback);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
    const t = setTimeout(() => {
      if (!done) { done = true; setInitCenter(fallback); }
    }, 6500);
    return () => clearTimeout(t);
  }, []);

  if (!initCenter) {
    return (
      <div className="h-full w-full grid place-items-center bg-muted/30">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Finding your location…</span>
        </div>
      </div>
    );
  }

  const hasWaypoints = waypoints.length > 0;
  const center = hasWaypoints ? [waypoints[0].lat, waypoints[0].lng] : initCenter;
  const zoom = hasWaypoints ? 8 : 11;

  return (
    <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
      <ClickHandler onAdd={onAdd} />
      <FlyTo waypoints={waypoints} />
      <TileLayer
        attribution="&copy; Esri"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        maxZoom={20}
      />

      {navigating && liveLocation ? (
        <>
          <Marker position={liveLocation} icon={headingArrowIcon(liveHeading)}>
            <Popup><div className="text-sm font-medium">You are here</div></Popup>
          </Marker>
          <RecenterOnNav location={liveLocation} recenterSignal={recenterSignal} />
        </>
      ) : (
        initCenter && (
          <Marker position={initCenter} icon={userLocationIcon}>
            <Popup><div className="text-sm font-medium">You are here</div></Popup>
          </Marker>
        )
      )}

      {route && (
        <Polyline positions={route.coords} pathOptions={{ color: '#f97316', weight: 5, opacity: 0.85 }} />
      )}
      {waypoints.length > 1 && !route && (
        <Polyline positions={waypoints.map((w) => [w.lat, w.lng])} pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.5, dashArray: '6,8' }} />
      )}

      {waypoints.map((w, i) => (
        <Marker key={`w-${i}`} position={[w.lat, w.lng]} icon={waypointIcon(i + 1, w.type)}>
          <Popup>
            <div className="min-w-[140px]">
              <div className="font-semibold">{w.label}</div>
              <div className="text-xs font-mono">{w.lat.toFixed(4)}, {w.lng.toFixed(4)}</div>
              <button onClick={() => onRemove(i)} className="mt-1 text-xs text-red-500 hover:underline">
                Remove stop
              </button>
            </div>
          </Popup>
          <Circle center={[w.lat, w.lng]} radius={(radiusKm || 30) * 1000} pathOptions={{ color: '#3b82f6', fillOpacity: 0.06 }} />
        </Marker>
      ))}

      {nearby.map(({ repeater: r, distance }) => (
        <Marker key={`r-${r.id}`} position={[r.lat, r.lng]} icon={repeaterIcon}>
          <Popup>
            <div className="min-w-[150px]">
              <div className="font-semibold">{r.name}</div>
              <div className="text-xs font-mono">{formatFreq(r.frequency)} MHz · {r.callsign}</div>
              <div className="text-xs text-muted-foreground mt-1">{(distance / 1.60934).toFixed(1)} mi from route</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
