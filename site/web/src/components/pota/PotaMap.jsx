import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { potaIcon } from '@/lib/leaflet-setup';

export default function PotaMap({ parks, height = '340px', bare = false }) {
  const points = (parks || []).filter((p) => p.lat && p.lng);
  if (points.length === 0) {
    return (
      <div style={{ height }} className={`${bare ? '' : 'rounded-xl border border-dashed border-border '}grid place-items-center text-muted-foreground bg-muted/30 text-sm`}>
        No parks with coordinates to display.
      </div>
    );
  }
  const center = [points[0].lat, points[0].lng];
  return (
    <div title="POTA park map. Use the map to inspect the park location and open its marker for details." style={{ height }} className={bare ? 'overflow-hidden' : 'rounded-xl overflow-hidden border border-border'}>
      <MapContainer center={center} zoom={4} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          attribution="&copy; Esri"
          maxZoom={20}
        />
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={potaIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{p.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{p.park_number}</div>
                <div className="text-xs">{[p.city, p.state].filter(Boolean).join(', ')}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}