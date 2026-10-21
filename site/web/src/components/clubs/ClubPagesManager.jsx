import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Plus, Trash2, Pencil } from 'lucide-react';
import ClubPageDialog from '@/components/clubs/ClubPageDialog';
import { toast } from '@/components/ui/use-toast';
import StaffTag from '@/components/shared/StaffTag';

export default function ClubPagesManager({ club, user }) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const p = await base44.entities.ClubPage.filter({ club_id: club.id }, '-created_date', 100).catch(() => []);
      setPages(p || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [club.id]);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (p) => { setEditing(p); setDialogOpen(true); };

  const deletePage = async (p) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    try {
      await base44.entities.ClubPage.delete(p.id);
      setPages((ps) => ps.filter((x) => x.id !== p.id));
      toast({ title: 'Page deleted' });
    } catch (e) { toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }); }
  };

  const canModify = (p) => p.created_by_id === user?.id || user?.role === 'admin';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-lg">Club pages ({pages.length})</h3>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1.5" /> New page</Button>
      </div>
      {loading ? (
        <div className="h-32 rounded-xl bg-muted animate-pulse" />
      ) : pages.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No pages yet. Create your first community page.
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {pages.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 grid place-items-center shrink-0"><FileText className="w-4 h-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link to={`/clubs/${club.id}/pages/${p.id}`} className="font-medium hover:text-primary truncate">{p.title}</Link>
                    {p.page_type && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">{p.page_type}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">by {p.author_callsign || p.author_name || '—'}<StaffTag userId={p.created_by_id} callsign={p.created_by_id ? undefined : p.author_callsign} /></div>
                </div>
                {canModify(p) && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-foreground" title="Edit"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => deletePage(p)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <ClubPageDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} club={club} user={user} page={editing} onCreated={load} />
    </div>
  );
}