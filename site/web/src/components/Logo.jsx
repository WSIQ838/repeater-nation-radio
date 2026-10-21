import { Image } from '@/components/ui/image';

// 512px WebP so the big badge on the home page stays sharp on high-DPI
// screens; ?v= busts browser caches when the artwork changes.
const LOGO_URL = '/branding/logo-badge-512.webp?v=2';

// Repeater Nation logo. `className` sizes the container (e.g. "w-9 h-9").
// rounded-full is applied by default so the circular badge reads cleanly on
// any background; pass className to override size.
export default function Logo({ className = 'w-9 h-9' }) {
  return (
    <Image
      src={LOGO_URL}
      alt="Repeater Nation"
      fittingType="fit"
      className={`${className} rounded-full shrink-0`}
    />
  );
}