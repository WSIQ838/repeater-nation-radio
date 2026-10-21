import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { shouldThrottle } from '../../shared/ipThrottle.ts';

const headers = {
  'User-Agent': 'RepeaterNation/1.0 (https://repeaternation.com)',
  'Accept': 'application/geo+json, application/json',
};

async function fetchJson(url: string) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error('Upstream ' + response.status);
  return response.json();
}

function isFreshWithin24Hours(value: any) {
  if (value == null || value === '') return false;
  const raw = Number(value);
  const timestamp = Number.isFinite(raw)
    ? (raw < 1e12 ? raw * 1000 : raw)
    : Date.parse(String(value));
  const age = Date.now() - timestamp;
  return Number.isFinite(age) && age >= 0 && age <= 24 * 60 * 60 * 1000;
}

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (v: number) => v * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function geometryNearCenter(geometry: any, lat: number, lng: number, radiusMiles: number) {
  if (!geometry || !Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  const coordinates: number[][] = [];
  const collect = (value: any) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      coordinates.push([Number(value[0]), Number(value[1])]);
      return;
    }
    value.forEach(collect);
  };
  if (geometry.type === 'GeometryCollection') (geometry.geometries || []).forEach((g: any) => collect(g?.coordinates));
  else collect(geometry.coordinates);
  if (!coordinates.length) return false;
  if (coordinates.some(([x, y]) => haversineMiles(lat, lng, y, x) <= radiusMiles)) return true;
  const lats = coordinates.map(([, y]) => y);
  const lngs = coordinates.map(([x]) => x);
  const latPad = radiusMiles / 69;
  const lngPad = radiusMiles / Math.max(1, 69 * Math.cos(lat * Math.PI / 180));
  return Math.max(...lats) >= lat - latPad && Math.min(...lats) <= lat + latPad
    && Math.max(...lngs) >= lng - lngPad && Math.min(...lngs) <= lng + lngPad;
}

// The Emergency page refreshes every minute, but repeaters barely change:
// keep each area's list for 10 minutes per instance (two reads of up to 500
// rows each otherwise, on every refresh from every open page).
const REPEATER_TTL_MS = 10 * 60 * 1000;
const repeaterCache = new Map<string, { at: number; rows: any[] }>();

async function listNearbyRepeatersCached(entity: any, lat: number, lng: number, radiusMiles: number) {
  const key = `${Number.isFinite(lat) ? lat.toFixed(2) : 'x'},${Number.isFinite(lng) ? lng.toFixed(2) : 'x'},${radiusMiles}`;
  const hit = repeaterCache.get(key);
  if (hit && Date.now() - hit.at < REPEATER_TTL_MS) return hit.rows;
  const rows = await listNearbyRepeaters(entity, lat, lng, radiusMiles);
  if (repeaterCache.size > 200) repeaterCache.clear();
  repeaterCache.set(key, { at: Date.now(), rows });
  return rows;
}

async function listNearbyRepeaters(entity: any, lat: number, lng: number, radiusMiles: number) {
  const latPad = radiusMiles / 69;
  const lngPad = radiusMiles / Math.max(1, 69 * Math.cos(lat * Math.PI / 180));
  const hasCenter = Number.isFinite(lat) && Number.isFinite(lng);
  const bounds = hasCenter ? {
    lat: { $gte: lat - latPad, $lte: lat + latPad },
    lng: { $gte: lng - lngPad, $lte: lng + lngPad },
  } : {};
  const pageSize = 500;
  const [gmrs, ham] = await Promise.all([
    entity.filter({ radio_service: { $in: ['GMRS', null, ''] }, ...bounds }, '-updated_date', pageSize, 0),
    entity.filter({ radio_service: 'HAM', ...bounds }, '-updated_date', pageSize, 0),
  ]);
  return [...(gmrs || []), ...(ham || [])]
    .filter((r: any) => r?.hidden !== true && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)));
}

async function fetchFirePerimeters() {
  const data = await fetchJson('https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?where=1%3D1&outFields=IncidentName%2CGISAcres%2CFeatureCategory%2CCurrentDateAge%2CIRWINID%2CUnitID%2CCurrentDate&returnGeometry=true&outSR=4326&f=geojson&resultRecordCount=2000');
  return (data?.features || []).filter((f: any) => f?.geometry);
}

