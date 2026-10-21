import { useEffect, useState } from 'react';

// Resolves the user's location via the browser geolocation API.
// Returns { location: [lat, lng] | null, usingFallback, loading }.
//
// IMPORTANT: when the location cannot be determined (permission denied, timeout,
// unsupported browser) `location` stays null and `usingFallback` is true. It used
// to be replaced with a point in the middle of Kansas, which callers then drew as
// a "You are here" pin (sitting in a lake). Callers should show a whole-country
// view instead and never claim to know where the member is.
export function useUserLocation() {
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok' | 'failed'

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('failed');
      return;
    }
    let done = false;
    const fail = () => { if (done) return; done = true; setStatus('failed'); };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Ignore junk fixes (NaN or the 0,0 "null island" some browsers report).
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) { fail(); return; }
        done = true;
        setLocation([lat, lng]);
        setStatus('ok');
      },
      fail,
      // Wi-Fi / network positioning is plenty for finding nearby repeaters and is far
      // quicker than demanding GPS-grade accuracy, which laptops and desktops usually
      // cannot provide within a few seconds. A recent cached fix is fine too.
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 }
    );
    const t = setTimeout(fail, 13000);
    return () => clearTimeout(t);
  }, []);

  return { location, usingFallback: status === 'failed', loading: status === 'loading' };
}