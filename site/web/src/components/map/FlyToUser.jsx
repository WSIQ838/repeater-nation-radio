import { useEffect } from 'react';
import { useMap, Marker, Popup } from 'react-leaflet';
import { userLocationIcon } from '@/lib/leaflet-setup';

// Flies the map to the user's GPS location once resolved, and renders a
// "you are here" marker. Must be rendered inside a <MapContainer>.
export default function FlyToUser({ location, zoom = 11 }) {
  const map = useMap();

  useEffect(() => {
    if (location) {
      map.flyTo(location, zoom, { duration: 0.8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  if (!location) return null;

  return (
    <Marker position={location} icon={userLocationIcon}>
      <Popup>
        <div className="text-sm font-medium">You are here</div>
      </Popup>
    </Marker>
  );
}