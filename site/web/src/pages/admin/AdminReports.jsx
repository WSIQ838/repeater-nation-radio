import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, Plus, Trash2, Flag } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { PageHeader, Loading, ErrorState, EmptyState, Badge, ConfirmDialog, formatDateTime } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

import { errMsg } from '@/lib/utils';
const STATUSES = ['Open', 'Investigating', 'Resolved', 'Dismissed'];
const CATEGORIES = ['User', 'Repeater', 'ForumPost', 'ForumReply', 'Club', 'Event', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const statusTone = { Open: 'destructive', Investigating: 'warn', Resolved: 'success', Dismissed: 'muted' };
const priorityTone = { Low: 'muted', Medium: 'primary', High: 'warn', Critical: 'destructive' };

export default function AdminReports() {
  const { toast } = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', reason: '', category: 'Other', priority: 'Medium', target_type: '', target_id: '', target_label: '' });

  const load = useCallback(() => {
    setLoading(true); setError('');
    adminApi('reports:list', { query, status, category })
      .then((d) => setReports(d.reports || []))
      .catch((e) => setError(errMsg(e) || 'Could not load reports'))
      .finally(() => setLoading(false));
  }, [query, status, category]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const updateReport = async (id, fields) => {
    try {
      await adminApi('reports:update', { id, ...fields });
      setReports((rs) => rs.map((x) => (x.id === id ? { ...x, ...fields } : x)));
      toast({ title: 'Report updated' });
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
  };

  const createReport = async () => {
    if (!form.title || !form.reason) { toast({ title: 'Title and reason are required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const d = await adminApi('reports:create', form);
      setReports((rs) => [d.report, ...rs]);
      setCreateOpen(false);
      setForm({ title: '', reason: '', category: 'Other', priority: 'Medium', target_type: '', target_id: '', target_label: '' });
      toast({ title: 'Report created' });
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await adminApi('reports:delete', { id: deleteTarget.id });
      setReports((rs) => rs.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: 'Report deleted' });
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const confirmDeleteRepeater = async () => {
    if (!deleteTarget || deleteTarget.category !== 'Repeater' || !deleteTarget.target_id) return;
    setBusy(true);
    try {
      await adminApi('reports:deleteRepeater', {
        report_id: deleteTarget.id,
        repeater_id: deleteTarget.target_id,
      });
      setReports((rs) => rs.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: 'Repeater and report deleted' });
    } catch (e) { toast({ title: errMsg(e) || 'Failed to delete repeater', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Reports" subtitle={`${reports.length} reports`} >
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> New report</Button>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports…" className="pl-9" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <Card className="overflow-hidden">
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : reports.length === 0 ? <EmptyState icon={Flag} title="No reports" description="Reports filed or created will appear here." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Report</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Priority</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 align-top">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{r.reason}</div>
                      {r.target_label && <div className="text-xs text-muted-foreground mt-1">Target: {r.target_label}</div>}
                    </td>
                    <td className="px-4 py-3"><Badge tone="muted">{r.category || 'Other'}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={priorityTone[r.priority] || 'muted'}>{r.priority || 'Medium'}</Badge></td>
                    <td className="px-4 py-3">
                      <select value={r.status || 'Open'} onChange={(e) => updateReport(r.id, { status: e.target.value })} className="h-8 px-2 rounded-md border border-input bg-background text-xs">
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(r.created_date)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.category === 'Repeater' && r.target_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleteTarget({ ...r, deleteRepeater: true })}
                            title="Delete the reported repeater and this report"
                          >
                            <Trash2 className="w-4 h-4 mr-1" /> Delete Repeater
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)} title="Delete report only">
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New report</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Category</Label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>Priority</Label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Target label (optional)</Label><Input value={form.target_label} onChange={(e) => setForm({ ...form, target_label: e.target.value })} placeholder="e.g. user email or repeater callsign" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createReport} disabled={busy}>{busy ? 'Creating…' : 'Create report'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete report?"
        description={`"${deleteTarget?.title}" will be permanently removed.`}
        confirmLabel={deleteTarget?.deleteRepeater ? 'Delete Repeater & Report' : 'Delete Report'}
        destructive
        loading={busy}
        onConfirm={deleteTarget?.deleteRepeater ? confirmDeleteRepeater : confirmDelete}
      />
    </div>
  );
}