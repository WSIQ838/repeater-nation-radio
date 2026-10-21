import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Radio, CalendarDays, Clock, User, ArrowRight, Loader2, Zap, Video, Users,
} from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

const RECURRING_LABELS = {
  none: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

function NetCard({ net, canManage }) {
  const isLive = net.status === 'active';
  const isCancelled = net.status === 'cancelled';
  const isEnded = net.status === 'ended';

  const scheduleText = [
    RECURRING_LABELS[net.recurring] || 'One-time',
    net.scheduled_date ? format(new Date(net.scheduled_date), 'EEE, MMM d') : null,
    net.start_time ? format(new Date(`2000-01-01T${net.start_time}`), 'h:mm a') : null,
  ].filter(Boolean).join(' — ');

  const freqText = [
    net.frequency ? `${net.frequency} MHz` : null,
    net.channel ? `CH ${net.channel}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Card className={`p-4 ${isLive ? 'border-success/50 bg-success/5' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-heading font-semibold truncate">{net.name}</span>
            {isLive && (
              <Badge className="bg-success text-success-foreground shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse mr-1" />
                LIVE NOW
              </Badge>
            )}
            {isCancelled && (
              <Badge variant="outline" className="text-muted-foreground shrink-0">Cancelled</Badge>
            )}
            {isEnded && (
              <Badge variant="outline" className="text-muted-foreground shrink-0">Ended</Badge>
            )}
            {!isLive && !isCancelled && !isEnded && (
              <Badge variant="outline" className="text-muted-foreground shrink-0">Scheduled</Badge>
            )}
          </div>
          {net.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2"><Linkify text={net.description} /></p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
            {net.operator_callsign && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> Net Control: {net.operator_callsign}<StaffTag userId={net.primary_user_id} callsign={net.primary_user_id ? undefined : net.operator_callsign} />
              </span>
            )}
            {scheduleText && (
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> {scheduleText}
              </span>
            )}
            {freqText && (
              <span className="flex items-center gap-1">
                <Radio className="w-3 h-3" /> {freqText}
              </span>
            )}
            {net.repeater_name && (
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" /> {net.repeater_name}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        {isLive ? (
          <Button size="sm" asChild>
            <Link to="/tools/net-control">
              <Video className="w-3.5 h-3.5 mr-1.5" /> Join Live Session
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" asChild>
            <Link to="/tools/net-control">
              View Net <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function ClubNets({ clubId, canManage }) {
  const [nets, setNets] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNets = useCallback(async () => {
    try {
      const result = await base44.entities.NetControlSession.filter(
        { club_id: clubId },
        '-updated_date',
        200
      );
      setNets(result || []);
    } catch (e) {
      console.error('Club nets load error:', e);
    }
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    loadNets();
    // Every net session change on the site reaches every open club page, and
    // a live net updates its session often. Only this club's nets reload the
    // list, and a burst reloads it once.
    let timer = null;
    const unsubscribe = base44.entities.NetControlSession.subscribe((event) => {
      const row = event?.data;
      if (row && !row._oversize && event.type !== 'delete' && row.club_id !== clubId) return;
      if (timer) return;
      timer = setTimeout(() => { timer = null; loadNets(); }, 1000);
    });
    return () => { unsubscribe?.(); if (timer) clearTimeout(timer); };
  }, [loadNets, clubId]);

  if (loading) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading club nets…
        </div>
      </Card>
    );
  }

  if (nets.length === 0) {
    return (
      <Card className="p-6 text-center">
        <div className="grid place-items-center w-12 h-12 rounded-2xl bg-muted text-muted-foreground mx-auto mb-3">
          <Radio className="w-6 h-6" />
        </div>
        <h3 className="font-heading font-semibold">No nets currently associated with this club.</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {canManage
            ? 'Create a net from Net Control and associate it with this club to see it here.'
            : 'Ask a club administrator to associate a net with this club.'}
        </p>
        {canManage && (
          <Button size="sm" variant="outline" className="mt-4" asChild>
            <Link to="/tools/net-control">
              <Users className="w-4 h-4 mr-1.5" /> Go to Net Control
            </Link>
          </Button>
        )}
      </Card>
    );
  }

  const now = new Date();
  const liveNets = nets.filter((n) => n.status === 'active');
  const upcomingNets = nets
    .filter((n) => n.status === 'scheduled' && (!n.scheduled_date || new Date(n.scheduled_date) >= now))
    .sort((a, b) => new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0));
  const pastNets = nets
    .filter((n) => !liveNets.includes(n) && !upcomingNets.includes(n))
    .sort((a, b) => new Date(b.scheduled_date || b.updated_date || 0) - new Date(a.scheduled_date || a.updated_date || 0));

  return (
    <div className="space-y-5">
      {liveNets.length > 0 && (
        <div>
          <h3 className="font-heading font-semibold mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            Live Nets
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {liveNets.map((n) => (
              <NetCard key={n.id} net={n} canManage={canManage} />
            ))}
          </div>
        </div>
      )}

      {upcomingNets.length > 0 && (
        <div>
          <h3 className="font-heading font-semibold mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Upcoming Nets
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {upcomingNets.map((n) => (
              <NetCard key={n.id} net={n} canManage={canManage} />
            ))}
          </div>
        </div>
      )}

      {pastNets.length > 0 && (
        <div>
          <h3 className="font-heading font-semibold mb-2 flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="w-4 h-4" /> Past Nets
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {pastNets.slice(0, 10).map((n) => (
              <NetCard key={n.id} net={n} canManage={canManage} />
            ))}
          </div>
          {pastNets.length > 10 && (
            <p className="text-xs text-muted-foreground mt-2">
              Showing 10 of {pastNets.length} past nets.
            </p>
          )}
        </div>
      )}
    </div>
  );
}