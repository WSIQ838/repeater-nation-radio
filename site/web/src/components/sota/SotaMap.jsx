import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { sotaIcon, callsignIcon } from '@/lib/leaflet-setup';
import { format } from 'date-fns';

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 9);
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

// The summit (activation site) plus, optionally, the stations worked from it.
// summit: { lat, lng, name, ref, location }
export default function SotaMap({ summit: site, contacts, height = '340px', bare = false }) {
  const summit = site?.lat && site?.lng ? site : null;
  const contactPoints = (contacts || []).filter((c) => c.lat && c.lng);
  const points = [...(summit ? [summit] : []), ...contactPoints];

  if (points.length === 0) {
    return (
      <div style={{ height }} className={`${bare ? '' : 'rounded-xl border border-dashed border-border '}grid place-items-center text-muted-foreground bg-muted/30 text-sm`}>
        No coordinates to display yet.
      </div>
    );
  }

  return (
    <div title="SOTA map. The summit marker shows the activation site and contact markers show mapped stations." style={{ height }} className={bare ? 'overflow-hidden' : 'rounded-xl overflow-hidden border border-border'}>
      <MapContainer center={[points[0].lat, points[0].lng]} zoom={5} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          attribution="&copy; Esri"
          maxZoom={20}
        />
        <FitBounds points={points} />
        {summit && (
          <Marker position={[summit.lat, summit.lng]} icon={sotaIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{summit.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{summit.ref}</div>
                {summit.location && <div className="text-xs">{summit.location}</div>}
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