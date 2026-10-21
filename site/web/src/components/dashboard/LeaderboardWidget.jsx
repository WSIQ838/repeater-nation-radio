import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardWidget({ userId, limit = 5, scrollable = false }) {
  const [ranked, setRanked] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await import('@/api/base44Client').then(({ base44 }) => base44.functions.invoke('leaderboard-xp', { period: 'all' }));
        const rows = response?.data?.rows || [];
        const computed = rows.map((r) => ({ userId: r.userId, displayName: r.displayName, callsign: r.callsign, avatar: r.avatar, xp: r.xp })).sort((a, b) => b.xp - a.xp);
        if (alive) setRanked(computed);
      } catch (e) {
        console.error('LeaderboardWidget load failed', e);
        if (alive) setRanked([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!ranked) return <div className="space-y-2">{[...Array(limit)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}</div>;

  const top = ranked.slice(0, limit);
  const myRank = userId ? ranked.findIndex((r) => String(r.userId) === String(userId)) + 1 : 0;

  if (top.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No leaderboard activity yet.</p>;

  return (
    <div>
      <div className={scrollable ? 'space-y-1 max-h-64 overflow-y-auto pr-1' : 'space-y-1'}>
        {top.map((r, i) => (
          <button key={r.userId} type="button" onClick={() => navigate(`/members/${r.userId}`)} className="flex items-center gap-2.5 w-full py-1.5 px-1 -mx-1 rounded-lg hover:bg-accent transition-colors text-left">
            <span className="w-5 text-center text-sm font-semibold shrink-0">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
            {r.avatar ? <img src={r.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" /> : <div className="w-8 h-8 rounded-full bg-muted grid place-items-center font-semibold text-xs shrink-0">{(r.displayName || 'M').charAt(0).toUpperCase()}</div>}
            <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{r.displayName}</div></div>
            <span className="text-xs font-semibold text-muted-foreground shrink-0">{r.xp.toLocaleString()} XP</span>
          </button>
        ))}
      </div>
      {myRank > limit && <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">Your rank: #{myRank} of {ranked.length}</div>}
      <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => navigate('/leaderboard')}>View full leaderboard</Button>
    </div>
  );
}
