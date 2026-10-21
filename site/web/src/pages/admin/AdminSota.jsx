import { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import FormSelect from '@/components/forms/FormSelect';
import { Mountain, Loader2, Upload, Check, X, Pencil, Trash2, Search, AlertCircle, ExternalLink, RefreshCw, Lock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import AddSummitDialog from '@/components/sota/AddSummitDialog';
import { PageHeader, Loading, EmptyState } from '@/components/admin/parts';
import { loadAll } from '@/lib/loadAll';

const STATUS_STYLE = {
  approved: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  under_review: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  rejected: 'bg-destructive/15 text-destructive',
};
const BATCH = 400;
const PAUSE_MS = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal CSV parser (quoted fields, doubled quotes).
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// SOTA's summitslist.csv: a title line, then SummitCode, AssociationName,
// RegionName, SummitName, AltM, AltFt, GridRef1, GridRef2, Longitude,
// Latitude, Points, BonusPoints, ValidFrom, ValidTo, ...
function summitsFromCsv(text) {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex((r) => r.some((c) => c.trim() === 'SummitCode'));
  if (headerAt < 0) throw new Error('This does not look like the SOTA summits list (no SummitCode column).');
  const head = rows[headerAt].map((h) => h.trim());
  const col = (name) => head.indexOf(name);
  const idx = { ref: col('SummitCode'), assoc: col('AssociationName'), region: col('RegionName'), name: col('SummitName'), altM: col('AltM'), altFt: col('AltFt'),
    lng: col('Longitude'), lat: col('Latitude'), points: col('Points'), bonus: col('BonusPoints'), validTo: col('ValidTo') };
  const today = new Date();
  return rows.slice(headerAt + 1).filter((r) => r[idx.ref]).map((r) => {
    const validTo = idx.validTo >= 0 ? r[idx.validTo] : '';
    const [d, m, y] = String(validTo).split('/').map(Number);
    const expired = y && new Date(y, (m || 1) - 1, d || 1) < today;
    return {
      summit_ref: r[idx.ref].trim().toUpperCase(),
      association_name: r[idx.assoc] || '',
      region_name: r[idx.region] || '',
      name: r[idx.name] || '',
      altitude_m: r[idx.altM], altitude_ft: r[idx.altFt],
      lng: r[idx.lng], lat: r[idx.lat],
      points: r[idx.points], bonus_points: r[idx.bonus],
      summit_status: expired ? 'inactive' : 'active',
    };
  });
}

export default function AdminSota() {
  const { toast } = useToast();
  const [tab, setTab] = useState('import');
  const [summits, setSummits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reviewing, setReviewing] = useState(null);
  const [parsed, setParsed] = useState(null); // { fileName, rows }
  const [assocFilter, setAssocFilter] = useState('W');
  const [dryRun, setDryRun] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, added, updated, unchanged, errors }
  const fileRef = useRef(null);
  const cancelRef = useRef(false);

  const load = async () => {
    setLoading(true);
    setSummits(await loadAll('SotaSummit', '-created_date', 1000).catch(() => []));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Automatic monthly sync status (off until SOTA approves; see sota-summits-sync).
  const [sync, setSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const loadSync = () => base44.functions.invoke('sota-summits-sync', { action: 'status' })
    .then((r) => setSync(r?.data || r)).catch(() => setSync({ error: true }));
  useEffect(() => { loadSync(); }, []);
  const runSyncNow = async () => {
    setSyncing(true);
    try {
      const r = await base44.functions.invoke('sota-summits-sync', { action: 'run' });
      const d = r?.data || r;
      toast({ title: d?.skipped ? 'Sync skipped' : 'Sync complete', description: d?.message || (d?.summits_total != null ? `+${d.summits_added} added · ${d.summits_updated} updated · ${d.summits_unchanged} unchanged` : d?.error) });
      loadSync(); load();
    } catch (e) { toast({ title: 'Sync failed', description: e?.response?.data?.error || e?.message, variant: 'destructive' }); }
    setSyncing(false);
  };

  const pending = useMemo(() => summits.filter((p) => p.verification_status === 'pending' || p.verification_status === 'under_review'), [summits]);
  const filtered = useMemo(() => {
    let list = summits.slice();
    if (statusFilter !== 'all') list = list.filter((p) => p.verification_status === statusFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((p) => [p.name, p.summit_ref, p.region_name, p.state, p.association_name].some((v) => String(v || '').toLowerCase().includes(s)));
    }
    return list;
  }, [summits, q, statusFilter]);

  const selected = useMemo(() => {
    const prefixes = assocFilter.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    return (parsed?.rows || []).filter((r) => !prefixes.length || prefixes.some((p) => r.summit_ref.startsWith(p)));
  }, [parsed, assocFilter]);

  const onFile = async (file) => {
    if (!file) return;
    try {
      const rows = summitsFromCsv(await file.text());
      setParsed({ fileName: file.name, rows });
      setProgress(null);
    } catch (e) { toast({ title: 'Could not read file', description: e?.message, variant: 'destructive' }); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const runImport = async () => {
    cancelRef.current = false;
    const total = selected.length;
    const acc = { done: 0, total, added: 0, updated: 0, unchanged: 0, errors: 0 };
    setProgress({ ...acc });
    for (let i = 0; i < total && !cancelRef.current; i += BATCH) {
      try {
        const res = await base44.functions.invoke('sota-summit-import', { rows: selected.slice(i, i + BATCH), dryRun });
        const d = res?.data || res;
        if (d?.error) throw new Error(d.error);
        acc.added += d.added || 0; acc.updated += d.updated || 0; acc.unchanged += d.unchanged || 0;
      } catch { acc.errors += 1; }
      acc.done = Math.min(total, i + BATCH);
      setProgress({ ...acc });
      if (i + BATCH < total) await sleep(PAUSE_MS);
    }
    toast({ title: dryRun ? 'Dry run complete' : 'Import complete', description: `+${acc.added} added · ${acc.updated} updated · ${acc.unchanged} unchanged${acc.errors ? ` · ${acc.errors} failed batches` : ''}` });
    if (!dryRun) load();
  };

  const setStatus = async (s, status) => {
    try {
      await base44.functions.invoke('sota-summit-manage', { action: 'moderate', data: { id: s.id, verification_status: status } });
      toast({ title: `Marked ${status.replace('_', ' ')}` });
      load();
    } catch { toast({ title: 'Update failed', variant: 'destructive' }); }
  };

  const removeSummit = async (s) => {
    if (!confirm(`Remove "${s.name}" (${s.summit_ref})? Activation history is preserved on the activations themselves.`)) return;
    try {
      await base44.entities.SotaSummit.delete(s.id);
      toast({ title: 'Summit removed' });
      load();
    } catch { toast({ title: 'Delete failed', variant: 'destructive' }); }
  };

  const tabs = [
    { key: 'import', label: 'Import summits list', icon: Upload },
    { key: 'submissions', label: `Submissions${pending.length ? ` (${pending.length})` : ''}`, icon: AlertCircle },
    { key: 'summits', label: 'All Summits', icon: Mountain },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="SOTA Administration" subtitle="Load the SOTA summits list, review community submissions, and edit summits." />

      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'import' && (
        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
                  {sync?.approved ? <RefreshCw className="w-5 h-5 text-primary" /> : <Lock className="w-5 h-5 text-muted-foreground" />} Automatic monthly sync
                  <Badge variant="outline" className={sync?.approved ? 'text-green-600 border-green-300' : 'text-muted-foreground'}>{sync?.approved ? 'On' : 'Off'}</Badge>
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {sync?.approved
                    ? <>Runs on the 3rd of each month and imports summits starting with <span className="font-mono">{(sync.prefixes || []).join(', ')}</span> from <span className="font-mono break-all">{sync.url}</span>.</>
                    : <>Off until the SOTA team approves automated downloads. Once you have their approval in writing, add a Base44 secret <span className="font-mono">SOTA_SYNC_APPROVED</span> = <span className="font-mono">yes</span> (optional: <span className="font-mono">SOTA_SYNC_PREFIXES</span>, default <span className="font-mono">W</span>; <span className="font-mono">SOTA_SUMMITS_URL</span> if they give you a different file address). Until then, use the manual upload below.</>}
                </p>
              </div>
              {sync?.approved && <Button variant="outline" onClick={runSyncNow} disabled={syncing}>{syncing ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5" />} Run now</Button>}
            </div>
            {sync?.runs?.length > 0 && (
              <div className="text-xs space-y-1">
                {sync.runs.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex flex-wrap gap-x-3 text-muted-foreground">
                    <span className="text-foreground">{String(r.started_at || '').slice(0, 16).replace('T', ' ')}</span>
                    <span>{r.trigger}</span>
                    <span className={r.status === 'failed' ? 'text-destructive' : r.status === 'completed' ? 'text-green-600' : ''}>{r.status}</span>
                    {r.status === 'completed' && <span>+{r.summits_added} added · {r.summits_updated} updated · {r.summits_unchanged} unchanged</span>}
                    {r.error && <span className="text-destructive">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="font-heading font-semibold text-lg mb-1">Import the SOTA summits list</h2>
              <p className="text-sm text-muted-foreground">
                Download <span className="font-mono">summitslist.csv</span> from the SOTA website yourself, then choose it here. Repeater Nation never
                connects to SOTA's servers — their API terms require the SOTA team's approval before AI-written software connects to their infrastructure.
                New summits are added, changed ones updated, and summits past their valid-to date are marked inactive (activation history is kept).
              </p>
              <a href="https://www.sotadata.org.uk/en/summits" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-1">SOTA database <ExternalLink className="w-3 h-3" /></a>
            </div>
            <div className="space-y-3 max-w-xl">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={progress && progress.done < progress.total}><Upload className="w-4 h-4 mr-1.5" /> Choose summitslist.csv</Button>
              {parsed && (
                <>
                  <div className="text-sm">{parsed.fileName}: <span className="font-semibold">{parsed.rows.length.toLocaleString()}</span> summits in the file.</div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="sota-assoc">Only import references starting with</label>
                    <Input id="sota-assoc" value={assocFilter} onChange={(e) => setAssocFilter(e.target.value)} placeholder="e.g. W, VE  (blank = everything)" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {selected.length.toLocaleString()} summits selected. Importing only the associations your members use keeps the directory fast
                      — "W" covers the United States (W0–W9, W4G…), "VE" Canada.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run (count changes without saving)</label>
                  <div className="flex gap-2">
                    <Button onClick={runImport} disabled={!selected.length || (progress && progress.done < progress.total)}>
                      {progress && progress.done < progress.total ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Upload className="w-4 h-4 mr-1.5" />}
                      {dryRun ? 'Run dry import' : `Import ${selected.length.toLocaleString()} summits`}
                    </Button>
                    {progress && progress.done < progress.total && <Button variant="outline" onClick={() => { cancelRef.current = true; }}>Stop</Button>}
                  </div>
                  <p className="text-xs text-muted-foreground">Imports run in batches of {BATCH} with a short pause between them so the app's database limit isn't hit. Keep this tab open.</p>
                </>
              )}
            </div>
          </Card>
          {progress && (
            <Card className="p-5 space-y-3">
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[['Added', progress.added, 'text-green-600'], ['Updated', progress.updated, 'text-blue-600'], ['Unchanged', progress.unchanged, 'text-muted-foreground'], ['Failed batches', progress.errors, 'text-destructive']].map(([label, val, color]) => (
                  <div key={label} className="p-3 rounded-lg border border-border bg-muted/30">
                    <div className={`text-2xl font-bold ${color}`}>{val.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">{progress.done.toLocaleString()} of {progress.total.toLocaleString()} processed{dryRun ? ' (dry run)' : ''}</div>
            </Card>
          )}
        </div>
      )}

      {tab === 'submissions' && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <EmptyState title="No pending submissions" description="Community-submitted summits awaiting review will show up here." icon={Mountain} />
          ) : (
            pending.map((p) => (
              <Card key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-300 grid place-items-center shrink-0"><Mountain className="w-5 h-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.name} <span className="text-muted-foreground font-mono">· {p.summit_ref}</span></div>
                  <div className="text-xs text-muted-foreground">{[p.region_name, p.county, p.state].filter(Boolean).join(', ')}{p.submitted_by_name ? ` · by ${p.submitted_by_name}` : ''}</div>
                </div>
                <Badge className={STATUS_STYLE[p.verification_status]}>{p.verification_status.replace('_', ' ')}</Badge>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setReviewing(p)}><Pencil className="w-3.5 h-3.5 mr-1" /> Review</Button>
                  <Button size="sm" variant="outline" title="Approve" onClick={() => setStatus(p, 'approved')}><Check className="w-3.5 h-3.5 text-green-600" /></Button>
                  <Button size="sm" variant="outline" title="Reject" onClick={() => setStatus(p, 'rejected')}><X className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'summits' && (
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, reference, region, state…" className="pl-9" />
              </div>
              <FormSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="under_review">Under review</option>
                <option value="rejected">Rejected</option>
              </FormSelect>
            </div>
            <div className="text-xs text-muted-foreground mt-2">{filtered.length.toLocaleString()} summits · {summits.length.toLocaleString()} total</div>
          </Card>
          {loading ? <Loading /> : (
            <div className="space-y-2">
              {filtered.slice(0, 100).map((p) => (
                <Card key={p.id} className="p-4 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-sm">{p.name} <span className="text-muted-foreground font-mono text-xs">· {p.summit_ref}</span></div>
                    <div className="text-xs text-muted-foreground">{[p.region_name, p.state].filter(Boolean).join(', ')} · {p.source === 'official' ? 'SOTA list' : 'community'}{p.points != null ? ` · ${p.points} pts` : ''}</div>
                  </div>
                  <Badge className={STATUS_STYLE[p.verification_status]}>{String(p.verification_status || '').replace('_', ' ')}</Badge>
                  {p.summit_status === 'inactive' && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" title="Edit this summit." onClick={() => setReviewing(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" title="Delete this summit." onClick={() => removeSummit(p)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </Card>
              ))}
              {filtered.length > 100 && <div className="text-xs text-muted-foreground text-center">Showing first 100. Refine your search to see more.</div>}
            </div>
          )}
        </div>
      )}

      <AddSummitDialog open={!!reviewing} onClose={() => setReviewing(null)} editing={reviewing} admin onSaved={load} />
    </div>
  );
}
