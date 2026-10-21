import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import AttachmentUploader, { AttachmentPreviews } from '@/components/messages/AttachmentUploader';
import EmojiPicker from '@/components/messages/EmojiPicker';
import MemberTagger from '@/components/forums/MemberTagger';
import { Loader2, AtSign } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function ProfilePostComposer({ user, avatarUrl, onPosted }) {
  const [content, setContent] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState([]);
  const [showTagger, setShowTagger] = useState(false);
  const { toast } = useToast();

  const displayName = user?.display_name || user?.full_name || user?.email || 'Member';
  const initial = displayName.charAt(0).toUpperCase();

  const addAttachment = async (att) => {
    const id = crypto.randomUUID?.() || String(Math.random());
    setPendingAttachments((p) => [...p, { ...att, id }]);
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file: att.file });
      const url = res?.file_url || res?.data?.file_url;
      setPendingAttachments((p) => p.map((a) => (a.id === id ? { ...a, url, uploading: false } : a)));
    } catch {
      setPendingAttachments((p) => p.filter((a) => a.id !== id));
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (id) => setPendingAttachments((p) => p.filter((a) => a.id !== id));

  const submit = async () => {
    const text = content.trim();
    if (!text && pendingAttachments.length === 0) return;
    setLoading(true);
    try {
      const attachments = pendingAttachments.map(({ url, type, name, mime }) => ({ url, type, name, mime }));
      const bodyMentions = (text.match(/@([A-Za-z0-9]{2,})/g) || []).map((m) => m.slice(1).toUpperCase());
      const mentions = [...new Set([...tags.map((t) => t.toUpperCase()), ...bodyMentions])];
      const post = await base44.entities.ProfilePost.create({
        content: text,
        attachments,
        mentions,
        author_name: displayName,
        author_avatar_url: avatarUrl || '',
        liked_by: [],
      });
      setContent('');
      setPendingAttachments([]);
      setTags([]);
      setShowTagger(false);
      onPosted?.(post);
      toast({ title: 'Posted to your profile' });
      if (mentions.length) {
        base44.functions.invoke('notify-tag', {
          mentions, context_type: 'post', context_id: post.id, preview: text,
        }).catch((e) => console.error('tag notify failed', e));
      }
    } catch (err) {
      toast({ title: 'Could not post', description: err?.message || 'Please try again.', variant: 'destructive' });
    }
    setLoading(false);
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold shrink-0 overflow-hidden">
          {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initial}
        </div>
        <div className="flex-1 min-w-0 space-y-2.5">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            rows={2}
            className="resize-none border-0 bg-muted/60 focus-visible:ring-1"
          />
          <AttachmentPreviews attachments={pendingAttachments} onRemove={removeAttachment} />
          {showTagger && <MemberTagger tags={tags} onChange={setTags} />}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <AttachmentUploader onAdd={addAttachment} disabled={uploading} />
              <EmojiPicker onPick={(emoji) => setContent((c) => c + emoji)} />
              <button
                type="button"
                onClick={() => setShowTagger((v) => !v)}
                className={`grid place-items-center w-9 h-9 rounded-lg transition-colors ${showTagger || tags.length > 0 ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                aria-label="Tag people"
                title="Tag people"
              >
                <AtSign className="w-5 h-5" />
              </button>
            </div>
            <Button size="sm" onClick={submit} disabled={loading || uploading || (!content.trim() && pendingAttachments.length === 0)}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
