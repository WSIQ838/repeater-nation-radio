import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Image as ImageComponent } from '@/components/ui/image';
import { Megaphone } from 'lucide-react';
import Linkify from '@/components/shared/Linkify';

const DISMISSED_KEY = 'rn-dismissed-announcements';

function getDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
  } catch {
    return [];
  }
}

function rememberDismissed(id) {
  try {
    const ids = getDismissed();
    if (!ids.includes(id)) localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids, id]));
  } catch {
    // localStorage unavailable (private mode, etc) — the popup will just reappear next visit.
  }
}

export default function AnnouncementPopup() {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    base44.entities.AdminNotification.filter({ active: true }, '-created_date', 20)
      .catch(() => [])
      .then((items) => {
        if (cancelled) return;
        const isAdmin = (user?.role || 'user') === 'admin';
        const now = Date.now();
        const dismissed = getDismissed();
        const candidate = (items || []).find((n) => {
          if (n.audience === 'Admins' && !isAdmin) return false;
          if (n.expires_at && new Date(n.expires_at).getTime() <= now) return false;
          return !dismissed.includes(n.id);
        });
        if (candidate) {
          setAnnouncement(candidate);
          setOpen(true);
        }
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleClose = () => {
    if (announcement) rememberDismissed(announcement.id);
    setOpen(false);
  };

  if (!announcement) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {announcement.image_url && (
          <div className="w-full aspect-video bg-muted">
            <ImageComponent src={announcement.image_url} alt="" className="w-full h-full" />
          </div>
        )}
        <div className="p-6">
          <DialogHeader>
            <div className="flex items-center gap-1.5 text-primary mb-1">
              <Megaphone className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Announcement</span>
            </div>
            <DialogTitle className="text-xl">{announcement.title}</DialogTitle>
          </DialogHeader>
          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words"><Linkify text={announcement.body} /></p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>Dismiss</Button>
            {announcement.link_url && (
              <a href={announcement.link_url} target="_blank" rel="noopener noreferrer" onClick={handleClose}>
                <Button>{announcement.link_label || 'Learn more'}</Button>
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
