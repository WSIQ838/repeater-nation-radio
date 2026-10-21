import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { useEffect } from 'react';
import { sdrIcon } from '@/lib/leaflet-setup';
import Linkify from '@/components/shared/Linkify';

function MapViewportSync({ streams, userLocation, onVisibleChange }) {
  const map = useMap();

  useEffect(() => {
    if (!userLocation) return;
    map.setView([userLocation.lat, userLocation.lng], Math.max(map.getZoom(), 8), { animate: true });
  }, [userLocation?.lat, userLocation?.lng]);

  const updateVisible = () => {
    const bounds = map.getBounds();
    const visible = (streams || []).filter((s) =>
      Number.isFinite(Number(s.lat)) &&
      Number.isFinite(Number(s.lng)) &&
      bounds.contains([Number(s.lat), Number(s.lng)])
    );
    onVisibleChange?.(visible.map((s) => s.id));
  };

  useMapEvents({
    moveend: updateVisible,
    zoomend: updateVisible,
  });

  useEffect(() => {
    updateVisible();
  }, [streams.length]);

  return null;
}

export default function SdrMap({ streams, height = '340px', userLocation = null, onVisibleChange }) {
  const points = (streams || []).filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)));
  if (points.length === 0) {
    return (
      <div style={{ height }} className="rounded-xl border border-dashed border-border grid place-items-center text-muted-foreground bg-muted/30 text-sm">
        No streams with a mapped location yet.
      </div>
    );
  }
  const center = userLocation ? [userLocation.lat, userLocation.lng] : [points[0].lat, points[0].lng];
  return (
    <div title="SDR stream map. Open a marker for details." style={{ height }} className="rounded-xl overflow-hidden border border-border">
      <MapContainer center={center} zoom={4} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          attribution="&copy; Esri"
          maxZoom={20}
        />
        <MapViewportSync streams={points} userLocation={userLocation} onVisibleChange={onVisibleChange} />
        {userLocation && (
          <CircleMarker center={[userLocation.lat, userLocation.lng]} radius={8} pathOptions={{ color: '#f97316', fillOpacity: 0.35 }}>
            <Popup>Your location</Popup>
          </CircleMarker>
        )}
        {points.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={sdrIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{s.name}</div>
                <div className="text-xs">{[s.city, s.state].filter(Boolean).join(', ')}</div>
                {s.frequency_info && <div className="text-xs text-muted-foreground">{s.frequency_info}</div>}
                {s.description && <div className="text-xs text-muted-foreground"><Linkify text={s.description} /></div>}
                <a href={s.stream_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Open stream</a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