async function fetchFireIncidents() {
  const where = encodeURIComponent("IncidentTypeCategory='WF'");
  const outFields = encodeURIComponent('OBJECTID,IncidentName,IncidentTypeCategory,IncidentSize,DiscoveryAcres,IrwinID,PercentContained,POOCity,POOState,FireDiscoveryDateTime,ModifiedOnDateTime_dt');
  const url = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query?where=' + where + '&outFields=' + outFields + '&returnGeometry=true&outSR=4326&f=geojson&resultRecordCount=2000';
  const data = await fetchJson(url);
  return (data?.features || []).filter((f: any) => Array.isArray(f?.geometry?.coordinates));
}

async function fetchOpenShelters() {
  const data = await fetchJson('https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0/query?where=1%3D1&outFields=shelter_id%2Cshelter_name%2Caddress%2Ccity%2Cstate%2Czip%2Cshelter_status%2Cevacuation_capacity%2Cpet_accommodations_code%2Cwheelchair_accessible%2Corg_name%2Chours_open%2Chours_close&returnGeometry=true&outSR=4326&f=geojson&resultRecordCount=2000');
  return data?.features || [];
}

async function fetchWeatherStations(lat: number, lng: number, radiusMiles: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const point = await fetchJson('https://api.weather.gov/points/' + encodeURIComponent(lat + ',' + lng));
  const stationsUrl = point?.properties?.observationStations;
  if (!stationsUrl) throw new Error('NWS observation station endpoint unavailable');
  const data = await fetchJson(String(stationsUrl) + (String(stationsUrl).includes('?') ? '&' : '?') + 'limit=50');
  const stations = (data?.features || []).filter((station: any) => Array.isArray(station?.geometry?.coordinates)).slice(0, 24);
  const observations = await Promise.allSettled(stations.map(async (station: any) => {
    const id = station?.properties?.stationIdentifier;
    if (!id) return { station, observation: null };
    try {
      const obs = await fetchJson('https://api.weather.gov/stations/' + encodeURIComponent(id) + '/observations/latest');
      return { station, observation: obs };
    } catch {
      return { station, observation: null };
    }
  }));
  return observations
    .filter((r: any) => r.status === 'fulfilled' && r.value)
    .map((r: any) => r.value)
    .filter((row: any) => {
      const coordinates = row?.station?.geometry?.coordinates;
      return Array.isArray(coordinates) && haversineMiles(lat, lng, Number(coordinates[1]), Number(coordinates[0])) <= radiusMiles;
    })
    .sort((a: any, b: any) => {
      const ac = a.station.geometry.coordinates, bc = b.station.geometry.coordinates;
      return haversineMiles(lat, lng, Number(ac[1]), Number(ac[0])) - haversineMiles(lat, lng, Number(bc[1]), Number(bc[0]));
    })
    .slice(0, 50);
}

async function fetchWaterGauges(lat: number, lng: number, radiusMiles: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const latDelta = radiusMiles / 69;
  const lngDelta = radiusMiles / Math.max(1, 69 * Math.cos(lat * Math.PI / 180));
  const bbox = [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta].join(',');
  const url = 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items?bbox=' + encodeURIComponent(bbox) + '&parameter_code=00065&limit=200&f=json';
  const data = await fetchJson(url);
  return (data?.features || []).filter((f: any) => {
    const p = f?.properties || {};
    return p?.time && (Date.now() - Date.parse(p.time)) <= 24 * 60 * 60 * 1000 && Array.isArray(f?.geometry?.coordinates);
  });
}

async function fetchAirQualityContours(lat: number, lng: number, radiusMiles: number) {
  const latDelta = Number.isFinite(lat) ? radiusMiles / 69 : 28;
  const lngDelta = Number.isFinite(lng) ? radiusMiles / Math.max(1, 69 * Math.cos(lat * Math.PI / 180)) : 55;
  const geometry = Number.isFinite(lat) && Number.isFinite(lng)
    ? '&geometry=' + encodeURIComponent([lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta].join(','))
    + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects'
    : '';
  const url = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/AirNowLatestContoursPM25/FeatureServer/0/query?where=1%3D1&outFields=gridcode%2CTimestamp&returnGeometry=true&outSR=4326&f=geojson&resultRecordCount=1000' + geometry;
  const data = await fetchJson(url);
  return (data?.features || []).filter((f: any) => {
    const timestamp = f?.properties?.Timestamp;
    if (!Array.isArray(f?.geometry?.coordinates)) return false;
    if (!timestamp) return true;
    const raw = Number(timestamp);
    const timestampMs = Number.isFinite(raw)
      ? (raw < 1e12 ? raw * 1000 : raw)
      : Date.parse(String(timestamp));
    const age = Date.now() - timestampMs;
    return Number.isFinite(age) && age >= 0 && age <= 12 * 60 * 60 * 1000;
  });
}

