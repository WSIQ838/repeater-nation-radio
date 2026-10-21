import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, UserPlus, Check, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { timeAgo } from '@/lib/timeAgo';
import { Image } from '@/components/ui/image';
import { useToast } from '@/components/ui/use-toast';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';
import LinkPreviews from '@/components/shared/LinkPreviews';

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
const isInternalLink = (url) => typeof url === 'string' && url.startsWith('/');

export default function NotificationDetailDialog({ notification, open, onOpenChange, onRead }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [me, setMe] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [csActing, setCsActing] = useState(false);
  const [csDecided, setCsDecided] = useState(null);

  useEffect(() => { base44.auth.me().then(setMe).catch(() => {}); }, []);
  useEffect(() => { setAccepted(false); setCsDecided(null); }, [notification?.id]);

  useEffect(() => {
    if (open && notification && !notification.read) {
      base44.entities.UserNotification.update(notification.id, {
        read: true,
        read_date: new Date().toISOString(),
      })
        .then(() => onRead?.(notification.id))
        .catch(() => {});
    }
  }, [open, notification]);

  const handleAccept = async () => {
    const requesterId = getRequesterId(notification);
    if (!requesterId) return;
    if (!me) { toast({ title: 'Still loading your account — try again in a moment', variant: 'destructive' }); return; }
    setAccepting(true);
    try {
      const fs = await base44.entities.Friendship.filter({
        requester_id: requesterId,
        recipient_id: me.id,
        status: 'pending',
      }, '-created_date', 1);
      if (fs?.[0]) {
        await base44.entities.Friendship.update(fs[0].id, { status: 'accepted' });
        base44.functions.invoke('notify-friend-accepted', { friendship_id: fs[0].id })
          .catch((e) => console.error('friend accepted notify failed', e));
        setAccepted(true);
        toast({ title: 'Friend request accepted', description: 'You are now friends.' });
      } else {
        toast({ title: 'Could not find friend request', description: 'It may have already been accepted or cancelled.', variant: 'destructive' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Could not accept friend request', variant: 'destructive' });
    }
    setAccepting(false);
  };

  const showAccept = isFriendRequest(notification) && !accepted;
  const showCallsignActions = isCallsignRequest(notification) && !csDecided;
  const linkInternal = notification?.link_url && isInternalLink(notification.link_url);

  const handleCallsignAction = async (action) => {
    const requestId = getCallsignRequestId(notification);
    if (!requestId) return;
    setCsActing(true);
    try {
      const res = await base44.functions.invoke('callsign-manage', { action, request_id: requestId });
      if (res.data?.ok) {
        setCsDecided(action);
        toast({ title: action === 'approve' ? 'Request approved' : 'Request denied' });
      } else {
        toast({ title: 'Error', description: res.data?.error || 'Action failed', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: e.message || 'Action failed', variant: 'destructive' });
    }
    setCsActing(false);
  };

  return (
    <Dialog open={open && !!notification} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {notification && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-heading">{notification.title}</DialogTitle>
              <DialogDescription className="text-xs">
                {notification.sender_name && <span className="inline-flex items-center gap-1">From {notification.sender_name}<StaffTag userId={notification.created_by_id} /> · </span>}
                {timeAgo(notification.created_date)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm whitespace-pre-wrap leading-relaxed break-words"><Linkify text={notification.message} /></p><LinkPreviews text={notification.message} />
              {notification.image_url && (
                <div className="rounded-lg overflow-hidden border border-border">
                  <Image src={notification.image_url} alt="" className="w-full max-h-80 object-cover" fittingType="fit" />
                </div>
              )}
              {showAccept && (
                <Button onClick={handleAccept} disabled={accepting || !me} className="w-full">
                  {accepting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                  {accepting ? 'Accepting…' : !me ? 'Loading…' : 'Accept Friend Request'}
                </Button>
              )}
              {accepted && (
                <div className="flex items-center gap-2 text-sm font-medium text-success bg-success/10 rounded-lg px-3 py-2">
                  <Check className="w-4 h-4" /> Friend request accepted — you are now friends!
                </div>
              )}
              {showCallsignActions && (
                <div className="flex gap-2">
                  <Button onClick={() => handleCallsignAction('approve')} disabled={csActing} className="flex-1">
                    {csActing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Approve
                  </Button>
                  <Button onClick={() => handleCallsignAction('deny')} disabled={csActing} variant="destructive" className="flex-1">
                    {csActing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                    Deny
                  </Button>
                </div>
              )}
              {csDecided && (
                <div className="flex items-center gap-2 text-sm font-medium text-success bg-success/10 rounded-lg px-3 py-2">
                  <Check className="w-4 h-4" /> Callsign access request {csDecided === 'approve' ? 'approved' : 'denied'}.
                </div>
              )}
              {notification.link_url && (
                linkInternal ? (
                  <Button variant={showAccept ? 'outline' : 'default'} className="w-full" onClick={() => { onOpenChange(false); navigate(notification.link_url); }}>
                    {notification.link_label || 'Open Link'}
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button variant={showAccept ? 'outline' : 'default'} asChild className="w-full">
                    <a href={notification.link_url} target="_blank" rel="noopener noreferrer">
                      {notification.link_label || 'Open Link'}
                      <ExternalLink className="w-4 h-4 ml-2" />
                    </a>
                  </Button>
                )
              )}
              <div className="text-xs text-muted-foreground pt-3 border-t border-border">
                Received: {new Date(notification.created_date).toLocaleString()}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}