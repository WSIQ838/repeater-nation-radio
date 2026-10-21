import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import { userLocationIcon, callsignIcon, hostIcon, coHostIcon } from '@/lib/leaflet-setup';
import { Navigation } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function fmtTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; }
}

// The Net Control live map — its own component so it can be embedded in the
// live dashboard and reused, unchanged, by the pop-out map window.
export default function NetControlMapCard({ session, checkIns, hosts, hostLocations, className = 'h-full w-full', zoom = 11 }) {
  const netLat = Number(session.latitude);
  const netLng = Number(session.longitude);
  const hasNetLocation = Number.isFinite(netLat) && Number.isFinite(netLng);
  const checkInsWithLoc = (checkIns || []).filter((c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)));

  const primaryHostRecord = (hosts || []).find((h) => h.is_primary && h.status === 'accepted');
  const hostCallsign = (primaryHostRecord?.user_callsign || session.operator_callsign || '').toUpperCase();
  const hostMarker = hostCallsign && hostLocations?.[hostCallsign]
    ? { callsign: hostCallsign, name: primaryHostRecord?.user_name || session.operator_name || '', ...hostLocations[hostCallsign] }
    : null;
  const coHostMarkers = (hosts || [])
    .filter((h) => h.status === 'accepted' && !h.is_primary && h.user_callsign && hostLocations?.[h.user_callsign.toUpperCase()])
    .map((h) => ({ callsign: h.user_callsign.toUpperCase(), name: h.user_name || '', ...hostLocations[h.user_callsign.toUpperCase()] }));

  const hasMapLocation = hasNetLocation || checkInsWithLoc.length > 0 || !!hostMarker || coHostMarkers.length > 0;
  const mapCenter = hasNetLocation
    ? [netLat, netLng]
    : checkInsWithLoc.length > 0
    ? [Number(checkInsWithLoc[0].lat), Number(checkInsWithLoc[0].lng)]
    : hostMarker
    ? [hostMarker.lat, hostMarker.lng]
    : [coHostMarkers[0]?.lat, coHostMarkers[0]?.lng];

  if (!hasMapLocation) {
    return (
      <div className={`${className} grid place-items-center text-center p-6 text-muted-foreground`}>
        <div><Navigation className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm font-medium">Net Control location is not mapped yet.</p><p className="text-xs mt-1">Add a location when creating the net and use the location button to save coordinates.</p></div>
      </div>
    );
  }

  return (
    <MapContainer center={mapCenter} zoom={zoom} className={className} scrollWheelZoom>
      <MapResizer />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxZoom={20} />
      {hasNetLocation && (
        <>
          <Marker position={[netLat, netLng]} icon={userLocationIcon}>
            <Popup><div className="text-sm"><strong>{session.name}</strong><div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">{session.operator_callsign || session.operator_name || 'Net Control'}<StaffTag userId={session.primary_user_id} callsign={session.primary_user_id ? undefined : session.operator_callsign} /></div>{session.location && <div className="text-xs mt-1">{session.location}</div>}</div></Popup>
          </Marker>
          <CircleMarker center={[netLat, netLng]} radius={18} pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.15, weight: 2 }} />
        </>
      )}
      {checkInsWithLoc.map((c) => (
        <Marker key={c.id} position={[Number(c.lat), Number(c.lng)]} icon={callsignIcon(c.callsign, c.signal_report)}>
          <Popup>
            <div className="text-sm">
              <strong>{c.callsign}</strong> <StaffTag callsign={c.callsign} />{c.name && <span className="text-muted-foreground"> — {c.name}</span>}
              {c.signal_report && <div className="text-xs mt-1">Signal: {c.signal_report}</div>}
              {c.location && <div className="text-xs mt-1">{c.location}</div>}
              <div className="text-xs text-muted-foreground mt-1">{c.status === 'checked_in' ? 'Checked in' : 'Checked out'} {fmtTime(c.check_in_time)}</div>
            </div>
          </Popup>
        </Marker>
      ))}
      {hostMarker && (
        <Marker position={[hostMarker.lat, hostMarker.lng]} icon={hostIcon(hostMarker.callsign)}>
          <Popup>
            <div className="text-sm">
              <strong>{hostMarker.callsign}</strong> <StaffTag callsign={hostMarker.callsign} />{hostMarker.name && <span className="text-muted-foreground"> — {hostMarker.name}</span>}
              <div className="text-xs text-muted-foreground mt-1">Net Control Host</div>
            </div>
          </Popup>
        </Marker>
      )}
      {coHostMarkers.map((h) => (
        <Marker key={`cohost-${h.callsign}`} position={[h.lat, h.lng]} icon={coHostIcon(h.callsign)}>
          <Popup>
            <div className="text-sm">
              <strong>{h.callsign}</strong> <StaffTag callsign={h.callsign} />{h.name && <span className="text-muted-foreground"> — {h.name}</span>}
              <div className="text-xs text-muted-foreground mt-1">Co-Host</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
