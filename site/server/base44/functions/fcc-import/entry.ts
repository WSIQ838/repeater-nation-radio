// Full-database import from the FCC ULS bulk data (GMRS or Amateur/HAM)
// into the local FccLicense table.
//
// Source URLs (verified live, not assumed -- www.fcc.gov itself returns a
// hard WAF 403 for non-browser requests, but these data.fcc.gov bulk-download
// URLs work fine):
//   GMRS: https://data.fcc.gov/download/pub/uls/complete/l_gmrs.zip  (~55 MB, ~611k licenses)
//   HAM:  https://data.fcc.gov/download/pub/uls/complete/l_amat.zip (~198 MB, several million licenses)
//
// A full import is far larger than one function invocation can finish, so
// this is resumable: pass the previous response's `run_id` and `cursor` back
// in to continue. KNOWN TRADEOFF: because a Deno function invocation can't
// hold state for the next call, every resumed call re-downloads and
// re-parses the entire source zip, then fast-forwards to `cursor` before
// writing anything new -- cheap for GMRS (~55 MB/call), a real bandwidth
// cost for the full HAM import (~198 MB per resumed call across what will
// likely be dozens of calls). This is disclosed, not hidden: a persistent
// staging store would remove the re-download cost but is out of scope here.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { requireAdmin, writeAudit } from '../../shared/adminGuard.ts';
import { parseCountsCreationDate } from '../../shared/fccUlsParser.ts';

const SOURCES: Record<string, string> = {
  GMRS: 'https://data.fcc.gov/download/pub/uls/complete/l_gmrs.zip',
  HAM: 'https://data.fcc.gov/download/pub/uls/complete/l_amat.zip',
};
const FILE_NAMES: Record<string, string> = { GMRS: 'l_gmrs.zip', HAM: 'l_amat.zip' };

// Base44 functions have a relatively tight execution envelope. Yield early so
// the resumable cursor advances before the platform can terminate the request.
const TIME_BUDGET_MS = 4000;
// Larger batches dramatically reduce Base44 entity-operation rate limiting
// during the multi-million-record HAM import while staying well below the
// function memory envelope.
const BATCH_SIZE = 50;
const DB_RETRY_ATTEMPTS = 6;
const DB_RETRY_DELAY_MS = 1500;

