// Merch store logic shared by merch-checkout, merch-admin, printful-webhook
// and stripe-webhook: settings defaults, server-side cart pricing, order
// emails and the "paid" fulfillment step.
import { sendBrandedEmail } from './emailTemplates.ts';
import { postDiscordNotification } from './discordWebhook.ts';
import { printfulConfigured, submitOrderToPrintful } from './printful.ts';

export const SETTINGS_DEFAULTS = {
  enabled: false,
  store_name: 'Repeater Nation Merch',
  tagline: 'Gear for operators who keep the airwaves friendly.',
  contact_email: '',
  shipping_flat_rate: 5.99,
  shipping_additional_item: 2.5,
  free_shipping_over: 0,
  ship_countries: ['US'],
  collect_tax: false,
  member_discount_percent: 0,
  auto_submit: true,
  // What the Merch page shows. Display only: checkout charges the same either way.
  show_shipping_badge: true,
  show_member_badge: true,
  show_product_shipping: true,
  show_shipping_details: true,
  show_tax_note: true,
  returns_policy: 'Every item is printed to order just for you, so we can\'t take returns for size or change of mind. If your item arrives damaged or misprinted, email us within 30 days of delivery with a photo and we\'ll send a free replacement.',
};

export async function getMerchSettings(db: any) {
  const row = (await db.entities.MerchSettings.list('-updated_date', 1).catch(() => []))?.[0] || null;
  const merged: any = { ...SETTINGS_DEFAULTS, ...(row || {}) };
  if (!Array.isArray(merged.ship_countries) || !merged.ship_countries.length) merged.ship_countries = ['US'];
  return { row, settings: merged };
}

// Records what a shipping-rate refresh did on the settings row, for the admin page.
export async function saveRatesRefresh(db: any, r: any) {
  const parts = [r.updated ? `Updated ${r.updated} product${r.updated === 1 ? '' : 's'} (${r.changed} changed)` : 'No products updated'];
  if (r.failed) parts.push(`${r.failed} failed: ${r.errors.slice(0, 3).join('; ')}`);
  if (r.rate_limited) parts.push('Printful asked us to slow down; the rest go next run');
  else if (r.remaining) parts.push(`${r.remaining} left for the next run`);
  const summary = parts.join('. ').slice(0, 1000);
  const patch = { rates_refreshed_at: new Date().toISOString(), rates_refresh_summary: summary };
  const { row } = await getMerchSettings(db);
  if (row) await db.entities.MerchSettings.update(row.id, patch);
  else await db.entities.MerchSettings.create({ ...SETTINGS_DEFAULTS, ...patch });
  return summary;
}

// Stripe's standard US card fee, taken from every order.
export const STRIPE_FEE = { percent: 2.9, fixed: 0.3 };
// The lowest price that doesn't lose money on a one-item order: Printful's
// cost plus Stripe's fee on the item and its shipping (shipping itself is
// passed through at Printful's rate).
export function breakEvenPrice(cost: number, shipping: number) {
  const p = STRIPE_FEE.percent / 100;
  return Math.ceil(((Number(cost) + p * Number(shipping || 0) + STRIPE_FEE.fixed) / (1 - p)) * 100 - 1e-6) / 100;
}

export const cents = (n: number) => Math.round(Number(n || 0) * 100);
export const dollars = (c: number) => Math.round(c) / 100;
export const fmt = (n: number) => `$${Number(n || 0).toFixed(2)}`;

const isRate = (v: any) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;

// Shipping rates for one unit: the option's own (e.g. a 3XL) if set, else the
// product's (a hoodie ships for more than a sticker), else the store default.
export function shipRates(product: any, variant: any, settings: any) {
  const first = [variant?.ship_first, product?.ship_first, settings.shipping_flat_rate].find(isRate);
  const additional = [variant?.ship_additional, product?.ship_additional, settings.shipping_additional_item ?? SETTINGS_DEFAULTS.shipping_additional_item].find(isRate);
  return { firstCents: cents(first ?? 0), additionalCents: cents(additional ?? 0) };
}

// Printful's rule: the highest first-item rate in the order is charged once;
// every other unit adds its own additional-item rate.
export function shippingCentsFor(units: { firstCents: number; additionalCents: number; quantity: number }[]) {
  const all = units.filter((u) => u.quantity > 0);
  if (!all.length) return 0;
  const base = all.reduce((best, u) => (u.firstCents > best.firstCents ? u : best), all[0]);
  const extras = all.reduce((t, u) => t + u.additionalCents * u.quantity, 0) - base.additionalCents;
  return base.firstCents + extras;
}

