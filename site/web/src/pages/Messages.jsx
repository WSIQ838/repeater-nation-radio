import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Mail, Send, MessageCircle, Check, CheckCheck, Users, Trash2, ArrowLeft } from 'lucide-react';
import { formatOnlineStatus } from '@/lib/onlineStatus';
import EmojiPicker from '@/components/messages/EmojiPicker';
import AttachmentUploader, { AttachmentPreviews, MessageAttachments } from '@/components/messages/AttachmentUploader';
import SidebarConnections from '@/components/messages/SidebarConnections';
import MessageBody from '@/components/messages/MessageBody';
import StaffTag from '@/components/shared/StaffTag';
import LinkPreviews from '@/components/shared/LinkPreviews';

const toLocalDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = hasTimezone ? raw : `${raw}${raw.includes('T') ? 'Z' : 'T00:00:00Z'}`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getTime = (value) => toLocalDate(value)?.getTime() || 0;
const formatMessageTime = (value) => {
  const date = toLocalDate(value);
  return date ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
};

// Keep one copy of every message and always keep the newest message first.
// This protects the UI from a realtime create event arriving immediately before/after a poll.
const mergeMessages = (current, incoming) => {
  const byId = new Map();

  [...current, ...(Array.isArray(incoming) ? incoming : [])].forEach((message) => {
    if (!message) return;
    const id = message.id;
    if (id) {
      const key = String(id);
      byId.set(key, { ...byId.get(key), ...message });
      return;
    }

    // Older records without an id should still not render twice when their contents match.
    const fallbackKey = [
      message.conversation_id,
      message.sender_id,
      message.recipient_id,
      message.created_date,
      message.body,
    ].map((v) => String(v ?? '')).join('|');
    if (!byId.has(`fallback:${fallbackKey}`)) byId.set(`fallback:${fallbackKey}`, message);
  });

  return Array.from(byId.values())
    .sort((a, b) => getTime(b.created_date) - getTime(a.created_date));
};

