import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { upsertSummits } from '../../shared/sotaSummits.ts';

// Admin-only import of the SOTA summits list. An administrator downloads
// summitslist.csv from the SOTA website themselves and uploads it on the
// SOTA admin page; the browser parses it and sends rows here in batches.
// This function never contacts SOTA's servers (the SOTA API terms require
// approval before AI-written software connects to their infrastructure --
// see sota-summits-sync for the approval-gated automatic version).
const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const MAX_ROWS = 500;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (!ADMIN_ROLES.has(user.role) && !ADMIN_ROLES.has(user._app_role)) {
      return Response.json({ error: 'Administrator authorization required' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, MAX_ROWS);
    const dryRun = body.dryRun === true;
    const result = await upsertSummits(base44, rows, dryRun);
    return Response.json({ ok: true, dryRun, ...result });
  } catch (error) {
    console.error('[sota-summit-import] error:', error?.message || error);
    return Response.json({ error: 'Import batch failed' }, { status: 500 });
  }
}
