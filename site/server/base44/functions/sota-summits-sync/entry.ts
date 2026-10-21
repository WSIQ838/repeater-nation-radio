import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { parseSummitsList, upsertSummits } from '../../shared/sotaSummits.ts';

// Monthly automatic refresh of the SOTA summits directory -- OFF by default.
//
// The SOTA API terms require the SOTA team's approval before AI-written
// software connects to their infrastructure. Until an administrator has that
// approval in writing and sets the SOTA_SYNC_APPROVED secret to "yes", this
// function makes no network request at all; it only reports that the sync is
// disabled. Admins keep using the manual upload on /admin/sota meanwhile.
//
// Once approved it downloads the summits list at most once every 25 days
// (scheduled run, or an admin pressing "Run now"), with an identifying
// User-Agent, and upserts it in batches.
//   SOTA_SYNC_APPROVED  "yes" to enable (set only after SOTA approves)
//   SOTA_SUMMITS_URL    summits list URL (default below; confirm with SOTA)
//   SOTA_SYNC_PREFIXES  reference prefixes to import, comma-separated (default "W")
//
// Actions: status (admin) | run (admin, or the session-less monthly workflow).
const DEFAULT_URL = 'https://storage.sota.org.uk/summitslist.csv';
const UA = 'RepeaterNation/1.0 (+https://repeaternation.com; SOTA summits sync, monthly)';
const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const MIN_DAYS_BETWEEN = 25;
const BATCH = 400;
const PAUSE_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function config() {
  return {
    approved: String(secrets.get('SOTA_SYNC_APPROVED') || '').trim().toLowerCase() === 'yes',
    url: String(secrets.get('SOTA_SUMMITS_URL') || '').trim() || DEFAULT_URL,
    prefixes: String(secrets.get('SOTA_SYNC_PREFIXES') || 'W').split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean),
  };
}

export default async function(req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  const isAdmin = !!user && (ADMIN_ROLES.has(user.role) || ADMIN_ROLES.has(user._app_role));
  // Signed-in members can't trigger it; the monthly workflow runs without a session.
  if (user && !isAdmin) return Response.json({ error: 'Administrator authorization required' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const cfg = config();
  const runs = await base44.asServiceRole.entities.SotaSyncRun.list('-started_at', 10).catch(() => []);

  if (body.action === 'status') {
    if (!isAdmin) return Response.json({ error: 'Administrator authorization required' }, { status: 403 });
    return Response.json({ ok: true, approved: cfg.approved, url: cfg.url, prefixes: cfg.prefixes, runs });
  }

  if (!cfg.approved) {
    return Response.json({ ok: true, skipped: 'not_approved', message: 'Automatic SOTA sync is off until SOTA approves it and SOTA_SYNC_APPROVED is set to yes.' });
  }
  const last = (runs || []).find((r: any) => r.status === 'completed' && !r.dry_run);
  if (last && Date.now() - Date.parse(last.started_at) < MIN_DAYS_BETWEEN * 86_400_000) {
    return Response.json({ ok: true, skipped: 'recent', message: `Last sync was ${last.started_at.slice(0, 10)}; syncs run at most every ${MIN_DAYS_BETWEEN} days.` });
  }

  const dryRun = isAdmin && body.dryRun === true;
  const t0 = Date.now();
  const run = await base44.asServiceRole.entities.SotaSyncRun.create({
    started_at: new Date().toISOString(), status: 'running', trigger: user ? 'manual' : 'scheduled', source: cfg.url,
    prefixes: cfg.prefixes.join(','), dry_run: dryRun, triggered_by_name: user?.full_name || 'Monthly schedule',
  });
  try {
    const res = await fetch(cfg.url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Summits list HTTP ${res.status}`);
    const rows = parseSummitsList(await res.text(), cfg.prefixes);
    const totals = { added: 0, updated: 0, unchanged: 0 };
    for (let i = 0; i < rows.length; i += BATCH) {
      const r = await upsertSummits(base44, rows.slice(i, i + BATCH), dryRun);
      totals.added += r.added; totals.updated += r.updated; totals.unchanged += r.unchanged;
      if (i + BATCH < rows.length) await sleep(PAUSE_MS);
    }
    const done = {
      status: 'completed', completed_at: new Date().toISOString(), duration_ms: Date.now() - t0, summits_total: rows.length,
      summits_added: totals.added, summits_updated: totals.updated, summits_unchanged: totals.unchanged,
    };
    await base44.asServiceRole.entities.SotaSyncRun.update(run.id, done);
    return Response.json({ ok: true, dryRun, ...done });
  } catch (error) {
    console.error('[sota-summits-sync]', error?.message || error);
    await base44.asServiceRole.entities.SotaSyncRun.update(run.id, { status: 'failed', error: String(error?.message || error).slice(0, 500), completed_at: new Date().toISOString(), duration_ms: Date.now() - t0 }).catch(() => {});
    return Response.json({ error: 'SOTA summits sync failed' }, { status: 502 });
  }
}
