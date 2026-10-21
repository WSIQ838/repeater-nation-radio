import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import FormSelect from '@/components/forms/FormSelect';
import { Trees, Loader2, RefreshCw, Check, X, Pencil, Trash2, Search, FlaskConical, AlertCircle, History } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import ParkReviewDialog from '@/components/pota/ParkReviewDialog';
import { PageHeader, Loading, EmptyState } from '@/components/admin/parts';

import { errMsg } from '@/lib/utils';
const STATUS_STYLE = {
  approved: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  under_review: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  rejected: 'bg-destructive/15 text-destructive',
};

export default function AdminPota() {
  const { toast } = useToast();
  const [tab, setTab] = useState('sync');
  const [parks, setParks] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [dryRun, setDryRun] = useState(false);
  const [syncUrl, setSyncUrl] = useState('');
  const [reviewing, setReviewing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [all, syncRuns] = await Promise.all([
        base44.entities.PotaPark.list('-created_date', 1000).catch(() => []),
        base44.entities.PotaSyncRun.list('-started_at', 50).catch(() => []),
      ]);
      setParks(all || []);
      setRuns(syncRuns || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const pending = useMemo(() => parks.filter((p) => p.verification_status === 'pending' || p.verification_status === 'under_review'), [parks]);

  const filteredParks = useMemo(() => {
    let list = parks.slice();
    if (statusFilter !== 'all') list = list.filter((p) => p.verification_status === statusFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((p) => (p.name || '').toLowerCase().includes(s) || (p.park_number || '').toLowerCase().includes(s) || (p.state || '').toLowerCase().includes(s) || (p.county || '').toLowerCase().includes(s));
    }
    return list;
  }, [parks, q, statusFilter]);

  const runSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await base44.functions.invoke('sync-pota-parks', {
        sourceUrl: syncUrl || undefined,
        dryRun,
      });
      const data = res.data || res;
      setSyncResult(data);
      toast({ title: dryRun ? 'Dry run complete' : 'Sync complete', description: `+${data.parks_added} added · ${data.parks_updated} updated · ${data.parks_removed} removed` });
      load();
    } catch (err) {
      toast({ title: 'Sync failed', description: errMsg(err) || err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const setStatus = async (park, status) => {
    try {
      await base44.functions.invoke('pota-park-manage', { action: 'moderate', data: { id: park.id, verification_status: status } });
      toast({ title: `Marked ${status.replace('_', ' ')}` });
      load();
    } catch { toast({ title: 'Update failed', variant: 'destructive' }); }
  };

  const removePark = async (park) => {
    if (!confirm(`Remove "${park.name}" (${park.park_number})? This deletes the park record. Activation history is preserved on the activations themselves.`)) return;
    try {
      await base44.entities.PotaPark.delete(park.id);
      toast({ title: 'Park removed' });
      load();
    } catch { toast({ title: 'Delete failed', variant: 'destructive' }); }
  };

  const tabs = [
    { key: 'sync', label: 'Sync', icon: RefreshCw },
    { key: 'submissions', label: `Submissions${pending.length ? ` (${pending.length})` : ''}`, icon: AlertCircle },
    { key: 'parks', label: 'All Parks', icon: Trees },
    { key: 'history', label: 'Sync History', icon: History },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="POTA Administration" subtitle="Manage the POTA park database, run syncs, and review community submissions." />

      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.key} title={t.key === "sync" ? "Synchronize the official POTA park data." : t.key === "submissions" ? "Review community-submitted parks." : t.key === "parks" ? "Browse and manage all POTA park records." : "View previous POTA synchronization runs."} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'sync' && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-heading font-semibold text-lg mb-1">Database Synchronization</h2>
            <p className="text-sm text-muted-foreground mb-4">Import or update the official POTA park reference data. New parks are added, changed parks are updated, and parks no longer in the source are flagged inactive (activation history is preserved).</p>
            <div className="space-y-3 max-w-xl">
              <div>
                <label className="text-sm font-medium">Source URL</label>
                <Input title="Optional source URL for the POTA park data. Leave blank to use the default source." value={syncUrl} onChange={(e) => setSyncUrl(e.target.value)} placeholder="https://pota.app/all_parks_ext.csv (default)" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input title="Preview synchronization changes without saving them." type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                Dry run (preview changes without saving)
              </label>
              <Button title={dryRun ? "Preview the synchronization changes without saving." : "Synchronize the POTA park database with the source."} onClick={runSync} disabled={syncing}>
                {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                {dryRun ? 'Run dry sync' : 'Run synchronization'}
              </Button>
            </div>
          </Card>

          {syncResult && (
            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-3 flex items-center gap-2"><FlaskConical className="w-5 h-5 text-primary" /> Sync Result</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Added', syncResult.parks_added, 'text-green-600'],
                  ['Updated', syncResult.parks_updated, 'text-blue-600'],
                  ['Unchanged', syncResult.parks_unchanged, 'text-muted-foreground'],
                  ['Removed', syncResult.parks_removed, 'text-destructive'],
                ].map(([label, val, color]) => (
                  <div key={label} className="p-3 rounded-lg border border-border bg-muted/30">
                    <div className={`text-2xl font-bold ${color}`}>{val}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground mt-3">Total processed: {syncResult.parks_total} · Duration: {(syncResult.duration_ms / 1000).toFixed(1)}s · Source: {syncResult.source}</div>
              {syncResult.error_count > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
                  <div className="font-medium text-destructive mb-1">{syncResult.error_count} error(s)</div>
                  <ul className="text-xs text-destructive/80 list-disc list-inside space-y-0.5">
                    {syncResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === 'submissions' && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <EmptyState title="No pending submissions" description="Community-submitted parks awaiting review will show up here." icon={Trees} />
          ) : (
            pending.map((p) => (
              <Card key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300 grid place-items-center shrink-0"><Trees className="w-5 h-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.name} <span className="text-muted-foreground font-mono">· {p.park_number}</span></div>
                  <div className="text-xs text-muted-foreground">{[p.city, p.county, p.state].filter(Boolean).join(', ')}{p.submitted_by_name ? ` · by ${p.submitted_by_name}` : ''}</div>
                </div>
                <Badge className={STATUS_STYLE[p.verification_status]}>{p.verification_status.replace('_', ' ')}</Badge>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" title="Open this community submission for review and editing." onClick={() => setReviewing(p)}><Pencil className="w-3.5 h-3.5 mr-1" /> Review</Button>
                  <Button size="sm" variant="outline" title="Approve this park submission." onClick={() => setStatus(p, 'approved')}><Check className="w-3.5 h-3.5 text-green-600" /></Button>
                  <Button size="sm" variant="outline" title="Reject this park submission." onClick={() => setStatus(p, 'rejected')}><X className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'parks' && (
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input title="Search parks by name, POTA reference, state, or county." value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, reference, state, county…" className="pl-9" />
              </div>
              <FormSelect title="Filter park records by verification status." value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="under_review">Under review</option>
                <option value="rejected">Rejected</option>
              </FormSelect>
            </div>
            <div className="text-xs text-muted-foreground mt-2">{filteredParks.length} parks · {parks.length} total</div>
          </Card>
          {loading ? (
            <Loading />
          ) : (
            <div className="space-y-2">
              {filteredParks.slice(0, 100).map((p) => (
                <Card key={p.id} className="p-4 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-sm">{p.name} <span className="text-muted-foreground font-mono text-xs">· {p.park_number}</span></div>
                    <div className="text-xs text-muted-foreground">{[p.city, p.state].filter(Boolean).join(', ')} · {p.source}</div>
                  </div>
                  <Badge className={STATUS_STYLE[p.verification_status]}>{p.verification_status.replace('_', ' ')}</Badge>
                  {p.pota_status === 'inactive' && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" title="Edit this park record." onClick={() => setReviewing(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" title="Delete this park record. Activation history is preserved." onClick={() => removePark(p)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </Card>
              ))}
              {filteredParks.length > 100 && <div className="text-xs text-muted-foreground text-center">Showing first 100. Refine your search to see more.</div>}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-2">
          {runs.length === 0 ? (
            <EmptyState title="No synchronization runs yet" description="Run a sync above to see its history here." icon={History} />
          ) : (
            runs.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm flex items-center gap-2">
                    <History className="w-4 h-4 text-muted-foreground" />
                    {r.started_at ? format(new Date(r.started_at), 'MMM d, yyyy · h:mm a') : '—'}
                    {r.dry_run && <Badge variant="outline" className="text-xs">Dry run</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.triggered_by_name}</div>
                </div>
                <div className="flex flex-wrap gap-3 mt-2 text-xs">
                  <span className="text-green-600">+{r.parks_added} added</span>
                  <span className="text-blue-600">{r.parks_updated} updated</span>
                  <span className="text-muted-foreground">{r.parks_unchanged} unchanged</span>
                  <span className="text-destructive">{r.parks_removed} removed</span>
                  <span className="text-muted-foreground">{(r.duration_ms / 1000).toFixed(1)}s</span>
                </div>
                {r.error_count > 0 && <div className="text-xs text-destructive mt-1">{r.error_count} error(s)</div>}
                <div className="text-xs text-muted-foreground mt-1 truncate">{r.source}</div>
              </Card>
            ))
          )}
        </div>
      )}

      <ParkReviewDialog open={!!reviewing} onClose={() => setReviewing(null)} park={reviewing} onSaved={load} />
    </div>
  );
}