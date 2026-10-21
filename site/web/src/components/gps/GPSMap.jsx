import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { repeaterIcon, headingArrowIcon, waypointIcon, clusterIcon } from '@/lib/leaflet-setup';
import { clusterRepeaters } from '@/lib/clusterUtils';
import { formatFreq } from '@/utils';
import { Loader2 } from 'lucide-react';

function ZoomTracker({ onZoomChange }) {
  const map = useMapEvents({ zoomend: () => onZoomChange(map.getZoom()) });
  useEffect(() => { onZoomChange(map.getZoom()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Pans the map to follow the live GPS dot. Following can be interrupted by
// the user dragging the map (reported via onUserPanned), and resumed with
// the Recenter button (recenterSignal).
function FollowUser({ location, following, recenterSignal, onUserPanned }) {
  const map = useMap();
  const programmatic = useRef(false);

  useMapEvents({
    dragstart: () => { if (!programmatic.current) onUserPanned(); },
  });

  useEffect(() => {
    if (!location || !following) return;
    programmatic.current = true;
    map.panTo(location, { animate: true, duration: 0.3 });
    const t = setTimeout(() => { programmatic.current = false; }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, following]);

  useEffect(() => {
    if (!recenterSignal || !location) return;
    programmatic.current = true;
    map.flyTo(location, Math.max(map.getZoom(), 15), { duration: 0.6 });
    const t = setTimeout(() => { programmatic.current = false; }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal]);

  return null;
}

const FALLBACK_CENTER = [39.5, -98.35];

export default function GPSMap({
  location, heading, route, waypoints = [], repeaterMarkers = [], routeRepeaterMarkers = [], selectedRepeater,
  following, onUserPanned, recenterSignal,
  onSelectRepeater,
}) {
  const [zoom, setZoom] = useState(12);
  const initialCenter = location || (waypoints[0] && [waypoints[0].lat, waypoints[0].lng]) || FALLBACK_CENTER;

  const displayRepeaterMarkers = useMemo(() => {
    const merged = [...repeaterMarkers, ...routeRepeaterMarkers];
    const seen = new Set();
    return merged.filter((entry) => {
      const id = entry?.repeater?.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [repeaterMarkers, routeRepeaterMarkers]);

  const { clusters, markers } = useMemo(
    () => clusterRepeaters(displayRepeaterMarkers.map((m) => m.repeater), zoom),
    [displayRepeaterMarkers, zoom]
  );
  const byId = useMemo(() => new Map(displayRepeaterMarkers.map((m) => [m.repeater.id, m])), [displayRepeaterMarkers]);

  if (!location && !waypoints.length) {
    return (
      <div className="h-full w-full grid place-items-center bg-muted/30">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Finding your location…</span>
        </div>
      </div>
    );
  }

  return (
    <MapContainer center={initialCenter} zoom={zoom} className="h-full w-full" scrollWheelZoom zoomControl={false}>
      <ZoomTracker onZoomChange={setZoom} />
      <FollowUser location={location} following={following} recenterSignal={recenterSignal} onUserPanned={onUserPanned} />
      <TileLayer
        attribution="&copy; Esri"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        maxZoom={20}
      />

      {location && (
        <Marker position={location} icon={headingArrowIcon(heading)}>
          <Popup><div className="text-sm font-medium">You are here</div></Popup>
        </Marker>
      )}

      {route && <Polyline positions={route.coords} pathOptions={{ color: '#f97316', weight: 5, opacity: 0.85 }} />}

      {waypoints.map((w, i) => (
        <Marker key={`w-${i}`} position={[w.lat, w.lng]} icon={waypointIcon(i + 1, w.type)}>
          <Popup>
            <div className="min-w-[140px]">
              <div className="font-semibold">{w.label}</div>
              <div className="text-xs font-mono">{w.lat.toFixed(4)}, {w.lng.toFixed(4)}</div>
            </div>
          </Popup>
        </Marker>
      ))}

      {clusters.map((c, i) => (
        <Marker key={`cluster-${i}`} position={[c.lat, c.lng]} icon={clusterIcon(c.count)}>
          <Popup>{c.count} repeaters in this area. Zoom in to see them.</Popup>
        </Marker>
      ))}
      {markers.map((r) => {
        const entry = byId.get(r.id);
        const isSelected = selectedRepeater?.id === r.id;
        return (
          <Marker key={`r-${r.id}`} position={[r.lat, r.lng]} icon={repeaterIcon} eventHandlers={{ click: () => onSelectRepeater?.(r) }}>
            <Popup>
              <div className="min-w-[160px]">
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs font-mono">{formatFreq(r.frequency)} MHz · {r.callsign}</div>
                {entry?.distanceMi != null ? (
                  <div className="text-xs text-primary">{entry.distanceMi.toFixed(1)} mi {entry.compass}</div>
                ) : entry?.routeDist != null ? (
                  <div className="text-xs text-primary">{(entry.routeDist / 1.60934).toFixed(1)} mi off route</div>
                ) : null}
              </div>
            </Popup>
            {isSelected && r.coverage_radius && (
              <Circle center={[r.lat, r.lng]} radius={r.coverage_radius * 1609} pathOptions={{ color: '#f97316', fillOpacity: 0.1 }} />
            )}
          </Marker>
        );
      })}
    </MapContainer>
  );
}
