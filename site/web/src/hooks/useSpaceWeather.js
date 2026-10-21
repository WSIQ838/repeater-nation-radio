import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Shared by the Space Weather and HF Propagation tools. The space-weather
// function caches upstream data for 10 minutes, so refreshing every 15
// minutes (and never from a hidden tab) keeps these pages nearly free.
const REFRESH_MS = 15 * 60 * 1000;

export default function useSpaceWeather() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('space-weather', {});
      const d = res?.data || res;
      if (!d?.ok) throw new Error(d?.error || 'Space-weather data is unavailable right now.');
      setData(d);
      setError('');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Space-weather data is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return { data, loading, error, reload: load };
}
