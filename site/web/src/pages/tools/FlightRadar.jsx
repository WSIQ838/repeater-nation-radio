import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  Activity,
  LocateFixed,
  MapPin,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  RefreshCw,
  Route,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
  ZoomIn,
} from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [39.5, -98.35];
const DEFAULT_ZOOM = 4;
const RELAY_BASE = 'https://hello-http.val.run/v2/point';
// ADSB.lol's own public API, used as a fallback when the relay above is
// unavailable -- same /v2/point/{lat}/{lon}/{radius} path the relay proxies.
const DIRECT_BASE = 'https://api.adsb.lol/v2/point';
const REFRESH_MS = 2000;
const SEARCH_LIMIT = 250;

const RANGE_OPTIONS = [25, 50, 100, 150, 250];

const metersToFeet = (meters) =>
  Number.isFinite(meters) ? Math.round(meters * 3.28084) : null;

const knots = (value) =>
  Number.isFinite(value) ? Math.round(value * 1.94384) : null;

const cleanText = (value) =>
  typeof value === 'string' ? value.trim() : '';

const normalizeAircraft = (raw) => ({
  icao24: cleanText(raw?.hex).toLowerCase(),
  callsign: cleanText(raw?.flight),
  registration: cleanText(raw?.r),
  aircraftType: cleanText(raw?.t),
  aircraftDescription: cleanText(raw?.desc),
  airline: cleanText(raw?.ownOp || raw?.op),
  airlineIcao: cleanText(raw?.ownOpIcao || raw?.opIcao),
  departureAirport: cleanText(raw?.route?.from || raw?.from),
  arrivalAirport: cleanText(raw?.route?.to || raw?.to),
  route: cleanText(raw?.route?.name || raw?.route),
  originCountry: cleanText(raw?.cou),
  latitude: Number(raw?.lat),
  longitude: Number(raw?.lon),
  altitudeM: Number.isFinite(raw?.alt_baro) && raw.alt_baro !== 'ground'
    ? Number(raw.alt_baro) * 0.3048
    : null,
  geoAltitudeM: Number.isFinite(raw?.alt_geom)
    ? Number(raw.alt_geom) * 0.3048
    : null,
  speedMps: Number.isFinite(raw?.gs) ? Number(raw.gs) * 0.514444 : null,
  heading: Number.isFinite(raw?.track) ? Number(raw.track) : null,
  verticalRateMps: Number.isFinite(raw?.bar_vr) ? Number(raw.bar_vr) * 0.00508 : null,
  onGround: raw?.alt_baro === 'ground' || Boolean(raw?.ground),
  squawk: cleanText(raw?.squawk),
  category: cleanText(raw?.category),
  lastContact: Number.isFinite(raw?.now) ? Number(raw.now) : Math.floor(Date.now() / 1000),
});

function makeAircraftIcon(heading, selected) {
  const rotation = Number.isFinite(heading) ? heading : 0;
  const fill = selected ? 'hsl(var(--primary))' : '#172033';

  return L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `
      <div style="width:34px;height:34px;display:grid;place-items:center;transform:translate(-50%,-50%) rotate(${rotation}deg);filter:drop-shadow(0 2px 4px rgba(0,0,0,.42));">
        <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2 15 10l6 2v2l-6 1.25V21h-2l-1-5.75L6 14v-2l6-2z"
            fill="${fill}" stroke="#fff" stroke-width="1.25" stroke-linejoin="round"/>
        </svg>
      </div>
    `,
  });
}

function MapViewport({ onViewportChange }) {
  const map = useMapEvents({
    moveend: () => onViewportChange(map),
    zoomend: () => onViewportChange(map),
  });

  useEffect(() => {
    onViewportChange(map);
  }, [map, onViewportChange]);

  return null;
}

function MapCommand({ target, setTarget }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    map.flyTo(target.center, target.zoom, { duration: 0.8 });
    setTarget(null);
  }, [map, target, setTarget]);

  return null;
}

function MapSizeFix() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [map]);

  return null;
}

function ageLabel(timestamp) {
  if (!timestamp) return 'Unknown';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function profileLocationLabel(profile, user) {
  const cityState = [profile?.city, profile?.state].filter(Boolean).join(', ');
  return cityState || cleanText(profile?.location) || cleanText(user?.location);
}

async function geocodeLocation(location) {
  if (!location) return null;

  const params = new URLSearchParams({
    q: location,
    format: 'json',
    limit: '1',
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) throw new Error('Could not locate your profile area.');
  const results = await response.json();
  const first = results?.[0];

  if (!first) throw new Error('Your saved profile location could not be found on the map.');

  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    label: first.display_name || location,
  };
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right break-words max-w-[65%]">{value || '—'}</strong>
    </div>
  );
}

