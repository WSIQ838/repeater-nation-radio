import { useEffect, useState } from 'react';

// Dark is the site default; light only when someone picks it with the theme
// toggle. Only that explicit pick is saved. The old 'pgmrs-theme' key was
// written on every page load with whatever the page first rendered (the OS
// light/dark setting), so it can't tell a real choice from a default and is
// no longer read. index.html applies the same rule before React loads.
const STORAGE_KEY = 'rn-theme';
const LEGACY_KEY = 'pgmrs-theme';

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

function savedTheme() {
  try { return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

export function useTheme() {
  const [theme, setTheme] = useState(() => (typeof window === 'undefined' ? 'dark' : savedTheme()));

  useEffect(() => { applyTheme(theme); }, [theme]);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* private mode: the choice lasts for this page only */ }
    setTheme(next);
  };
  return { theme, toggle };
}

export default useTheme;
