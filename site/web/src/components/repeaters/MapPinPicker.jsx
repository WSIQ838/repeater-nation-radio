import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useUserLocation } from '@/hooks/useUserLocation';

const pinIcon = L.divIcon({
  className: '',
  html: `<div style="transform: translate(-50%,-100%);">
    <div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#f97316;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.35);"></div>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) { onPick(e.latlng); },
  });
  return null;
}

// Fixes Leaflet's pixel-to-lat/lng math after the container becomes visible
// (the dialog animates open with zero size, which corrupts click coordinates).
function SizeInvalidator() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    fix();
    const t = setTimeout(fix, 100);
    const t2 = setTimeout(fix, 300);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [map]);
  return null;
}

// Recenter the map when a pin is dropped somewhere off-screen.
function Recenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([Number(lat), Number(lng)], Math.max(map.getZoom(), 11), { animate: true });
    }
  }, [lat, lng, map]);
  return null;
}

export default function MapPinPicker({ lat, lng, onPick }) {
  const { location: userLoc, loading: locLoading } = useUserLocation();
  const hasPin = !!(lat && lng);
  const center = hasPin ? [Number(lat), Number(lng)] : (userLoc || [39.5, -98.35]);
  const zoom = hasPin ? 12 : 11;

  if (!hasPin && locLoading) {
    return (
      <div className="rounded-md border border-input overflow-hidden" style={{ height: 260 }}>
        <div className="h-full w-full grid place-items-center bg-muted/30">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">Finding your location…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-input overflow-hidden">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: 260, width: '100%' }}
        scrollWheelZoom
      >
        <SizeInvalidator />
        <Recenter lat={lat} lng={lng} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        <ClickHandler onPick={onPick} />
        {lat && lng && <Marker position={[Number(lat), Number(lng)]} icon={pinIcon} />}
      </MapContainer>
    </div>
  );
}