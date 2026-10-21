import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { cachedConfig } from '@/lib/configCache';

// Falls back to the current hardcoded links so the site never shows a blank
// Discord button while the fetch is in flight or if it fails.
const FALLBACK = {
  social_discord_url: 'https://discord.gg/SjNy9jR9ej',
  social_twitter_url: '',
  social_facebook_url: '',
  social_instagram_url: '',
  social_youtube_url: '',
  social_tiktok_url: '',
  donation_url: '',
  donation_mode: 'none',
  show_bug_report_link: true,
};

let cached = null;

function fetchSocials() {
  if (cached) return Promise.resolve(cached);
  return cachedConfig('site', () => base44.functions.invoke('public-site-settings', {})
    .then((res) => ({ ...FALLBACK, ...(res?.data || {}) })))
    .then((s) => { cached = s; return s; })
    .catch(() => FALLBACK);
}

// Site-wide social links (Discord, Twitter/X, Facebook, Instagram, YouTube,
// TikTok) plus the donation URL, managed from Admin → Settings. Cached
// across components so Layout/Landing/Contact mounting together only fetch
// once.
export function useSiteSocials() {
  const [socials, setSocials] = useState(cached || FALLBACK);
  useEffect(() => {
    let alive = true;
    fetchSocials().then((s) => { if (alive) setSocials(s); });
    return () => { alive = false; };
  }, []);
  return socials;
}
