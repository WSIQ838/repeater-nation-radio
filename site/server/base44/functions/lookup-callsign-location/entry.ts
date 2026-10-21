// Looks up a GMRS callsign's location from the FCC ULS database and geocodes
// it to lat/lng. Used by the QSO/Contact Logger to auto-fill location fields.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { ulsLookup } from '../../shared/fcc.ts';

const formatZip = (zip: any): string | null => {
  if (!zip) return null;
  const z = String(zip).trim();
  if (/^\d{9}$/.test(z)) return `${z.slice(0, 5)}-${z.slice(5)}`;
  if (/^\d{5}$/.test(z)) return z;
  return z;
};

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    // Authenticate — only logged-in users can look up callsign locations
    try {
      const me = await base44.auth.me();
      if (!me) return Response.json({ found: false, message: 'Authentication required.' }, { status: 401 });
    } catch (err) {
      return Response.json({ found: false, message: 'Authentication required.' }, { status: 401 });
    }

    let body: any = {};
    try { body = await req.json(); } catch {}
    const callsign = String(body.callsign || '').trim().toUpperCase();
    if (!callsign) return Response.json({ found: false, message: 'Callsign required.' });

    const fcc = await ulsLookup(base44, callsign);
    if (!fcc.found) {
      return Response.json({ found: false, message: fcc.message || 'Callsign not found in FCC database.' });
    }

    // Parse address from FCC result
    let city: string | null = null;
    let state: string | null = null;
    let zip: string | null = null;
    const addr = fcc.address;
    if (addr && typeof addr === 'object') {
      city = addr.city || null;
      state = addr.state || null;
      zip = formatZip(addr.zip || addr.postalCode);
    }

    // Geocode city + state to get lat/lng/county
    let lat: number | null = null;
    let lng: number | null = null;
    let county: string | null = null;
    if (city || state) {
      const query = [city, state].filter(Boolean).join(', ');
      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'RepeaterNation/1.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data: any = await res.json();
          const hit = data?.results?.[0];
          if (hit) {
            lat = hit.latitude;
            lng = hit.longitude;
            county = hit.admin2 || null;
          }
        }
      } catch (e) {
        console.error('[lookup-callsign-location] geocode failed:', (e as any)?.message || e);
      }
    }

    return Response.json({
      found: true,
      callsign,
      licensee: fcc.licensee || null,
      city,
      state,
      zip,
      county,
      lat,
      lng,
    });
  } catch (error) {
    console.error('[lookup-callsign-location] error:', (error as any)?.message || error);
    return Response.json({ found: false, message: (error as any)?.message || 'Lookup failed.' }, { status: 500 });
  }
}