import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Bell, RadioTower, UserPlus, MessageCircle, Inbox, Megaphone } from 'lucide-react';

const broadcastTone = { Announcement: 'text-orange-500', Alert: 'text-red-500', Maintenance: 'text-red-500', System: 'text-slate-500' };

export default function NotificationBell() {
  const [user, setUser] = useState(null);
  const [access, setAccess] = useState([]);
  const [friends, setFriends] = useState([]);
  const [messages, setMessages] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [userNotifs, setUserNotifs] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const u = await base44.auth.me().catch(() => null);
    if (!u) { setUser(null); return; }
    setUser(u);
    const [a, f, m, b, un] = await Promise.all([
      base44.entities.RepeaterAccessRequest.filter({ status: 'Pending' }, '-created_date', 20).catch(() => []),
      base44.entities.Friendship.filter({ recipient_id: u.id, status: 'pending' }, '-created_date', 20).catch(() => []),
      base44.entities.Message.filter({ recipient_id: u.id, read: false }, '-created_date', 20).catch(() => []),
      base44.entities.AdminNotification.filter({ active: true }, '-created_date', 20).catch(() => []),
      base44.entities.UserNotification.filter({ user_id: u.id, read: false }, '-created_date', 20).catch(() => []),
    ]);
    setAccess((a || []).filter((r) => r.owner_id === u.id));
    setFriends(f || []);
    setMessages(m || []);
    setUserNotifs(un || []);
    const now = Date.now();
    setBroadcasts((b || []).filter((n) => !n.expires_at || new Date(n.expires_at).getTime() > now));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh whenever the popover opens so items are current
  useEffect(() => { if (open) load(); }, [open, load]);

  const items = [
    ...userNotifs.map((n) => ({
      key: `un-${n.id}`,
      icon: Bell,
      tint: 'text-primary',
      title: n.title,
      sub: (n.message || '').slice(0, 80),
      to: '/dashboard',
    })),
    ...broadcasts.map((n) => ({
      key: `b-${n.id}`,
      icon: Megaphone,
      tint: broadcastTone[n.type] || 'text-orange-500',
      title: n.title,
      sub: (n.body || '').slice(0, 80),
      to: '/dashboard',
    })),
    ...access.map((r) => ({
      key: `a-${r.id}`,
      icon: RadioTower,
      tint: 'text-orange-500',
      title: `${r.requester_callsign || r.requester_name || 'Someone'} requested access`,
      sub: r.repeater_name || 'Repeater access request',
      to: '/repeaters',
    })),
    ...friends.map((f) => ({
      key: `f-${f.id}`,
      icon: UserPlus,
      tint: 'text-green-500',
      title: `${f.requester_name || 'New member'} sent a friend request`,
      sub: 'Pending',
      to: `/members/${f.requester_id}`,
    })),
    ...messages.map((m) => ({
      key: `m-${m.id}`,
      icon: MessageCircle,
      tint: 'text-blue-500',
      title: `New message from ${m.sender_name || 'someone'}`,
      sub: (m.body || '').slice(0, 60),
      to: '/messages',
    })),
  ];

  const count = items.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-heading font-semibold text-sm">Notifications</h3>
          {count > 0 && <span className="text-xs text-muted-foreground">{count} new</span>}
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-muted-foreground">
              <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">You're all caught up.</p>
            </div>
          ) : (
            items.map((n) => (
              <Link
                key={n.key}
                to={n.to}
                onClick={() => setOpen(false)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/60 transition-colors border-b border-border/50 last:border-0"
              >
                <div className={`mt-0.5 shrink-0 ${n.tint}`}><n.icon className="w-4 h-4" /></div>
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-snug truncate">{n.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{n.sub}</div>
                </div>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}