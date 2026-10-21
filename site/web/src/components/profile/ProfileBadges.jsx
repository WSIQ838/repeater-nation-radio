import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import BadgePreview, { rarityStyle } from '@/components/admin/BadgePreview';
import { Award, ChevronDown } from 'lucide-react';
import Linkify from '@/components/shared/Linkify';

// Displays the earned badges for a given user. Fetches the user's UserBadge
// records and joins them with the Badge catalog so each award renders with its
// icon, color, and rarity. Secret badges are revealed once earned. Disabled
// badges are hidden. Renders nothing until loaded, and nothing if the user
// has no earned badges, so profiles without badges stay clean.
export default function ProfileBadges({ userId, onCount }) {
  const [awards, setAwards] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const [userBadges, badges] = await Promise.all([
          base44.entities.UserBadge.filter({ user_id: userId }, '-awarded_at', 200),
          base44.entities.Badge.list('display_order', 500),
        ]);
        if (!alive) return;
        const map = new Map((badges || []).map((b) => [b.id, b]));
        const joined = (userBadges || [])
          .map((ub) => ({ ...ub, badge: map.get(ub.badge_id) }))
          .filter((ub) => ub.badge && ub.badge.enabled !== false)
          .sort((a, b) => (a.badge.display_order || 0) - (b.badge.display_order || 0));
        setAwards(joined);
        onCount?.(joined.length);
      } catch (e) {
        console.error('ProfileBadges load failed', e);
        if (alive) { setAwards([]); onCount?.(0); }
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  if (!awards || awards.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-muted/30 transition-colors"
            aria-expanded={open}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Award className="w-5 h-5 text-primary shrink-0" />
              <span className="font-heading font-semibold text-lg">Badges</span>
              <span className="text-sm font-normal text-muted-foreground">({awards.length})</span>
            </span>
            <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-6 pb-6 pt-2 border-t border-border">
            <TooltipProvider delayDuration={150}>
              <div className="flex flex-wrap gap-4">
          {awards.map((ub) => {
            const r = rarityStyle(ub.badge.rarity);
            return (
              <Tooltip key={ub.id}>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center text-center w-24 cursor-help">
                    <BadgePreview badge={ub.badge} size="md" />
                    <div className="text-xs font-medium mt-1.5 leading-tight line-clamp-2">{ub.badge.name}</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[230px] bg-popover text-popover-foreground border shadow-lg">
                  <div className="space-y-1.5">
                    <div className="font-semibold leading-tight">{ub.badge.name}</div>
                    {ub.badge.rarity && (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${r.chip}`}>{ub.badge.rarity}</span>
                    )}
                    {ub.badge.description && <p className="text-xs opacity-90 leading-snug"><Linkify text={ub.badge.description} /></p>}
                    {ub.badge.requirement_label && (
                      <p className="text-[11px] opacity-70 leading-snug italic">{ub.badge.requirement_label}</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
              })}
              </div>
            </TooltipProvider>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}