// Printful calls this when an order ships, fails, is held or canceled. The
// URL merch-admin registers carries ?token=<derived from the API key>; the
// payload itself is only used to find which order changed, which is then
// re-read from Printful's API. Buyers get a tracking email the first time a
// new tracking number shows up.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { printfulConfigured, refreshOrderFromPrintful, sameToken, webhookToken } from '../../shared/printful.ts';
import { getMerchSettings, sendShippedEmail } from '../../shared/merch.ts';

export default async function(req: Request): Promise<Response> {
  try {
    if (!printfulConfigured()) return Response.json({ error: 'Not configured' }, { status: 503 });
    const token = new URL(req.url).searchParams.get('token') || '';
    if (!sameToken(token, await webhookToken())) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const event = await req.json().catch(() => ({}));
    const pfOrder = event?.data?.order || {};
    const db = createClientFromRequest(req).asServiceRole;
    const externalId = String(pfOrder.external_id || '');
    let order = externalId ? (await db.entities.MerchOrder.filter({ id: externalId }).catch(() => []))?.[0] : null;
    if (!order && pfOrder.id) order = (await db.entities.MerchOrder.filter({ printful_order_id: Number(pfOrder.id) }).catch(() => []))?.[0];
    if (!order) {
      // Not one of ours (or a test from Printful's webhook simulator). 200 so
      // Printful doesn't keep retrying.
      console.log('printful-webhook: no matching order', event?.type, externalId || pfOrder.id);
      return Response.json({ ok: true, matched: false });
    }

    const { order: fresh, newShipments } = await refreshOrderFromPrintful(db, order);
    if (newShipments.length) {
      const { settings } = await getMerchSettings(db);
      await sendShippedEmail(db, fresh, newShipments, settings).catch((e) => console.error('printful-webhook: shipped email failed', e?.message || e));
    }
    if (event?.type === 'order_failed' || event?.type === 'order_put_hold') {
      const reason = String(event?.data?.reason || pfOrder?.notes || '').slice(0, 300);
      await db.entities.MerchOrder.update(order.id, { error: `Printful: ${event.type.replace('order_', '').replace('_', ' ')}${reason ? ` — ${reason}` : ''}` }).catch(() => {});
    }
    return Response.json({ ok: true, matched: true, status: fresh.status });
  } catch (err: any) {
    console.error('printful-webhook error', err?.message || err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
