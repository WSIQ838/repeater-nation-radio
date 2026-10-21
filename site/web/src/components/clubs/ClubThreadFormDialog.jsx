import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import ImageUploader from '@/components/forums/ImageUploader';

const CATEGORIES = ['General', 'Repeater News', 'Meetups', 'Technical', 'Off-Topic'];

export default function ClubThreadFormDialog({ open, onClose, club, user, onCreated }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('General');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) { toast({ title: 'Title and content are required', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      await base44.entities.ClubThread.create({
        club_id: club.id,
        title: title.trim(),
        body: body.trim(),
        category,
        author_callsign: user?.callsign || '',
        author_name: user?.full_name || '',
        image_urls: images,
        club_owner_id: club.created_by_id || null,
      });
      toast({ title: 'Thread posted' });
      setTitle(''); setBody(''); setCategory('General'); setImages([]);
      onCreated?.();
      onClose();
    } catch (err) {
      toast({ title: 'Could not post thread', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!club) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New discussion thread</DialogTitle>
          <DialogDescription>Share repeater news, plan a meetup, or start a conversation in {club.name}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="th-title">Title</Label>
            <Input id="th-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New repeater online in the valley" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="th-cat">Category</Label>
            <select id="th-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="th-body">Content</Label>
            <textarea id="th-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono" placeholder={'Write your post in Markdown…'} />
          </div>
          <div className="space-y-1.5">
            <Label>Photos</Label>
            <ImageUploader images={images} onChange={setImages} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>{loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Posting…</> : 'Post thread'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}