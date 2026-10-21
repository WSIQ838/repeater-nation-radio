import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineIndicator() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-lg">
      <WifiOff className="w-4 h-4" />
      You're offline — cached pages still work; live data will sync when you reconnect.
    </div>
  );
}