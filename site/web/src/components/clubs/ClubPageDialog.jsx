import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import ImageUploader from '@/components/forums/ImageUploader';

const PAGE_TYPES = ['Info', 'Rules', 'Announcement', 'FAQ', 'Resources', 'Discussion'];

export default function ClubPageDialog({ open, onClose, club, user, onCreated, page }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pageType, setPageType] = useState('Info');
  const [contentFormat, setContentFormat] = useState('text');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(page?.title || '');
      setBody(page?.body || '');
      setPageType(page?.page_type || 'Info');
      setContentFormat(page?.content_format || (page ? 'markdown' : 'text'));
      setImages(page?.image_urls || []);
    }
  }, [open, page]);

  const submit = async () => {
    if (!title.trim() || !body.trim()) { toast({ title: 'Title and content are required', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      if (page) {
        await base44.functions.invoke('club-page-manage', { action: 'update', club_id: club.id, page: { id: page.id, title: title.trim(), body, page_type: pageType, content_format: contentFormat, image_urls: images } });
        toast({ title: 'Page updated' });
      } else {
        await base44.functions.invoke('club-page-manage', { action: 'create', club_id: club.id, page: { club_id: club.id, title: title.trim(), body, page_type: pageType, content_format: contentFormat, image_urls: images } });
        toast({ title: 'Page published' });
      }
      onCreated?.();
      onClose();
    } catch (err) {
      toast({ title: 'Could not save page', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!club) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{page ? 'Edit page' : `New page for ${club.name}`}</DialogTitle>
          <DialogDescription>Share news, rules, docs, or anything with the club. Choose plain text for simple pages or HTML for custom formatting.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pg-title">Title</Label>
              <Input id="pg-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Club Net Procedures" />
            </div>
            <div className="space-y-1.5 w-36">
              <Label htmlFor="pg-type">Page type</Label>
              <select id="pg-type" value={pageType} onChange={(e) => setPageType(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {PAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="pg-body">Content</Label>
              <select id="pg-format" value={contentFormat} onChange={(e) => setContentFormat(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                <option value="text">Plain text</option>
                <option value="html">HTML</option>
                <option value="markdown">Markdown</option>
              </select>
            </div>
            <textarea
              id="pg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
              placeholder={contentFormat === 'html' ? '<h2>Club announcement</h2>\n<p>Write your page using HTML…</p>' : contentFormat === 'markdown' ? '# Heading\nWrite your page in Markdown…' : 'Write your page in plain text…'}
            />
            <p className="text-[11px] text-muted-foreground">{contentFormat === 'html' ? 'HTML is sanitized when displayed. Script and event-handler content is removed.' : contentFormat === 'markdown' ? 'Markdown formatting is supported for legacy and Markdown pages.' : 'Plain text is displayed exactly as entered, including line breaks.'}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Photos</Label>
            <ImageUploader images={images} onChange={setImages} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>{loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : (page ? 'Save changes' : 'Publish page')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}