export function memberDiscountFor(user: any, settings: any): number {
  const pct = Number(settings.member_discount_percent || 0);
  if (!user || user.callsign_verified !== true || !(pct > 0)) return 0;
  return Math.min(50, pct);
}

// Prices a cart from the database. Anything the browser sends besides ids
// and quantities is ignored.
export function priceCart(requested: any[], products: any[], discountPct: number, settings: any) {
  const byId = new Map(products.map((p) => [String(p.id), p]));
  const lines: any[] = [];
  for (const r of requested) {
    const p: any = byId.get(String(r.product_id));
    if (!p || p.active !== true) throw new Error('One of the items in your cart is no longer available.');
    const v = (p.variants || []).find((x: any) => x.key === r.variant_key);
    if (!v || v.available === false || !(Number(v.price) > 0)) throw new Error(`${p.name}${v ? ` (${v.label})` : ''} is no longer available.`);
    if (p.source === 'printful' && !v.printful_sync_variant_id) throw new Error(`${p.name} isn't connected to Printful yet.`);
    const listCents = cents(v.price);
    const unitCents = Math.round(listCents * (100 - discountPct) / 100);
    lines.push({
      product_id: String(p.id), product_name: p.name, variant_key: v.key, variant_label: v.label || '',
      quantity: r.quantity, unit_price: dollars(unitCents), list_price: dollars(listCents),
      image_url: v.image_url || p.image_url || '', source: p.source === 'printful' ? 'printful' : 'manual',
      ...(v.printful_sync_variant_id ? { printful_sync_variant_id: v.printful_sync_variant_id } : {}),
      _unitCents: unitCents, _listCents: listCents, _ship: shipRates(p, v, settings),
    });
  }
  const subtotalCents = lines.reduce((t, l) => t + l._listCents * l.quantity, 0);
  const afterDiscountCents = lines.reduce((t, l) => t + l._unitCents * l.quantity, 0);
  const freeOver = cents(settings.free_shipping_over || 0);
  const shippingCents = freeOver > 0 && afterDiscountCents >= freeOver
    ? 0
    : shippingCentsFor(lines.map((l) => ({ ...l._ship, quantity: l.quantity })));
  return {
    lines: lines.map(({ _unitCents, _listCents, _ship, ...l }) => l),
    unitCents: lines.map((l) => l._unitCents),
    subtotal: dollars(subtotalCents),
    discount: dollars(subtotalCents - afterDiscountCents),
    shipping: dollars(shippingCents),
    shippingCents,
  };
}

export function orderNumber(id: string): string {
  return `RN-${String(id || '').slice(-6).toUpperCase()}`;
}

function itemLines(order: any): string {
  return (order.items || []).map((i: any) => `• ${i.quantity} × ${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ''} — ${fmt(i.unit_price * i.quantity)}`).join('\n');
}

function addressLines(a: any = {}): string {
  return [a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country].filter(Boolean).join('\n');
}

export async function sendOrderConfirmation(db: any, order: any, settings: any, appUrl = '') {
  if (!order.email) return { sent: false };
  const lines = [
    `Hi ${order.name || 'there'},`,
    `Thanks for your order! We've received your payment for order ${order.order_number}.`,
    itemLines(order),
    [`Subtotal: ${fmt(order.subtotal)}`, order.discount ? `Member discount: −${fmt(order.discount)}` : '', `Shipping: ${fmt(order.shipping)}`, order.tax ? `Tax: ${fmt(order.tax)}` : '', `Total paid: ${fmt(order.total)}`].filter(Boolean).join('\n'),
    `Shipping to:\n${addressLines(order.shipping_address)}`,
    order.has_printful_items ? 'Your items are printed to order, which usually takes 2–7 business days before they ship. We\'ll email you tracking as soon as they\'re on the way.' : 'We\'ll email you tracking as soon as your order ships.',
    appUrl && order.user_id ? `You can check your order any time at ${appUrl}/merch/orders` : '',
    settings.contact_email ? `Questions? Reply to ${settings.contact_email}.` : '',
    '73,\nRepeater Nation',
  ].filter(Boolean);
  const res = await sendBrandedEmail(db, { to: order.email, subject: `Your Repeater Nation order ${order.order_number}`, body: lines.join('\n\n') });
  if (res.sent) await db.entities.MerchOrder.update(order.id, { confirmation_email_sent: true }).catch(() => {});
  return res;
}

