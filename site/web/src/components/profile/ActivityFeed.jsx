import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare, Radio, Backpack, Wifi, CalendarDays, Building2, Reply, Activity, ArrowUpRight,
} from 'lucide-react';

const SOURCES = [
  { entity: 'ForumPost', limit: 6, build: (r) => ({ icon: MessageSquare, label: 'Posted in forums', detail: r.title, to: `/forums/${r.id}` }) },
  { entity: 'ForumReply', limit: 6, build: (r) => ({ icon: Reply, label: 'Replied in forums', detail: r.body?.slice(0, 80), to: r.post_id ? `/forums/${r.post_id}` : '/forums' }) },
  { entity: 'ContactLog', limit: 6, build: (r) => ({ icon: Radio, label: 'Logged a contact', detail: r.callsign ? `QSO with ${r.callsign}` : null, to: '/logbook' }) },
  { entity: 'Equipment', limit: 5, build: (r) => ({ icon: Backpack, label: 'Added equipment', detail: r.name, to: '/equipment' }) },
  { entity: 'Repeater', limit: 5, build: (r) => ({ icon: Wifi, label: 'Added a repeater', detail: r.name, to: '/repeaters' }) },
  { entity: 'Event', limit: 5, build: (r) => ({ icon: CalendarDays, label: 'Created an event', detail: r.title, to: '/events' }) },
  { entity: 'Club', limit: 5, build: (r) => ({ icon: Building2, label: 'Created a club', detail: r.name, to: `/clubs/${r.id}` }) },
];

export default function ActivityFeed({ userId }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const results = await Promise.all(
        SOURCES.map(async (s) => {
          try {
            const records = await base44.entities[s.entity].filter(
              { created_by_id: userId }, '-created_date', s.limit
            );
            return (records || []).map((r) => {
              const meta = s.build(r);
              return { ...meta, date: r.created_date, id: r.id };
            });
          } catch { return []; }
        })
      );
      if (!alive) return;
      const merged = results.flat()
        .filter((i) => i?.date)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 15);
      setItems(merged);
    })();
    return () => { alive = false; };
  }, [userId]);

  if (!items) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4"><Activity className="w-5 h-5 text-primary" /><h2 className="font-heading font-semibold text-lg">Recent Activity</h2></div>
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}</div>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Activity className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <h2 className="font-heading font-semibold text-lg">No recent activity</h2>
        <p className="text-sm text-muted-foreground mt-1">This member hasn't posted or logged anything yet.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4"><Activity className="w-5 h-5 text-primary" /><h2 className="font-heading font-semibold text-lg">Recent Activity</h2></div>
      <ol className="space-y-1">
        {items.map((item, idx) => (
          <li key={item.id + '-' + idx}>
            <Link to={item.to} className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/40 transition-colors group">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0"><item.icon className="w-4 h-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{item.label}</div>
                {item.detail && <div className="text-xs text-muted-foreground truncate">{item.detail}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(item.date), { addSuffix: true })}</span>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}