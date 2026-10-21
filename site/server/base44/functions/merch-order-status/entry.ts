// Order summary for the "thanks for your order" page. The buyer may not be
// signed in, so it's looked up by the Stripe Checkout Session id from the
// success URL (long and unguessable). Returns no street address or email.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.session_id || '');
    if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = (await base44.asServiceRole.entities.MerchOrder.filter({ stripe_session_id: sessionId }, undefined, 1).catch(() => []))?.[0];
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });
    return Response.json({
      order: {
        order_number: order.order_number,
        status: order.status,
        items: (order.items || []).map((i: any) => ({ product_name: i.product_name, variant_label: i.variant_label, quantity: i.quantity, unit_price: i.unit_price, image_url: i.image_url })),
        subtotal: order.subtotal, discount: order.discount, shipping: order.shipping, tax: order.tax, total: order.total,
        ship_to: order.shipping_address ? [order.shipping_address.city, order.shipping_address.state, order.shipping_address.country].filter(Boolean).join(', ') : '',
        shipments: (order.shipments || []).map((s: any) => ({ carrier: s.carrier, tracking_number: s.tracking_number, tracking_url: s.tracking_url })),
        has_account: !!order.user_id,
      },
    });
  } catch (err: any) {
    console.error('merch-order-status error', err?.message || err);
    return Response.json({ error: 'Could not load the order' }, { status: 500 });
  }
}