export default async function(req: Request): Promise<Response> {
  try {
    const { throttled } = shouldThrottle(req, 15, 60_000);
    if (throttled) return Response.json({ error: 'Too many emergency intel requests. Try again shortly.' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    let lat = Number(body.lat), lng = Number(body.lng);
    const zip = String(body.zip || '').trim();
    if (zip && /^\d{5}(?:-\d{4})?$/.test(zip)) {
      const geo = await fetchJson('https://nominatim.openstreetmap.org/search?format=jsonv2&country=United%20States&postalcode=' + encodeURIComponent(zip) + '&limit=1');
      if (geo?.[0]?.lat && geo?.[0]?.lon) { lat = Number(geo[0].lat); lng = Number(geo[0].lon); }
    }
    const radiusMiles = Math.min(250, Math.max(10, Number(body.radiusMiles) || 100));
    const hasCenter = Number.isFinite(lat) && Number.isFinite(lng);
    const base44 = createClientFromRequest(req);
    const [alertsResult, quakesResult, repeatersResult, firesResult, fireIncidentsResult, sheltersResult, weatherStationsResult, waterGaugesResult, airQualityResult] = await Promise.allSettled([
      fetchJson('https://api.weather.gov/alerts/active'),
      fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'),
      listNearbyRepeatersCached(base44.asServiceRole.entities.Repeater, lat, lng, radiusMiles),
      fetchFirePerimeters(),
      fetchFireIncidents(),
      fetchOpenShelters(),
      fetchWeatherStations(lat, lng, radiusMiles),
      fetchWaterGauges(lat, lng, radiusMiles),
      fetchAirQualityContours(lat, lng, radiusMiles),
    ]);

    const alerts = alertsResult.status === 'fulfilled' ? (alertsResult.value?.features || []).map((f: any) => ({
      id: f.id, type: 'weather', event: f?.properties?.event || 'Weather Alert', headline: f?.properties?.headline || '',
      severity: f?.properties?.severity || '', urgency: f?.properties?.urgency || '', certainty: f?.properties?.certainty || '',
      area: f?.properties?.areaDesc || '', effective: f?.properties?.effective || null, expires: f?.properties?.expires || null,
      description: f?.properties?.description || '', geometry: f.geometry || null, url: f?.properties?.web || '',
    })).filter((alert: any) => !hasCenter || !alert.geometry || geometryNearCenter(alert.geometry, lat, lng, radiusMiles)) : [];

    const earthquakes = quakesResult.status === 'fulfilled' ? (quakesResult.value?.features || []).map((f: any) => ({
      id: f.id, magnitude: Number(f?.properties?.mag), place: f?.properties?.place || 'Earthquake',
      time: f?.properties?.time || null, updated: f?.properties?.updated || null, tsunami: Number(f?.properties?.tsunami || 0),
      url: f?.properties?.url || '', coordinates: Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates.slice(0, 2) : null,
    })).filter((q: any) => Array.isArray(q.coordinates) && isFreshWithin24Hours(q.time)) : [];

    const repeaters = repeatersResult.status === 'fulfilled' ? (repeatersResult.value || [])
      .filter((r: any) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))).map((r: any) => ({
        id: r.id, callsign: r.callsign || '', name: r.name || r.callsign || 'Repeater', city: r.city || '', state: r.state || '',
        service: String(r.radio_service || r.service || 'GMRS').toUpperCase(), frequency: r.frequency || r.input_frequency || '',
        tone: r.tone || r.ctcss || r.dcs || '', lat: Number(r.lat), lng: Number(r.lng),
      })) : [];

    const firePerimeters = firesResult.status === 'fulfilled' ? (firesResult.value || []).filter((f: any) => f?.geometry).map((f: any, i: number) => ({
      id: f?.properties?.IRWINID || f?.properties?.IncidentName || 'fire-' + i, name: f?.properties?.IncidentName || 'Active Fire',
      acres: Number(f?.properties?.GISAcres) || null, category: f?.properties?.FeatureCategory || 'Wildfire Daily Fire Perimeter',
      ageDays: Number(f?.properties?.CurrentDateAge), unit: f?.properties?.UnitID || '', currentDate: f?.properties?.CurrentDate || null,
      geometry: f.geometry,
    })).filter((fire: any) => !hasCenter || geometryNearCenter(fire.geometry, lat, lng, radiusMiles)) : [];

    const fireIncidents = fireIncidentsResult.status === 'fulfilled' ? (fireIncidentsResult.value || []).filter((f: any) => Array.isArray(f?.geometry?.coordinates)).map((f: any, i: number) => ({
      id: f?.properties?.IrwinID || f?.properties?.OBJECTID || 'incident-fire-' + i,
      name: f?.properties?.IncidentName || 'Active Wildfire',
      acres: Number(f?.properties?.IncidentSize || f?.properties?.DiscoveryAcres) || null,
      contained: Number.isFinite(Number(f?.properties?.PercentContained)) ? Number(f.properties.PercentContained) : null,
      city: f?.properties?.POOCity || '', state: f?.properties?.POOState || '',
      discovered: f?.properties?.FireDiscoveryDateTime || null,
      updated: f?.properties?.ModifiedOnDateTime_dt || null,
      coordinates: f.geometry.coordinates,
    })) : [];

    const weatherStations = weatherStationsResult.status === 'fulfilled' ? (weatherStationsResult.value || []).map((row: any) => {
      const p = row?.station?.properties || {};
      const o = row?.observation?.properties || {};
      const coordinates = row?.station?.geometry?.coordinates;
      const tempC = o?.temperature?.value;
      const windKph = o?.windSpeed?.value;
      const windDir = o?.windDirection?.value;
      return {
        id: p.stationIdentifier,
        name: p.name || p.stationIdentifier || 'Weather Station',
        elevation: p.elevation?.value ?? null,
        temperatureF: Number.isFinite(Number(tempC)) ? (Number(tempC) * 9 / 5 + 32) : null,
        humidity: Number.isFinite(Number(o?.relativeHumidity?.value)) ? Number(o.relativeHumidity.value) : null,
        windMph: Number.isFinite(Number(windKph)) ? Number(windKph) * 0.621371 : null,
        windDirection: Number.isFinite(Number(windDir)) ? Number(windDir) : null,
        condition: o?.textDescription || '',
        observed: o?.timestamp || null,
        coordinates: Array.isArray(coordinates) ? coordinates.slice(0, 2) : null,
      };
    }).filter((s: any) => Array.isArray(s.coordinates)) : [];

    const waterGauges = waterGaugesResult.status === 'fulfilled' ? (waterGaugesResult.value || []).map((f: any) => {
      const p = f?.properties || {};
      return {
        id: f?.id || p?.monitoring_location_id,
        name: p?.monitoring_location_name || p?.monitoring_location_id || 'USGS Water Gauge',
        value: Number.isFinite(Number(p?.value)) ? Number(p.value) : null,
        unit: p?.unit_of_measure || '',
        observed: p?.time || null,
        coordinates: Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates.slice(0, 2) : null,
      };
    }).filter((g: any) => Array.isArray(g.coordinates) && Number.isFinite(g.value)) : [];

    const airQuality = airQualityResult.status === 'fulfilled' ? (airQualityResult.value || []).filter((f: any) => f?.geometry).map((f: any, i: number) => ({
      id: 'aqi-' + (f?.properties?.Timestamp || i) + '-' + i,
      categoryCode: Number(f?.properties?.gridcode) || 0,
      timestamp: f?.properties?.Timestamp || null,
      geometry: f.geometry,
    })).filter((zone: any) => {
      if (zone.timestamp == null || zone.timestamp === '') return true;
      const raw = Number(zone.timestamp);
      const timestampMs = Number.isFinite(raw)
        ? (raw < 1e12 ? raw * 1000 : raw)
        : Date.parse(String(zone.timestamp));
      const age = Date.now() - timestampMs;
      return Number.isFinite(age) && age >= 0 && age <= 12 * 60 * 60 * 1000;
    }) : [];

    const shelters = sheltersResult.status === 'fulfilled' ? (sheltersResult.value || []).filter((f: any) => Array.isArray(f?.geometry?.coordinates)).map((f: any) => ({
      id: f?.properties?.shelter_id, name: f?.properties?.shelter_name || 'Emergency Shelter',
      address: f?.properties?.address || '', city: f?.properties?.city || '', state: f?.properties?.state || '', zip: f?.properties?.zip || '',
      status: f?.properties?.shelter_status || 'OPEN', evacuationCapacity: Number(f?.properties?.evacuation_capacity) || null,
      pets: f?.properties?.pet_accommodations_code || '', wheelchairAccessible: f?.properties?.wheelchair_accessible || '',
      organization: f?.properties?.org_name || '', coordinates: f.geometry.coordinates,
    })) : [];

    const center = hasCenter ? { lat, lng } : null;
    const nearbyRepeaters = hasCenter
      ? repeaters.map((r: any) => ({ ...r, _distance: haversineMiles(lat, lng, r.lat, r.lng) })).filter((r: any) => r._distance <= radiusMiles).sort((a: any, b: any) => a._distance - b._distance).slice(0, 1000).map(({ _distance, ...r }: any) => r)
      : repeaters.slice(0, 1000);
    const nearbyEarthquakes = hasCenter
      ? earthquakes.map((q: any) => ({ ...q, _distance: haversineMiles(lat, lng, q.coordinates[1], q.coordinates[0]) })).filter((q: any) => q._distance <= radiusMiles).sort((a: any, b: any) => a._distance - b._distance).map(({ _distance, ...q }: any) => q)
      : earthquakes.filter((q: any) => Number(q.magnitude) >= 2.5);
    const nearbyShelters = hasCenter
      ? shelters.map((s: any) => ({ ...s, _distance: haversineMiles(lat, lng, s.coordinates[1], s.coordinates[0]) })).filter((s: any) => s._distance <= radiusMiles).sort((a: any, b: any) => a._distance - b._distance).slice(0, 1000).map(({ _distance, ...s }: any) => s)
      : shelters.slice(0, 1000);
    const nearbyFireIncidents = hasCenter
      ? fireIncidents.map((f: any) => ({ ...f, _distance: haversineMiles(lat, lng, f.coordinates[1], f.coordinates[0]) })).filter((f: any) => f._distance <= radiusMiles).sort((a: any, b: any) => a._distance - b._distance).slice(0, 1000).map(({ _distance, ...f }: any) => f)
      : fireIncidents.slice(0, 1000);

    return Response.json({
      generatedAt: new Date().toISOString(), center, radiusMiles,
      alerts, earthquakes: nearbyEarthquakes, repeaters: nearbyRepeaters, firePerimeters, fireIncidents: nearbyFireIncidents, shelters: nearbyShelters, weatherStations, waterGauges, airQuality,
      sources: { weather: 'National Weather Service', weatherStations: 'National Weather Service', earthquakes: 'USGS', waterGauges: 'USGS Water Data APIs', airQuality: 'EPA AirNow PM2.5 AQI contours', firePerimeters: 'NIFC WFIGS Interagency Fire Perimeters', fireIncidents: 'NIFC WFIGS Current Incident Locations', shelters: 'FEMA ESF6 Open Shelters', repeaters: 'Repeater Nation' },
      upstreamErrors: { alerts: alertsResult.status === 'rejected', earthquakes: quakesResult.status === 'rejected', repeaters: repeatersResult.status === 'rejected', firePerimeters: firesResult.status === 'rejected', fireIncidents: fireIncidentsResult.status === 'rejected', shelters: sheltersResult.status === 'rejected', weatherStations: weatherStationsResult.status === 'rejected', waterGauges: waterGaugesResult.status === 'rejected', airQuality: airQualityResult.status === 'rejected' },
      upstreamErrorDetails: Object.fromEntries([
        ['alerts', alertsResult], ['earthquakes', quakesResult], ['repeaters', repeatersResult],
        ['firePerimeters', firesResult], ['fireIncidents', fireIncidentsResult], ['shelters', sheltersResult],
        ['weatherStations', weatherStationsResult], ['waterGauges', waterGaugesResult], ['airQuality', airQualityResult],
      ].filter(([, result]: any) => result.status === 'rejected').map(([name, result]: any) => [name, String(result.reason?.message || 'Upstream request failed')])),
    });
  } catch (error: any) {
    console.error('[emergency-intel] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Emergency data unavailable' }, { status: 500 });
  }
}