export default function Messages() {
  const [me, setMe] = useState(null);
  const [messages, setMessages] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [friends, setFriends] = useState([]);
  const [presence, setPresence] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState(null);
  const [searchParams] = useSearchParams();
  const scrollRef = useRef(null);

  useEffect(() => { base44.auth.me().then(setMe).catch(() => {}); }, []);

  const load = async () => {
    if (!me) return;
    setLoading(true);
    try {
      const [msgs, profs] = await Promise.all([
        base44.entities.Message.list('-created_date', 500),
        base44.entities.Profile.list('-updated_date', 500),
      ]);
      setMessages((current) => mergeMessages(current, msgs));
      setProfiles(Array.isArray(profs) ? profs : []);

      const toDeliver = (msgs || []).filter((m) => m.recipient_id === me.id && (m.status || 'sent') === 'sent');
      if (toDeliver.length) {
        setMessages((current) => current.map((m) =>
          toDeliver.some((u) => String(u.id) === String(m.id))
            ? { ...m, status: 'delivered' }
            : m
        ));
        base44.functions.invoke('message-status', { action: 'delivered' }).catch(() => {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (me) load(); }, [me]);

  useEffect(() => {
    if (!me) return;
    let running = false;
    const poll = async () => {
      if (running || document.hidden) return; // realtime still delivers while hidden
      running = true;
      try {
        const next = await base44.entities.Message.list('-created_date', 500);
        if (Array.isArray(next)) {
          setMessages((current) => mergeMessages(current, next));
          const toDeliver = next.filter((m) => m.recipient_id === me.id && (m.status || 'sent') === 'sent');
          if (toDeliver.length) {
            setMessages((current) => current.map((m) =>
              toDeliver.some((u) => String(u.id) === String(m.id))
                ? { ...m, status: 'delivered' }
                : m
            ));
            base44.functions.invoke('message-status', { action: 'delivered' }).catch(() => {});
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        running = false;
      }
    };
    // Realtime subscription delivers new messages immediately; this poll is
    // only a recovery/backstop, and each one reads up to 500 messages, so once
    // a minute is plenty.
    const timer = setInterval(poll, 60000);
    return () => clearInterval(timer);
  }, [me]);

  useEffect(() => {
    if (!me) return;
    base44.entities.Friendship.list('-created_date', 500).then((rows) => {
      const list = (rows || []).filter((f) => f.status === 'accepted').map((f) => {
        const requester = f.requester_id === me.id;
        return { id: requester ? f.recipient_id : f.requester_id, name: requester ? f.recipient_name : f.requester_name };
      }).filter((f) => f.id && f.id !== me.id);
      setFriends(list);
    }).catch(console.error);
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const unsubscribe = base44.entities.Message.subscribe((event) => {
      if (!event?.type || !event.data) return;
      const eventMessage = event.data;
      if (eventMessage.sender_id !== me.id && eventMessage.recipient_id !== me.id) return;

      setMessages((prev) => {
        const id = eventMessage.id || event.id;
        if (event.type === 'delete') {
          return id ? prev.filter((m) => String(m.id) !== String(id)) : prev;
        }
        if (event.type !== 'create' && event.type !== 'update') return prev;
        return mergeMessages(prev, [{ ...eventMessage, id }]);
      });
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [me]);

  useEffect(() => {
    const id = searchParams.get('u');
    if (id) setActiveId(id);
    const listingTitle = searchParams.get('listing');
    if (listingTitle && !draft) setDraft(`Hi! I'm interested in your Community Marketplace listing: "${listingTitle}"`);
  }, [searchParams]);

  const profileByUserId = useMemo(() => {
    const map = {};
    profiles.forEach((p) => { if (p?.created_by_id) map[String(p.created_by_id)] = p; });
    return map;
  }, [profiles]);

  const getProfile = (id) => profileByUserId[String(id)] || null;
  const getName = (id) => {
    const p = getProfile(id);
    if (p?.display_name) return p.display_name;
    const friend = friends.find((f) => String(f.id) === String(id));
    if (friend?.name) return friend.name;
    const m = messages.find((x) => x.sender_id === id || x.recipient_id === id);
    if (m) return m.sender_id === id ? m.sender_name : m.recipient_name;
    return 'Member';
  };
  const getAvatar = (id) => getProfile(id)?.avatar_url || getProfile(id)?.profile_picture || getProfile(id)?.profile_image || null;

  const conversations = useMemo(() => {
    if (!me) return [];
    const map = {};
    messages.forEach((m) => {
      const otherId = m.sender_id === me.id ? m.recipient_id : m.sender_id;
      if (!otherId || otherId === me.id) return;
      if (!map[otherId]) map[otherId] = { userId: otherId, messages: [], lastDate: m.created_date, lastBody: '', unread: 0 };
      map[otherId].messages.push(m);
      if (m.recipient_id === me.id && !m.read) map[otherId].unread++;
      if (getTime(m.created_date) >= getTime(map[otherId].lastDate)) {
        map[otherId].lastDate = m.created_date;
        map[otherId].lastBody = m.body || (m.attachments?.length ? `📎 ${m.attachments.length} attachment${m.attachments.length > 1 ? 's' : ''}` : '');
      }
    });
    return Object.values(map)
      .map((c) => ({ ...c, name: getName(c.userId), avatarUrl: getAvatar(c.userId) }))
      .sort((a, b) => getTime(b.lastDate) - getTime(a.lastDate));
  }, [messages, me, profiles, friends]);

  useEffect(() => { if (!activeId && conversations.length) setActiveId(conversations[0].userId); }, [conversations, activeId]);

  const presenceIds = useMemo(
    () => Array.from(new Set([...conversations.map((c) => c.userId), ...friends.map((f) => f.id), activeId].filter(Boolean))).join(','),
    [conversations, friends, activeId]
  );

  useEffect(() => {
    if (!presenceIds || !me) { setPresence({}); return; }
    const fetchPresence = () => {
      if (document.hidden) return; // don't poll from a background tab
      base44.functions.invoke('getFriendsPresence', { user_ids: presenceIds.split(','), requester_id: me.id }).then((r) => {
        const map = {};
        (r?.data?.users || r?.users || []).forEach((u) => { if (u?.id) map[u.id] = u; });
        setPresence(map);
      }).catch(() => {});
    };
    fetchPresence();
    const timer = setInterval(fetchPresence, 30000);
    return () => clearInterval(timer);
  }, [presenceIds, me]);

  const activeConv = conversations.find((c) => String(c.userId) === String(activeId));
  const activeMessages = activeConv
    ? [...activeConv.messages].sort((a, b) => getTime(a.created_date) - getTime(b.created_date))
    : [];
  const chatName = activeConv?.name || getName(activeId) || 'Member';
  const chatAvatar = activeConv?.avatarUrl || getAvatar(activeId);
  const activeStatus = presence[activeId]?.last_active ? formatOnlineStatus(presence[activeId].last_active) : null;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeMessages.length, activeId]);

  useEffect(() => {
    if (!activeConv || !me) return;
    const unread = activeConv.messages.filter((m) => m.recipient_id === me.id && (m.status !== 'read' || !m.read));
    if (unread.length) base44.functions.invoke('message-status', { action: 'read', ids: unread.map((m) => m.id) }).catch(() => {});
    if (unread.length) {
      setMessages((ms) => ms.map((m) =>
        unread.some((u) => String(u.id) === String(m.id))
          ? { ...m, read: true, status: 'read' }
          : m
      ));
    }
  }, [activeId, activeConv, me]);

  const addAttachment = async (att) => {
    const id = crypto.randomUUID?.() || String(Math.random());
    setPendingAttachments((p) => [...p, { ...att, id }]);
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file: att.file });
      const url = res?.file_url || res?.data?.file_url;
      setPendingAttachments((p) => p.map((a) => a.id === id ? { ...a, url, uploading: false } : a));
    } catch {
      setPendingAttachments((p) => p.filter((a) => a.id !== id));
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (id) => setPendingAttachments((p) => p.filter((a) => a.id !== id));

  const deleteConversation = async (conversation) => {
    if (!conversation?.messages?.length || deletingConversation) return;
    if (!window.confirm(`Delete this conversation with ${conversation.name}? This will permanently delete all messages in this conversation.`)) return;
    setDeletingConversation(conversation.userId);
    try {
      await Promise.all(conversation.messages.map((m) => base44.entities.Message.delete(m.id)));
      setMessages((current) => current.filter((m) => !conversation.messages.some((x) => String(x.id) === String(m.id))));
      if (String(activeId) === String(conversation.userId)) {
        setActiveId(null);
        setDraft('');
        setPendingAttachments([]);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      load();
    } finally {
      setDeletingConversation(null);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    if ((!draft.trim() && !pendingAttachments.length) || !activeId || !me || uploading) return;
    const body = draft.trim();
    const attachments = pendingAttachments.map(({ url, type, name, mime }) => ({ url, type, name, mime }));
    setDraft('');
    setPendingAttachments([]);
    try {
      const msg = await base44.entities.Message.create({
        conversation_id: [me.id, activeId].sort().join('__'),
        sender_id: me.id,
        sender_name: me.full_name || me.email,
        recipient_id: activeId,
        recipient_name: chatName,
        body,
        attachments,
        read: false,
        status: 'sent'
      });
      setMessages((current) => mergeMessages(current, [msg]));
      base44.functions.invoke('notify-message', { recipient_id: activeId }).catch((err) => console.error('notify-message failed:', err));
    } catch (err) {
      console.error(err);
      setDraft(body);
      setPendingAttachments(pendingAttachments);
    }
  };

  if (!me) return <div className="p-8 max-w-4xl mx-auto"><div className="h-48 rounded-xl bg-muted animate-pulse" /></div>;

  const AvatarFor = ({ id, name, url, small = false }) => (
    <Avatar className={`${small ? 'w-9 h-9 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0`}>
      {url && <AvatarImage src={url} alt={name || 'Member'} className="object-cover" />}
      <AvatarFallback className="bg-navy text-white font-bold text-sm">{(name || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );

  return <div className="p-5 sm:p-8 max-w-6xl mx-auto space-y-4">
    <div><h1 className="text-2xl sm:text-3xl font-heading font-bold">Messages</h1><p className="text-muted-foreground mt-1">{conversations.length} conversations</p></div>
    {conversations.length === 0 && friends.length === 0 && !loading && !activeId ? <Card className="p-12 text-center"><MessageCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><h2 className="font-heading font-semibold text-lg">No messages yet</h2><p className="text-sm text-muted-foreground mt-1">Visit a member's profile to start a conversation.</p><Link to="/directory"><Button variant="outline" className="mt-4">Browse Members</Button></Link></Card> : <div className="grid md:grid-cols-3 gap-4 md:h-[70vh]">
      <Card className={`p-0 overflow-hidden md:col-span-1 h-[70vh] md:h-full flex-col ${activeId ? 'hidden md:flex' : 'flex'}`}>{loading ? <div className="flex-1 p-2">{[1,2,3,4].map((i) => <div key={i} className="h-16 m-1 rounded-lg bg-muted animate-pulse" />)}</div> : <Tabs defaultValue="conversations" className="flex flex-col flex-1 min-h-0">
        <TabsList className="rounded-none border-b border-border bg-transparent h-auto p-0 w-full justify-start"><TabsTrigger value="conversations" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 py-2.5"><MessageCircle className="w-3.5 h-3.5" /> Conversations {conversations.length > 0 && <span className="text-xs text-muted-foreground">({conversations.length})</span>}</TabsTrigger><TabsTrigger value="friends" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 py-2.5"><Users className="w-3.5 h-3.5" /> Friends {friends.length > 0 && <span className="text-xs text-muted-foreground">({friends.length})</span>}</TabsTrigger></TabsList>
        <TabsContent value="conversations" className="mt-0 flex-1 min-h-0 overflow-y-auto">{conversations.length ? conversations.map((c) => { const st = presence[c.userId]?.last_active ? formatOnlineStatus(presence[c.userId].last_active) : null; const deleting = deletingConversation === c.userId; return <button key={c.userId} onClick={() => setActiveId(c.userId)} className={`w-full flex items-center gap-3 p-3 text-left border-b border-border hover:bg-accent/40 ${String(activeId) === String(c.userId) ? 'bg-accent/60' : ''}`}><div className="relative"><AvatarFor id={c.userId} name={c.name} url={c.avatarUrl} />{st?.online && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-card" />}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-medium truncate text-sm">{c.name}</span><StaffTag userId={c.userId} compact /><span className="flex-1" /><span role="button" tabIndex={0} title="Delete conversation" aria-label={`Delete conversation with ${c.name}`} onClick={(e) => { e.stopPropagation(); deleteConversation(c); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); deleteConversation(c); } }} className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive">{deleting ? <span className="block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}</span></div>{st && <div className={`text-xs ${st.online ? 'text-success font-medium' : st.idle ? 'text-amber-500 font-medium' : 'text-muted-foreground'}`}>{st.online ? '🟢 Online' : st.idle ? '🟡 Idle' : st.text}</div>}<div className="text-xs text-muted-foreground truncate">{c.lastBody}</div></div></button>; }) : <div className="p-6 text-center text-sm text-muted-foreground">No conversations yet. Start one from the Friends tab.</div>}</TabsContent>
        <TabsContent value="friends" className="mt-0 flex-1 min-h-0 overflow-y-auto">{friends.length ? friends.map((f) => { const name = getName(f.id); return <button key={f.id} onClick={() => setActiveId(f.id)} className={`w-full flex items-center gap-3 p-3 text-left border-b border-border hover:bg-accent/40 ${String(activeId) === String(f.id) ? 'bg-accent/60' : ''}`}><AvatarFor id={f.id} name={name} url={getAvatar(f.id)} /><span className="font-medium truncate text-sm">{name}</span><StaffTag userId={f.id} compact /></button>; }) : <div className="p-6 text-center text-sm text-muted-foreground">No friends yet. Browse members to connect.</div>}</TabsContent>
      </Tabs>}{activeId && <SidebarConnections userId={activeId} onPickFriend={setActiveId} />}</Card>
      <Card className={`md:col-span-2 p-0 overflow-hidden flex-col h-[70vh] md:h-full ${activeId ? 'flex' : 'hidden md:flex'}`}>{activeId ? <><div className="flex items-center gap-3 p-4 border-b border-border"><button type="button" onClick={() => setActiveId(null)} className="md:hidden -ml-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent shrink-0" aria-label="Back to conversations"><ArrowLeft className="w-4 h-4" /></button><Link to={`/members/${activeId}`} className="shrink-0"><AvatarFor id={activeId} name={chatName} url={chatAvatar} small /></Link><Link to={`/members/${activeId}`} className="font-heading font-semibold hover:text-primary">{chatName}</Link><StaffTag userId={activeId} className="ml-1.5" />{activeStatus ? <span className="text-xs text-muted-foreground">{activeStatus.online ? '🟢 Online' : activeStatus.idle ? '🟡 Idle' : activeStatus.text}</span> : <span className="text-xs text-muted-foreground">Offline</span>}</div><div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">{!activeMessages.length && <div className="h-full grid place-items-center text-center text-sm text-muted-foreground"><div><MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />Say hi to {chatName} — send the first message.</div></div>}{activeMessages.map((m) => { const mine = m.sender_id === me.id; return <div key={m.id || `${m.sender_id}-${m.created_date}-${m.body}`} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}><div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>{m.body && <MessageBody body={m.body} linkClassName={mine ? '!text-primary-foreground !decoration-primary-foreground/60' : ''} />}<MessageAttachments attachments={m.attachments} /><div className={`flex items-center gap-1 text-[10px] mt-1 ${mine ? 'justify-end text-primary-foreground/70' : 'text-muted-foreground'}`}><span>{formatMessageTime(m.created_date)}</span>{mine && (m.status === 'read' ? <CheckCheck className="w-3 h-3" /> : m.status === 'delivered' ? <CheckCheck className="w-3 h-3 opacity-60" /> : <Check className="w-3 h-3 opacity-50" />)}</div></div>{m.body && <div className="max-w-[75%] w-full flex flex-col" style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}><LinkPreviews text={m.body} /></div>}</div>; })}</div><form onSubmit={send} className="border-t border-border"><AttachmentPreviews attachments={pendingAttachments} onRemove={removeAttachment} /><div className="flex items-center gap-1 p-3"><AttachmentUploader attachments={pendingAttachments} onAdd={addAttachment} onRemove={removeAttachment} disabled={uploading} /><EmojiPicker onPick={(emoji) => setDraft((d) => d + emoji)} /><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message…" className="flex-1 h-10 px-3 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary/40 outline-none" /><Button type="submit" size="icon" disabled={(!draft.trim() && !pendingAttachments.length) || uploading}><Send className="w-4 h-4" /></Button></div></form></> : <div className="flex-1 grid place-items-center text-muted-foreground text-sm"><div className="text-center"><Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />Select a conversation to view messages.</div></div>}</Card>
    </div>}
  </div>;
}
