import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminClient';
import { PageHeader, Loading, ErrorState, EmptyState, ConfirmDialog } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge as UiBadge } from '@/components/ui/badge';
import BadgePreview, { rarityStyle } from '@/components/admin/BadgePreview';
import BadgeDialog from '@/components/admin/BadgeDialog';
import BadgeStatsDialog from '@/components/admin/BadgeStatsDialog';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, BarChart3, Sparkles, EyeOff, Power } from 'lucide-react';

import { errMsg } from '@/lib/utils';
export default function AdminBadges() {
  const { toast } = useToast();
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statsBadge, setStatsBadge] = useState(null);
  const [deleteBadge, setDeleteBadge] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  const load = () => {
    setLoading(true); setError('');
    adminApi('badges:list')
      .then((d) => setBadges(d?.badges || []))
      .catch((e) => setError(errMsg(e) || e?.message || 'Could not load badges'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (b) => { setEditing(b); setDialogOpen(true); };

  const save = async (form) => {
    try {
      if (editing?.id) {
        await adminApi('badges:update', { id: editing.id, ...form });
        toast({ title: 'Badge updated' });
      } else {
        await adminApi('badges:create', form);
        toast({ title: 'Badge created' });
      }
      setDialogOpen(false);
      load();
    } catch (e) { toast({ title: errMsg(e) || 'Save failed', variant: 'destructive' }); }
  };

  const remove = async () => {
    if (!deleteBadge) return;
    setDeleting(true);
    try {
      await adminApi('badges:delete', { id: deleteBadge.id });
      toast({ title: 'Badge deleted' });
      setDeleteBadge(null);
      load();
    } catch (e) { toast({ title: errMsg(e) || 'Delete failed', variant: 'destructive' }); }
    setDeleting(false);
  };

  const runEvaluation = async () => {
    setEvaluating(true);
    try {
      const r = await adminApi('badges:evaluate');
      toast({ title: `Auto-evaluation complete`, description: `${r?.awarded || 0} new award(s) across ${r?.evaluated || 0} badge(s).` });
      load();
    } catch (e) { toast({ title: errMsg(e) || 'Evaluation failed', variant: 'destructive' }); }
    setEvaluating(false);
  };

  return (
    <div>
      <PageHeader title="Badges" subtitle="Create and manage achievement badges — no code changes needed">
        <Button variant="outline" onClick={runEvaluation} disabled={evaluating}>
          <Sparkles className="w-4 h-4" /> {evaluating ? 'Evaluating…' : 'Run auto-evaluation'}
        </Button>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Create badge</Button>
      </PageHeader>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : badges.length === 0 ? (
        <EmptyState title="No badges yet" description="Create your first achievement badge to get started." icon={Plus} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {badges.map((b) => (
            <Card key={b.id} className="p-5 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <BadgePreview badge={b} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="font-heading font-bold leading-tight truncate">{b.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{b.description || 'No description'}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${rarityStyle(b.rarity).chip}`}>{b.rarity}</span>
                <UiBadge variant="outline">{b.category}</UiBadge>
                {b.enabled ? <UiBadge variant="secondary" className="gap-1"><Power className="w-3 h-3" /> Enabled</UiBadge> : <UiBadge variant="destructive">Disabled</UiBadge>}
                {b.is_secret && <UiBadge variant="secondary" className="gap-1"><EyeOff className="w-3 h-3" /> Secret</UiBadge>}
              </div>
              <div className="text-xs text-muted-foreground italic line-clamp-2">"{b.requirement_label || (b.requirement_type === 'manual_only' ? 'Manual award' : `${b.requirement_type}: ${b.requirement_amount}`)}"</div>
              <div className="flex items-center gap-1 mt-auto pt-1">
                <Button size="sm" variant="outline" onClick={() => setStatsBadge(b)}><BarChart3 className="w-3.5 h-3.5" /> Stats</Button>
                <Button size="sm" variant="ghost" onClick={() => openEdit(b)}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                <Button size="icon" variant="ghost" className="ml-auto" onClick={() => setDeleteBadge(b)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <BadgeDialog open={dialogOpen} onOpenChange={setDialogOpen} badge={editing} onSave={save} />
      <BadgeStatsDialog open={!!statsBadge} onOpenChange={(v) => !v && setStatsBadge(null)} badge={statsBadge} onChanged={load} />
      <ConfirmDialog
        open={!!deleteBadge}
        onOpenChange={(v) => !v && setDeleteBadge(null)}
        title="Delete badge"
        description={`Delete "${deleteBadge?.name}"? This also removes all awards of this badge from every user. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}