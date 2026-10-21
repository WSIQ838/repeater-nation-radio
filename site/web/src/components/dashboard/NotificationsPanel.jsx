import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  CheckCheck, Trash2, Inbox, Megaphone, MessageCircle, RadioTower,
  AlertTriangle, Settings as SettingsIcon, ChevronDown, ChevronUp,
  UserPlus, Check, Loader2, CheckCircle2, XCircle, Heart,
} from 'lucide-react';
import { timeAgo } from '@/lib/timeAgo';
import NotificationDetailDialog from '@/components/notifications/NotificationDetailDialog';
import { Image as ImageComponent } from '@/components/ui/image';
import { useToast } from '@/components/ui/use-toast';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

const isFriendRequest = (n) => (n?.description || '').startsWith('friend_request:');
const getRequesterId = (n) => {
  const d = n?.description || '';
  return d.startsWith('friend_request:') ? d.slice('friend_request:'.length) : null;
};
const isCallsignRequest = (n) => (n?.description || '').startsWith('callsign_request:');
const getCallsignRequestId = (n) => {
  const d = n?.description || '';
  return d.startsWith('callsign_request:') ? d.slice('callsign_request:'.length) : null;
};

const NOTIF_TYPES = {
  announcement: { icon: Megaphone, tint: 'text-orange-500' },
  message: { icon: MessageCircle, tint: 'text-blue-500' },
  forum_reply: { icon: MessageCircle, tint: 'text-green-500' },
  access_request: { icon: RadioTower, tint: 'text-orange-500' },
  mention: { icon: MessageCircle, tint: 'text-purple-500' },
  like: { icon: Heart, tint: 'text-pink-500' },
  comment: { icon: MessageCircle, tint: 'text-cyan-500' },
  system: { icon: SettingsIcon, tint: 'text-slate-500' },
  alert: { icon: AlertTriangle, tint: 'text-red-500' },
};

