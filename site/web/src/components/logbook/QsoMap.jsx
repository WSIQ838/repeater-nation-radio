import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { callsignIcon } from '@/lib/leaflet-setup';
import { formatFreq } from '@/utils';
import { Clock, MapPin, Radio, FileText, Signal } from 'lucide-react';
import Linkify from '@/components/shared/Linkify';

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export default function QsoMap({ logs }) {
  const mapped = logs.filter((l) => l.lat && l.lng);
  return (
    <MapContainer center={[39.5, -98.35]} zoom={4} className="h-full w-full" scrollWheelZoom>
      <MapResizer />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxZoom={20} />
      {mapped.map((l) => (
        <Marker key={l.id} position={[l.lat, l.lng]} icon={callsignIcon(l.callsign, l.signal_report)}>
          <Popup>
            <div className="min-w-[180px] space-y-1">
              <div className="font-semibold text-sm">{l.callsign}</div>
              {l.contact_name && <div className="text-xs text-muted-foreground">{l.contact_name}</div>}
              <div className="text-xs flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" /> {l.date ? new Date(l.date).toLocaleString() : '—'}
              </div>
              {l.frequency && (
                <div className="text-xs font-mono">{formatFreq(l.frequency)} MHz · Ch {l.channel || '—'} · {l.mode}</div>
              )}
              {l.signal_report && (
                <div className="text-xs flex items-center gap-1"><Signal className="w-3 h-3" /> {l.signal_report}</div>
              )}
              {l.radio_used && (
                <div className="text-xs flex items-center gap-1 text-muted-foreground"><Radio className="w-3 h-3" /> {l.radio_used}</div>
              )}
              {(l.city || l.state || l.zip || l.county) && (
                <div className="text-xs flex items-center gap-1 text-muted-foreground">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {[l.city, l.state, l.zip].filter(Boolean).join(', ')}{l.county ? ` (${l.county})` : ''}
                </div>
              )}
              {l.notes && (
                <div className="text-xs flex items-start gap-1 pt-1 border-t border-border/50">
                  <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-3"><Linkify text={l.notes} /></span>
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}