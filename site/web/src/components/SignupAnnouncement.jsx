import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Megaphone } from 'lucide-react';
import Linkify from '@/components/shared/Linkify';

// Dismissal is remembered by content, not by a fixed id (there's no entity
// record backing this -- it's a single admin-editable setting), so editing
// the title/body shows it again even to someone who already dismissed the
// old wording.
const DISMISSED_KEY = 'rn-dismissed-signup-announcement';

export default function SignupAnnouncement() {
  const [announcement, setAnnouncement] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    base44.functions.invoke('get-signup-announcement')
      .then((r) => (r?.data || r))
      .catch(() => ({ enabled: false }))
      .then((data) => {
        if (cancelled || !data?.enabled) return;
        let dismissed = '';
        try { dismissed = localStorage.getItem(DISMISSED_KEY) || ''; } catch { /* private mode, etc. */ }
        if (dismissed === `${data.title}|${data.body}`) return;
        setAnnouncement(data);
        setOpen(true);
      });
    return () => { cancelled = true; };
  }, []);

  const handleClose = () => {
    if (announcement) {
      try { localStorage.setItem(DISMISSED_KEY, `${announcement.title}|${announcement.body}`); } catch { /* ignore */ }
    }
    setOpen(false);
  };

  if (!announcement) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-1.5 text-primary mb-1">
            <Megaphone className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Before you sign up</span>
          </div>
          <DialogTitle className="text-xl">{announcement.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words"><Linkify text={announcement.body} /></p>
        <div className="mt-3 flex justify-end">
          <Button onClick={handleClose}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
