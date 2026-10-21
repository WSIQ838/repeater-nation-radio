import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Marker, Popup, TileLayer, WMSTileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, Bell, CircleAlert, CloudSun, Droplets, Earth, LocateFixed, RadioTower, RefreshCw, ShieldAlert, TriangleAlert, Wind, X } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [39.5, -98.35];
const DEFAULT_ZOOM = 4;
const REFRESH_MS = 60000;
const RADIUS_OPTIONS = [25, 50, 100, 250];
const SATELLITE_HOTSPOT_DATE = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const iconSvg = (type) => {
  const common = 'viewBox="0 0 24 24" aria-hidden="true"';
  const paths = {
    location: '<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"></path><circle cx="12" cy="9" r="2.75"></circle>',
    shelter: '<path d="M3 11.5 12 4l9 7.5"></path><path d="M5 10.5V20h14v-9.5"></path><path d="M9 20v-5h6v5M8 12h.01M16 12h.01"></path>',
    repeater: '<path d="M12 4v16"></path><path d="M8 7h8M6 11h12M4 16h16"></path><path d="M8 7 5 4M16 7l3-3"></path><circle cx="12" cy="4" r="1.5" fill="currentColor" stroke="none"></circle>',
    earthquake: '<path d="M3 15h4l2-7 3 11 3-9 2 3h4"></path><path d="M5 19h14"></path>',
    fire: '<path d="M12 21c4 0 7-2.7 7-6.5 0-3.2-2.1-5.1-4.3-7.7.1 2.2-.8 3.7-2 4.7.2-3.8-1.6-6.6-3.6-8.5.1 3.2-3.1 5.4-3.1 9.1C6 18.2 8.6 21 12 21Z"></path><path d="M12 17c1.3 0 2.3-.9 2.3-2.2 0-1-.5-1.8-1.2-2.6-.2 1-.7 1.5-1.2 1.9-.1-1.1-.5-1.8-1-2.4-.4 1-.9 1.8-.9 2.9 0 1.4.9 2.4 2 2.4Z" fill="currentColor" stroke="none"></path>',
    weather: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7Z"></path><path d="M8 4v2M4.5 6.5 6 8M15.5 6.5 14 8"></path><path d="M9 21h6"></path>',
    water: '<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z"></path><path d="M9 15c.7 1.2 1.7 1.8 3 1.8s2.3-.6 3-1.8"></path>',
    evacuation: '<path d="M5 20V5h14"></path><path d="M9 9h8l-3-3M17 9l-3 3"></path><path d="M8 20h8"></path>',
    airQuality: '<path d="M4 8h9a3 3 0 1 0-3-3"></path><path d="M4 13h14a2 2 0 1 1-2 2"></path><path d="M4 18h8"></path>',
    satellite: '<path d="M7 7l10 10"></path><path d="m14 4 6 6-3 3-6-6 3-3Z"></path><path d="m10 14-6 6"></path><path d="M5 15l4 4"></path><path d="M4 4h5M4 4v5"></path>'
  };
  return '<svg ' + common + '>' + (paths[type] || paths.location) + '</svg>';
};
const mapIcon = (type) => L.divIcon({ className: 'emergency-map-icon', html: '<div class="emergency-map-icon-inner emergency-map-icon-' + type + '">' + iconSvg(type) + '</div>', iconSize: type === 'location' ? [34, 34] : [34, 34], iconAnchor: type === 'location' ? [17, 30] : [17, 17], popupAnchor: type === 'location' ? [0, -30] : [0, -17] });

const haversineMiles = (a, b) => {
  if (!a || !b) return Infinity;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};

function FlyToLocation({ location }) {
  const map = useMap();
  useEffect(() => {
    if (location) map.flyTo([location.lat, location.lng], 8, { duration: 0.8 });
  }, [location, map]);
  return null;
}

