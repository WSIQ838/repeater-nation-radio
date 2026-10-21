import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, RefreshCw } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';

const CATEGORIES = [
  ['overall', 'Overall'],
  ['radio', 'Radio'],
  ['nets', 'Nets'],
  ['pota', 'POTA'],
  ['badges', 'Badges'],
  ['community', 'Community'],
];

const PERIODS = [
  ['all', 'All Time'],
  ['year', 'This Year'],
  ['month', 'This Month'],
  ['week', 'This Week'],
];

function categoryScore(r, tab) {
  if (tab === 'radio') return r.contacts * 5 + r.uniqueContacts * 10;
  if (tab === 'nets') return r.checkins * 10 + r.nets * 15 + r.longestStreak * 5;
  if (tab === 'pota') return r.potaActivations * 50 + r.potaParks * 25 + r.potaContacts * 2;
  if (tab === 'badges') return r.badges * 50;
  if (tab === 'community') return r.clubsCount * 10 + r.clubsCreated * 25 + r.eventsCreated * 10;
  return r.xp;
}

export default function Leaderboard() {
  const [tab, setTab] = useState('overall');
  const [period, setPeriod] = useState('all');
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [currentUser, response] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.functions.invoke('leaderboard-xp', { period }),
      ]);
      setMe(currentUser);
      setRows(response?.data?.rows || []);
    } catch (e) {
      console.error('Leaderboard load failed', e);
      setError('The leaderboard could not be loaded. Please try again.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period]);

  const ranked = useMemo(() => {
    return [...rows]
      .map((r) => ({ ...r, score: categoryScore(r, tab) }))
      .sort((a, b) => b.score - a.score);
  }, [rows, tab]);

  const myRank = me ? ranked.findIndex((r) => String(r.userId) === String(me.id)) + 1 : 0;

  return <div className="max-w-5xl mx-auto space-y-6">
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold flex items-center gap-2"><Trophy className="w-7 h-7" />Leaderboard</h1>
        <p className="text-muted-foreground mt-1">Repeater Nation and HAM operator activity and achievements.</p>
      </div>
      <Button variant="outline" size="icon" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
    </div>
    <div className="flex flex-wrap gap-2">{CATEGORIES.map(([key, label]) => <Button key={key} variant={tab === key ? 'default' : 'outline'} size="sm" onClick={() => setTab(key)}>{label}</Button>)}</div>
    <div className="flex flex-wrap gap-2">{PERIODS.map(([key, label]) => <Button key={key} variant={period === key ? 'secondary' : 'ghost'} size="sm" onClick={() => setPeriod(key)}>{label}</Button>)}</div>
    <Card className="p-4">
      <details>
        <summary className="cursor-pointer font-semibold select-none">How to Earn XP</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
          <div><strong>📻 Radio Contacts</strong><div className="text-muted-foreground">5 XP per contact + 5 bonus XP for each unique callsign contacted.</div></div>
          <div><strong>🎙️ Net Participation</strong><div className="text-muted-foreground">10 XP per net check-in + 15 XP per net attended.</div></div>
          <div><strong>🔥 Net Streak</strong><div className="text-muted-foreground">5 XP per day in your longest net streak.</div></div>
          <div><strong>🏕️ POTA</strong><div className="text-muted-foreground">50 XP per activation + 25 XP per park + 2 XP per POTA contact.</div></div>
          <div><strong>🏅 Badges</strong><div className="text-muted-foreground">50 XP for each badge earned.</div></div>
          <div><strong>👥 Clubs</strong><div className="text-muted-foreground">10 XP per club joined + 25 XP for each of your first 5 clubs created.</div></div>
          <div><strong>📅 Events</strong><div className="text-muted-foreground">10 XP for each of your first 10 eligible events created.</div></div>
          <div><strong>👤 Complete Profile</strong><div className="text-muted-foreground">50 XP when your profile has a name, location, and avatar.</div></div>
          <div><strong>📡 Verified Callsign</strong><div className="text-muted-foreground">100 XP for an active, verified callsign.</div></div>
          <div><strong>📸 Repeater Photos</strong><div className="text-muted-foreground">10 XP for each of your first 10 approved repeater photos.</div></div>
          <div><strong>🧰 Equipment Submissions</strong><div className="text-muted-foreground">10 XP for each of your first 20 approved equipment submissions.</div></div>
          <div><strong>💬 Repeater Comments</strong><div className="text-muted-foreground">2 XP for a qualifying repeater comment, limited by the daily/repeater rules.</div></div>
          <div><strong>📞 Direct Radio Calls</strong><div className="text-muted-foreground">2 XP per completed direct call, up to 3 XP-earning calls per day.</div></div>
        </div>
      </details>
    </Card>
    {myRank > 0 && <Card className="p-4">Your rank: <strong>#{myRank}</strong> of {ranked.length} operators</Card>}
    {error && <Card className="p-4 text-destructive">{error}</Card>}
    {loading ? <div className="space-y-3">{[1,2,3,4,5].map((n) => <div key={n} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div> :
      ranked.length === 0 ? <Card className="p-10 text-center text-muted-foreground">No leaderboard activity is available yet.</Card> :
      <div className="space-y-3">{ranked.map((r, i) => <Card key={r.userId} className="p-4 flex items-center gap-4">
        <div className="w-10 text-center font-bold text-lg">{i < 3 ? ['🥇','🥈','🥉'][i] : `#${i + 1}`}</div>
        {r.avatar ? <img src={r.avatar} alt="" className="w-11 h-11 rounded-full object-cover" /> : <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center font-semibold">{(r.displayName || 'M').slice(0,1).toUpperCase()}</div>}
        <div className="min-w-0 flex-1"><div className="font-semibold flex items-center gap-1.5 min-w-0"><span className="truncate">{r.displayName}</span><StaffTag userId={r.userId} /></div><div className="text-sm text-muted-foreground">{r.callsign || 'No callsign'} · Level {r.level}</div></div>
        <div className="text-right"><div className="font-bold">{r.score.toLocaleString()} XP</div></div>
      </Card>)}</div>}
  </div>;
}
