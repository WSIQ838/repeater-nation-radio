import { Twitter, Instagram, Youtube, Facebook, Music2 } from 'lucide-react';
import DiscordIcon from '@/components/DiscordIcon';
import { useSiteSocials } from '@/lib/useSiteSocials';

const SOCIAL_ICONS = [
  { key: 'social_discord_url', label: 'Discord', icon: DiscordIcon },
  { key: 'social_twitter_url', label: 'Twitter / X', icon: Twitter },
  { key: 'social_facebook_url', label: 'Facebook', icon: Facebook },
  { key: 'social_instagram_url', label: 'Instagram', icon: Instagram },
  { key: 'social_youtube_url', label: 'YouTube', icon: Youtube },
  { key: 'social_tiktok_url', label: 'TikTok', icon: Music2 },
];

// Renders an icon for each social link configured in Admin → Settings →
// Social Links; platforms left blank there just don't render.
export default function SiteSocialLinks({ className = '', iconClassName = 'w-8 h-8' }) {
  const socials = useSiteSocials();
  const active = SOCIAL_ICONS.filter((s) => socials[s.key]);
  if (!active.length) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {active.map((s) => (
        <a
          key={s.key}
          href={socials[s.key]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.label}
          title={s.label}
          className={`grid place-items-center ${iconClassName} rounded-full bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors`}
        >
          <s.icon className="w-4 h-4" />
        </a>
      ))}
    </div>
  );
}
