// Geocode a place query (city, ZIP, address) to coordinates using the
// free Open-Meteo geocoding API. No API key required.
export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    let query = String(body.query || '').trim();
    if (!query) {
      query = [body.city, body.state, body.zip].filter(Boolean).join(', ').trim();
    }
    if (!query) return Response.json({ error: 'query required' }, { status: 400 });

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'RepeaterNation/1.0' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return Response.json({ error: 'Geocoding service unavailable' }, { status: 502 });
    const data: any = await res.json();
    const hit = data?.results?.[0];
    if (!hit) return Response.json({ error: 'Location not found' }, { status: 404 });

    return Response.json({
      lat: hit.latitude,
      lng: hit.longitude,
      county: hit.admin2 || null,
      city: hit.name || null,
      state: hit.admin1 || null,
      label: [hit.name, hit.admin1, hit.country_code].filter(Boolean).join(', '),
    });
  } catch (error) {
    console.error('[geocode-location] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}