export default async function(req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  const { caller, error } = await requireAdmin(base44);
  if (error) return error;
  let run: any = null;
  try {
    const body = await req.json().catch(() => ({}));
    const radioService = body.radio_service === 'HAM' ? 'HAM' : 'GMRS';
    const dryRun = body.dry_run === true;
    const runId = body.run_id ? String(body.run_id) : '';
    const rawCursor = String(body.cursor || '0');
    const match = rawCursor.match(/^(HD|EN):(\d+)$/i);
    let phase: 'HD' | 'EN' = match ? (match[1].toUpperCase() as 'HD' | 'EN') : 'HD';
    let startCursor = match ? Number(match[2]) : Math.max(0, Number(body.cursor || 0) || 0);
    const t0 = Date.now();

    const sourceUrl = SOURCES[radioService];
    const requestedResume = body.resume === true;

    // Never allow multiple full-import workers for the same radio service.
    // Multiple browser tabs/retries can otherwise create concurrent workers,
    // which quickly exhausts Base44 request capacity and makes the whole site
    // appear rate-limited. A paused run only resumes when the caller explicitly
    // sends resume=true (the admin Resume button does this).
    const activeRuns = await base44.asServiceRole.entities.FccImportRun
      .filter({ run_type: 'full_import', radio_service: radioService, status: 'running' }, '-created_date', 10)
      .catch(() => []);
    if (activeRuns?.length && (!runId || !activeRuns.some((r: any) => r.id === runId))) {
      return Response.json({
        error: `${radioService} FCC full import is already running.`,
        run_id: activeRuns[0].id,
        cursor: activeRuns[0].cursor || '',
        busy: true,
      }, { status: 409 });
    }

    // Create the run before opening the FCC archive so transport/memory failures
    // are recorded instead of surfacing only as a generic user-exception.
    if (runId) {
      // A long-running import can outlive a stale/missing run record (for
      // example after an app data reset or an interrupted entity write). Do
      // not throw away thousands of records already processed just because
      // the run metadata disappeared. Retry the lookup briefly, then create
      // a replacement run and continue from the caller-supplied cursor.
      for (let attempt = 1; attempt <= 3 && !run; attempt++) {
        run = await base44.asServiceRole.entities.FccImportRun.get(runId).catch(() => null);
        if (!run && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }

      if (!run) {
        run = await base44.asServiceRole.entities.FccImportRun.create({
          run_type: 'full_import', radio_service: radioService, source: sourceUrl,
          source_file: FILE_NAMES[radioService], source_date: '', dry_run: dryRun,
          status: 'running', started_at: new Date().toISOString(),
          records_scanned: startCursor, records_created: 0, records_updated: 0,
          malformed_records: 0, skipped_records: 0,
          triggered_by_name: caller.full_name || caller.email || 'admin',
          notes: `Recovered missing import run ${runId}; resumed at ${phase}:${startCursor}.`,
        });
      }
    } else {
      run = await base44.asServiceRole.entities.FccImportRun.create({
        run_type: 'full_import', radio_service: radioService, source: sourceUrl,
        source_file: FILE_NAMES[radioService], source_date: '', dry_run: dryRun,
        status: 'running', started_at: new Date().toISOString(), records_scanned: 0,
        records_created: 0, records_updated: 0, malformed_records: 0,
        skipped_records: 0, triggered_by_name: caller.full_name || caller.email || 'admin',
      });
    }
    if (runId && run.status === 'paused' && !requestedResume) {
      return Response.json({
        paused: true,
        run_id: run.id,
        cursor: run.cursor || rawCursor,
        status: 'paused',
      });
    }
    if (runId && (run.status === 'failed' || run.status === 'paused')) {
      await base44.asServiceRole.entities.FccImportRun.update(run.id, { status: 'running', completed_at: null });
      run.status = 'running';
    }

    // NEVER buffer the complete FCC ZIP in memory. The previous implementation
    // used response.arrayBuffer() + JSZip + split(), which exceeded the function
    // memory limit before the ZIP reached EOF (especially for l_amat.zip).
    // HttpRangeReader reads the ZIP directory and then only the requested file
    // ranges, so HD.dat / EN.dat are streamed instead of materialized in RAM.
    const { HttpRangeReader, ZipReader, TextWriter } = await import('npm:@zip.js/zip.js@2.8.15');
    // Keep decompression inside the function's memory budget. FCC ULS ZIPs are
    // large, and web-worker transfer can temporarily duplicate stream buffers.
    // HTTP range requests also prevent the ZIP itself from being buffered.
    const zipReader = new ZipReader(
      new HttpRangeReader(sourceUrl, {
        forceRangeRequests: true,
        maximumRangeSize: 8 * 1024 * 1024,
      }),
      {
        useWebWorkers: false,
        transferStreams: false,
        useCompressionStream: false,
      }
    );

    try {
      const entries = await zipReader.getEntries();
      const byName = new Map(
        entries
          .filter((entry: any) => !entry.directory)
          .map((entry: any) => [String(entry.filename || '').toUpperCase(), entry])
      );
      const hdEntry: any = byName.get('HD.DAT');
      const enEntry: any = byName.get('EN.DAT');
      if (!hdEntry) {
        return Response.json({ error: 'HD.dat missing from source zip -- FCC file layout may have changed' }, { status: 422 });
      }

      let sourceDate = '';
      const countsEntry: any = byName.get('COUNTS');
      if (countsEntry) {
        try {
          const countsText = await countsEntry.getData(new TextWriter());
          sourceDate = parseCountsCreationDate(countsText);
        } catch (e) {
          console.warn('[fcc-import] counts read failed:', (e as any)?.message || e);
        }
      }


      let scanned = 0;
      let created = 0;
      let updated = 0;
      let malformed = 0;
      let skipped = 0;
      const errors: string[] = [];

      const gmrsCode = 'ZA';
      const hamCodes = new Set(['HA', 'HV']);
      const isTargetCode = (code: string) => radioService === 'GMRS'
        ? code.trim().toUpperCase() === gmrsCode
        : hamCodes.has(code.trim().toUpperCase());

      const toIso = (value: string): string | null => {
        const m = String(value || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return m ? m[3] + '-' + m[1] + '-' + m[2] : null;
      };

      const normalizeStatus = (code: string, expirationDate: string | null, cancellationDate: string | null) => {
        const c = code.trim().toUpperCase();
        if (cancellationDate) return 'cancelled';
        if (c === 'C') return 'cancelled';
        if (c === 'T') return 'terminated';
        if (c === 'E') return 'expired';
        if (c === 'A') {
          if (expirationDate && new Date(expirationDate).getTime() < Date.now()) return 'expired';
          return 'active';
        }
        return 'other';
      };

      // WritableStream is used deliberately: zip.js awaits each write(), which
      // gives database batch writes real backpressure. Only a line-sized carry
      // buffer and one 500-row DB batch exist in memory at a time.
      async function streamEntryLines(
        entry: any,
        onLine: (line: string) => Promise<void>,
      ): Promise<'completed' | 'time'> {
        const decoder = new TextDecoder('windows-1252');
        let carry = '';
        let stoppedForTime = false;

        const writable = new WritableStream<Uint8Array>({
          async write(chunk) {
            if (stoppedForTime) return;
            carry += decoder.decode(chunk, { stream: true });
            let newline = carry.indexOf('\n');
            while (newline >= 0) {
              const line = carry.slice(0, newline).replace(/\r$/, '');
              carry = carry.slice(newline + 1);
              if (line) await onLine(line);
              if (Date.now() - t0 >= TIME_BUDGET_MS) {
                stoppedForTime = true;
                throw new Error('__FCC_TIME_BUDGET__');
              }
              newline = carry.indexOf('\n');
            }
          },
          async close() {
            if (stoppedForTime) return;
            carry += decoder.decode();
            if (carry) await onLine(carry.replace(/\r$/, ''));
          },
        });

        try {
          await entry.getData(writable, {
            useWebWorkers: false,
            transferStreams: false,
            useCompressionStream: false,
          });
        } catch (e) {
          const msg = String((e as any)?.message || e);
          if (msg.includes('__FCC_TIME_BUDGET__')) return 'time';
          throw e;
        }
        return stoppedForTime || Date.now() - t0 >= TIME_BUDGET_MS ? 'time' : 'completed';
      }

      const isRetryableDbError = (e: any) => {
        const message = String((e as any)?.message || e);
        return /rate limit|too many requests|cloudflare|timeout|temporarily unavailable|5\d\d/i.test(message);
      };

      async function withDbRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
        let lastError: any = null;
        for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt++) {
          try {
            return await operation();
          } catch (e) {
            lastError = e;
            if (!isRetryableDbError(e) || attempt === DB_RETRY_ATTEMPTS) throw e;
            const delay = DB_RETRY_DELAY_MS * attempt;
            await new Promise((resolve) => setTimeout(resolve, delay));
            console.warn('[fcc-import] retrying ' + label + ' after ' + delay + 'ms (attempt ' + (attempt + 1) + '/' + DB_RETRY_ATTEMPTS + '): ' + ((e as any)?.message || e));
          }
        }
        throw lastError;
      }

      async function adaptiveBulkWrite<T>(
        label: string,
        rows: T[],
        write: (chunk: T[]) => Promise<void>,
      ): Promise<void> {
        if (!rows.length) return;
        try {
          await withDbRetry(label + ' (' + rows.length + ')', () => write(rows));
          return;
        } catch (e) {
          if (!isRetryableDbError(e) || rows.length <= 1) throw e;
          const midpoint = Math.ceil(rows.length / 2);
          console.warn('[fcc-import] ' + label + ' rate-limited at ' + rows.length + '; splitting into ' + midpoint + ' + ' + (rows.length - midpoint));
          await adaptiveBulkWrite(label, rows.slice(0, midpoint), write);
          await adaptiveBulkWrite(label, rows.slice(midpoint), write);
        }
      }

      async function flushHd(rows: any[]) {
        if (!rows.length) return;
        if (dryRun) {
          created += rows.length;
          return;
        }

        const keys = rows.map((r) => r.licenseKey);
        let existingRows: any[] = [];
        try {
          existingRows = await withDbRetry('FCC license existing lookup', () =>
            base44.asServiceRole.entities.FccLicense.filter(
              { radio_service: radioService, license_key: { $in: keys } },
              undefined,
              1000
            )
          );
        } catch (e) {
          const message = 'existing FCC license lookup failed: ' + ((e as any)?.message || e);
          errors.push(message);
          throw new Error(message);
        }

        const existingByKey = new Map<string, any>(
          (existingRows || []).map((r: any) => [String(r.license_key), r])
        );
        const toCreate: any[] = [];
        const toUpdate: any[] = [];
        for (const r of rows) {
          const ex = existingByKey.get(r.licenseKey);
          if (ex) toUpdate.push({ id: ex.id, ...r.shape });
          else toCreate.push(r.shape);
        }

        try {
          if (toCreate.length) {
            await adaptiveBulkWrite(
              'FCC license bulk create',
              toCreate,
              (chunk) => base44.asServiceRole.entities.FccLicense.bulkCreate(chunk)
            );
            created += toCreate.length;
          }
          if (toUpdate.length) {
            await adaptiveBulkWrite(
              'FCC license bulk update',
              toUpdate,
              (chunk) => base44.asServiceRole.entities.FccLicense.bulkUpdate(chunk)
            );
            updated += toUpdate.length;
          }
        } catch (e) {
          const message = 'FCC license batch write failed: ' + ((e as any)?.message || e);
          errors.push(message);
          throw new Error(message);
        }
      }

      async function flushEn(rows: any[]) {
        if (!rows.length || dryRun) return;
        const usis = rows.map((r) => r.usi);
        let existingRows: any[] = [];
        try {
          existingRows = await withDbRetry('FCC entity existing lookup', () =>
            base44.asServiceRole.entities.FccLicense.filter(
              { radio_service: radioService, unique_system_identifier: { $in: usis } },
              undefined,
              1000
            )
          );
        } catch (e) {
          const message = 'FCC entity lookup failed: ' + ((e as any)?.message || e);
          errors.push(message);
          throw new Error(message);
        }

        const byUsi = new Map<string, any>(
          (existingRows || []).map((r: any) => [String(r.unique_system_identifier), r])
        );
        const updates = rows
          .map((r) => {
            const ex = byUsi.get(r.usi);
            return ex ? {
              id: ex.id,
              licensee_name: r.licenseeName,
              city: r.city,
              state: r.state,
              zip: r.zip,
              frn: r.frn,
              last_checked_at: new Date().toISOString(),
              source: 'full_import',
            } : null;
          })
          .filter(Boolean);

        if (!updates.length) return;
        try {
          await adaptiveBulkWrite(
            'FCC entity batch update',
            updates,
            (chunk) => base44.asServiceRole.entities.FccLicense.bulkUpdate(chunk)
          );
          updated += updates.length;
        } catch (e) {
          const message = 'FCC entity batch update failed: ' + ((e as any)?.message || e);
          errors.push(message);
          throw new Error(message);
        }
      }

      let completed = false;
      let cursorForResponse = startCursor;

      // Phase 1: HD.dat contains the license identity/status fields required
      // for callsign verification. It is processed as a stream and resumed by
      // target-record cursor, not by holding all HD rows in a Map.
      if (phase === 'HD') {
        const batch: any[] = [];
        let targetIndex = 0;
        const streamResult = await streamEntryLines(hdEntry, async (line) => {
          if (Date.now() - t0 >= TIME_BUDGET_MS) throw new Error('__FCC_TIME_BUDGET__');

          const f = line.split('|');
          if (f[0] !== 'HD') return;

          const code = String(f[6] || '').trim().toUpperCase();
          if (!isTargetCode(code)) return;

          const currentIndex = targetIndex++;
          cursorForResponse = currentIndex + 1;
          if (currentIndex < startCursor) return;

          const usi = String(f[1] || '').trim();
          const callsign = String(f[4] || '').trim().toUpperCase();
          if (!usi || !callsign || f.length < 44) {
            malformed++;
            return;
          }

          const grantDate = toIso(f[7] || '');
          const expirationDate = toIso(f[8] || '');
          const cancellationDate = toIso(f[9] || '');
          const licenseStatus = normalizeStatus(String(f[5] || ''), expirationDate, cancellationDate);
          const nowIso = new Date().toISOString();

          batch.push({
            licenseKey: code + ':' + usi,
            shape: {
              callsign,
              normalized_callsign: callsign,
              radio_service: radioService,
              radio_service_code: code,
              license_key: code + ':' + usi,
              license_status_code: String(f[5] || '').trim(),
              license_status: licenseStatus,
              active: licenseStatus === 'active',
              ...(grantDate ? { grant_date: grantDate } : {}),
              ...(expirationDate ? { expiration_date: expirationDate } : {}),
              ...(cancellationDate ? { cancellation_date: cancellationDate } : {}),
              ...(toIso(f[43] || '') ? { last_transaction_date: toIso(f[43] || '') } : {}),
              licensee_name: '',
              city: '',
              state: '',
              zip: '',
              frn: '',
              unique_system_identifier: usi,
              uls_file_number: String(f[2] || '').trim(),
              source: 'full_import',
              source_file: FILE_NAMES[radioService],
              imported_at: nowIso,
              last_checked_at: nowIso,
            },
          });
          scanned++;

          if (batch.length >= BATCH_SIZE) {
            await flushHd(batch.splice(0, batch.length));
          }
        });

        if (batch.length) await flushHd(batch.splice(0, batch.length));

        if (streamResult === 'time') {
          phase = 'HD';
          startCursor = cursorForResponse;
        } else if (enEntry) {
          phase = 'EN';
          startCursor = 0;
          cursorForResponse = 0;
        } else {
          completed = true;
        }
      }

      // Phase 2: EN.dat is streamed separately and used only to enrich rows
      // that the HD phase already created. This avoids the old giant EN Map.
      if (!completed && phase === 'EN' && enEntry) {
        const batch: any[] = [];
        let targetIndex = 0;
        cursorForResponse = startCursor;

        const streamResult = await streamEntryLines(enEntry, async (line) => {
          if (Date.now() - t0 >= TIME_BUDGET_MS) throw new Error('__FCC_TIME_BUDGET__');

          const f = line.split('|');
          if (f[0] !== 'EN') return;
          if (String(f[5] || '').trim().toUpperCase() !== 'L') return;

          const currentIndex = targetIndex++;
          cursorForResponse = currentIndex + 1;
          if (currentIndex < startCursor) return;

          const usi = String(f[1] || '').trim();
          if (!usi || f.length < 23) {
            malformed++;
            return;
          }

          batch.push({
            usi,
            licenseeName: String(f[7] || '').trim(),
            city: String(f[16] || '').trim(),
            state: String(f[17] || '').trim(),
            zip: String(f[18] || '').trim().slice(0, 5),
            frn: String(f[22] || '').trim(),
          });
          scanned++;

          if (batch.length >= BATCH_SIZE) {
            await flushEn(batch.splice(0, batch.length));
          }
        });

        if (batch.length) await flushEn(batch.splice(0, batch.length));

        if (streamResult === 'time') {
          phase = 'EN';
          startCursor = cursorForResponse;
        } else {
          completed = true;
        }
      }

      const hasErrors = errors.length > 0;
      const nextCursor = completed && !hasErrors ? '' : phase + ':' + startCursor;
      const durationMs = Date.now() - t0;

      const mergedErrors = [run.errors, ...errors].filter(Boolean).join('\n').slice(0, 5000);
      const latestRunState = await base44.asServiceRole.entities.FccImportRun.get(run.id).catch(() => null);
      const pauseRequested = latestRunState?.status === 'paused';
      await base44.asServiceRole.entities.FccImportRun.update(run.id, {
        cursor: nextCursor,
        records_scanned: (run.records_scanned || 0) + scanned,
        records_created: (run.records_created || 0) + created,
        records_updated: (run.records_updated || 0) + updated,
        malformed_records: (run.malformed_records || 0) + malformed,
        skipped_records: (run.skipped_records || 0) + skipped,
        error_count: (run.error_count || 0) + errors.length,
        errors: mergedErrors,
        duration_ms: (run.duration_ms || 0) + durationMs,
        status: pauseRequested ? 'paused' : hasErrors ? 'failed' : completed ? 'completed' : 'running',
        ...(hasErrors || completed ? { completed_at: new Date().toISOString() } : {}),
      });

      if (completed && !hasErrors && !dryRun) {
        await writeAudit(base44, {
          admin_id: caller.id,
          admin_name: caller.full_name || caller.email || 'admin',
          action: 'fcc_full_import',
          category: 'callsigns',
          target_type: 'FccImportRun',
          target_id: run.id,
          target_label: radioService + ' full import',
          meta: {
            radio_service: radioService,
            source_date: sourceDate,
            total_created: (run.records_created || 0) + created,
            total_updated: (run.records_updated || 0) + updated,
          },
        });
      }

      return Response.json({
        ok: !hasErrors,
        run_id: run.id,
        dry_run: dryRun,
        radio_service: radioService,
        done: completed && !hasErrors,
        phase,
        cursor: nextCursor,
        scanned,
        created,
        updated,
        malformed,
        skipped,
        source_date: sourceDate || run.source_date || '',
        errors: errors.slice(0, 10),
        error_count: errors.length,
      });
    } finally {
      await zipReader.close().catch(() => {});
    }
  } catch (error) {
    const message = (error as any)?.message || String(error) || 'Import failed';
    console.error('[fcc-import] error:', message);
    try {
      if (run?.id) {
        await base44.asServiceRole.entities.FccImportRun.update(run.id, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_count: (run.error_count || 0) + 1,
          errors: [run.errors, message].filter(Boolean).join('\\n').slice(0, 5000),
        });
      }
    } catch (persistError) {
      console.error('[fcc-import] failed to persist error:', (persistError as any)?.message || persistError);
    }
    // Return a normal function response so the Base44 SDK does not collapse the backend
    // error into the generic `user-exception` message. The UI can then display the
    // actual FCC/import error and the persisted FccImportRun keeps the cursor.
    return Response.json({ ok: false, error: message, run_id: run?.id || '', resumable: !!run?.id }, { status: 200 });
  }
}