function AircraftPopup({ aircraft }) {
  const title = aircraft.callsign || aircraft.registration || aircraft.icao24.toUpperCase();

  return (
    <div className="w-[250px] text-sm">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
          <Plane className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold truncate">{title}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {aircraft.airline || aircraft.originCountry || 'Live ADS-B traffic'}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <DetailRow label="Aircraft" value={aircraft.aircraftDescription || aircraft.aircraftType} />
        <DetailRow label="Registration" value={aircraft.registration} />
        <DetailRow label="Operator" value={aircraft.airline} />
        <DetailRow label="Altitude" value={metersToFeet(aircraft.altitudeM) != null ? `${metersToFeet(aircraft.altitudeM).toLocaleString()} ft` : null} />
        <DetailRow label="Speed" value={knots(aircraft.speedMps) != null ? `${knots(aircraft.speedMps)} kt` : null} />
        <DetailRow label="Heading" value={Number.isFinite(aircraft.heading) ? `${Math.round(aircraft.heading)}°` : null} />
        <DetailRow label="Status" value={aircraft.onGround ? 'On ground' : 'Airborne'} />
        <DetailRow label="Squawk" value={aircraft.squawk} />
      </div>

      {(aircraft.departureAirport || aircraft.arrivalAirport || aircraft.route) && (
        <div className="mt-3 rounded-lg bg-muted/70 p-2.5 space-y-2">
          {aircraft.route && (
            <div className="font-medium flex items-center gap-1.5 text-xs">
              <Route className="w-3.5 h-3.5" />
              {aircraft.route}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <PlaneTakeoff className="w-3 h-3" /> Departure
              </div>
              <div className="font-medium text-xs mt-0.5">{aircraft.departureAirport || '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <PlaneLanding className="w-3 h-3" /> Arrival
              </div>
              <div className="font-medium text-xs mt-0.5">{aircraft.arrivalAirport || '—'}</div>
            </div>
          </div>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground mt-3">
        ICAO24 {aircraft.icao24.toUpperCase()} · {ageLabel(aircraft.lastContact)}
      </div>
    </div>
  );
}

export default function FlightRadar() {
  const [aircraft, setAircraft] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [rangeNm, setRangeNm] = useState(100);
  const [airborneOnly, setAirborneOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [profileArea, setProfileArea] = useState('');
  const [profileTarget, setProfileTarget] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  const [profileReady, setProfileReady] = useState(false);

  const requestRef = useRef(null);
  const viewportRef = useRef({
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
  });
  const refreshTimerRef = useRef(null);

  const updateViewport = useCallback((map) => {
    viewportRef.current = {
      center: [map.getCenter().lat, map.getCenter().lng],
      zoom: map.getZoom(),
    };
    setMapCenter(viewportRef.current.center);
    setMapZoom(viewportRef.current.zoom);
  }, []);

  const loadAircraft = useCallback(async (manual = false) => {
    if (requestRef.current) return;

    if (manual) setRefreshing(true);
    else setLoading(true);

    setError('');
    requestRef.current = true;

    const [lat, lon] = viewportRef.current.center;
    const url = `${RELAY_BASE}/${lat.toFixed(4)}/${lon.toFixed(4)}/${rangeNm}`;

    try {
      let response = null;
      let data = null;
      let usedSource = 'ADSB.lol relay';

      try {
        response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error(`relay-${response.status}`);
        data = await response.json();
      } catch {
        const directUrl = `${DIRECT_BASE}/${lat.toFixed(4)}/${lon.toFixed(4)}/${rangeNm}`;
        response = await fetch(directUrl, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`feed-${response.status}`);
        data = await response.json();
        usedSource = 'ADSB.lol direct';
      }

      const rows = (Array.isArray(data?.ac) ? data.ac : [])
        .map(normalizeAircraft)
        .filter((a) =>
          a.icao24 &&
          Number.isFinite(a.latitude) &&
          Number.isFinite(a.longitude)
        );

      setAircraft(rows);
      setSource(usedSource);
      setLastUpdated(new Date());
    } catch (e) {
      setError('The live flight feed is temporarily unavailable. Try Refresh again in a moment.');
      setSource('');
    } finally {
      requestRef.current = null;
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeNm]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const me = await base44.auth.me();
        if (!active || !me) return;

        const profiles = await base44.entities.Profile.filter(
          { created_by_id: me.id },
          '-updated_date',
          1
        );

        if (!active) return;

        const profile = profiles?.[0];
        const savedLocation = profileLocationLabel(profile, me);

        if (!savedLocation) {
          setProfileReady(true);
          return;
        }

        setProfileArea(savedLocation);

        try {
          const place = await geocodeLocation(savedLocation);
          if (!active) return;

          const center = [place.lat, place.lon];
          setMapCenter(center);
          setProfileArea(savedLocation);
          viewportRef.current = { center, zoom: 8 };
          setProfileTarget({ center, zoom: 8 });
        } catch {
          // Keep the normal U.S. view when the saved profile area cannot be geocoded.
        }
      } catch {
        // Flight Radar is public; profile lookup is an enhancement only.
      } finally {
        if (active) setProfileReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profileReady) return undefined;
    loadAircraft();
    const timer = window.setInterval(() => { if (!document.hidden) loadAircraft(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadAircraft, profileReady]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const handleViewportChange = useCallback((map) => {
    updateViewport(map);

    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      loadAircraft();
    }, 700);
  }, [loadAircraft, updateViewport]);

  const centerOnProfile = useCallback(() => {
    if (!profileTarget) {
      setError(profileArea ? 'Your saved profile location could not be mapped.' : 'Add a general location to your profile first.');
      return;
    }

    setProfileTarget(profileTarget);
  }, [profileArea, profileTarget]);

  const visibleAircraft = useMemo(() => {
    const query = search.trim().toLowerCase();

    return aircraft
      .filter((a) => !airborneOnly || !a.onGround)
      .filter((a) => {
        if (!query) return true;
        return [
          a.callsign,
          a.registration,
          a.icao24,
          a.airline,
          a.aircraftType,
          a.aircraftDescription,
          a.originCountry,
          a.route,
          a.departureAirport,
          a.arrivalAirport,
        ].some((field) => field?.toLowerCase().includes(query));
      })
      .slice(0, SEARCH_LIMIT);
  }, [aircraft, airborneOnly, search]);

  const selectedAircraft = selectedId
    ? aircraft.find((a) => a.icao24 === selectedId)
    : null;

  const mapStatus = loading
    ? 'Loading live traffic…'
    : refreshing
      ? 'Updating…'
      : `${visibleAircraft.length.toLocaleString()} shown`;

  return (
    <ToolShell
      title="Flight Radar"
      description="Live ADS-B aircraft traffic with map-based filtering and member-location centering."
      icon={Plane}
      disclaimer={false}
    >
      <div className="space-y-3">
        <Card className="overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-border">
            <div className="flex flex-col xl:flex-row xl:items-center gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-10"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search callsign, registration, airline, type, ICAO24…"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-input bg-background p-1">
                  {RANGE_OPTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRangeNm(value)}
                      className={`h-8 px-2.5 rounded-md text-xs font-medium transition-colors ${rangeNm === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                    >
                      {value} NM
                    </button>
                  ))}
                </div>

                <Button
                  type="button"
                  variant={airborneOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAirborneOnly((value) => !value)}
                  className="gap-1.5"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Airborne
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => loadAircraft(true)}
                  disabled={refreshing}
                  className="gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                {mapStatus}
              </span>
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 bg-destructive/5 border-b border-destructive/20 text-sm text-destructive flex items-start gap-3">
              <div className="min-w-0 flex-1">{error}</div>
              <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="relative">
            <div className="h-[72vh] min-h-[560px]">
              <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                minZoom={2}
                maxZoom={13}
                className="h-full w-full"
                scrollWheelZoom
              >
                <MapSizeFix />
                <MapViewport onViewportChange={handleViewportChange} />
                <MapCommand target={profileTarget} setTarget={setProfileTarget} />
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                  maxZoom={19}
                />

                {visibleAircraft.map((a) => (
                  <Marker
                    key={a.icao24}
                    position={[a.latitude, a.longitude]}
                    icon={makeAircraftIcon(a.heading, selectedId === a.icao24)}
                    eventHandlers={{
                      click: () => setSelectedId(a.icao24),
                    }}
                  >
                    <Popup>
                      <AircraftPopup aircraft={a} />
                    </Popup>
                  </Marker>
                ))}

                {selectedAircraft && (
                  <Marker
                    position={[selectedAircraft.latitude, selectedAircraft.longitude]}
                    opacity={0}
                  />
                )}
              </MapContainer>
            </div>

            <div className="absolute left-3 top-3 z-[500] flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={centerOnProfile}
                disabled={!profileArea}
                className="shadow-md bg-background/95 backdrop-blur gap-1.5"
                title={profileArea ? `Center on ${profileArea}` : 'Add a profile location first'}
              >
                <UserRound className="w-3.5 h-3.5" />
                My Area
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setProfileTarget({
                  center: DEFAULT_CENTER,
                  zoom: DEFAULT_ZOOM,
                })}
                className="shadow-md bg-background/95 backdrop-blur gap-1.5"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                U.S. View
              </Button>
            </div>

            <div className="absolute right-3 top-3 z-[500] hidden md:block">
              <Card className="px-3 py-2 shadow-md bg-background/95 backdrop-blur">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Range</div>
                <div className="font-semibold text-sm">{rangeNm} nautical miles</div>
              </Card>
            </div>

            {selectedAircraft && (
              <Card className="absolute left-3 bottom-3 z-[500] w-[min(360px,calc(100%-24px))] p-3 shadow-lg bg-background/95 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{selectedAircraft.onGround ? 'Ground' : 'Airborne'}</Badge>
                      <span className="font-semibold truncate">
                        {selectedAircraft.callsign || selectedAircraft.registration || selectedAircraft.icao24.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {selectedAircraft.aircraftDescription || selectedAircraft.aircraftType || 'Aircraft details unavailable'}
                      {selectedAircraft.airline ? ` · ${selectedAircraft.airline}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId('')}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Close aircraft details"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
                  <DetailRow
                    label="Altitude"
                    value={metersToFeet(selectedAircraft.altitudeM) != null ? `${metersToFeet(selectedAircraft.altitudeM).toLocaleString()} ft` : null}
                  />
                  <DetailRow
                    label="Speed"
                    value={knots(selectedAircraft.speedMps) != null ? `${knots(selectedAircraft.speedMps)} kt` : null}
                  />
                  <DetailRow
                    label="Heading"
                    value={Number.isFinite(selectedAircraft.heading) ? `${Math.round(selectedAircraft.heading)}°` : null}
                  />
                  <DetailRow label="Registration" value={selectedAircraft.registration} />
                </div>

                {(selectedAircraft.departureAirport || selectedAircraft.arrivalAirport || selectedAircraft.route) && (
                  <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                    <DetailRow label="Route" value={selectedAircraft.route} />
                    <DetailRow label="Departure" value={selectedAircraft.departureAirport} />
                    <DetailRow label="Arrival" value={selectedAircraft.arrivalAirport} />
                  </div>
                )}
              </Card>
            )}
          </div>
        </Card>

        <div className="grid lg:grid-cols-[1fr_360px] gap-3">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-heading font-semibold">Flight list</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Showing up to {SEARCH_LIMIT.toLocaleString()} matching aircraft inside the current {rangeNm} NM scan.
                </div>
              </div>
            </div>

            <div className="mt-3 max-h-[320px] overflow-y-auto divide-y divide-border border border-border rounded-lg">
              {visibleAircraft.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {loading ? 'Loading aircraft…' : 'No aircraft match the current search/filter.'}
                </div>
              ) : (
                visibleAircraft.map((a) => (
                  <button
                    key={a.icao24}
                    type="button"
                    onClick={() => setSelectedId(a.icao24)}
                    className={`w-full text-left p-3 hover:bg-muted/60 transition-colors ${selectedId === a.icao24 ? 'bg-primary/5' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-muted grid place-items-center shrink-0">
                        <Plane className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {a.callsign || a.registration || a.icao24.toUpperCase()}
                          </span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                            {a.onGround ? 'GROUND' : 'AIR'}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {[a.airline, a.aircraftType, a.registration].filter(Boolean).join(' · ') || 'ADS-B traffic'}
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground shrink-0">
                        <div>{knots(a.speedMps) != null ? `${knots(a.speedMps)} kt` : '—'}</div>
                        <div>{metersToFeet(a.altitudeM) != null ? `${Math.round(metersToFeet(a.altitudeM) / 1000)}k ft` : '—'}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div>
              <div className="font-heading font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Member location
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                The radar starts from your saved profile location instead of using browser GPS.
              </div>
              {profileArea ? (
                <div className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  {profileArea}
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  No general profile location saved.
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 gap-1.5"
                onClick={centerOnProfile}
                disabled={!profileArea}
              >
                <LocateFixed className="w-3.5 h-3.5" />
                Center on my area
              </Button>
            </div>

            <div className="border-t border-border pt-4">
              <div className="font-heading font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Live feed
              </div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Traffic refreshes every 30 seconds and again after you move or zoom the map. Aircraft are read from the live ADS-B feed available through the radar relay.
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="font-heading font-semibold">Flight details</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Callsign, aircraft type, registration, operator, altitude, speed, heading, and squawk are shown when supplied by the live feed. Departure, arrival, and route fields appear only when the source provides them.
              </div>
            </div>

            <div className="border-t border-border pt-4 text-[11px] text-muted-foreground leading-relaxed">
              Data source: ADSB.lol open flight data. Map: OpenStreetMap. The relay is used to keep browser requests compatible with the public feed.
            </div>
          </Card>
        </div>
      </div>
    </ToolShell>
  );
}
