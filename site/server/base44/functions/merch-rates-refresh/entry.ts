// Keeps Merch shipping in step with Printful. The "Merch Shipping Rates"
// workflow calls this every 6 hours; each Printful product on automatic rates
// is re-quoted once it is 20 hours old, so every product updates about once a
// day and a run cut short by the time or quote budget finishes on the next.
// Products whose rates an admin typed in (ship_auto off) are never touched.
//
// Callers: the session-less workflow, or an administrator (who refreshes every
// product right away). Signed-in non-admins are refused. A session-less call
// can only do work that is already due, so calling it more often than the
// schedule costs one database read.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { printfulConfigured, refreshShippingRates, tokenScopes, canEditProducts, pushPendingPrices } from '../../shared/printful.ts';
import { saveRatesRefresh } from '../../shared/merch.ts';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const STALE_HOURS = 20;

// Price changes that didn't reach Printful when they were saved (time budget
// or a Printful hiccup) are retried here.
async function retryPricePushes(db: any) {
  const pending = ((await db.entities.MerchProduct.filter({ source: 'printful' }, 'sort_order', 500)) || [])
    .filter((p: any) => (p.variants || []).some((v: any) => v.pf_price_pending));
  if (!pending.length) return null;
  try {
    if (!canEditProducts(await tokenScopes())) return { skipped: 'read_only' };
    let pushed = 0;
    for (const p of pending.slice(0, 5)) pushed += (await pushPendingPrices(db, p.id, { deadlineMs: 8_000 })).pushed;
    return { pushed };
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const isAdmin = !!user && (ADMIN_ROLES.has(user.role) || ADMIN_ROLES.has(user._app_role));
    if (user && !isAdmin) return Response.json({ error: 'Administrator authorization required' }, { status: 403 });
    if (!printfulConfigured()) return Response.json({ ok: true, skipped: 'Printful is not connected (PRINTFUL_API_KEY missing)' });

    const db = base44.asServiceRole;
    const staleBefore = isAdmin ? new Date().toISOString() : new Date(Date.now() - STALE_HOURS * 3600_000).toISOString();
    const result = await refreshShippingRates(db, { staleBefore });
    const prices = await retryPricePushes(db);
    if (!result.due) return Response.json({ ok: true, skipped: 'All shipping rates are up to date', ...result, prices });
    const summary = await saveRatesRefresh(db, result);
    return Response.json({ ok: true, summary, ...result, prices });
  } catch (err: any) {
    console.error('merch-rates-refresh error', err?.message || err);
    return Response.json({ error: err?.message || 'unexpected error' }, { status: 500 });
  }
}
