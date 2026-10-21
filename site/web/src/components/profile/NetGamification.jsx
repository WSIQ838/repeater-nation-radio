import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Radio, Flame, Trophy, Calendar, Users, Clock, Award } from 'lucide-react';

export default function NetGamification({ userId }) {
  const [streaks, setStreaks] = useState(null);
  const [clubBadges, setClubBadges] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const [s, b] = await Promise.all([
          base44.entities.NetStreak.filter({ user_id: userId }, '-current_streak', 200).catch(() => []),
          base44.entities.ClubStreakBadge.filter({ user_id: userId }, '-longest_streak', 200).catch(() => []),
        ]);
        if (!alive) return;
        setStreaks(s || []);
        setClubBadges(b || []);
      } catch (e) { console.error(e); }
    })();
    return () => { alive = false; };
  }, [userId]);

  if (!streaks || !clubBadges) return null;
  if (!streaks.length && !clubBadges.length) return null;

  const totalCheckins = streaks.reduce((s, r) => s + (r.total_checkins || 0), 0);
  const totalNets = streaks.reduce((s, r) => s + (r.total_nets_attended || 0), 0);
  const currentStreak = streaks.reduce((m, r) => Math.max(m, r.current_streak || 0), 0);
  const longestStreak = streaks.reduce((m, r) => Math.max(m, r.longest_streak || 0), 0);
  const clubsParticipated = streaks.length;
  const firstNet = streaks.reduce((earliest, r) => {
    if (!r.first_checkin_date) return earliest;
    if (!earliest) return r.first_checkin_date;
    return new Date(r.first_checkin_date) < new Date(earliest) ? r.first_checkin_date : earliest;
  }, null);
  const lastNet = streaks.reduce((latest, r) => {
    if (!r.last_checkin_date) return latest;
    if (!latest) return r.last_checkin_date;
    return new Date(r.last_checkin_date) > new Date(latest) ? r.last_checkin_date : latest;
  }, null);
  const mostAttendedClub = streaks.slice().sort((a, b) => (b.total_nets_attended || 0) - (a.total_nets_attended || 0))[0];

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" /> Net Statistics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Stat icon={Flame} label="Current Streak" value={currentStreak} color="text-orange-500" />
          <Stat icon={Trophy} label="Longest Streak" value={longestStreak} color="text-amber-500" />
          <Stat icon={Radio} label="Total Check-Ins" value={totalCheckins} color="text-blue-500" />
          <Stat icon={Calendar} label="Nets Attended" value={totalNets} color="text-green-500" />
          <Stat icon={Users} label="Clubs" value={clubsParticipated} color="text-purple-500" />
        </div>
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground">
          {firstNet && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> First net: {fmtDate(firstNet)}</span>}
          {lastNet && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Most recent: {fmtDate(lastNet)}</span>}
          {mostAttendedClub && <span className="flex items-center gap-1"><Trophy className="w-3 h-3" /> Most attended: {mostAttendedClub.club_name || '—'} ({mostAttendedClub.total_nets_attended || 0})</span>}
        </div>
      </Card>

      {streaks.length > 0 && (
        <Card className="p-6">
          <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" /> Club Check-In Streaks
          </h2>
          <div className="space-y-3">
            {streaks.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                <div className="text-2xl shrink-0">🔥</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {s.club_id
                      ? <Link to={`/clubs/${s.club_id}`} className="font-medium hover:text-primary truncate">{s.club_name || 'Club'}</Link>
                      : <span className="font-medium truncate">{s.club_name || 'Club'}</span>}
                    <span className="text-lg font-bold text-orange-500">{s.current_streak || 0}</span>
                    <span className="text-xs text-muted-foreground">Net Streak</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
                    <span>Longest: {s.longest_streak || 0}</span>
                    <span>Check-ins: {s.total_checkins || 0}</span>
                    <span>Nets: {s.total_nets_attended || 0}</span>
                    {s.last_checkin_date && <span>Last: {fmtDate(s.last_checkin_date)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {clubBadges.length > 0 && (
        <Card className="p-6">
          <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" /> Club Streak Badges
          </h2>
          <div className="flex flex-wrap gap-3">
            {clubBadges.map((b) => (
              <div key={b.id} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
                <span className="text-xl">🔥</span>
                <div>
                  <div className="text-sm font-bold">{b.club_name || 'Club'}</div>
                  <div className="text-xs text-muted-foreground">{b.longest_streak} Net Streak</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="text-center">
      <Icon className={`w-5 h-5 mx-auto mb-1.5 ${color}`} />
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}