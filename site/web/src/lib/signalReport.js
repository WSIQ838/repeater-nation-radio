// Shared signal-report -> color-tier mapping, used by the POTA contact form
// and by every map that pins a contact/check-in (Logbook, POTA, Net Control).
// Reports are normally "5-N" (readability-strength, N 1-9), but free text is
// tolerated by reading the last 1-9 digit found in the string.

export function signalStrength(value) {
  const m = String(value || '').match(/([1-9])(?!.*[1-9])/);
  return m ? Number(m[1]) : null;
}

const TIERS = [
  { max: 2, dot: '🔴', bg: '#ef4444', fg: '#ffffff', badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800' },
  { max: 4, dot: '🟠', bg: '#f97316', fg: '#ffffff', badge: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800' },
  { max: 6, dot: '🟡', bg: '#eab308', fg: '#1f2937', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800' },
  { max: 8, dot: '🟢', bg: '#84cc16', fg: '#1f2937', badge: 'bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-950 dark:text-lime-300 dark:border-lime-800' },
  { max: 9, dot: '🟢', bg: '#22c55e', fg: '#ffffff', badge: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' },
];

const UNKNOWN_TIER = { dot: '⚪', bg: '#64748b', fg: '#ffffff', badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' };

export function signalTier(value) {
  const strength = signalStrength(value);
  if (strength == null) return UNKNOWN_TIER;
  return TIERS.find((t) => strength <= t.max) || UNKNOWN_TIER;
}

export const SIGNAL_REPORT_OPTIONS = ['5-1', '5-2', '5-3', '5-4', '5-5', '5-6', '5-7', '5-8', '5-9'];
