// Applies the FCC's daily ULS transaction file (new licenses, renewals,
// cancellations, status changes) to the local FccLicense table.
//
// Source URLs (verified live against data.fcc.gov, not assumed):
//   GMRS: https://data.fcc.gov/download/pub/uls/daily/l_gm_<day>.zip
//   HAM:  https://data.fcc.gov/download/pub/uls/daily/l_am_<day>.zip
// where <day> is mon/tue/wed/thu/fri. The FCC publishes Tuesday through
// Saturday; each published file contains the previous day's transactions.
// Daily files use the same HD.dat/EN.dat pipe-delimited format as the complete
// dumps, so this reuses the same parser.
// Daily files are small (typically tens to low hundreds of KB), so unlike
// fcc-import this always completes in one call -- no cursor/resume needed.
//
// Idempotency: the FCC's own "File Creation Date" (from the zip's `counts`
// file) is the dedupe key. A source_date already recorded as a completed
// daily_update run for this radio_service is skipped unless force:true is
// passed. Applying the same file twice is also safe on its own merits, since
// every record is an upsert keyed on (radio_service_code, unique_system_identifier),
// not an append -- re-running just re-writes the same values.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import JSZip from 'npm:jszip@3.10.1';
import { checkCallerPermission, writeAudit } from '../../shared/adminGuard.ts';
import { parseHdDat, parseEnDat, joinHdEn, parseCountsCreationDate } from '../../shared/fccUlsParser.ts';

const PREFIX: Record<string, string> = { GMRS: 'l_gm', HAM: 'l_am' };
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function currentWeekday(): string {
  const day = new Date().getUTCDay();
  // Published Tue -> Monday transactions, Wed -> Tuesday, Thu -> Wednesday,
  // Fri -> Thursday, Sat -> Friday. No new file is published Sunday/Monday.
  if (day === 0 || day === 1) return 'fri';
  return WEEKDAYS[day - 1];
}

async function runOne(base44: any, caller: any, radioService: 'GMRS' | 'HAM', weekday: string, dryRun: boolean, force: boolean) {
  const t0 = Date.now();
  const fileName = `${PREFIX[radioService]}_${weekday}.zip`;
  const sourceUrl = `https://data.fcc.gov/download/pub/uls/daily/${fileName}`;

  const resp = await fetch(sourceUrl, { redirect: 'follow' });
  if (!resp.ok) {
    return { radio_service: radioService, error: `Failed to fetch ${sourceUrl} (${resp.status})` };
  }
  const buf = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const countsFile = zip.file('counts');
  const countsText = countsFile ? await countsFile.async('string') : '';
  const sourceDate = parseCountsCreationDate(countsText);

  if (!force && sourceDate) {
    const already = await base44.asServiceRole.entities.FccImportRun.filter({
      run_type: 'daily_update', radio_service: radioService, source_date: sourceDate, status: 'completed',
    }, '-completed_at', 1).catch(() => []);
    if (already && already.length) {
      return {
        radio_service: radioService, skipped: true, source_date: sourceDate,
        message: `Already processed ${fileName} (source date ${sourceDate}). Pass force:true to re-run.`,
      };
    }
  }

  const hdFile = zip.file('HD.dat');
  const enFile = zip.file('EN.dat');
  const hdText = hdFile ? await hdFile.async('string') : '';
  const enText = enFile ? await enFile.async('string') : '';

  const run = await base44.asServiceRole.entities.FccImportRun.create({
    run_type: 'daily_update', radio_service: radioService, source: sourceUrl, source_file: fileName,
    source_date: sourceDate, dry_run: dryRun, status: 'running', started_at: new Date().toISOString(),
    triggered_by_name: caller?.full_name || caller?.email || 'Scheduled FCC Daily Update',
  });

  if (!hdText) {
    // No HD.dat in today's file just means nothing changed for this service
    // today -- not an error. Finalize the run row regardless of dry_run so a
    // preview never leaves a permanently "running" row in the import history.
    await base44.asServiceRole.entities.FccImportRun.update(run.id, {
      status: 'completed', completed_at: new Date().toISOString(), duration_ms: Date.now() - t0,
      notes: 'No HD.dat in source -- no license changes today.',
    });
    return { radio_service: radioService, run_id: run.id, source_date: sourceDate, created: 0, updated: 0, scanned: 0 };
  }

  const hd = parseHdDat(hdText);
  const en = parseEnDat(enText);
  const { records, skipped } = joinHdEn(hd.rows, en.rows);
  const malformed = hd.malformed + en.malformed;
  const errors: string[] = [];
  let created = 0, updated = 0;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    let existingRows: any[] = [];
    try {
      existingRows = await base44.asServiceRole.entities.FccLicense.filter({
        radio_service: radioService,
        license_key: { $in: chunk.map((r) => r.licenseKey) },
      }, undefined, 1000);
    } catch (e) {
      errors.push(`existing-lookup failed: ${(e as any)?.message || e}`);
    }
    const existingByKey = new Map<string, any>();
    for (const row of existingRows || []) {
      if (row.license_key) existingByKey.set(String(row.license_key), row);
      else if (row.normalized_callsign) {
        existingByKey.set(String(row.radio_service_code || row.radio_service) + ':' + String(row.normalized_callsign), row);
      }
    }

    const toCreate: any[] = [];
    const toUpdate: any[] = [];
    for (const rec of chunk) {
      const shape = {
        callsign: rec.callsign, normalized_callsign: rec.normalizedCallsign,
        radio_service: rec.radioService, radio_service_code: rec.radioServiceCode,
        license_key: rec.licenseKey,
        license_status_code: rec.licenseStatusCode, license_status: rec.licenseStatus,
        active: rec.licenseStatus === 'active',
        ...(rec.grantDate ? { grant_date: rec.grantDate } : {}),
        ...(rec.expirationDate ? { expiration_date: rec.expirationDate } : {}),
        ...(rec.cancellationDate ? { cancellation_date: rec.cancellationDate } : {}),
        ...(rec.lastActionDate ? { last_transaction_date: rec.lastActionDate } : {}),
        licensee_name: rec.licenseeName, city: rec.city, state: rec.state, zip: rec.zip, frn: rec.frn,
        unique_system_identifier: rec.uniqueSystemIdentifier, uls_file_number: rec.ulsFileNumber,
        source: 'daily_transaction', source_file: fileName, imported_at: nowIso, last_checked_at: nowIso,
      };
      const ex = existingByKey.get(rec.licenseKey)
        || existingByKey.get(rec.radioServiceCode + ':' + rec.normalizedCallsign);
      if (ex) toUpdate.push({ id: ex.id, ...shape });
      else toCreate.push(shape);
    }

    if (!dryRun) {
      if (toCreate.length) {
        try { await base44.asServiceRole.entities.FccLicense.bulkCreate(toCreate); created += toCreate.length; }
        catch (e) { errors.push(`create failed: ${(e as any)?.message || e}`); }
      }
      if (toUpdate.length) {
        try { await base44.asServiceRole.entities.FccLicense.bulkUpdate(toUpdate); updated += toUpdate.length; }
        catch (e) { errors.push(`update failed: ${(e as any)?.message || e}`); }
      }
    } else {
      created += toCreate.length;
      updated += toUpdate.length;
    }
  }

  // Finalize the run row unconditionally (dry-run or not) -- only the actual
  // FccLicense writes above are skipped for a dry run, matching fcc-import.
  await base44.asServiceRole.entities.FccImportRun.update(run.id, {
    status: errors.length ? 'failed' : 'completed',
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - t0,
    records_scanned: records.length, records_created: created, records_updated: updated,
    malformed_records: malformed, skipped_records: skipped,
    error_count: errors.length, errors: errors.join('\n').slice(0, 5000),
  });

  return {
    radio_service: radioService, run_id: run.id, source_date: sourceDate,
    scanned: records.length, created, updated, malformed, skipped,
    errors: errors.slice(0, 10), error_count: errors.length,
  };
}