export default function NotificationsPanel({ userId, bare = false }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [accepting, setAccepting] = useState(new Set());
  const [acceptedIds, setAcceptedIds] = useState(new Set());
  const [csActing, setCsActing] = useState(new Set());
  const [csDecided, setCsDecided] = useState({});
  const { toast } = useToast();

  const handleAccept = async (e, n) => {
    e.stopPropagation();
    const requesterId = getRequesterId(n);
    if (!requesterId || !userId) return;
    setAccepting((prev) => new Set(prev).add(n.id));
    try {
      const fs = await base44.entities.Friendship.filter({
        requester_id: requesterId,
        recipient_id: userId,
        status: 'pending',
      }, '-created_date', 1);
      if (fs?.[0]) {
        await base44.entities.Friendship.update(fs[0].id, { status: 'accepted' });
        base44.functions.invoke('notify-friend-accepted', { friendship_id: fs[0].id })
          .catch((e) => console.error('friend accepted notify failed', e));
        setAcceptedIds((prev) => new Set(prev).add(n.id));
        toast({ title: 'Friend request accepted', description: 'You are now friends.' });
      } else {
        toast({ title: 'Could not find friend request', description: 'It may have already been accepted or cancelled.', variant: 'destructive' });
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Could not accept friend request', variant: 'destructive' });
    }
    setAccepting((prev) => { const next = new Set(prev); next.delete(n.id); return next; });
  };

  const handleCallsignAction = async (e, n, action) => {
    e.stopPropagation();
    const requestId = getCallsignRequestId(n);
    if (!requestId) return;
    setCsActing((prev) => new Set(prev).add(n.id));
    try {
      const res = await base44.functions.invoke('callsign-manage', { action, request_id: requestId });
      if (res.data?.ok) {
        setCsDecided((prev) => ({ ...prev, [n.id]: action }));
        toast({ title: action === 'approve' ? 'Request approved' : 'Request denied' });
      } else {
        toast({ title: 'Error', description: res.data?.error || 'Action failed', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'Action failed', variant: 'destructive' });
    }
    setCsActing((prev) => { const next = new Set(prev); next.delete(n.id); return next; });
  };

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = async () => {
      try {
        const all = await base44.entities.UserNotification.filter({ user_id: userId }, '-created_date', 500);
        const now = Date.now();
        if (active) setNotifications((all || []).filter((n) => !n.scheduled_date || new Date(n.scheduled_date).getTime() <= now));
      } catch (e) { console.error(e); }
      if (active) setLoading(false);
    };
    load();

    const unsubscribe = base44.entities.UserNotification.subscribe((event) => {
      const n = event?.data;
      if (!n || n.user_id !== userId) return;
      if (event.type === 'create') {
        if (n.scheduled_date && new Date(n.scheduled_date).getTime() > Date.now()) return;
        setNotifications((prev) => prev.some((x) => x.id === n.id) ? prev : [n, ...prev]);
      } else if (event.type === 'update') {
        setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, ...n } : x));
      } else if (event.type === 'delete') {
        setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      }
    });
    return () => { active = false; unsubscribe?.(); };
  }, [userId]);

  const handleRead = (id) => {
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (!unread.length) return;
    try {
      await base44.entities.UserNotification.bulkUpdate(
        unread.map((n) => ({ id: n.id, read: true, read_date: new Date().toISOString() }))
      );
      setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await base44.entities.UserNotification.delete(id);
      setNotifications((ns) => ns.filter((n) => n.id !== id));
    } catch (err) { console.error(err); }
  };

  const openDetail = (n) => {
    setSelected(n);
    setDetailOpen(true);
  };

  const filtered = notifications.filter((n) =>
    filter === 'unread' ? !n.read : filter === 'read' ? n.read : true
  );
  const unreadCount = notifications.filter((n) => !n.read).length;
  const visible = expanded ? filtered : filtered.slice(0, 5);

  return (
    <Card className={bare ? 'p-0 border-0 shadow-none bg-transparent' : 'p-5'}>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="font-heading font-semibold text-[15px]">Notifications</h3>
          <span className="text-xs text-muted-foreground">{unreadCount} unread of {notifications.length}</span>
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4 mr-1.5" /> Mark all read
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4">
        {['all', 'unread', 'read'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs capitalize transition-colors ${filter === f ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground'}`}
          >
            {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Read'}
            {f === 'unread' && unreadCount > 0 && <span>({unreadCount})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center">
          <Inbox className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {filter === 'unread' ? 'No unread notifications' : filter === 'read' ? 'No read notifications' : 'No notifications yet'}
          </p>
        </div>
      ) : (
        <>
          <div className={bare ? 'space-y-1 max-h-[60vh] overflow-y-auto pr-1' : 'space-y-1'}>
            {visible.map((n) => {
              const typeInfo = NOTIF_TYPES[n.type] || NOTIF_TYPES.announcement;
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 py-1.5 cursor-pointer hover:bg-accent/40 rounded-lg p-2 -mx-2 ${!n.read ? 'bg-primary/5' : ''}`}
                  onClick={() => openDetail(n)}
                >
                  <div className={`mt-0.5 shrink-0 ${typeInfo.tint}`}>
                    <typeInfo.icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      <span className={`text-sm ${!n.read ? 'font-semibold' : 'font-medium'} truncate`}>{n.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate"><Linkify text={n.message} /></p>
                    {n.image_url && (
                      <div className="mt-1 w-14 h-14 rounded-md overflow-hidden border border-border shrink-0">
                        <ImageComponent src={n.image_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{timeAgo(n.created_date)}</span>
                      {n.sender_name && <span className="inline-flex items-center gap-1">· {n.sender_name}<StaffTag userId={n.created_by_id} compact /></span>}
                    </div>
                    {isFriendRequest(n) && !acceptedIds.has(n.id) && (
                      <button
                        onClick={(e) => handleAccept(e, n)}
                        disabled={accepting.has(n.id)}
                        className="mt-1.5 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-success/15 text-success text-xs font-medium hover:bg-success/25 disabled:opacity-50 transition-colors"
                      >
                        {accepting.has(n.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                        Accept
                      </button>
                    )}
                    {acceptedIds.has(n.id) && (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-success">
                        <Check className="w-3 h-3" /> Accepted
                      </span>
                    )}
                    {isCallsignRequest(n) && !csDecided[n.id] && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          onClick={(e) => handleCallsignAction(e, n, 'approve')}
                          disabled={csActing.has(n.id)}
                          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-success/15 text-success text-xs font-medium hover:bg-success/25 disabled:opacity-50 transition-colors"
                        >
                          {csActing.has(n.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Approve
                        </button>
                        <button
                          onClick={(e) => handleCallsignAction(e, n, 'deny')}
                          disabled={csActing.has(n.id)}
                          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-destructive/15 text-destructive text-xs font-medium hover:bg-destructive/25 disabled:opacity-50 transition-colors"
                        >
                          <XCircle className="w-3 h-3" />
                          Deny
                        </button>
                      </div>
                    )}
                    {csDecided[n.id] && (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-success">
                        <Check className="w-3 h-3" /> {csDecided[n.id] === 'approve' ? 'Approved' : 'Denied'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, n.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          {filtered.length > 5 && (
            <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setExpanded((v) => !v)}>
              {expanded ? (<><ChevronUp className="w-4 h-4 mr-1.5" /> Show less</>) : (<><ChevronDown className="w-4 h-4 mr-1.5" /> Show {filtered.length - 5} more</>)}
            </Button>
          )}
        </>
      )}

      <NotificationDetailDialog
        notification={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRead={handleRead}
      />
    </Card>
  );
}