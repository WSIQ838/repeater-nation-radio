import { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { potaIcon, userLocationIcon } from '@/lib/leaflet-setup';
import { Badge } from '@/components/ui/badge';

function FlyToUser({ location }) {
  const map = useMap();
  useEffect(() => {
    if (location) map.flyTo([location.lat, location.lng], Math.max(map.getZoom(), 10), { duration: 1.2 });
  }, [location?.lat, location?.lng]);
  return null;
}

function MapStateWatcher({ onState }) {
  const map = useMap();
  const report = () => onState({ zoom: map.getZoom(), bounds: map.getBounds() });
  useMapEvents({ zoomend: report, moveend: report });
  useEffect(() => { report(); }, []);
  return null;
}

function ClusterPin({ cluster }) {
  const map = useMap();
  const radius = Math.min(22, 10 + Math.sqrt(cluster.count) * 2.2);
  return (
    <CircleMarker
      center={[cluster.lat, cluster.lng]}
      radius={radius}
      pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.55, weight: 2 }}
      eventHandlers={{ click: () => map.setView([cluster.lat, cluster.lng], Math.min(map.getZoom() + 3, 11)) }}
    >
      <Popup>
        <div className="text-sm">
          <div className="font-semibold">{cluster.count} parks in this area</div>
          <div className="text-xs text-muted-foreground">Click to zoom in</div>
        </div>
      </Popup>
    </CircleMarker>
  );
}

// `bare` drops the map's own rounded border so it can sit flush inside a console panel.
export default function ClusteredPotaMap({ parks, onActivate, userLocation, height = '440px', bare = false }) {
  const [zoom, setZoom] = useState(4);
  const [bounds, setBounds] = useState(null);
  const points = (parks || []).filter((p) => p.lat && p.lng);

  const clusters = useMemo(() => {
    if (zoom >= 8 || points.length === 0) return null;
    const precision = zoom <= 3 ? 3 : zoom <= 5 ? 1.5 : 0.5;
    const map = {};
    points.forEach((p) => {
      const key = `${Math.round(p.lat / precision)}_${Math.round(p.lng / precision)}`;
      if (!map[key]) map[key] = { lat: 0, lng: 0, count: 0 };
      map[key].count++;
      map[key].lat += p.lat;
      map[key].lng += p.lng;
    });
    return Object.values(map).map((c) => ({ lat: c.lat / c.count, lng: c.lng / c.count, count: c.count }));
  }, [points, zoom]);

  // Only render individual markers within the current viewport (capped) to keep the DOM light.
  const visiblePoints = useMemo(() => {
    if (zoom < 8 || !bounds) return [];
    const within = points.filter((p) => bounds.contains([p.lat, p.lng]));
    return within.slice(0, 400);
  }, [points, zoom, bounds]);

  if (points.length === 0) {
    return (
      <div style={{ height }} className={`${bare ? '' : 'rounded-xl border border-dashed border-border '}grid place-items-center text-muted-foreground bg-muted/30 text-sm`}>
        No parks with coordinates to display.
      </div>
    );
  }

  const center = points.length > 0 ? [points[0].lat, points[0].lng] : [39.5, -98.35];

  return (
    <div title="POTA park map. Zoom to see individual park markers and use marker actions to view or activate a park." style={{ height }} className={bare ? 'overflow-hidden' : 'rounded-xl overflow-hidden border border-border'}>
      <MapContainer center={center} zoom={4} className="h-full w-full" scrollWheelZoom={false}>
        <MapStateWatcher onState={({ zoom: z, bounds: b }) => { setZoom(z); setBounds(b); }} />
        <FlyToUser location={userLocation} />
        {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon} />}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          attribution="&copy; Esri"
          maxZoom={20}
        />
        {clusters ? (
          clusters.map((c, i) => <ClusterPin key={i} cluster={c} />)
        ) : (
          visiblePoints.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={potaIcon}>
              <Popup>
                <div className="text-sm min-w-[180px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-semibold">{p.name}</span>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">{p.park_number}</div>
                  <div className="text-xs mb-1">{[p.city, p.state].filter(Boolean).join(', ') || p.location}</div>
                  {p.park_type && p.park_type !== 'Other' && <div className="text-xs text-muted-foreground">{p.park_type}</div>}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <Badge variant="outline" className={p.source === 'official' ? 'text-green-600 border-green-300' : 'text-blue-600 border-blue-300'}>
                      {p.source === 'official' ? 'Official' : 'Community'}
                    </Badge>
                    {p.pota_status === 'inactive' && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                  </div>
                  <div className="flex gap-1.5 mt-2.5">
                    <Link to={`/tools/pota/parks/${p.id}`} title="Open the park details page." className="text-xs font-medium text-primary hover:underline">View Park</Link>
                    {onActivate && (
                      <button title={`Start a POTA activation at ${p.name || p.park_number || 'this park'}.`} onClick={() => onActivate(p)} className="text-xs font-medium text-primary hover:underline">Activate</button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))
        )}
      </MapContainer>
    </div>
  );
}