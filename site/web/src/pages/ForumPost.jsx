import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Send, User, Loader2, Trash2, Pencil } from 'lucide-react';
import { Image } from '@/components/ui/image';
import LikeDislike from '@/components/forums/LikeDislike';
import ImageUploader from '@/components/forums/ImageUploader';
import PostDialog from '@/components/forums/PostDialog';
import MentionPills from '@/components/shared/MentionPills';
import { useToast } from '@/components/ui/use-toast';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';
import LinkPreviews from '@/components/shared/LinkPreviews';
import ShareButton from '@/components/shared/ShareButton';

export default function ForumPost() {
  const { id } = useParams(); const navigate = useNavigate();
  const [post, setPost] = useState(null); const [replies, setReplies] = useState([]); const [loading, setLoading] = useState(true); const [user, setUser] = useState(null); const [profiles, setProfiles] = useState({});
  const [callsignToUserId, setCallsignToUserId] = useState({});
  const [body, setBody] = useState(''); const [submitting, setSubmitting] = useState(false); const [replyImages, setReplyImages] = useState([]); const [showEdit, setShowEdit] = useState(false);
  const { toast } = useToast();
  const load = async () => { setLoading(true); try { const p = await base44.entities.ForumPost.get(id); setPost(p); const r = await base44.entities.ForumReply.filter({ post_id: id }); setReplies(Array.isArray(r) ? r : []); } catch (e) { console.error(e); } finally { setLoading(false); } };
  useEffect(() => { (async () => { try { const me = await base44.auth.me(); setUser(me); const ps = await base44.entities.Profile.list('-updated_date', 500); const map = {}; const callsignMap = {}; (ps || []).forEach((p) => { if (p?.created_by_id) map[p.created_by_id] = p; if (p?.callsign && p?.created_by_id) callsignMap[p.callsign.trim().toUpperCase()] = p.created_by_id; }); setProfiles(map); setCallsignToUserId(callsignMap); } catch (e) { console.error(e); } load(); })(); }, [id]);
  const deletePost = async () => { try { await base44.entities.ForumPost.delete(id); navigate('/forums'); } catch (e) { console.error(e); } };
  const deleteReply = async (r) => { try { await base44.entities.ForumReply.delete(r.id); setReplies((rs) => rs.filter((x) => x.id !== r.id)); if (post) { const res = await base44.functions.invoke('adjust-forum-replies-count', { post_id: id, delta: -1 }); const next = res?.data?.replies_count ?? Math.max(0, (post.replies_count || 0) - 1); setPost({ ...post, replies_count: next }); } } catch (e) { console.error(e); } };
  const canModerate = ['admin', 'super_admin', 'moderator'].includes(user?.role); const canEdit = post?.created_by_id === user?.id || canModerate;
  const submitReply = async () => { if (!body.trim()) return; setSubmitting(true); try { const reply = await base44.entities.ForumReply.create({ post_id: id, body: body.trim(), author_name: user?.full_name || 'Anonymous', author_callsign: user?.callsign || '', image_urls: replyImages, liked_by: [], disliked_by: [] }); setReplies((r) => [...r, reply]); if (post) { const res = await base44.functions.invoke('adjust-forum-replies-count', { post_id: id, delta: 1 }); const next = res?.data?.replies_count ?? (post.replies_count || 0) + 1; setPost({ ...post, replies_count: next }); } setBody(''); setReplyImages([]); toast({ title: 'Reply posted' }); } catch (e) { console.error(e); toast({ title: 'Could not post reply', description: e?.message || 'Please try again.', variant: 'destructive' }); } finally { setSubmitting(false); } };
  if (loading) return <div className="p-8 max-w-3xl mx-auto"><div className="h-48 rounded-xl bg-muted animate-pulse" /></div>;
  if (!post) return <div className="p-8 max-w-3xl mx-auto text-center text-muted-foreground">Post not found. <Link to="/forums" className="text-primary">Back to forums</Link></div>;
  return (
    <div className="p-5 sm:p-8 max-w-3xl mx-auto space-y-6">
      <Link to="/forums" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to forums</Link>
      <Card className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3 min-w-0"><div className="w-10 h-10 rounded-full bg-primary/10 text-primary overflow-hidden shrink-0 grid place-items-center">{profiles[post.created_by_id]?.avatar_url ? <img src={profiles[post.created_by_id].avatar_url} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5" />}</div><div className="min-w-0"><h1 className="text-xl sm:text-2xl font-heading font-bold">{post.title}</h1><div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground"><span className="font-mono">{post.author_callsign || post.author_name || 'Anonymous'}</span><StaffTag userId={post.created_by_id} />{post.created_date && <span>· {new Date(post.created_date).toLocaleDateString()}</span>}</div></div></div>{canEdit && <div className="flex items-center gap-1"><button onClick={() => setShowEdit(true)} className="p-1.5 text-muted-foreground hover:text-primary" title="Edit post"><Pencil className="w-4 h-4" /></button><button onClick={deletePost} className="p-1.5 text-muted-foreground hover:text-destructive" title="Delete post"><Trash2 className="w-4 h-4" /></button></div>}</div>
        <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed"><Linkify text={post.body} /></p><LinkPreviews text={post.body} />
        {post.image_urls?.length > 0 && <div className="grid gap-2 mt-3 sm:grid-cols-2">{post.image_urls.map((url, i) => <div key={i} className="rounded-lg overflow-hidden border border-border"><Image src={url} alt="" className="w-full max-h-72 object-cover" /></div>)}</div>}
        {post.mentions?.length > 0 && <div className="mt-3"><MentionPills mentions={post.mentions} callsignToUserId={callsignToUserId} /></div>}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border"><LikeDislike entity="ForumPost" recordId={post.id} likedBy={post.liked_by || []} dislikedBy={post.disliked_by || []} userId={user?.id} onChange={(d) => setPost((p) => (p ? { ...p, ...d } : p))} /><div className="ml-auto"><ShareButton url={`${window.location.origin}/forums/${post.id}`} title={post.title} text={post.body?.slice(0, 140)} /></div></div>
      </Card>
      <div><h2 className="text-sm font-semibold text-muted-foreground mb-3">{replies.length} replies</h2><div className="space-y-3">{replies.map((r) => <Card key={r.id} className="p-4"><div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-full bg-primary/10 text-primary overflow-hidden shrink-0 grid place-items-center">{profiles[r.created_by_id]?.avatar_url ? <img src={profiles[r.created_by_id].avatar_url} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4" />}</div><div className="min-w-0 flex-1"><div className="text-sm font-medium font-mono flex items-center gap-1.5 flex-wrap">{r.author_callsign || r.author_name || 'Anonymous'}<StaffTag userId={r.created_by_id} /></div>{r.created_date && <div className="text-xs text-muted-foreground">{new Date(r.created_date).toLocaleString()}</div>}</div>{(r.created_by_id === user?.id || canModerate) && <button onClick={() => deleteReply(r)} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0" title="Delete reply"><Trash2 className="w-4 h-4" /></button>}</div><p className="text-sm whitespace-pre-wrap break-words leading-relaxed"><Linkify text={r.body} /></p><LinkPreviews text={r.body} />{r.image_urls?.length > 0 && <div className="grid gap-2 mt-2 sm:grid-cols-2">{r.image_urls.map((url, i) => <div key={i} className="rounded-lg overflow-hidden border border-border"><Image src={url} alt="" className="w-full max-h-60 object-cover" /></div>)}</div>}<div className="mt-2"><LikeDislike entity="ForumReply" recordId={r.id} likedBy={r.liked_by || []} dislikedBy={r.disliked_by || []} userId={user?.id} onChange={(d) => setReplies((rs) => rs.map((x) => x.id === r.id ? { ...x, ...d } : x))} /></div></Card>)}{replies.length === 0 && <p className="text-sm text-muted-foreground">No replies yet. Be the first to respond.</p>}</div></div>
      <Card className="p-4"><Label>Post a reply</Label><Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your reply... (use @callsign to tag)" onKeyDown={(e) => { if (e.key === 'Enter') submitReply(); }} className="mt-2" /><div className="mt-2"><ImageUploader images={replyImages} onChange={setReplyImages} /></div><div className="flex justify-end mt-2"><Button onClick={submitReply} disabled={submitting || !body.trim()}>{submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}Reply</Button></div></Card>
      <PostDialog open={showEdit} onClose={() => setShowEdit(false)} onCreated={(updated) => { if (updated) setPost(updated); else load(); }} user={user} post={post} />
    </div>
  );
}