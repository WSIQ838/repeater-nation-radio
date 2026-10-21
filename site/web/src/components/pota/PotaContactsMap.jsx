import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { potaIcon, callsignIcon } from '@/lib/leaflet-setup';
import { format } from 'date-fns';

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 6);
      return;
    }
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const bounds = [
      [Math.min(...lats) - 0.5, Math.min(...lngs) - 0.5],
      [Math.max(...lats) + 0.5, Math.max(...lngs) + 0.5],
    ];
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [points, map]);
  return null;
}

export default function PotaContactsMap({ activation, contacts, height = '340px', bare = false }) {
  const park = activation?.lat && activation?.lng ? { lat: activation.lat, lng: activation.lng, name: activation.park_name, park_number: activation.park_number, park_location: activation.park_location } : null;
  const contactPoints = (contacts || []).filter((c) => c.lat && c.lng);
  const points = [...(park ? [park] : []), ...contactPoints];

  if (points.length === 0) {
    return (
      <div style={{ height }} className={`${bare ? '' : 'rounded-xl border border-dashed border-border '}grid place-items-center text-muted-foreground bg-muted/30 text-sm`}>
        No contact locations to display yet.
      </div>
    );
  }

  return (
    <div title="POTA contact map. The park marker shows the activation site and contact markers show mapped stations." style={{ height }} className={bare ? 'overflow-hidden' : 'rounded-xl overflow-hidden border border-border'}>
      <MapContainer center={[points[0].lat, points[0].lng]} zoom={5} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          attribution="&copy; Esri"
          maxZoom={20}
        />
        <FitBounds points={points} />
        {park && (
          <Marker position={[park.lat, park.lng]} icon={potaIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{park.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{park.park_number}</div>
                <div className="text-xs">{park.park_location}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Activation site</div>
              </div>
            </Popup>
          </Marker>
        )}
        {contactPoints.map((c) => (
          <Marker key={c.id} position={[c.lat, c.lng]} icon={callsignIcon(c.callsign, c.signal_report)}>
            <Popup>
              <div className="text-sm">
                <div className="font-mono font-semibold">{c.callsign}</div>
                {c.contact_name && <div className="text-xs">{c.contact_name}</div>}
                <div className="text-xs text-muted-foreground">{[c.city, c.state].filter(Boolean).join(', ')}</div>
                {c.date && <div className="text-xs mt-0.5">{format(new Date(c.date), 'MMM d, h:mm a')}</div>}
                {c.signal_report && <div className="text-xs">Signal: {c.signal_report}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}