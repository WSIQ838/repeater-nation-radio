import {
  Trophy, Star, Award, RadioTower, Radio, Satellite, MapPin, Users, MessageCircle,
  Shield, ShieldCheck, Flame, Zap, Crown, Medal, Target, Rocket, Wrench, Cpu, Globe,
  Heart, ThumbsUp, CheckCircle, Sparkles, Flag, Bell, BookOpen, Camera, Compass,
  Activity, Eye, Gift, Signal, Wifi, Headphones, Battery, Gauge, Hexagon, Diamond,
} from 'lucide-react';
import { Image } from '@/components/ui/image';
import { hex6Of } from '@/lib/colorAlpha';

const ICONS = {
  Trophy, Star, Award, RadioTower, Radio, Satellite, MapPin, Users, MessageCircle,
  Shield, ShieldCheck, Flame, Zap, Crown, Medal, Target, Rocket, Wrench, Cpu, Globe,
  Heart, ThumbsUp, CheckCircle, Sparkles, Flag, Bell, BookOpen, Camera, Compass,
  Activity, Eye, Gift, Signal, Wifi, Headphones, Battery, Gauge, Hexagon, Diamond,
};

export function getIcon(name) {
  return name ? ICONS[name] : null;
}

const RARITY_STYLES = {
  Common: { ring: 'border-muted-foreground/40', glow: '', chip: 'bg-muted text-muted-foreground' },
  Uncommon: { ring: 'border-green-500/60', glow: 'shadow-[0_0_14px_rgba(34,197,94,0.35)]', chip: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  Rare: { ring: 'border-blue-500/60', glow: 'shadow-[0_0_14px_rgba(59,130,246,0.35)]', chip: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  Epic: { ring: 'border-purple-500/60', glow: 'shadow-[0_0_14px_rgba(168,85,247,0.35)]', chip: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  Legendary: { ring: 'border-amber-500/70', glow: 'shadow-[0_0_16px_rgba(245,158,11,0.4)]', chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  Mythic: { ring: 'border-pink-500/70', glow: 'shadow-[0_0_16px_rgba(236,72,153,0.4)]', chip: 'bg-pink-500/15 text-pink-600 dark:text-pink-400' },
};

const SIZES = {
  sm: { box: 'w-10 h-10', emoji: 'text-lg', icon: 'w-5 h-5' },
  md: { box: 'w-16 h-16', emoji: 'text-2xl', icon: 'w-7 h-7' },
  lg: { box: 'w-24 h-24', emoji: 'text-4xl', icon: 'w-10 h-10' },
};

export function rarityStyle(rarity) {
  return RARITY_STYLES[rarity] || RARITY_STYLES.Common;
}

export default function BadgePreview({ badge, size = 'md' }) {
  const r = rarityStyle(badge?.rarity);
  const s = SIZES[size] || SIZES.md;
  const color = badge?.color || '#f59e0b';

  const renderIcon = () => {
    if (badge?.icon_type === 'image' && badge?.image_url) {
      return <Image src={badge.image_url} fittingType="fill" className="w-full h-full rounded-full" />;
    }
    if (badge?.icon_type === 'icon' && badge?.icon) {
      const Ico = getIcon(badge.icon);
      if (Ico) return <Ico className={s.icon} style={{ color }} />;
    }
    return <span className={s.emoji} style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}>{badge?.icon || '🏆'}</span>;
  };

  return (
    <div
      className={`relative grid place-items-center rounded-full border-2 ${s.box} ${r.ring} ${r.glow} bg-card`}
      style={badge?.icon_type === 'image' ? undefined : { background: `${hex6Of(color)}1f` }}
    >
      {renderIcon()}
    </div>
  );
}