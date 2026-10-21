type RequestPoint = {
  lat: number;
  lon: number;
  radiusNm: number;
};

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getPoint(body: any): RequestPoint | null {
  const lat = finiteNumber(body?.lat);
  const lon = finiteNumber(body?.lon);
  const radiusNm = finiteNumber(body?.radiusNm);

  if (lat === null || lon === null || radiusNm === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return {
    lat,
    lon,
    radiusNm: Math.max(5, Math.min(250, radiusNm)),
  };
}

function normalizeAircraft(raw: any) {
  const numberOrNull = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  return {
    icao24: String(raw?.hex || '').trim().toLowerCase(),
    callsign: String(raw?.flight || '').trim(),
    registration: String(raw?.r || '').trim(),
    aircraftType: String(raw?.t || '').trim(),
    aircraftDescription: String(raw?.desc || '').trim(),
    airline: String(raw?.ownOp || raw?.op || '').trim(),
    airlineIcao: String(raw?.ownOpIcao || raw?.opIcao || '').trim(),
    departureAirport: String(raw?.route?.from || raw?.from || '').trim(),
    arrivalAirport: String(raw?.route?.to || raw?.to || '').trim(),
    route: String(raw?.route?.name || (typeof raw?.route === 'string' ? raw.route : '') || '').trim(),
    originCountry: String(raw?.cou || '').trim(),
    latitude: numberOrNull(raw?.lat),
    longitude: numberOrNull(raw?.lon),
    altitudeM: raw?.alt_baro === 'ground' ? null : (() => {
      const n = numberOrNull(raw?.alt_baro);
      return n === null ? null : n * 0.3048;
    })(),
    speedMps: (() => {
      const n = numberOrNull(raw?.gs);
      return n === null ? null : n * 0.514444;
    })(),
    heading: numberOrNull(raw?.track),
    verticalRateMps: (() => {
      const n = numberOrNull(raw?.bar_vr);
      return n === null ? null : n * 0.00508;
    })(),
    onGround: raw?.alt_baro === 'ground' || Boolean(raw?.ground),
    squawk: String(raw?.squawk || '').trim(),
    category: String(raw?.category || '').trim(),
    lastContact: numberOrNull(raw?.now) ?? Math.floor(Date.now() / 1000),
  };
}

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const point = getPoint(body);

    if (!point) {
      return Response.json(
        { error: 'A valid latitude, longitude, and scan range are required.' },
        { status: 400 },
      );
    }

    const url =
      `https://hello-http.val.run/v2/point/${point.lat.toFixed(4)}/${point.lon.toFixed(4)}/${point.radiusNm}`;

    const upstream = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error('[flight-radar] relay status', upstream.status, detail.slice(0, 300));

      return Response.json(
        {
          error: 'The live flight feed is temporarily unavailable.',
          upstreamStatus: upstream.status,
        },
        { status: 502 },
      );
    }

    const data = await upstream.json();
    const aircraft = (Array.isArray(data?.ac) ? data.ac : [])
      .map(normalizeAircraft)
      .filter((a: any) =>
        a.icao24 &&
        Number.isFinite(a.latitude) &&
        Number.isFinite(a.longitude)
      );

    return Response.json({
      time: Number.isFinite(data?.now) ? Number(data.now) : Math.floor(Date.now() / 1000),
      aircraft,
      count: aircraft.length,
      provider: 'ADSB.lol',
      transport: 'Repeater Nation Base44 relay',
    });
  } catch (error: any) {
    console.error('[flight-radar] error:', error?.message || error);

    return Response.json(
      { error: 'Unable to load live aircraft data right now.' },
      { status: 502 },
    );
  }
}
