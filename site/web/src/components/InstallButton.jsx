import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export default function InstallButton({ variant = 'outline', size = 'sm', className = '' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Already installed (standalone mode)?
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setInstalled(true);
    }

    const installedHandler = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  if (installed || !deferredPrompt) return null;

  const handleClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <Button variant={variant} size={size} onClick={handleClick} className={className}>
      <Download className="w-4 h-4 mr-1.5" />
      Install App
    </Button>
  );
}