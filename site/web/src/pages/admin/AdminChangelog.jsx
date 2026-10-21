import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { PageHeader, Loading, ErrorState } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Send, Trash2, History } from 'lucide-react';

export default function AdminChangelog() {
  const { toast } = useToast();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true); setError('');
    base44.entities.ChangeLog.list('-created_date', 100)
      .then((e) => setEntries(Array.isArray(e) ? e : []))
      .catch((e) => setError(e?.message || 'Could not load changelog'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const add = async () => {
    if (!notes.trim()) { toast({ title: 'Notes are required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await base44.entities.ChangeLog.create({ version: version.trim(), notes: notes.trim(), sent: false });
      setVersion(''); setNotes('');
      toast({ title: 'Entry added · sending to Discord…' });
      // Auto-post pending entries to Discord immediately
      try {
        const res = await base44.functions.invoke('publish-changelog', {});
        const n = res?.data?.sent ?? 0;
        if (n > 0) toast({ title: `Posted ${n} ${n === 1 ? 'entry' : 'entries'} to Discord` });
      } catch (e) {
        toast({ title: 'Saved, but Discord send failed — will retry on next publish', variant: 'destructive' });
      }
      load();
    } catch (e) { toast({ title: e?.message || 'Add failed', variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    try { await base44.entities.ChangeLog.delete(id); setEntries((es) => es.filter((x) => x.id !== id)); }
    catch (e) { toast({ title: e?.message || 'Delete failed', variant: 'destructive' }); }
  };

  const unsent = entries.filter((e) => !e.sent);

  return (
    <div>
      <PageHeader title="Change Log" subtitle="Record changes; entries are posted to Discord automatically when added, and again on publish as a safety net.">
        <Badge variant="secondary" className="gap-1"><History className="w-3.5 h-3.5" /> {unsent.length} pending</Badge>
      </PageHeader>

      <Card className="p-5 mb-6">
        <h2 className="font-semibold mb-4">Add changelog entry</h2>
        <div className="space-y-3">
          <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Version label (optional, e.g. v1.4.2)" />
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="What changed in this release?" />
          <div className="flex justify-end">
            <Button onClick={add} disabled={saving || !notes.trim()}><Plus className="w-4 h-4" /> {saving ? 'Adding…' : 'Add entry'}</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Each new entry is sent to Discord automatically when added. The site publish also re-posts any still-pending entries as a safety net.</p>
      </Card>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <div className="space-y-3">
          {entries.length === 0 && <p className="text-sm text-muted-foreground">No changelog entries yet.</p>}
          {entries.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {e.version && <span className="font-semibold">{e.version}</span>}
                    {e.sent
                      ? <Badge variant="outline" className="gap-1"><Send className="w-3 h-3" /> Sent</Badge>
                      : <Badge className="gap-1 bg-primary text-primary-foreground">Pending</Badge>}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{e.notes}</p>
                  {e.sent_date && <p className="text-xs text-muted-foreground mt-2">Sent {new Date(e.sent_date).toLocaleString()}</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}