import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Send, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import { Image } from '@/components/ui/image';
import StaffTag from '@/components/shared/StaffTag';
import LinkPreviews from '@/components/shared/LinkPreviews';

// Links people put in threads and replies open in a new tab, safely.
const MD_LINKS = { a: ({ node: _node, ...p }) => <a className="text-primary underline break-words" {...p} target="_blank" rel="noopener noreferrer nofollow ugc" /> };

export default function ClubThreadDialog({ open, thread, club, user, canModerate, onClose, onUpdated }) {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!open || !thread) return;
    setLoading(true);
    setReplyBody('');
    base44.entities.ClubThreadReply.filter({ thread_id: thread.id }, 'created_date', 500)
      .then((r) => setReplies(r || []))
      .catch(() => setReplies([]))
      .finally(() => setLoading(false));
  }, [open, thread]);

  const postReply = async () => {
    if (!replyBody.trim()) return;
    setPosting(true);
    try {
      const r = await base44.entities.ClubThreadReply.create({
        thread_id: thread.id,
        body: replyBody.trim(),
        author_callsign: user?.callsign || '',
        author_name: user?.full_name || '',
        club_owner_id: club.created_by_id || null,
      });
      setReplies((rs) => [...rs, r]);
      setReplyBody('');
      const newCount = (thread.replies_count || 0) + 1;
      await base44.entities.ClubThread.update(thread.id, { replies_count: newCount });
      onUpdated?.({ ...thread, replies_count: newCount });
    } catch (err) {
      toast({ title: 'Could not post reply', description: err.message, variant: 'destructive' });
    } finally {
      setPosting(false);
    }
  };

  const deleteReply = async (r) => {
    try {
      await base44.entities.ClubThreadReply.delete(r.id);
      setReplies((rs) => rs.filter((x) => x.id !== r.id));
      const newCount = Math.max(0, (thread.replies_count || 0) - 1);
      await base44.entities.ClubThread.update(thread.id, { replies_count: newCount });
      onUpdated?.({ ...thread, replies_count: newCount });
    } catch (e) { toast({ title: 'Could not delete', variant: 'destructive' }); }
  };

  if (!thread) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">{thread.title}</DialogTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span className="inline-flex items-center gap-1.5">by {thread.author_callsign || thread.author_name || '—'}<StaffTag userId={thread.created_by_id} callsign={thread.created_by_id ? undefined : thread.author_callsign} /></span>
            <span>·</span>
            <span>{thread.created_date ? format(new Date(thread.created_date), 'MMM d, yyyy · h:mm a') : ''}</span>
            {thread.category && <><span>·</span><span className="font-semibold uppercase tracking-wide text-primary">{thread.category}</span></>}
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1 scrollbar-thin">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_LINKS}>{thread.body}</ReactMarkdown>
            <LinkPreviews text={thread.body} />
          </div>

          {thread.image_urls?.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {thread.image_urls.map((url, i) => (
                <div key={i} className="rounded-lg overflow-hidden border border-border">
                  <Image src={url} alt="" className="w-full max-h-72 object-cover" />
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border pt-4">
            <h4 className="font-heading font-semibold text-sm mb-3">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</h4>
            {loading ? (
              <div className="grid place-items-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : replies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No replies yet. Be the first to respond.</p>
            ) : (
              <div className="space-y-3">
                {replies.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-primary">{r.author_callsign || '—'}</span><StaffTag userId={r.created_by_id} callsign={r.created_by_id ? undefined : r.author_callsign} />
                        <span className="text-muted-foreground">{r.created_date ? format(new Date(r.created_date), 'MMM d, h:mm a') : ''}</span>
                      </div>
                      {(r.created_by_id === user?.id || canModerate) && (
                        <button onClick={() => deleteReply(r)} className="p-1 text-muted-foreground hover:text-destructive" title="Delete reply"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_LINKS}>{r.body}</ReactMarkdown><LinkPreviews text={r.body} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-3 flex gap-2">
          <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={2} className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-none" placeholder="Write a reply…" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postReply(); }} />
          <Button onClick={postReply} disabled={posting || !replyBody.trim()} className="self-end">{posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}