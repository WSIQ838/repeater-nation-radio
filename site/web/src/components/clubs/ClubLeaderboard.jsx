import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Flame, Trophy, Calendar, Radio } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';

export default function ClubLeaderboard({ clubId }) {
  const [streaks, setStreaks] = useState(null);

  useEffect(() => {
    if (!clubId) return;
    let alive = true;
    (async () => {
      try {
        const records = await base44.entities.NetStreak.filter({ club_id: clubId }, '-current_streak', 200);
        if (!alive) return;
        setStreaks(records || []);
      } catch (e) { console.error(e); }
    })();
    return () => { alive = false; };
  }, [clubId]);

  if (!streaks) return <div className="py-8 text-center text-muted-foreground">Loading…</div>;
  if (!streaks.length) return (
    <Card className="p-6 text-center">
      <Flame className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
      <h3 className="font-heading font-semibold">No streaks yet</h3>
      <p className="text-sm text-muted-foreground mt-1">Check into club nets to start your streak!</p>
    </Card>
  );

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

  return (
    <Card className="p-5">
      <h3 className="font-heading font-semibold mb-4 flex items-center gap-2"><Flame className="w-5 h-5 text-orange-500" /> Net Streak Leaderboard</h3>
      <div className="space-y-2">
        {streaks.map((s, idx) => (
          <div key={s.id} className={`flex items-center gap-3 p-3 rounded-lg border ${idx === 0 ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700' : 'border-border'}`}>
            <div className={`w-8 h-8 rounded-full grid place-items-center text-sm font-bold shrink-0 ${idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200' : idx === 2 ? 'bg-orange-300 text-orange-800 dark:bg-orange-900 dark:text-orange-200' : 'bg-muted text-muted-foreground'}`}>
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{s.user_callsign || s.user_name || '—'}</span><StaffTag userId={s.user_id} callsign={s.user_id ? undefined : s.user_callsign} />
                <span className="text-lg">🔥</span>
                <span className="text-lg font-bold text-orange-500">{s.current_streak || 0}</span>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
                <span className="flex items-center gap-0.5"><Trophy className="w-3 h-3" /> {s.longest_streak || 0}</span>
                <span className="flex items-center gap-0.5"><Radio className="w-3 h-3" /> {s.total_checkins || 0}</span>
                <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" /> {s.total_nets_attended || 0}</span>
                <span>Last: {fmtDate(s.last_checkin_date)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}