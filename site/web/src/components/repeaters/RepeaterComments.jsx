import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';
import LinkPreviews from '@/components/shared/LinkPreviews';

export default function RepeaterComments({ repeaterId, repeaterName, userId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!repeaterId) return;
    setLoading(true);
    base44.entities.RepeaterComment.filter({ repeater_id: repeaterId }, '-created_date', 200)
      .then(setComments).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [repeaterId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim() || !userId) return;
    setSaving(true);
    try {
      let name = '';
      let callsign = '';
      try {
        const me = await base44.auth.me();
        name = me?.full_name || '';
        const profiles = await base44.entities.Profile.filter({ created_by_id: me.id });
        callsign = profiles?.[0]?.callsign || '';
        name = profiles?.[0]?.display_name || name;
      } catch {}
      const created = await base44.entities.RepeaterComment.create({
        repeater_id: repeaterId,
        repeater_name: repeaterName,
        body: body.trim(),
        author_name: name,
        author_callsign: callsign,
      });
      setComments((cs) => [created, ...cs]);
      setBody('');
      base44.functions.invoke('notify-repeater-comment', { comment_id: created.id }).catch((err) => {
        console.error('[RepeaterComments] notification failed:', err);
      });
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const remove = async (c) => {
    if (!c?.id) return;
    try { await base44.entities.RepeaterComment.delete(c.id); setComments((cs) => cs.filter((x) => x.id !== c.id)); } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <MessageSquare className="w-4 h-4" /> Comments {comments.length > 0 && <span className="text-muted-foreground/70">({comments.length})</span>}
      </div>

      {userId ? (
        <form onSubmit={submit} className="flex gap-2">
          <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment about this repeater…" disabled={saving} />
          <Button type="submit" size="icon" disabled={saving || !body.trim()}><Send className="w-4 h-4" /></Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Log in to leave a comment.</p>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin pr-1">
        {loading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-6">No comments yet. Be the first to share your experience!</div>
        ) : comments.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold shrink-0">
                  {(c.author_callsign || c.author_name || '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold flex items-center gap-1.5 min-w-0"><span className="truncate">{c.author_callsign || c.author_name || 'Anonymous'}</span><StaffTag userId={c.created_by_id} callsign={c.created_by_id ? undefined : c.author_callsign} /></div>
                  {c.created_date && <div className="text-[10px] text-muted-foreground">{new Date(c.created_date).toLocaleString()}</div>}
                </div>
              </div>
              {c.created_by_id === userId && (
                <button onClick={() => remove(c)} className="p-1 -m-1 text-muted-foreground hover:text-destructive shrink-0" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-sm mt-2 whitespace-pre-wrap break-words"><Linkify text={c.body} /></p><LinkPreviews text={c.body} />
          </div>
        ))}
      </div>
    </div>
  );
}