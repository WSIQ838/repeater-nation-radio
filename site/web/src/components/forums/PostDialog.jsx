import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ImageUploader from '@/components/forums/ImageUploader';
import MemberTagger from '@/components/forums/MemberTagger';
import TagSelector from '@/components/forms/TagSelector';
import { useToast } from '@/components/ui/use-toast';

const CATEGORIES = ['General', 'Technical', 'Equipment', 'Events', 'Swap', 'Off-Topic'];

export default function PostDialog({ open, onClose, onCreated, user, post = null }) {
  const isEditing = !!post?.id;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('General');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagIds, setTagIds] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    if (post) {
      setTitle(post.title || ''); setBody(post.body || ''); setCategory(post.category || 'General');
      setImages(post.image_urls || []); setTagIds(post.tag_ids || []); setTags(post.mentions || []);
    } else {
      setTitle(''); setBody(''); setCategory('General'); setImages([]); setTags([]); setTagIds([]);
    }
    setError('');
  }, [post, open]);

  const submit = async () => {
    setError('');
    if (!title.trim() || !body.trim()) { setError('Title and message are required.'); return; }
    setLoading(true);
    try {
      const bodyMentions = (body.match(/@([A-Za-z0-9]{2,})/g) || []).map((m) => m.slice(1).toUpperCase());
      const mentions = [...new Set([...tags.map((t) => typeof t === 'string' ? t.toUpperCase() : ''), ...bodyMentions].filter(Boolean))];
      const data = { title: title.trim(), body: body.trim(), category, image_urls: images, mentions, tag_ids: tagIds };
      const saved = isEditing
        ? await base44.entities.ForumPost.update(post.id, data)
        : await base44.entities.ForumPost.create({ ...data, author_name: user?.full_name || user?.email || 'Anonymous', author_callsign: user?.callsign || '', liked_by: [], disliked_by: [] });
      onCreated?.(saved);
      onClose();
      toast({ title: isEditing ? 'Post updated' : 'Post published' });
      if (!isEditing && mentions.length) {
        base44.functions.invoke('notify-tag', {
          mentions, context_type: 'forum_post', context_id: saved.id, preview: title.trim(),
        }).catch((e) => console.error('tag notify failed', e));
      }
    } catch (err) {
      setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} post`);
      toast({ title: isEditing ? 'Could not update post' : 'Could not create post', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{isEditing ? 'Edit forum post' : 'New forum post'}</DialogTitle></DialogHeader>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Category</Label><select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="space-y-1.5"><Label>Tags</Label><TagSelector value={tagIds} onChange={setTagIds} allowCreate /></div>
          <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's the topic?" /></div>
          <div className="space-y-1.5"><Label>Message</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Write your post... (use @callsign to tag members)" /></div>
          <div className="space-y-1.5"><Label>Tag members</Label><MemberTagger tags={tags} onChange={setTags} /></div>
          <div className="space-y-1.5"><Label>Photos</Label><ImageUploader images={images} onChange={setImages} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>{loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {isEditing ? 'Saving...' : 'Posting...'}</> : (isEditing ? 'Save changes' : 'Post')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}