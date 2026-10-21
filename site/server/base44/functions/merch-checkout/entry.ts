// Starts a Stripe Checkout for a merch cart. Prices, discounts and shipping
// are worked out here from MerchProduct / MerchSettings; the browser only
// sends product ids, variant keys and quantities. A pending MerchOrder is
// saved first and its id rides along in the session metadata, so
// stripe-webhook can mark exactly that order paid.
//
// Signing in is optional. While the store is switched off, only admins can
// check out (to place test orders).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { stripeFetch, toForm, appUrlFromReq } from '../../shared/stripe.ts';
import { getMerchSettings, memberDiscountFor, priceCart, orderNumber } from '../../shared/merch.ts';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

// Each checkout makes an order row and a Stripe session, so cap how often one
// address can start one (per function instance; good enough to stop a loop).
const recent = new Map<string, number[]>();
function throttled(key: string, limit = 10, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) { recent.set(key, hits); return true; }
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5000) recent.clear();
  return false;
}

export default async function(req: Request): Promise<Response> {
  try {
    if (!secrets.get('STRIPE_SECRET_KEY')) return Response.json({ error: 'Checkout is not set up yet.' }, { status: 400 });
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    let user: any = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    const isAdmin = !!user && (ADMIN_ROLES.has(user.role) || ADMIN_ROLES.has(user._app_role));

    const { settings } = await getMerchSettings(db);
    if (!settings.enabled && !isAdmin) return Response.json({ error: 'Merch isn\'t open yet.' }, { status: 403 });

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    if (throttled(user?.id || ip || 'anon')) return Response.json({ error: 'Too many checkout attempts. Please wait a few minutes.' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const raw = Array.isArray(body.items) ? body.items : [];
    if (!raw.length) return Response.json({ error: 'Your cart is empty.' }, { status: 400 });
    if (raw.length > 20) return Response.json({ error: 'That cart has too many different items (20 max).' }, { status: 400 });
    const merged = new Map<string, any>();
    for (const r of raw) {
      const product_id = String(r?.product_id || '').slice(0, 64);
      const variant_key = String(r?.variant_key || '').slice(0, 64);
      const qty = Math.floor(Number(r?.quantity));
      if (!product_id || !variant_key || !(qty >= 1)) return Response.json({ error: 'Your cart has an invalid item. Remove it and try again.' }, { status: 400 });
      const k = `${product_id}|${variant_key}`;
      const prev = merged.get(k);
      merged.set(k, { product_id, variant_key, quantity: Math.min(10, (prev?.quantity || 0) + qty) });
    }
    const requested = [...merged.values()];

    const ids = [...new Set(requested.map((r) => r.product_id))];
    const products = await db.entities.MerchProduct.filter({ id: { $in: ids } }, undefined, 50);
    const discountPct = memberDiscountFor(user, settings);
    let priced: any;
    try { priced = priceCart(requested, products || [], discountPct, settings); }
    catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }

    const base = appUrlFromReq(req);
    if (!base) return Response.json({ error: 'App URL not configured' }, { status: 500 });

    const lines = priced.lines;
    const order = await db.entities.MerchOrder.create({
      user_id: user?.id || '',
      email: user?.email || '',
      name: user?.full_name || '',
      items: lines.map(({ list_price, ...l }: any) => l),
      subtotal: priced.subtotal,
      discount: priced.discount,
      shipping: priced.shipping,
      tax: 0,
      total: Math.round((priced.subtotal - priced.discount + priced.shipping) * 100) / 100,
      currency: 'USD',
      member_discount_percent: discountPct,
      status: 'pending_payment',
      has_manual_items: lines.some((l: any) => l.source === 'manual'),
      has_printful_items: lines.some((l: any) => l.source === 'printful'),
    });
    const number = orderNumber(order.id);

    const form: any = {
      mode: 'payment',
      success_url: `${base}/merch/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/merch?canceled=1`,
      client_reference_id: order.id,
      'phone_number_collection[enabled]': 'true',
      'shipping_options[0][shipping_rate_data][type]': 'fixed_amount',
      'shipping_options[0][shipping_rate_data][fixed_amount][amount]': String(priced.shippingCents),
      'shipping_options[0][shipping_rate_data][fixed_amount][currency]': 'usd',
      'shipping_options[0][shipping_rate_data][display_name]': priced.shippingCents === 0 ? 'Free shipping' : 'Standard shipping',
      ...(user?.email ? { customer_email: user.email } : {}),
      ...(settings.collect_tax ? { 'automatic_tax[enabled]': 'true' } : {}),
    };
    settings.ship_countries.slice(0, 50).forEach((c: string, i: number) => {
      form[`shipping_address_collection[allowed_countries][${i}]`] = String(c).toUpperCase().slice(0, 2);
    });
    lines.forEach((l: any, i: number) => {
      form[`line_items[${i}][quantity]`] = String(l.quantity);
      form[`line_items[${i}][price_data][currency]`] = 'usd';
      form[`line_items[${i}][price_data][unit_amount]`] = String(priced.unitCents[i]);
      form[`line_items[${i}][price_data][product_data][name]`] = `${l.product_name}${l.variant_label ? ` — ${l.variant_label}` : ''}`.slice(0, 250);
      if (discountPct) form[`line_items[${i}][price_data][product_data][description]`] = `Member price (${discountPct}% off)`;
      if (/^https:\/\//.test(l.image_url)) form[`line_items[${i}][price_data][product_data][images][0]`] = l.image_url;
      if (settings.collect_tax) form[`line_items[${i}][price_data][tax_behavior]`] = 'exclusive';
    });
    const metadata: Record<string, string> = { type: 'merch', merch_order_id: order.id, order_number: number, app_user_id: user?.id || '' };
    for (const [k, v] of Object.entries(metadata)) {
      form[`metadata[${k}]`] = v;
      form[`payment_intent_data[metadata][${k}]`] = v;
    }

    let session: any;
    try {
      session = await stripeFetch('/v1/checkout/sessions', { method: 'POST', body: toForm(form) });
    } catch (e: any) {
      await db.entities.MerchOrder.update(order.id, { status: 'abandoned', error: `Stripe: ${String(e?.message || e).slice(0, 300)}` }).catch(() => {});
      console.error('merch-checkout: stripe error', e?.message || e);
      const msg = /tax/i.test(String(e?.message)) ? 'Checkout is misconfigured (sales tax). Please try again later.' : 'Could not start checkout. Please try again.';
      return Response.json({ error: msg }, { status: 502 });
    }
    await db.entities.MerchOrder.update(order.id, { stripe_session_id: session.id, order_number: number });
    return Response.json({ url: session.url, order_number: number });
  } catch (err: any) {
    console.error('merch-checkout error', err?.message || err);
    return Response.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