function LocateButton({ onLocated, loading }) {
  const locate = () => {
    if (!navigator.geolocation) return;
    onLocated({ loading: true });
    navigator.geolocation.getCurrentPosition(
      (position) => onLocated({ loading: false, location: { lat: position.coords.latitude, lng: position.coords.longitude } }),
      (error) => {
        const messages = {
          1: 'Location access is blocked. Allow location access for Repeater Nation in your browser, then try again.',
          2: 'Your location could not be determined. Check that Windows/browser location services are enabled, then try again.',
          3: 'Location lookup timed out. Try again or use Search ZIP instead.',
        };
        onLocated({ loading: false, error: messages[error?.code] || 'Unable to determine your current location. Try again or use Search ZIP.' });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  };
  return (
    <Button size="sm" variant="outline" onClick={locate} disabled={loading} className="gap-1.5">
      {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
      {loading ? 'Locating…' : 'Find My Location'}
    </Button>
  );
}

function alertTitle(alert) { return alert?.event || alert?.headline || 'Weather Alert'; }
function formatTime(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleString(); } catch { return ''; }
}
function severityClass(severity) {
  const s = String(severity || '').toLowerCase();
  if (s === 'extreme') return 'border-red-500/60 bg-red-500/10';
  if (s === 'severe') return 'border-orange-500/60 bg-orange-500/10';
  if (s === 'moderate') return 'border-amber-500/50 bg-amber-500/10';
  return 'border-input bg-card';
}

export default function EmergencyIntel() {
  const [data, setData] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [radius, setRadius] = useState(100);
  const [zipInput, setZipInput] = useState('');
  const [zipBusy, setZipBusy] = useState(false);
  const [layers, setLayers] = useState({ alerts: true, earthquakes: true, repeaters: true, fires: true, shelters: true, weatherStations: true, water: true, airQuality: true, fireHotspots: true, evacuationWarnings: true });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedAlert, setSelectedAlert] = useState(null);

  const load = useCallback(async (quiet = false, overrideZip = '') => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('emergency-intel', {
        lat: location?.lat, lng: location?.lng, zip: overrideZip || undefined, radiusMiles: radius,
      });
      setData(res?.data || res || {});
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Emergency data is temporarily unavailable.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [location, radius]);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) load(true); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const lookupZip = async () => {
    const zip = zipInput.trim();
    if (!/^\d{5}$/.test(zip)) { setError('Enter a valid 5-digit ZIP code.'); return; }
    setZipBusy(true); setError('');
    try {
      const res = await base44.functions.invoke('emergency-intel', { zip, radiusMiles: radius });
      const next = res?.data || res || {};
      setData(next);
      if (next.center) setLocation(next.center);
    } catch (e) { setError(e?.response?.data?.error || e?.message || 'ZIP code lookup failed.'); }
    finally { setZipBusy(false); }
  };

  const handleLocated = ({ loading: busy, location: next, error: locationError }) => {
    setLocationBusy(busy);
    if (next) setLocation(next);
    if (locationError) setError(locationError);
  };

  const repeaters = useMemo(() => {
    const rows = data?.repeaters || [];
    const mapped = rows.map((r) => ({ ...r, distance: location ? haversineMiles(location, { lat: r.lat, lng: r.lng }) : null }))
      .filter((r) => !location || r.distance <= radius)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    return mapped.slice(0, 500);
  }, [data, location, radius]);

  const earthquakes = useMemo(() => {
    const rows = data?.earthquakes || [];
    if (!location) return rows.filter((q) => Number(q.magnitude) >= 2.5);
    return rows.map((q) => ({ ...q, distance: haversineMiles(location, { lat: q.coordinates[1], lng: q.coordinates[0] }) }))
      .filter((q) => q.distance <= radius).sort((a, b) => a.distance - b.distance);
  }, [data, location, radius]);

  const activeAlerts = data?.alerts || [];
  const firePerimeters = (data?.firePerimeters || []).slice(0, 150);
  const fireIncidents = useMemo(() => {
    const rows = data?.fireIncidents || [];
    const mapped = rows.map((fire) => ({
      ...fire,
      distance: location ? haversineMiles(location, { lat: fire.coordinates[1], lng: fire.coordinates[0] }) : null,
    })).filter((fire) => !location || fire.distance <= radius)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    return mapped.slice(0, 500);
  }, [data, location, radius]);
  const shelters = useMemo(() => {
    const rows = data?.shelters || [];
    const mapped = rows.map((s) => ({ ...s, distance: location ? haversineMiles(location, { lat: s.coordinates[1], lng: s.coordinates[0] }) : null }))
      .filter((s) => !location || s.distance <= radius)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    return mapped.slice(0, 500);
  }, [data, location, radius]);
  const weatherStations = useMemo(() => {
    const rows = data?.weatherStations || [];
    return rows.map((s) => ({ ...s, distance: location ? haversineMiles(location, { lat: s.coordinates[1], lng: s.coordinates[0] }) : null }))
      .filter((s) => !location || s.distance <= radius)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)).slice(0, 100);
  }, [data, location, radius]);
  const waterGauges = useMemo(() => {
    const rows = data?.waterGauges || [];
    return rows.map((g) => ({ ...g, distance: location ? haversineMiles(location, { lat: g.coordinates[1], lng: g.coordinates[0] }) : null }))
      .filter((g) => !location || g.distance <= radius)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)).slice(0, 200);
  }, [data, location, radius]);
  const airQuality = useMemo(() => (data?.airQuality || []).filter((zone) => zone?.geometry), [data]);
  const evacuationWarnings = useMemo(() => {
    const evacuationPattern = /evacuat|shelter in place|leave area|mandatory evacuation|evacuation warning|evacuation order/i;
    return activeAlerts.filter((alert) => evacuationPattern.test([alert.event, alert.headline, alert.description].filter(Boolean).join(' ')) && alert.geometry);
  }, [activeAlerts]);
  const evacuationStyle = (alert) => {
    const text = [alert.event, alert.headline, alert.description].filter(Boolean).join(' ');
    const mandatory = /mandatory evacuation|evacuation order|ordered to evacuate/i.test(text);
    return mandatory
      ? { color: '#b91c1c', fillColor: '#dc2626', fillOpacity: 0.22, weight: 3 }
      : { color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.18, weight: 2.5 };
  };
  const evacuationStatus = (alert) => {
    const text = [alert.event, alert.headline, alert.description].filter(Boolean).join(' ');
    return /mandatory evacuation|evacuation order|ordered to evacuate/i.test(text) ? 'Evacuation Order' : 'Evacuation Warning / Advisory';
  };
  const airQualityCategory = (code) => ({
    1: 'Good',
    2: 'Moderate',
    3: 'Unhealthy for Sensitive Groups',
    4: 'Unhealthy',
    5: 'Very Unhealthy',
    6: 'Hazardous',
  }[Number(code)] || 'No Data');
  const airQualityStyle = (code) => {
    const styles = {
      1: { color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.08 },
      2: { color: '#eab308', fillColor: '#eab308', fillOpacity: 0.12 },
      3: { color: '#f97316', fillColor: '#f97316', fillOpacity: 0.15 },
      4: { color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.17 },
      5: { color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.19 },
      6: { color: '#7f1d1d', fillColor: '#7f1d1d', fillOpacity: 0.22 },
    };
    return styles[Number(code)] || { color: '#64748b', fillColor: '#64748b', fillOpacity: 0.08 };
  };
  const mapCenter = location ? [location.lat, location.lng] : DEFAULT_CENTER;
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);

  return (
    <ToolShell title="Emergency & Situational Awareness" description="Live emergency alerts, earthquakes, and nearby GMRS/HAM repeaters in one command-center map." icon={ShieldAlert} disclaimer={false}>
      <div className="space-y-4">
        <Card className="p-4">
          {data?.upstreamErrors && Object.values(data.upstreamErrors).some(Boolean) && (
            <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <div className="font-semibold">Data source issue</div>
              <div className="mt-1">
                {Object.entries(data.upstreamErrors)
                  .filter(([, failed]) => failed)
                  .map(([key]) => ({
                    alerts: 'Weather Alerts',
                    earthquakes: 'Earthquakes',
                    repeaters: 'GMRS + HAM Repeaters',
                    firePerimeters: 'Wildfire Perimeters',
                    fireIncidents: 'Wildfire Incidents',
                    shelters: 'Emergency Shelters',
                    weatherStations: 'Weather Stations',
                    waterGauges: 'Water Gauges',
                    airQuality: 'Air Quality / Smoke',
                  }[key] || key))
                  .join(', ')} did not respond during this refresh. Available layers remain displayed and will retry on the next refresh.
              </div>
              {data?.upstreamErrorDetails && Object.keys(data.upstreamErrorDetails).length > 0 && (
                <div className="mt-1 text-[11px] opacity-80">
                  {Object.entries(data.upstreamErrorDetails).map(([key, message]) => (
                    <div key={key}>{key}: {String(message)}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-heading font-semibold">Live Emergency Map</div>
              <div className="text-xs text-muted-foreground mt-1">Official NWS alerts and USGS earthquake data, combined with the Repeater Nation repeater network.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <LocateButton onLocated={handleLocated} loading={locationBusy} />
              <Button size="sm" variant="outline" onClick={() => load(true)} disabled={refreshing} className="gap-1.5">
                <RefreshCw className={refreshing ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} /> Refresh
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Search ZIP</span><input value={zipInput} onChange={(e) => setZipInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') lookupZip(); }} inputMode="numeric" maxLength={5} placeholder="ZIP code" className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm" /><Button size="sm" onClick={lookupZip} disabled={zipBusy}>{zipBusy ? 'Looking up…' : 'Search ZIP'}</Button>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Radius</span>
            {RADIUS_OPTIONS.map((value) => (
              <Button key={value} size="sm" variant={radius === value ? 'default' : 'outline'} onClick={() => setRadius(value)}>{value} mi</Button>
            ))}
            <span className="ml-2 text-xs text-muted-foreground">Auto-refreshes every 60 seconds</span>
          </div>

          <div className="mt-4 border-t pt-4">
            <button type="button" onClick={() => setFiltersOpen((v) => !v)} className="w-full flex items-center justify-between text-left">
              <span className="font-heading font-semibold">Map Filters</span>
              <span className="text-xs text-muted-foreground">{filtersOpen ? 'Hide' : 'Show'}</span>
            </button>
            {filtersOpen && <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {[
                ['alerts', 'Weather Alerts', Bell],
                ['earthquakes', 'Earthquakes', Earth],
                ['repeaters', 'GMRS + HAM', RadioTower],
                ['fires', 'Wildfires', ShieldAlert],
                ['shelters', 'Shelters', CircleAlert],
                ['weatherStations', 'Weather Stations', CloudSun],
                ['water', 'Water Gauges', Droplets],
                ['airQuality', 'Air Quality', Wind],
                ['fireHotspots', 'Satellite Hotspots', ShieldAlert],
                ['evacuationWarnings', 'Evacuations', TriangleAlert],
              ].map(([key, label, Icon]) => (
                <Button key={key} size="sm" variant={layers[key] ? 'default' : 'outline'} onClick={() => setLayers((v) => ({ ...v, [key]: !v[key] }))} className="w-full min-w-0 gap-1.5 justify-start">
                  <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
                </Button>
              ))}
            </div>}
          </div>
        </Card>

        {error && <Card className="p-3 border-amber-500/50 bg-amber-500/10 text-sm flex gap-2"><TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></Card>}

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="h-[560px] relative">
            {loading && !data && <div className="absolute inset-0 z-[1000] grid place-items-center bg-background/80"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>}
            <MapContainer center={mapCenter} zoom={location ? 8 : DEFAULT_ZOOM} className="h-full w-full" scrollWheelZoom>
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <div className="leaflet-top leaflet-right emergency-map-legend">
                <div className="rounded-lg border border-white/70 bg-white/95 p-2 shadow-lg backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/95">
                  <div className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Map Legend</div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    {[
                      ['fire', 'Wildfire'],
                      ['evacuation', 'Evacuation'],
                      ['shelter', 'Shelter'],
                      ['repeater', 'GMRS / HAM'],
                      ['earthquake', 'Earthquake'],
                      ['weather', 'Weather'],
                      ['water', 'Water Gauge'],
                      ['airQuality', 'Air Quality'],
                      ['satellite', 'Satellite Hotspot'],
                    ].map(([type, label]) => (
                      <div key={type} className="flex items-center gap-1.5 whitespace-nowrap text-[10px] text-slate-700 dark:text-slate-200">
                        <span className={'emergency-map-legend-dot emergency-map-icon-' + type} />
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {layers.fireHotspots && (
                <>
                  <WMSTileLayer
                    key={'satellite-noaa21-' + SATELLITE_HOTSPOT_DATE}
                    url="https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"
                    layers="VIIRS_NOAA21_Thermal_Anomalies_375m_All"
                    format="image/png"
                    transparent
                    opacity={1}
                    className="emergency-satellite-hotspots"
                    version="1.1.1"
                    params={{ TIME: SATELLITE_HOTSPOT_DATE, STYLES: 'default' }}
                    attribution="NASA GIBS / VIIRS"
                  />
                  <WMSTileLayer
                    key={'satellite-noaa20-' + SATELLITE_HOTSPOT_DATE}
                    url="https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"
                    layers="VIIRS_NOAA20_Thermal_Anomalies_375m_All"
                    format="image/png"
                    transparent
                    opacity={1}
                    className="emergency-satellite-hotspots"
                    version="1.1.1"
                    params={{ TIME: SATELLITE_HOTSPOT_DATE, STYLES: 'default' }}
                    attribution="NASA GIBS / VIIRS"
                  />
                  <WMSTileLayer
                    key={'satellite-snpp-' + SATELLITE_HOTSPOT_DATE}
                    url="https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"
                    layers="VIIRS_SNPP_Thermal_Anomalies_375m_All"
                    format="image/png"
                    transparent
                    opacity={1}
                    className="emergency-satellite-hotspots"
                    version="1.1.1"
                    params={{ TIME: SATELLITE_HOTSPOT_DATE, STYLES: 'default' }}
                    attribution="NASA GIBS / VIIRS"
                  />
                </>
              )}
              <FlyToLocation location={location} />
              {location && <Marker position={[location.lat, location.lng]} icon={mapIcon('location')}><Popup><strong>Your location</strong><br />Used only to center and filter nearby data.</Popup></Marker>}

              {layers.shelters && shelters.map((shelter) => (
                <Marker key={'shelter-' + shelter.id} position={[shelter.coordinates[1], shelter.coordinates[0]]} icon={mapIcon('shelter')}>
                  <Popup><strong>{shelter.name}</strong><br />{shelter.status}<br />{shelter.address}{shelter.city ? ', ' + shelter.city : ''}{shelter.state ? ', ' + shelter.state : ''}<br />{shelter.distance != null ? shelter.distance.toFixed(1) + ' mi away' : ''}</Popup>
                </Marker>
              ))}

              {layers.weatherStations && weatherStations.map((station) => (
                <Marker key={'weather-station-' + station.id} position={[station.coordinates[1], station.coordinates[0]]} icon={mapIcon('weather')}>
                  <Popup><strong>{station.name}</strong><br />{station.condition || 'Current observation'}{station.temperatureF != null ? <><br />Temperature: {station.temperatureF.toFixed(1)}°F</> : null}{station.humidity != null ? <><br />Humidity: {station.humidity.toFixed(0)}%</> : null}{station.windMph != null ? <><br />Wind: {station.windMph.toFixed(1)} mph</> : null}<br />Observed: {formatTime(station.observed) || 'Unknown'}{station.distance != null ? <><br />{station.distance.toFixed(0)} mi away</> : null}</Popup>
                </Marker>
              ))}

              {layers.water && waterGauges.map((gauge) => (
                <Marker key={'water-gauge-' + gauge.id} position={[gauge.coordinates[1], gauge.coordinates[0]]} icon={mapIcon('water')}>
                  <Popup><strong>{gauge.name}</strong><br />Gage height: {gauge.value.toFixed(2)} {gauge.unit}<br />Observed: {formatTime(gauge.observed) || 'Unknown'}{gauge.distance != null ? <><br />{gauge.distance.toFixed(0)} mi away</> : null}</Popup>
                </Marker>
              ))}

              {layers.fires && fireIncidents.map((fire) => {
                const [lng, lat] = fire.coordinates || [];
                return <Marker key={'fire-incident-' + fire.id} position={[lat, lng]} icon={mapIcon('fire')}>
                  <Popup><strong>{fire.name}</strong><br />{fire.acres ? Math.round(fire.acres).toLocaleString() + ' acres' : 'Active wildfire'}{fire.contained != null ? <><br />Contained: {fire.contained}%</> : null}{fire.city || fire.state ? <><br />{fire.city}{fire.city && fire.state ? ', ' : ''}{fire.state}</> : null}<br />Discovered: {formatTime(fire.discovered) || 'Unknown'}<br />Updated: {formatTime(fire.updated) || 'Unknown'}{fire.distance != null ? <><br />{fire.distance.toFixed(0)} mi away</> : null}</Popup>
                </Marker>;
              })}

              {layers.fires && firePerimeters.map((fire) => fire.geometry ? (
                <GeoJSON key={'fire-perimeter-' + fire.id} data={fire.geometry} style={() => ({ color: '#dc2626', weight: 2, fillColor: '#dc2626', fillOpacity: 0.14 })}>
                  <Popup><strong>{fire.name}</strong><br />{fire.acres ? Math.round(fire.acres).toLocaleString() + ' acres' : 'Active perimeter'}<br />{fire.category}<br />Updated: {formatTime(fire.currentDate) || 'Unknown'}</Popup>
                </GeoJSON>
              ) : null)}

              {layers.airQuality && airQuality.map((zone) => (
                <GeoJSON key={zone.id} data={zone.geometry} style={() => ({ ...airQualityStyle(zone.categoryCode), weight: 1.5 })}>
                  <Popup><strong>AirNow PM2.5 AQI zone</strong><br />Category: {airQualityCategory(zone.categoryCode)}<br />Updated: {formatTime(zone.timestamp) || 'Unknown'}<br />AirNow data is preliminary and not fully validated.</Popup>
                </GeoJSON>
              ))}

              {layers.evacuationWarnings && evacuationWarnings.map((alert) => {
                const geometry = alert.geometry;
                const coordinates = geometry?.type === 'Polygon'
                  ? geometry.coordinates?.[0]
                  : geometry?.type === 'MultiPolygon'
                    ? geometry.coordinates?.[0]?.[0]
                    : [];
                const center = Array.isArray(coordinates) && coordinates.length
                  ? coordinates.reduce((acc, point) => [acc[0] + Number(point[1] || 0), acc[1] + Number(point[0] || 0)], [0, 0]).map((value) => value / coordinates.length)
                  : null;
                const popup = (
                  <Popup><strong>{evacuationStatus(alert)}</strong><br />{alertTitle(alert)}<br />{alert.area}<br />Issued: {formatTime(alert.effective) || 'Unknown'}<br />Expires: {formatTime(alert.expires) || 'Unknown'}<br />Source: National Weather Service active alert feed.</Popup>
                );
                return (
                  <React.Fragment key={'evacuation-' + alert.id}>
                    <GeoJSON data={geometry} style={() => ({ ...evacuationStyle(alert), weight: 3, fillOpacity: 0.22 })} eventHandlers={{ click: () => setSelectedAlert(alert) }}>
                      {popup}
                    </GeoJSON>
                    {center && <CircleMarker center={center} radius={8} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }} eventHandlers={{ click: () => setSelectedAlert(alert) }}>
                      {popup}
                    </CircleMarker>}
                  </React.Fragment>
                );
              })}

              {layers.alerts && activeAlerts.map((alert) => alert.geometry ? (
                <GeoJSON key={alert.id} data={alert.geometry} style={() => ({ color: String(alert.severity).toLowerCase() === 'extreme' ? '#dc2626' : '#f59e0b', weight: 2, fillOpacity: 0.12 })} eventHandlers={{ click: () => setSelectedAlert(alert) }} />
              ) : null)}

              {layers.earthquakes && earthquakes.map((q) => {
                const [lng, lat] = q.coordinates || [];
                const radiusPx = Math.max(5, Math.min(18, 5 + Number(q.magnitude || 0) * 2));
                return <Marker key={q.id} position={[lat, lng]} icon={mapIcon('earthquake')}>
                  <Popup><strong>M{Number(q.magnitude).toFixed(1)} earthquake</strong><br />{q.place}<br />Time: {formatTime(q.time) || 'Unknown'}<br />{q.updated ? <>Updated: {formatTime(q.updated)}<br /></> : null}{q.distance != null ? <>{q.distance.toFixed(0)} mi away</> : null}</Popup>
                </Marker>;
              })}

              {layers.repeaters && repeaters.map((r) => (
                <Marker key={r.id} position={[r.lat, r.lng]} icon={mapIcon('repeater')}>
                  <Popup><strong>{r.callsign || r.name}</strong><br />{r.service} · {r.city}{r.state ? ', ' + r.state : ''}<br />{r.frequency ? 'Frequency: ' + r.frequency : ''}<br />{r.distance != null ? r.distance.toFixed(0) + ' mi away' : ''}</Popup>
                </Marker>
              ))}
            </MapContainer>
            </div>
          </Card>

          <Card className="p-4">
            <button type="button" onClick={() => setStatsOpen((v) => !v)} className="w-full flex items-center justify-between text-left">
              <span className="font-heading font-semibold">Stats</span>
              <span className="text-xs text-muted-foreground">{statsOpen ? 'Hide' : 'Show'}</span>
            </button>
            {statsOpen && <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">Active Alerts</div><div className="text-xl font-heading font-bold mt-1">{activeAlerts.length}</div></div>
                <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">Earthquakes</div><div className="text-xl font-heading font-bold mt-1">{earthquakes.length}</div></div>
                <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">Repeaters</div><div className="text-xl font-heading font-bold mt-1">{repeaters.length}</div></div>
                <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">Wildfires</div><div className="text-xl font-heading font-bold mt-1">{fireIncidents.length || firePerimeters.length}</div></div>
                <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">Shelters</div><div className="text-xl font-heading font-bold mt-1">{shelters.length}</div></div>
                <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">Weather Stations</div><div className="text-xl font-heading font-bold mt-1">{weatherStations.length}</div></div>
                <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">Water Gauges</div><div className="text-xl font-heading font-bold mt-1">{waterGauges.length}</div></div>
                <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">AQ Zones</div><div className="text-xl font-heading font-bold mt-1">{airQuality.length}</div></div>
                <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">Evacuations</div><div className="text-xl font-heading font-bold mt-1">{evacuationWarnings.length}</div></div>
                <div className="rounded-lg border p-3 col-span-2"><div className="text-[11px] text-muted-foreground">Data Updated</div><div className="text-sm font-medium mt-1">{data?.generatedAt ? formatTime(data.generatedAt) : 'Loading…'}</div></div>
              </div>}
          </Card>
        </div>

        {selectedAlert && (
          <Card className={'p-4 ' + severityClass(selectedAlert.severity)}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><div className="font-heading font-semibold">{alertTitle(selectedAlert)}</div><div className="text-xs text-muted-foreground">{selectedAlert.severity || 'Unknown'} · {selectedAlert.area}</div></div>
                  <Button size="icon" variant="ghost" onClick={() => setSelectedAlert(null)}><X className="w-4 h-4" /></Button>
                </div>
                {selectedAlert.headline && <p className="text-sm mt-2">{selectedAlert.headline}</p>}
                <p className="text-xs text-muted-foreground mt-2">{selectedAlert.description}</p>
                <div className="text-xs text-muted-foreground mt-2">Issued: {formatTime(selectedAlert.effective) || 'Unknown'} · Expires: {formatTime(selectedAlert.expires) || 'Unknown'}</div>
              </div>
            </div>
          </Card>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 font-heading font-semibold"><Bell className="w-4 h-4" /> Active Weather Alerts</div>
            <div className="space-y-2 mt-3 max-h-[420px] overflow-auto">
              {activeAlerts.length === 0 ? <p className="text-sm text-muted-foreground">No active NWS alerts returned.</p> : activeAlerts.slice(0, 40).map((alert) => (
                <button key={alert.id} type="button" onClick={() => setSelectedAlert(alert)} className={'w-full text-left rounded-lg border p-3 ' + severityClass(alert.severity) + ' hover:border-primary/50 transition'}>
                  <div className="flex items-start gap-2"><CircleAlert className="w-4 h-4 shrink-0 mt-0.5" /><div className="min-w-0"><div className="font-medium text-sm">{alertTitle(alert)}</div><div className="text-xs text-muted-foreground mt-0.5">{alert.area}</div><div className="text-[11px] text-muted-foreground mt-1">Issued: {formatTime(alert.effective) || 'unknown'} · expires {formatTime(alert.expires) || 'unknown'}</div></div></div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 font-heading font-semibold"><ShieldAlert className="w-4 h-4" /> Active Wildfires</div>
            <div className="space-y-2 mt-3 max-h-[420px] overflow-auto">
              {fireIncidents.length === 0 && firePerimeters.length === 0 ? <p className="text-sm text-muted-foreground">No active NIFC wildfires returned.</p> :
                <>
                  {fireIncidents.slice(0, 40).map((fire) => (
                    <div key={'fire-list-' + fire.id} className="rounded-lg border p-3">
                      <div className="font-medium text-sm">{fire.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{fire.acres ? Math.round(fire.acres).toLocaleString() + ' acres' : 'Active wildfire'}{fire.contained != null ? ' · ' + fire.contained + '% contained' : ''}{fire.city || fire.state ? ' · ' + [fire.city, fire.state].filter(Boolean).join(', ') : ''}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">Discovered: {formatTime(fire.discovered) || 'Unknown'} · Updated: {formatTime(fire.updated) || 'Unknown'}</div>
                    </div>
                  ))}
                  {firePerimeters.slice(0, 20).map((fire) => (
                    <div key={'fire-perimeter-list-' + fire.id} className="rounded-lg border p-3">
                      <div className="font-medium text-sm">{fire.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{fire.acres ? Math.round(fire.acres).toLocaleString() + ' acres' : 'Active perimeter'} · {fire.category}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">Perimeter updated: {formatTime(fire.currentDate) || 'Unknown'}</div>
                    </div>
                  ))}
                </>}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 font-heading font-semibold"><CloudSun className="w-4 h-4" /> Nearby Weather Stations</div>
            <div className="space-y-2 mt-3 max-h-[420px] overflow-auto">
              {weatherStations.length === 0 ? <p className="text-sm text-muted-foreground">No recent NWS station observations returned.</p> : weatherStations.slice(0, 40).map((s) => (
                <div key={s.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2"><strong className="text-sm">{s.name}</strong><span className="text-[10px] font-semibold rounded bg-muted px-1.5 py-0.5">NWS</span></div>
                  <div className="text-xs text-muted-foreground mt-1">{s.condition || 'Current observation'}{s.temperatureF != null ? ' · ' + s.temperatureF.toFixed(1) + '°F' : ''}{s.humidity != null ? ' · ' + s.humidity.toFixed(0) + '% RH' : ''}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Observed: {formatTime(s.observed) || 'Unknown'}{s.distance != null ? ' · ' + s.distance.toFixed(1) + ' mi' : ''}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 font-heading font-semibold"><Droplets className="w-4 h-4" /> Nearby Water Gauges</div>
            <div className="space-y-2 mt-3 max-h-[420px] overflow-auto">
              {waterGauges.length === 0 ? <p className="text-sm text-muted-foreground">No recent USGS water-gauge observations returned.</p> : waterGauges.slice(0, 40).map((g) => (
                <div key={g.id} className="rounded-lg border p-3">
                  <div className="font-medium text-sm">{g.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">Gage height: {g.value.toFixed(2)} {g.unit}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Observed: {formatTime(g.observed) || 'Unknown'}{g.distance != null ? ' · ' + g.distance.toFixed(1) + ' mi' : ''}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 font-heading font-semibold"><TriangleAlert className="w-4 h-4" /> Evacuation Warnings / Orders</div>
            <div className="space-y-2 mt-3 max-h-[420px] overflow-auto">
              {evacuationWarnings.length === 0 ? <p className="text-sm text-muted-foreground">No current evacuation warning/order polygons were identified in the active alert feed.</p> : evacuationWarnings.slice(0, 40).map((alert) => (
                <button key={'evacuation-list-' + alert.id} type="button" onClick={() => setSelectedAlert(alert)} className="w-full text-left rounded-lg border p-3 hover:border-primary/50 transition">
                  <div className="font-medium text-sm">{evacuationStatus(alert)} · {alertTitle(alert)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{alert.area}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Issued: {formatTime(alert.effective) || 'Unknown'} · Expires: {formatTime(alert.expires) || 'Unknown'}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">This layer surfaces evacuation-related polygons already present in the active official alert feed. It is not a nationwide static evacuation-zone database; local authorities may publish evacuation information through other channels.</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 font-heading font-semibold"><ShieldAlert className="w-4 h-4" /> Satellite Fire Hotspots</div>
            <div className="space-y-2 mt-3">
              <p className="text-sm text-muted-foreground">VIIRS NOAA-21 + NOAA-20 satellite thermal-anomaly imagery from NASA GIBS. The layer uses an explicit recent satellite date so hotspot tiles render correctly.</p>
              <p className="text-xs text-muted-foreground">Satellite detections can represent fire, hot smoke, agriculture, or other thermal sources and should be treated as situational-awareness data rather than a confirmed incident.</p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 font-heading font-semibold"><Wind className="w-4 h-4" /> Air Quality / Smoke</div>
            <div className="space-y-2 mt-3">
              {airQuality.length === 0 ? <p className="text-sm text-muted-foreground">No current AirNow PM2.5 AQI contour data returned.</p> : (
                <>
                  <p className="text-sm text-muted-foreground">Current PM2.5 AQI contour coverage from EPA AirNow. Categories are approximate map zones, not individual monitor readings.</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    {[1, 2, 3, 4, 5, 6].map((code) => (
                      <div key={code} className="rounded border p-2"><span className="font-medium">{airQualityCategory(code)}</span><div className="text-muted-foreground">{airQuality.filter((z) => z.categoryCode === code).length} zones</div></div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 font-heading font-semibold"><RadioTower className="w-4 h-4" /> Nearby Radio Infrastructure</div>
            <div className="space-y-2 mt-3 max-h-[420px] overflow-auto">
              {!location ? <p className="text-sm text-muted-foreground">Use Find My Location to see repeaters sorted by distance.</p> :
                repeaters.length === 0 ? <p className="text-sm text-muted-foreground">No mapped repeaters found within {radius} miles.</p> :
                repeaters.slice(0, 40).map((r) => (
                  <div key={r.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2"><strong className="text-sm">{r.callsign || r.name}</strong><span className="text-[10px] font-semibold rounded bg-muted px-1.5 py-0.5">{r.service}</span></div>
                    <div className="text-xs text-muted-foreground mt-1">{r.city}{r.state ? ', ' + r.state : ''} · {r.distance.toFixed(1)} mi</div>
                    {r.frequency && <div className="text-xs mt-1">Frequency: {r.frequency}{r.tone ? ' · Tone: ' + r.tone : ''}</div>}
                  </div>
                ))}
            </div>
          </Card>
        </div>

        <Card className="p-4 text-xs text-muted-foreground">
          <div className="font-medium text-foreground mb-1">Data sources</div>
          <div>Weather alerts/stations and evacuation-related alert polygons: National Weather Service · Earthquakes/water gauges: USGS · Air quality: EPA AirNow PM2.5 AQI contours · Satellite fire hotspots: NASA GIBS / VIIRS · Wildfires: NIFC WFIGS current incidents/perimeters · Shelters: FEMA ESF6 · Radio infrastructure: Repeater Nation.</div>
          <div className="mt-1">Evacuation coverage is derived from current official alert polygons and should not be interpreted as complete nationwide evacuation-zone coverage.</div>
          <div className="mt-1">Map icon assets can use Flaticon resources where appropriate; free Flaticon assets require visible attribution to the author, while Premium removes that attribution requirement.</div>
          <div className="mt-1">This page is an informational situational-awareness tool. Always verify emergency information with official local authorities.</div>
        </Card>
      </div>
    </ToolShell>
  );
}
