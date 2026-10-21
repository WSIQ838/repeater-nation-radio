import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Loader2, BarChart3, Megaphone } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';

export default function ClubNetAttendance({ club }) {
  const [sessions, setSessions] = useState([]);
  const [checkIns, setCheckIns] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!club?.id) return;
    setLoading(true);
    (async () => {
      try {
        const nets = await base44.entities.NetControlSession.filter({ club_id: club.id, record_attendance: true }, '-started_at', 200);
        const validNets = (nets || []).filter((n) => n.status === 'ended' || n.status === 'active');
        setSessions(validNets);
        const ciMap = {};
        await Promise.all(validNets.map(async (n) => {
          const cis = await base44.entities.NetControlCheckIn.filter({ session_id: n.id }, 'check_in_time', 500).catch(() => []);
          ciMap[n.id] = cis || [];
        }));
        setCheckIns(ciMap);
      } catch (e) { console.error('Attendance load error:', e); }
      setLoading(false);
    })();
  }, [club?.id]);

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="w-5 h-5 animate-spin" />Loading attendance…</div>;

  const totalCheckIns = Object.values(checkIns).reduce((sum, cis) => sum + cis.length, 0);
  const participation = {};
  Object.values(checkIns).forEach((cis) => {
    cis.forEach((ci) => {
      const key = ci.callsign?.toUpperCase();
      if (key) participation[key] = (participation[key] || 0) + 1;
    });
  });
  const topParticipants = Object.entries(participation).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Nets Attended</div><div className="text-2xl font-heading font-bold">{sessions.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Check-ins</div><div className="text-2xl font-heading font-bold">{totalCheckIns}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Unique Stations</div><div className="text-2xl font-heading font-bold">{Object.keys(participation).length}</div></Card>
      </div>

      {topParticipants.length > 0 && (
        <Card className="p-4">
          <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4" />Top Participants</h3>
          <div className="space-y-1">
            {topParticipants.map(([callsign, count], i) => (
              <div key={callsign} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                <span><span className="text-muted-foreground w-6 inline-block">{i + 1}.</span><span className="font-medium">{callsign}</span></span>
                <Badge variant="secondary">{count} check-in{count !== 1 ? 's' : ''}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2"><Calendar className="w-4 h-4" />Attendance History</h3>
        {sessions.length === 0 ? (
          <div className="text-center py-6">
            <Megaphone className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">No net attendance recorded yet. When members run nets with this club's roster, attendance will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((n) => {
              const cis = checkIns[n.id] || [];
              return (
                <div key={n.id} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2">
                  <div className="flex-1">
                    <div className="font-medium">{n.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {n.started_at && <span>{new Date(n.started_at).toLocaleDateString()}</span>}
                      <span>· {n.net_type}</span>
                      {n.operator_callsign && <span className="inline-flex items-center gap-1">· Op: {n.operator_callsign}<StaffTag userId={n.primary_user_id} callsign={n.primary_user_id ? undefined : n.operator_callsign} compact /></span>}
                    </div>
                  </div>
                  <Badge variant="secondary">{cis.length} check-ins</Badge>
                  <Badge variant="outline">{n.duration_minutes || 0}m</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}