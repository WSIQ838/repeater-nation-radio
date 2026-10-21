// Weather, daily forecast, and sunrise/sunset.
// Uses WeatherAPI.com (keyed, 1M calls/month free tier) when WEATHER_API_KEY is
// set, falling back to Open-Meteo (no key, shared-IP 10k/day limit) otherwise.
// Response is normalized so the frontend always sees weather_text and
// sunrise/sunset as readable "HH:MM AM/PM" strings in the location's local time.
import { secrets } from 'base44:runtime';
import { shouldThrottle } from '../../shared/ipThrottle.ts';

const WMO_TEXT: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

function toAmPm(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return iso; }
}

export default async function(req: Request): Promise<Response> {
  try {
    const { throttled } = shouldThrottle(req, 30, 60_000);
    if (throttled) return Response.json({ error: 'Too many weather requests. Try again shortly.' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (isNaN(lat) || isNaN(lng)) return Response.json({ error: 'lat and lng required' }, { status: 400 });

    const key = secrets.get('WEATHER_API_KEY');

    if (key) {
      const url = `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(key)}&q=${lat},${lng}&days=7&aqi=no&alerts=yes`;
      const res = await fetch(url, { headers: { 'User-Agent': 'RepeaterNation/1.0' } });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('[get-weather] weatherapi status', res.status, detail.slice(0, 300));
        const msg = (res.status === 401 || res.status === 403) ? 'Weather API key is invalid or disabled.' : 'Weather service unavailable.';
        return Response.json({ error: msg }, { status: 502 });
      }
      const d: any = await res.json();

      const current = {
        temperature_2m: d.current?.temp_c,
        relative_humidity_2m: d.current?.humidity,
        apparent_temperature: d.current?.feelslike_c,
        weather_code: d.current?.condition?.code,
        weather_text: d.current?.condition?.text,
        wind_speed_10m: d.current?.wind_kph,
        wind_direction_10m: d.current?.wind_degree,
      };

      const days: any[] = d.forecast?.forecastday || [];
      const daily = {
        time: days.map((x) => x.date),
        weather_code: days.map((x) => x.day?.condition?.code),
        weather_text: days.map((x) => x.day?.condition?.text),
        temperature_2m_max: days.map((x) => x.day?.maxtemp_c),
        temperature_2m_min: days.map((x) => x.day?.mintemp_c),
        sunrise: days.map((x) => x.astro?.sunrise),
        sunset: days.map((x) => x.astro?.sunset),
        precipitation_probability_max: days.map((x) => x.day?.daily_chance_of_rain),
      };

      const alerts = (d.alerts?.alert || []).map((a: any) => ({
        title: a.headline || a.event,
        severity: a.severity,
        headline: a.headline,
        area: a.areas,
        description: a.desc,
      }));

      return Response.json({ weather: { current, daily }, alerts });
    }

    // Fallback: Open-Meteo (no key) — subject to shared-IP daily limit
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max` +
      `&timezone=auto&forecast_days=7`;
    const wRes = await fetch(weatherUrl, { headers: { 'User-Agent': 'RepeaterNation/1.0' } });
    if (!wRes.ok) {
      const detail = await wRes.text().catch(() => '');
      console.error('[get-weather] open-meteo status', wRes.status, detail.slice(0, 300));
      return Response.json({ error: wRes.status === 429 ? 'Weather service rate limit reached. Please try again later.' : 'Weather service unavailable' }, { status: 502 });
    }
    const w: any = await wRes.json();

    // Normalize: add weather_text and convert sunrise/sunset to "HH:MM AM/PM"
    if (w.current) w.current.weather_text = WMO_TEXT[w.current.weather_code] || 'Unknown';
    if (w.daily) {
      w.daily.weather_text = (w.daily.weather_code || []).map((c: number) => WMO_TEXT[c] || 'Unknown');
      w.daily.sunrise = (w.daily.sunrise || []).map(toAmPm);
      w.daily.sunset = (w.daily.sunset || []).map(toAmPm);
    }

    // Best-effort NWS alerts for US locations
    let alerts: any[] = [];
    if (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66) {
      try {
        const aRes = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lng}`, {
          headers: { 'User-Agent': 'RepeaterNation/1.0', 'Accept': 'application/geo+json' },
        });
        if (aRes.ok) {
          const aData = await aRes.json();
          alerts = (aData?.features || []).map((f: any) => ({
            title: f?.properties?.event,
            severity: f?.properties?.severity,
            headline: f?.properties?.headline,
            description: f?.properties?.description,
            area: f?.properties?.areaDesc,
            expires: f?.properties?.expires,
          }));
        }
      } catch (e) { console.error('[get-weather] alerts failed:', e?.message || e); }
    }

    return Response.json({ weather: w, alerts });
  } catch (error) {
    console.error('[get-weather] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}