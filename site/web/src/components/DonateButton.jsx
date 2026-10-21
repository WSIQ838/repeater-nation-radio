import { useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSiteSocials } from '@/lib/useSiteSocials';
import DonateDialog from '@/components/DonateDialog';

// Renders nothing when donations aren't configured in Admin → Settings →
// Donations, so it's always safe to drop in anywhere. Opens an in-app
// checkout dialog when Stripe donations are enabled, otherwise links out to
// the configured external donation page.
export default function DonateButton({ variant = 'outline', size = 'sm', className = '', children }) {
  const { donation_mode, donation_url } = useSiteSocials();
  const [open, setOpen] = useState(false);

  if (donation_mode === 'none') return null;

  if (donation_mode === 'stripe') {
    return (
      <>
        <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
          <Heart className="w-4 h-4 mr-1.5" /> {children || 'Donate'}
        </Button>
        <DonateDialog open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <a href={donation_url} target="_blank" rel="noopener noreferrer">
      <Button variant={variant} size={size} className={className}>
        <Heart className="w-4 h-4 mr-1.5" /> {children || 'Donate'}
      </Button>
    </a>
  );
}
