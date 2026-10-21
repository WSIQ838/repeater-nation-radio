import { useEffect, useRef, useState } from 'react';
import { Search, Satellite, RefreshCw, CheckCircle2, XCircle, ExternalLink, Flag, Database, PlayCircle, PauseCircle, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { base44 } from '@/api/base44Client';
import { PageHeader, Loading, ErrorState, Badge, StatCard } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

import { errMsg } from '@/lib/utils';

const RADIO_SERVICES = ['GMRS', 'HAM'];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// Small scrollable activity log for a running full import -- mirrors the
// pattern already used for the AdminUsers reverify-all/resync-all loops, so
// a multi-minute, multi-call import doesn't look frozen.
function RunLog({ entries }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [entries]);
  if (!entries?.length) return null;
  const toneClass = { info: 'text-muted-foreground', warn: 'text-warning', success: 'text-success', error: 'text-destructive' };
  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-2.5 max-h-40 overflow-y-auto font-mono text-xs space-y-0.5">
      {entries.map((e) => (
        <div key={e.id} className={toneClass[e.tone] || toneClass.info}>{e.message}</div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    if (value.street || value.city || value.state || value.zip) {
      return [value.street, value.city, value.state, value.zip].filter(Boolean).join(', ');
    }
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function formatFccKey(key) {
  return key.replace(/[_-]+/g, ' ').replace(/\\b\\w/g, (m) => m.toUpperCase());
}

function renderFccValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    return value.map((item, index) => (
      <div key={index} className="mb-1 last:mb-0">
        {typeof item === 'object' ? renderFccObject(item) : String(item)}
      </div>
    ));
  }
  if (typeof value === 'object') return renderFccObject(value);
  return String(value);
}

function renderFccObject(value) {
  if (value.code && value.label) return value.label + ' (' + value.code + ')';
  if (value.street || value.city || value.state || value.zip) {
    return [value.street, value.city, value.state, value.zip].filter(Boolean).join(', ');
  }
  return (
    <div className="space-y-1">
      {Object.entries(value)
        .filter(([, nested]) => nested !== null && nested !== undefined && nested !== '')
        .map(([nestedKey, nestedValue]) => (
          <div key={nestedKey} className="rounded border border-border/50 px-2 py-1">
            <span className="text-muted-foreground">{formatFccKey(nestedKey)}: </span>
            <span>{renderFccValue(nestedValue)}</span>
          </div>
        ))}
    </div>
  );
}

export default function AdminFcc() {
  const { toast } = useToast();
  const [callsign, setCallsign] = useState('');
  const [result, setResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [sync, setSync] = useState(null);
  const [syncLoading, setSyncLoading] = useState(true);

  const loadSync = () => {
    setSyncLoading(true);
    adminApi('fcc:syncStatus').then((d) => setSync(d.status)).catch(() => setSync(null)).finally(() => setSyncLoading(false));
  };
  useEffect(loadSync, []);

  // ── Local FCC ULS database (FccLicense, kept current by fcc-import /
  // fcc-daily-update) -- FccImportRun's RLS already permits admin/super_admin
  // read directly, matching the pattern AdminSdr.jsx uses for SdrStream. ──
  const [dbRuns, setDbRuns] = useState([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [runBusy, setRunBusy] = useState({}); // { GMRS: true } while a full import/daily update is running
  const [runLog, setRunLog] = useState({});   // { GMRS: [entries] }
  const [runProgress, setRunProgress] = useState({}); // { GMRS: {scanned,total,created,updated,startedAt,etaMs} }
  const [dryRun, setDryRun] = useState(false);
  const pauseRequestedRef = useRef({ GMRS: false, HAM: false });

  const formatEta = (ms) => {
    if (!Number.isFinite(ms) || ms <= 0) return 'Calculating…';
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `~${seconds}s remaining`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `~${minutes}m remaining`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins ? `~${hours}h ${mins}m remaining` : `~${hours}h remaining`;
  };

  // Approximate FCC snapshot sizes used only for the ETA calculation. The
  // actual cursor remains authoritative; the UI labels this as an estimate
  // because FCC replaces the weekly snapshots and record counts change.
  const ETA_TARGETS = {
    GMRS: { HD: 620000, EN: 650000 },
    HAM: { HD: 3900000, EN: 4300000 },
  };

  const loadDbRuns = () => {
    setDbLoading(true);
    base44.entities.FccImportRun.list('-started_at', 30)
      .then((rows) => {
        const nextRows = rows || [];
        setDbRuns(nextRows);

        // Restore the visible progress state after a page refresh.
        for (const service of RADIO_SERVICES) {
          const running = nextRows.find((r) =>
            r.radio_service === service &&
            r.run_type === 'full_import' &&
            r.status === 'running'
          );
          if (running) {
            const match = String(running.cursor || '').match(/^(HD|EN):(\d+)$/i);
            setRunProgress((prev) => ({
              ...prev,
              [service]: {
                phase: match?.[1]?.toUpperCase() || 'HD',
                scanned: match ? Number(match[2]) : Number(running.records_scanned || 0),
                total: null,
                created: Number(running.records_created || 0),
                updated: Number(running.records_updated || 0),
                running: true,
              },
            }));
          }
        }
      })
      .catch(() => setDbRuns([]))
      .finally(() => setDbLoading(false));
  };
  useEffect(loadDbRuns, []);

  const latestRun = (radioService, runType, status) =>
    dbRuns.find((r) => r.radio_service === radioService && r.run_type === runType && (!status || r.status === status));

  const appendLog = (radioService, message, tone = 'info') => {
    setRunLog((prev) => ({
      ...prev,
      [radioService]: [...(prev[radioService] || []).slice(-49), { id: `${Date.now()}-${Math.random()}`, message, tone }],
    }));
  };

  const pauseFullImport = async (radioService) => {
    const current = latestRun(radioService, 'full_import');
    if (!current || current.status === 'completed') return;
    pauseRequestedRef.current[radioService] = true;
    appendLog(radioService, 'Pause requested — finishing the current worker batch and saving the resume cursor…', 'warn');
    try {
      await base44.entities.FccImportRun.update(current.id, { status: 'paused' });
      setDbRuns((prev) => prev.map((r) => r.id === current.id ? { ...r, status: 'paused' } : r));
    } catch (e) {
      pauseRequestedRef.current[radioService] = false;
      appendLog(radioService, `Pause failed: ${errMsg(e) || e?.message || 'unknown error'}`, 'error');
      toast({ title: 'Could not pause FCC import', description: errMsg(e) || e?.message, variant: 'destructive' });
    }
  };

  const runFullImport = async (radioService) => {
    if (runBusy[radioService]) return;
    pauseRequestedRef.current[radioService] = false;
    setRunBusy((prev) => ({ ...prev, [radioService]: true }));
    setRunLog((prev) => ({ ...prev, [radioService]: [] }));
    setRunProgress((prev) => ({ ...prev, [radioService]: null }));
    appendLog(radioService, `Starting ${dryRun ? 'dry-run ' : ''}full import for ${radioService}…`);
    const priorRun = latestRun(radioService, 'full_import');
    const resumableRun = priorRun && priorRun.status !== 'completed';
    const resumePaused = priorRun?.status === 'paused';
    let runId = resumableRun ? priorRun.id : '';
    let cursor = resumableRun ? String(priorRun.cursor || '') : '';
    let totals = { created: 0, updated: 0 };
    let finished = false;
    try {
      // The backend cursor is phase-aware (HD:n / EN:n), so every call
      // advances the same resumable job. Keep chaining calls automatically
      // until the import reports done instead of making the admin press Resume.
      for (let i = 0; i < 10000; i++) {
        const res = await base44.functions.invoke('fcc-import', {
          radio_service: radioService,
          dry_run: dryRun,
          run_id: runId,
          cursor,
          resume: resumePaused,
        });
        const d = res.data || res;
        if (d.error || d.ok === false) {
          const detail = d.error || d.errors?.[0] || 'FCC import failed';
          throw new Error(detail);
        }
        runId = d.run_id;
        totals = {
          created: totals.created + (d.created || 0),
          updated: totals.updated + (d.updated || 0),
        };

        const cursorText = String(d.cursor || '');
        const phaseMatch = cursorText.match(/^(HD|EN):(\d+)$/i);
        const progressPhase = d.phase || phaseMatch?.[1]?.toUpperCase() || '';
        const position = phaseMatch ? Number(phaseMatch[2]) : 0;

        setRunProgress((prev) => ({
          ...prev,
          [radioService]: {
            phase: progressPhase,
            scanned: position,
            total: null,
            created: totals.created,
            updated: totals.updated,
            running: !d.done,
            startedAt: prev[radioService]?.startedAt || Date.now(),
            batches: (prev[radioService]?.batches || 0) + 1,
            etaMs: (() => {
              const startedAt = prev[radioService]?.startedAt || Date.now();
              const batches = (prev[radioService]?.batches || 0) + 1;
              const elapsed = Date.now() - startedAt;
              if (batches < 3 || !elapsed || position <= 0) return null;
              const target = ETA_TARGETS[radioService]?.[progressPhase] || 0;
              if (!target || position >= target) return 0;
              const recordsPerMs = position / elapsed;
              return (target - position) / recordsPerMs;
            })(),
          },
        }));

        const progressText =
          (progressPhase ? progressPhase + ' ' : '') +
          'position ' + position +
          (d.done ? ' — complete' : '') +
          ', +' + (d.created || 0) + ' created, +' + (d.updated || 0) + ' updated' +
          (d.error_count ? ', ' + d.error_count + ' error(s)' : '');
        appendLog(radioService, 'Batch ' + (i + 1) + ': ' + progressText);

        if (pauseRequestedRef.current[radioService] || d.paused) {
          appendLog(radioService, 'Import paused. Progress is saved and can be resumed from this position.', 'warn');
          break;
        }

        if (d.done) {
          finished = true;
          appendLog(radioService, 'Done — ' + totals.created + ' created, ' + totals.updated + ' updated.', 'success');
          break;
        }

        cursor = cursorText;
        // Pace chained worker calls so a long FCC import does not exhaust Base44 request capacity.
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      if (pauseRequestedRef.current[radioService]) {
        setRunProgress((prev) => ({
          ...prev,
          [radioService]: { ...(prev[radioService] || {}), running: false, paused: true },
        }));
        loadDbRuns();
        return;
      }

      if (finished) {
        setRunProgress((prev) => ({
          ...prev,
          [radioService]: {
            ...(prev[radioService] || {}),
            phase: 'DONE',
            scanned: prev[radioService]?.scanned || 0,
            total: prev[radioService]?.scanned || null,
            created: totals.created,
            updated: totals.updated,
            running: false,
            done: true,
          },
        }));
        toast({
          title: radioService + ' full import ' + (dryRun ? '(dry run) ' : '') + 'complete',
          description: totals.created + ' created, ' + totals.updated + ' updated.',
        });
      } else {
        appendLog(radioService, 'Import reached the automatic worker limit and remains resumable. It will continue automatically.', 'warn');
        toast({
          title: radioService + ' full import continuing',
          description: 'The resumable import will continue from its saved cursor.',
        });
        if (!dryRun) {
          setTimeout(() => runFullImport(radioService), 1500);
        }
      }
      if (!dryRun) loadDbRuns();
    } catch (e) {
      const message = errMsg(e) || e?.message || 'unknown error';
      const rateLimited = /rate limit|too many requests|temporarily unavailable|429/i.test(String(message));
      if (rateLimited && !dryRun) {
        appendLog(radioService, 'Request rate limit detected. Import stopped to protect the rest of the website. Resume manually after the rate-limit window clears.', 'warn');
        toast({ title: 'FCC import paused by rate limit', description: 'The importer will not retry automatically. Resume it manually after the site recovers.' });
      } else {
        appendLog(radioService, `Failed: ${message}`, 'error');
        toast({ title: 'Full import failed', description: message, variant: 'destructive' });
      }
      loadDbRuns();
    } finally {
      setRunBusy((prev) => ({ ...prev, [radioService]: false }));
    }
  };

  // If the admin refreshes the page while a full import is running, resume it
  // automatically from the persisted FCC cursor. This is deliberately limited
  // to status=running; failed jobs still require an explicit retry.
  const autoResumeRef = useRef(new Set());
  useEffect(() => {
    if (dbLoading || dryRun) return;
    for (const service of RADIO_SERVICES) {
      const running = dbRuns.find((r) =>
        r.radio_service === service &&
        r.run_type === 'full_import' &&
        r.status === 'running'
      );
      if (running && !autoResumeRef.current.has(service) && !runBusy[service]) {
        autoResumeRef.current.add(service);
        appendLog(service, 'Resuming active full import automatically after page load…');
        runFullImport(service);
      }
    }
  }, [dbRuns, dbLoading, dryRun]);

  const runDailyUpdate = async (radioService, force = false) => {
    if (runBusy[radioService]) return;
    setRunBusy((prev) => ({ ...prev, [radioService]: true }));
    setRunLog((prev) => ({ ...prev, [radioService]: [] }));
    appendLog(radioService, `Running ${dryRun ? 'dry-run ' : ''}daily update for ${radioService}…`);
    try {
      const res = await base44.functions.invoke('fcc-daily-update', { radio_service: radioService, dry_run: dryRun, force });
      const d = res.data || res;
      const r = (d.results || []).find((x) => x.radio_service === radioService) || d.results?.[0];
      if (r?.error) throw new Error(r.error);
      if (r?.skipped) {
        appendLog(radioService, r.message || 'Already up to date.', 'info');
      } else {
        appendLog(radioService, `Done — ${r?.created || 0} created, ${r?.updated || 0} updated (source date ${r?.source_date || 'unknown'}).`, 'success');
      }
      toast({ title: `${radioService} daily update ${dryRun ? '(dry run) ' : ''}complete`, description: r?.skipped ? r.message : `${r?.created || 0} created, ${r?.updated || 0} updated.` });
      if (!dryRun) loadDbRuns();
    } catch (e) {
      appendLog(radioService, `Failed: ${errMsg(e) || e?.message || 'unknown error'}`, 'error');
      toast({ title: 'Daily update failed', description: errMsg(e), variant: 'destructive' });
    } finally {
      setRunBusy((prev) => ({ ...prev, [radioService]: false }));
    }
  };

  const search = async () => {
    const cs = callsign.trim().toUpperCase();
    if (!cs) return;
    setSearching(true); setResult(null);
    try {
      const d = await adminApi('fcc:search', { callsign: cs });
      setResult(d.result);
    } catch (e) {
      toast({ title: errMsg(e) || 'Search failed', variant: 'destructive' });
    } finally { setSearching(false); }
  };

  return (
    <div>
      <PageHeader title="FCC Data" subtitle="Callsign verification and synchronization status" >
        <Button variant="outline" size="sm" onClick={loadSync}><RefreshCw className="w-4 h-4" /> Refresh status</Button>
      </PageHeader>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Satellite className="w-4 h-4 text-primary" /><h2 className="font-semibold">Synchronization status</h2></div>
          {syncLoading ? <Loading /> : sync ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard label="Verified" value={sync.verified} tone="success" />
                <StatCard label="Pending" value={sync.pending} tone="warn" />
                <StatCard label="Needs review" value={sync.needsReview} tone="destructive" />
              </div>
              <p className="text-xs text-muted-foreground">{sync.message}</p>
              <div className="text-xs text-muted-foreground">Total repeaters: {sync.total}</div>
            </div>
          ) : <ErrorState message="Could not load sync status" onRetry={loadSync} />}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Search className="w-4 h-4 text-primary" /><h2 className="font-semibold">FCC callsign search</h2></div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>Callsign</Label>
              <Input value={callsign} onChange={(e) => setCallsign(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="e.g. WQXW123" />
            </div>
            <div className="flex items-end">
              <Button onClick={search} disabled={searching}>{searching ? 'Searching…' : 'Search'}</Button>
            </div>
          </div>

          {searching && <Loading label="Querying FCC ULS…" />}
          {result && !searching && (
            <div className="mt-4 rounded-lg border border-border p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {result.verified ? <Badge tone="success"><CheckCircle2 className="w-3 h-3" /> Verified</Badge> : <Badge tone="destructive"><XCircle className="w-3 h-3" /> Not verified</Badge>}
                <span className="font-medium">{result.callsign}</span>
              </div>
              {!result.fccReachable && <p className="text-muted-foreground">{result.message}</p>}
              {result.fccReachable && !result.found && <p className="text-muted-foreground">{result.message}</p>}
              {result.found && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {[
                      ['Callsign', result.callsign],
                      ['Licensee', result.licensee],
                      ['Status', result.status],
                      ['Service', result.service],
                      ['FRN', result.frn],
                      ['Grant date', result.grantDate],
                      ['Expiration', result.expiration],
                      ['Address', result.address],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md border border-border p-2.5">
                        <div className="text-muted-foreground mb-0.5">{label}</div>
                        <div className="font-medium break-words whitespace-pre-wrap">{displayValue(value)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {result.fccRecordUrl && (
                      <a
                        href={result.fccRecordUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> Open FCC ULS record
                      </a>
                    )}
                    <a
                      href={`https://consumercomplaints.fcc.gov/hc/en-us/requests/new?ticket_form_id=38844&description=${encodeURIComponent(`FCC license report for callsign ${result.callsign}. Licensee: ${displayValue(result.licensee)}. FRN: ${displayValue(result.frn)}. Status: ${displayValue(result.status)}. Service: ${displayValue(result.service)}.`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      <Flag className="w-3 h-3" /> Report to FCC
                    </a>
                  </div>

                  {result.record && (
                    <details open className="rounded-lg border border-border overflow-hidden">
                      <summary className="cursor-pointer select-none px-3 py-2.5 bg-muted/40 font-medium text-sm">
                        Complete FCC ULS record — every field returned by the lookup service
                      </summary>
                      <div className="p-3 space-y-2 max-h-[520px] overflow-y-auto">
                        {Object.entries(result.record)
                          .filter(([, value]) => value !== null && value !== undefined && value !== '')
                          .map(([key, value]) => (
                            <div key={key} className="grid grid-cols-1 sm:grid-cols-[190px_1fr] gap-1 sm:gap-3 border-b border-border/60 pb-2 last:border-0">
                              <div className="text-xs text-muted-foreground font-medium break-words">
                                {key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())}
                              </div>
                              <div className="text-xs whitespace-pre-wrap break-words font-sans m-0">
                                {renderFccValue(value)}
                              </div>
                            </div>
                          ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-1"><Database className="w-4 h-4 text-primary" /><h2 className="font-semibold">Local FCC ULS database</h2></div>
        <p className="text-sm text-muted-foreground mb-4">
          Callsign verification checks this local table first, built from the FCC's own bulk data
          (<code>data.fcc.gov</code>), before falling back to OpenCallbook, the official FCC API, and the amateur callbooks above.
          A full import loads every GMRS or amateur license from the FCC's complete dump; the daily update applies the FCC's
          own daily transaction file and runs automatically Tuesday through Saturday after the FCC publishes that day's file.
        </p>
        {!dbLoading && dbRuns.length === 0 && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <div className="font-medium">FCC local database has not been initialized yet.</div>
            <div className="text-muted-foreground mt-1">
              Verification will continue using the online fallback providers until a full import completes.
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm mb-4">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry run (preview counts without writing anything)
        </label>

        <div className="grid sm:grid-cols-2 gap-4">
          {RADIO_SERVICES.map((service) => {
            const lastFull = latestRun(service, 'full_import', 'completed');
            const currentFull = latestRun(service, 'full_import');
            const resumableFull = currentFull && currentFull.status !== 'completed' ? currentFull : null;
            const pausedFull = currentFull?.status === 'paused';
            const lastDaily = latestRun(service, 'daily_update', 'completed');
            const busy = !!runBusy[service];
            const importActive = busy || currentFull?.status === 'running';
            const progress = runProgress[service];
            return (
              <div key={service} className="rounded-lg border border-border p-4">
                <div className="font-medium mb-2">{service === 'GMRS' ? 'GMRS' : 'Amateur (HAM)'}</div>
                <div className="text-xs text-muted-foreground space-y-1 mb-3">
                  <div>Last full import: {lastFull ? `${fmtDate(lastFull.completed_at)} (${lastFull.records_created || 0} created, ${lastFull.records_updated || 0} updated)` : 'Never run'}</div>
                  <div>Last daily update: {lastDaily ? fmtDate(lastDaily.completed_at) : 'Never run'}</div>
                  {pausedFull && <div className="text-warning">Import is paused at {currentFull.cursor || 'the saved cursor'}.</div>}
                  {resumableFull && !busy && !pausedFull && <div className="text-warning">A full import is resumable (position {resumableFull.cursor || 0}) — it will continue automatically when started.</div>}
                </div>
                {progress && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium">
                        {progress.done ? 'Import complete' : progress.phase === 'EN' ? 'Processing licensee records' : 'Processing license records'}
                      </span>
                      <span className="text-muted-foreground">
                        {progress.done ? '100%' : `Estimated: ${formatEta(progress.etaMs)}`}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      {progress.done ? (
                        <div className="h-full w-full bg-success rounded-full" />
                      ) : (
                        <div className="h-full w-2/5 rounded-full bg-primary animate-pulse" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1.5">
                      <span>{progress.phase || 'HD'} position: {Number(progress.scanned || 0).toLocaleString()}</span>
                      <span>{Number(progress.created || 0).toLocaleString()} created</span>
                      <span>{Number(progress.updated || 0).toLocaleString()} updated</span>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => runFullImport(service)}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <PlayCircle className="w-3.5 h-3.5 mr-1.5" />}
                    {resumableFull ? 'Resume Full Import' : 'Run Full Import'}
                  </Button>
                  {importActive && (
                    <Button size="sm" variant="outline" onClick={() => pauseFullImport(service)}>
                      <PauseCircle className="w-3.5 h-3.5 mr-1.5" /> Pause
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy || importActive} onClick={() => runDailyUpdate(service)}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                    Run Daily Update
                  </Button>
                </div>
                <RunLog entries={runLog[service]} />
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Import history</h2>
          <Button variant="outline" size="sm" onClick={loadDbRuns}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
        </div>
        {dbLoading ? <Loading /> : dbRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No FCC imports have run yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-1.5 pr-3">Started</th>
                  <th className="py-1.5 pr-3">Type</th>
                  <th className="py-1.5 pr-3">Service</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5 pr-3">Created</th>
                  <th className="py-1.5 pr-3">Updated</th>
                  <th className="py-1.5 pr-3">Errors</th>
                  <th className="py-1.5 pr-3">By</th>
                </tr>
              </thead>
              <tbody>
                {dbRuns.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDate(r.started_at)}</td>
                    <td className="py-1.5 pr-3">{r.run_type === 'full_import' ? 'Full import' : 'Daily update'}{r.dry_run ? ' (dry run)' : ''}</td>
                    <td className="py-1.5 pr-3">{r.radio_service}</td>
                    <td className="py-1.5 pr-3">
                      <Badge tone={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'destructive' : 'warn'}>{r.status}</Badge>
                    </td>
                    <td className="py-1.5 pr-3">{r.records_created ?? 0}</td>
                    <td className="py-1.5 pr-3">{r.records_updated ?? 0}</td>
                    <td className="py-1.5 pr-3">{r.error_count ? <span className="text-destructive">{r.error_count}</span> : 0}</td>
                    <td className="py-1.5 pr-3 truncate max-w-[140px]">{r.triggered_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}