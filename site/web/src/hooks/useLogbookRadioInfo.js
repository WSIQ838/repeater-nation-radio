import { useCallback, useEffect, useState } from 'react';

export const EMPTY_LOGBOOK_RADIO_INFO = {
  radio_service: 'GMRS',
  band: '',
  frequency: '',
  channel: '',
  mode: 'Simplex',
  radio_used: '',
};

const STORAGE_KEY = 'repeater-nation-logbook-radio-info';

const readStored = () => {
  if (typeof window === 'undefined') return EMPTY_LOGBOOK_RADIO_INFO;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_LOGBOOK_RADIO_INFO;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_LOGBOOK_RADIO_INFO, ...parsed };
  } catch {
    return EMPTY_LOGBOOK_RADIO_INFO;
  }
};

export function useLogbookRadioInfo() {
  const [radioInfo, setRadioInfo] = useState(readStored);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(radioInfo));
    } catch {
      // Local persistence is best-effort; the form still works in memory.
    }
  }, [radioInfo]);

  const updateRadioInfo = useCallback((patch) => {
    setRadioInfo((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetRadioInfo = useCallback(() => {
    setRadioInfo(EMPTY_LOGBOOK_RADIO_INFO);
  }, []);

  return { radioInfo, setRadioInfo, updateRadioInfo, resetRadioInfo };
}
