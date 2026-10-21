import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { REPEATERBOOK_STATES } from '@/lib/repeaterbookStates';
import { Loader2, Download, Radio, CheckCircle2, AlertTriangle } from 'lucide-react';

import { errMsg } from '@/lib/utils';

export default function RepeaterBookImport({ open, onOpenChange, onImported }) {
  const [stateId, setStateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [service, setService] = useState('GMRS');
  const [hamProgress, setHamProgress] = useState(null);
  const [hamMode, setHamMode] = useState('state');
  const [hamStateId, setHamStateId] = useState('');
  const [allGmrsBusy, setAllGmrsBusy] = useState(false);
  const [allGmrsResult, setAllGmrsResult] = useState(null);

  const selected = REPEATERBOOK_STATES.find((s) => s.id === stateId);
  const hamSelected = REPEATERBOOK_STATES.find((s) => s.id === hamStateId);

  const syncAllGmrs = async () => {
    setAllGmrsBusy(true);
    setError('');
    setAllGmrsResult(null);
    try {
      const res = await base44.functions.invoke('importRepeaterbookAll', {});
      setAllGmrsResult(res?.data || null);
      onImported?.();
    } catch (e) {
      setError(errMsg(e) || e?.message || 'GMRS nationwide sync failed');
    } finally {
      setAllGmrsBusy(false);
    }
  };

  const run = async () => {
    if (service === 'HAM' && hamMode === 'state') {
      if (!hamSelected) return;
      setBusy(true);
      setError('');
      setResult(null);
      try {
        const res = await base44.functions.invoke('importRepeaterbookHamState', {
          state_id: hamSelected.id,
          state_abbr: hamSelected.abbr,
          state_name: hamSelected.name,
        });
        setResult(res?.data || null);
        onImported?.();
      } catch (e) {
        setError(errMsg(e) || e?.message || 'HAM state import failed');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (service === 'HAM') {
      setBusy(true);
      setError('');
      setResult(null);

      try {
        let data = await base44.functions.invoke('importRepeaterbookHam', { action: 'start' });
        let progress = data?.data || {};
        setHamProgress(progress);

        while (progress.status === 'active' && progress.current_index < progress.states_total) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          data = await base44.functions.invoke('importRepeaterbookHam', { action: 'step' });
          progress = data?.data || {};
          setHamProgress(progress);
          if (progress.status === 'paused') break;
        }

        setResult(progress);
        onImported?.();
      } catch (e) {
        setError(errMsg(e) || e?.message || 'HAM import failed');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!selected) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await base44.functions.invoke('importRepeaterbookState', {
        state_id: selected.id,
        state_abbr: selected.abbr,
        state_name: selected.name,
      });
      setResult(res?.data || null);
      onImported?.();
    } catch (e) {
      setError(errMsg(e) || e?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError('');
    setStateId('');
    setService('GMRS');
    setHamProgress(null);
    setHamMode('state');
    setHamStateId('');
    setAllGmrsBusy(false);
    setAllGmrsResult(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" /> Import from RepeaterBook
          </DialogTitle>
          <DialogDescription>
            Import GMRS repeaters by state or synchronize the HAM repeater database from the approved RepeaterBook API.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <div className={`flex items-center gap-2 ${service === 'HAM' && result.paused && result.pause_reason !== 'rate_limit' ? 'text-destructive' : service === 'HAM' && result.paused ? 'text-amber-600' : 'text-success'}`}>
              {service === 'HAM' && result.paused ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
              <span className="font-medium">
                {service === 'HAM' && result.paused
                  ? result.pause_reason === 'auth'
                    ? 'HAM Sync Paused — Authentication Failed'
                    : result.pause_reason === 'rate_limit'
                      ? 'HAM Sync Paused — Rate Limited'
                      : 'HAM Sync Paused — Progress Saved'
                  : 'Import complete'}
              </span>
            </div>
            <div className="text-sm space-y-1">
              {service === 'HAM' && hamMode === 'nationwide' ? (
                <>
                  {result.paused && result.pause_reason === 'auth' && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive text-xs">
                      RepeaterBook rejected the server's API token ({result.last_error || 'unauthorized'}). This will not resolve on its own — the REPEATERBOOK_API_TOKEN needs to be fixed before resuming.
                    </div>
                  )}
                  <div>States processed: <b>{result.states_completed}</b> / {result.states_total}</div>
                  <div>Records received: <b>{result.fetched}</b></div>
                  <div>HAM repeaters added: <b>{result.created}</b></div>
                  <div>Existing HAM repeaters updated: {result.updated}</div>
                  <div>Skipped: {result.skipped}</div>
                  {result.errors?.length > 0 && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">
                      <div>State errors: {result.errors.length}</div>
                      <div className="mt-1 text-xs break-words">
                        {result.errors.slice(-3).map((e) => `${e.state_id}: ${e.error}`).join(' · ')}
                        {result.errors.length > 3 ? ' · …' : ''}
                      </div>
                    </div>
                  )}
                </>
              ) : service === 'HAM' && hamMode === 'state' ? (
                <>
                  <div>HAM repeaters added: <b>{result.imported}</b></div>
                  <div>Existing HAM repeaters updated: {result.updated}</div>
                  <div>Without coordinates: {result.no_coords}</div>
                  <div>Total found: {result.total}</div>
                </>
              ) : (
                <>
                  <div>Imported: <b>{result.imported}</b></div>
                  <div>Skipped (already exist): {result.skipped}</div>
                  <div>Without coordinates: {result.no_coords}</div>
                  <div>Total found: {result.total}</div>
                </>
              )}
            </div>
            {service === 'HAM' && (
              <p className="text-xs text-muted-foreground">
                HAM records are stored with <b>radio_service = HAM</b> and matched by callsign + frequency to prevent duplicates.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={service === 'GMRS' ? 'default' : 'outline'} onClick={() => setService('GMRS')}>
                GMRS
              </Button>
              <Button type="button" variant={service === 'HAM' ? 'default' : 'outline'} onClick={() => setService('HAM')}>
                <Radio className="w-4 h-4" /> HAM
              </Button>
            </div>

            {service === 'GMRS' ? (
              <>
                <label className="text-sm font-medium">State</label>
                <select
                  value={stateId}
                  onChange={(e) => setStateId(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="">Select a state…</option>
                  {REPEATERBOOK_STATES.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground mb-2">Or sync all states at once (faster, no geocoding — run the geocode step afterward):</div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={allGmrsBusy}
                    onClick={syncAllGmrs}
                  >
                    {allGmrsBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                    {allGmrsBusy ? 'Syncing all states…' : 'Sync All GMRS States'}
                  </Button>
                  {allGmrsResult && (
                    <div className="mt-2 text-sm space-y-1">
                      <div className="flex items-center gap-1 text-success"><CheckCircle2 className="w-4 h-4" /><span className="font-medium">Sync complete</span></div>
                      <div>States processed: <b>{allGmrsResult.states}</b></div>
                      <div>Total rows found: <b>{allGmrsResult.total_rows}</b></div>
                      <div>Imported: <b>{allGmrsResult.imported}</b></div>
                      <div>Skipped (duplicates): {allGmrsResult.skipped}</div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" size="sm" variant={hamMode === 'state' ? 'default' : 'outline'} onClick={() => setHamMode('state')}>
                    Single State
                  </Button>
                  <Button type="button" size="sm" variant={hamMode === 'nationwide' ? 'default' : 'outline'} onClick={() => setHamMode('nationwide')}>
                    Nationwide (API)
                  </Button>
                </div>

                {hamMode === 'state' ? (
                  <>
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                      Scrapes RepeaterBook's public amateur-radio results page for one state — no API token required. Offsets are approximated from the standard split for each band since this page doesn't report an exact split.
                    </div>
                    <label className="text-sm font-medium">State</label>
                    <select
                      value={hamStateId}
                      onChange={(e) => setHamStateId(e.target.value)}
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="">Select a state…</option>
                      {REPEATERBOOK_STATES.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </>
                ) : (
                <>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                  <div className="font-medium">HAM Repeater Sync</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sync progress is stored server-side. The sync pauses on rate limits and can be resumed without starting over.
                  </p>
                  {hamProgress?.paused && hamProgress.pause_reason === 'auth' && (
                    <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      <div className="font-medium">RepeaterBook rejected the server's API credentials ({hamProgress.last_error || 'unauthorized'}).</div>
                      <div className="mt-1">
                        This isn't a rate limit — the REPEATERBOOK_API_TOKEN configured for this app is invalid, expired, or not approved.
                        Fix the token in server settings, then click Resume.
                      </div>
                    </div>
                  )}
                  {hamProgress?.paused && hamProgress.pause_reason === 'rate_limit' && (
                    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                      <div className="font-medium">RepeaterBook temporarily rate-limited this sync.</div>
                      <div className="mt-1 text-muted-foreground">
                        Your progress is saved. The sync will not retry until the recorded cooldown has passed.
                      </div>
                      {hamProgress.next_retry_at && (
                        <div className="mt-1 font-medium">Next retry: {new Date(hamProgress.next_retry_at).toLocaleString()}</div>
                      )}
                    </div>
                  )}
                  {hamProgress?.paused && hamProgress.pause_reason === 'error' && (
                    <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      <div className="font-medium">Sync paused after an unexpected error: {hamProgress.last_error || 'unknown error'}</div>
                      <div className="mt-1">Progress is saved. Click Resume to try again.</div>
                    </div>
                  )}
                </div>
                {busy && hamProgress && !hamProgress.paused && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Syncing HAM repeaters…</span>
                    <span className="text-xs text-muted-foreground">{hamProgress.states_completed} / {hamProgress.states_total} states</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: Math.round((hamProgress.states_completed / Math.max(hamProgress.states_total, 1)) * 100) + '%' }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <span>Found: <b className="text-foreground">{hamProgress.fetched}</b></span>
                    <span>Added: <b className="text-foreground">{hamProgress.created}</b></span>
                    <span>Updated: <b className="text-foreground">{hamProgress.updated}</b></span>
                  </div>
                </div>
                )}
                </>
                )}
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result || allGmrsResult ? (
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          ) : service === 'HAM' && result?.paused ? (
            <>
              <DialogClose asChild>
                <Button variant="outline" disabled={busy}>Close</Button>
              </DialogClose>
              <Button onClick={() => { setResult(null); run(); }} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {busy ? 'Resuming…' : 'Resume HAM Sync'}
              </Button>
            </>
          ) : (
            <>
              <DialogClose asChild>
                <Button variant="outline" disabled={busy}>Cancel</Button>
              </DialogClose>
              <Button
                onClick={run}
                disabled={
                  (service === 'GMRS' && !selected) ||
                  (service === 'HAM' && hamMode === 'state' && !hamSelected) ||
                  busy
                }
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {busy
                  ? 'Importing…'
                  : service === 'HAM' && hamMode === 'nationwide'
                    ? (hamProgress?.states_completed ? 'Resume HAM Sync' : 'Start HAM Sync')
                    : 'Import'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}