export default async function(req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);

  // A scheduled Workflow trigger (see base44/workflows/FCC Daily Update.jsonc)
  // has no browser session to forward, so base44.auth.me() resolves to null
  // here the same way it does for assignUserRepeaters's app_user_auth
  // trigger -- the workflow itself is the trusted caller in that case. An
  // admin manually clicking "Run Daily Update Now" DOES carry a session, and
  // must actually be an admin; anyone else with a session is rejected. Every
  // write this function makes comes from the FCC's own source data (never
  // from caller-supplied content), so an unauthenticated workflow trigger
  // writing FCC data is not a privilege-escalation risk the way it would be
  // for a function that trusted caller-supplied fields.
  const caller = await base44.auth.me().catch(() => null);
  if (caller) {
    const isAdmin = caller.role === 'admin' || caller.role === 'super_admin';
    if (!isAdmin) {
      const permError = await checkCallerPermission(base44, caller, 'callsigns.manage');
      if (permError) return permError;
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Without a session we can't tell the scheduled workflow from an
    // anonymous caller, so session-less calls get exactly what the schedule
    // does: today's file, deduped by source date. force / dry_run / a chosen
    // weekday are admin-only (an anonymous force:true could otherwise make
    // the importer redo provider downloads on demand).
    const dryRun = !!caller && body.dry_run === true;
    const force = !!caller && body.force === true;
    const weekday = caller && WEEKDAYS.includes(body.weekday) ? body.weekday : currentWeekday();
    const services: Array<'GMRS' | 'HAM'> = body.radio_service === 'GMRS' || body.radio_service === 'HAM'
      ? [body.radio_service] : ['GMRS', 'HAM'];

    const results = [];
    for (const service of services) {
      results.push(await runOne(base44, caller, service, weekday, dryRun, force));
    }

    const anyError = results.some((r: any) => r.error);
    if (!dryRun && !anyError) {
      await writeAudit(base44, {
        admin_id: caller?.id || '', admin_name: caller?.full_name || caller?.email || 'Scheduled FCC Daily Update',
        action: 'fcc_daily_update', category: 'callsigns',
        target_type: 'FccImportRun', target_label: `Daily update (${weekday})`,
        meta: { weekday, results: results.map((r: any) => ({ service: r.radio_service, created: r.created, updated: r.updated, skipped: r.skipped || false })) },
      });
    }

    return Response.json({ ok: true, weekday, dry_run: dryRun, results });
  } catch (error) {
    console.error('[fcc-daily-update] error:', (error as any)?.message || error);
    return Response.json({ error: (error as any)?.message || 'Daily update failed' }, { status: 500 });
  }
}