export async function sendShippedEmail(db: any, order: any, shipments: any[], settings: any) {
  if (!order.email || !shipments.length) return { sent: false };
  const track = shipments.map((s) => `• ${[s.carrier, s.service].filter(Boolean).join(' ')}${s.tracking_number ? ` — ${s.tracking_number}` : ''}${s.tracking_url ? `\n  ${s.tracking_url}` : ''}`).join('\n');
  const lines = [
    `Hi ${order.name || 'there'},`,
    `Good news: your Repeater Nation order ${order.order_number} is on its way.`,
    `Tracking:\n${track}`,
    settings.contact_email ? `Questions? Reply to ${settings.contact_email}.` : '',
    '73,\nRepeater Nation',
  ].filter(Boolean);
  const res = await sendBrandedEmail(db, { to: order.email, subject: `Your order ${order.order_number} has shipped`, body: lines.join('\n\n') });
  if (res.sent) await db.entities.MerchOrder.update(order.id, { shipped_email_sent: true }).catch(() => {});
  return res;
}

function sessionShipping(session: any) {
  const sd = session?.collected_information?.shipping_details || session?.shipping_details || session?.shipping || null;
  const a = sd?.address || session?.customer_details?.address || {};
  return {
    name: String(sd?.name || session?.customer_details?.name || ''),
    line1: String(a.line1 || ''),
    line2: String(a.line2 || ''),
    city: String(a.city || ''),
    state: String(a.state || ''),
    postal_code: String(a.postal_code || ''),
    country: String(a.country || ''),
  };
}

// Called by stripe-webhook once a merch Checkout Session is paid. Records
// the payment details, emails the buyer, tells the team, and sends Printful
// items off for printing. Idempotent: a re-delivered event finds the order
// already past pending_payment and stops.
export async function fulfillPaidMerchOrder(base44: any, db: any, session: any, appUrl = '') {
  const meta = session?.metadata || {};
  let order = meta.merch_order_id ? (await db.entities.MerchOrder.filter({ id: meta.merch_order_id }).catch(() => []))?.[0] : null;
  if (!order) order = (await db.entities.MerchOrder.filter({ stripe_session_id: session.id }).catch(() => []))?.[0];
  if (!order) {
    console.error('merch: paid session has no matching order', session?.id);
    return { ok: false, reason: 'no_order' };
  }
  if (!['pending_payment', 'abandoned'].includes(order.status)) return { ok: true, duplicate: true };

  const td = session.total_details || {};
  const update = {
    status: 'paid',
    paid_at: new Date().toISOString(),
    email: String(session.customer_details?.email || order.email || ''),
    name: String(session.customer_details?.name || order.name || ''),
    phone: String(session.customer_details?.phone || ''),
    shipping_address: sessionShipping(session),
    shipping: dollars(Number(td.amount_shipping ?? cents(order.shipping))),
    tax: dollars(Number(td.amount_tax || 0)),
    total: dollars(Number(session.amount_total ?? cents(order.total))),
    stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : String(session.payment_intent?.id || ''),
  };
  await db.entities.MerchOrder.update(order.id, update);
  order = { ...order, ...update };

  const { settings } = await getMerchSettings(db);
  await sendOrderConfirmation(db, order, settings, appUrl).catch((e) => console.error('merch: confirmation email failed', e?.message || e));

  const summary = (order.items || []).map((i: any) => `${i.quantity}× ${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ''}`).join(', ');
  await postDiscordNotification(base44, 'payment', 'merch_order', {
    buyer_name: order.name || 'A customer', order_number: order.order_number, amount: fmt(order.total), items: summary,
  }, {
    fields: [
      { name: 'Order', value: order.order_number || '—', inline: true },
      { name: 'Total', value: fmt(order.total), inline: true },
      { name: 'Items', value: summary.slice(0, 1000) || '—' },
    ],
  }).catch(() => {});
  if (settings.contact_email) {
    await sendBrandedEmail(db, {
      to: settings.contact_email,
      subject: `New merch order ${order.order_number} — ${fmt(order.total)}`,
      body: [`${order.name || 'Someone'} (${order.email || 'no email'}) placed order ${order.order_number}.`, itemLines(order), `Total: ${fmt(order.total)}`,
        order.has_manual_items ? 'This order has items you ship yourself. Mark them shipped in Admin → Merch once they\'re sent.' : '',
        `Shipping to:\n${addressLines(order.shipping_address)}`].filter(Boolean).join('\n\n'),
    }).catch(() => {});
  }

  if (order.has_printful_items) {
    if (printfulConfigured()) {
      order = await submitOrderToPrintful(db, order, settings);
    } else {
      await db.entities.MerchOrder.update(order.id, { status: 'needs_attention', error: 'Printful isn\'t connected, so this order wasn\'t sent for printing. Add the PRINTFUL_API_KEY secret, then press "Send to Printful".' });
    }
  }
  return { ok: true, order_id: order.id };
}
