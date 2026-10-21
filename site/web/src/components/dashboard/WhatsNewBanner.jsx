import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, X } from 'lucide-react';
import Linkify from '@/components/shared/Linkify';

const SEEN_KEY = 'gmrs_last_seen_changelog';

export default function WhatsNewBanner() {
  const [latest, setLatest] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const entries = await base44.entities.ChangeLog.list('-created_date', 1);
        const top = entries?.[0];
        if (!top) return;
        const seen = localStorage.getItem(SEEN_KEY);
        if (seen === top.id) { setHidden(true); return; }
        setLatest(top);
      } catch (e) { /* ignore */ }
    })();
  }, []);

  if (!latest || hidden) return null;

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, latest.id);
    setHidden(true);
  };

  return (
    <div className="relative rounded-xl border border-primary/30 bg-primary/5 p-5 overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-12 translate-x-12 blur-2xl" />
      <div className="relative flex items-start gap-4">
        <div className="grid place-items-center w-11 h-11 rounded-xl bg-primary/15 text-primary shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-semibold text-[15px]">What's New{latest.version ? ` — ${latest.version}` : ''}</h3>
            {latest.created_date && (
              <span className="text-xs text-muted-foreground">
                {new Date(latest.created_date).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4"><Linkify text={latest.notes} /></p>
        </div>
        <button onClick={dismiss} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0" title="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}