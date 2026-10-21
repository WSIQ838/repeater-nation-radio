// Printful API (v1) helpers for the merch store. Auth is a private token from
// developers.printful.com, created for the store's "Manual order platform /
// API" store and saved as the PRINTFUL_API_KEY secret. A store-level token
// needs no X-PF-Store-Id header.
import { secrets } from 'base44:runtime';

const API = 'https://api.printful.com';

export function printfulConfigured(): boolean {
  return !!secrets.get('PRINTFUL_API_KEY');
}

export async function printfulFetch(path: string, init: { method?: string; body?: any } = {}): Promise<any> {
  const key = secrets.get('PRINTFUL_API_KEY');
  if (!key) throw new Error('Printful is not connected yet (PRINTFUL_API_KEY secret missing)');
  const res = await fetch(`${API}${path}`, {
    method: init.method || 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { result: text }; }
  if (!res.ok) {
    const msg = data?.error?.message || (typeof data?.result === 'string' ? data.result : '') || `Printful API ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Printful webhooks aren't signed, so the URL we register carries a token
// derived from the API key. The handler also re-reads the order from Printful
// instead of trusting the payload, so a forged call can at most trigger a
// refresh with Printful's real data.
export async function webhookToken(): Promise<string> {
  const key = secrets.get('PRINTFUL_API_KEY') || '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${key}:rn-printful-webhook`));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export function sameToken(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const WEBHOOK_TYPES = [
  'package_shipped', 'package_returned', 'order_failed', 'order_canceled',
  'order_put_hold', 'order_put_hold_approval', 'order_remove_hold', 'order_updated',
];

// Printful order status -> our MerchOrder status.
export function mapPrintfulStatus(s: string, current = ''): string {
  switch (String(s || '').toLowerCase()) {
    case 'draft': case 'pending': return 'submitted';
    case 'inprocess': return 'in_production';
    case 'onhold': return 'on_hold';
    case 'partial': return 'partially_shipped';
    case 'fulfilled': return 'shipped';
    case 'failed': return 'needs_attention';
    case 'canceled': return current === 'refunded' ? 'refunded' : 'canceled';
    default: return current || 'submitted';
  }
}

export function shipmentsFrom(pfOrder: any): any[] {
  return (pfOrder?.shipments || []).map((s: any) => ({
    carrier: String(s.carrier || ''),
    service: String(s.service || ''),
    tracking_number: String(s.tracking_number || ''),
    tracking_url: String(s.tracking_url || ''),
    shipped_at: s.shipped_at ? String(s.shipped_at) : (s.ship_date ? String(s.ship_date) : ''),
  }));
}

const money = (n: any) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

export function buildPrintfulOrder(order: any, settings: any = {}) {
  const a = order.shipping_address || {};
  const items = (order.items || []).filter((i: any) => i.source === 'printful' && i.printful_sync_variant_id);
  return {
    external_id: order.id,
    shipping: 'STANDARD',
    recipient: {
      name: a.name || order.name || '',
      address1: a.line1 || '',
      ...(a.line2 ? { address2: a.line2 } : {}),
      city: a.city || '',
      ...(a.state ? { state_code: a.state } : {}),
      country_code: a.country || 'US',
      zip: a.postal_code || '',
      ...(order.phone ? { phone: order.phone } : {}),
      ...(order.email ? { email: order.email } : {}),
    },
    items: items.map((i: any) => ({
      sync_variant_id: i.printful_sync_variant_id,
      quantity: i.quantity,
      retail_price: money(i.unit_price),
      name: `${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ''}`,
    })),
    retail_costs: {
      currency: 'USD',
      subtotal: money(order.subtotal),
      discount: money(order.discount),
      shipping: money(order.shipping),
      tax: money(order.tax),
      total: money(order.total),
    },
    packing_slip: {
      store_name: settings.store_name || 'Repeater Nation',
      ...(settings.contact_email ? { email: settings.contact_email } : {}),
      message: 'Thanks for supporting Repeater Nation. 73!',
      custom_order_id: order.order_number || order.id,
    },
  };
}

// Sends a paid order to Printful. confirm=true goes straight to printing;
// false leaves it as a draft in Printful for an admin to confirm there.
// Safe to call twice: an order Printful already has is read back instead.
export async function submitOrderToPrintful(db: any, order: any, settings: any = {}): Promise<any> {
  const confirm = settings.auto_submit !== false;
  let pf: any;
  try {
    const res = await printfulFetch(`/orders?confirm=${confirm ? 'true' : 'false'}`, { method: 'POST', body: buildPrintfulOrder(order, settings) });
    pf = res?.result;
  } catch (e: any) {
    if (/external.?id/i.test(String(e?.message || ''))) {
      pf = (await printfulFetch(`/orders/@${order.id}`))?.result;
    } else {
      const update = { status: 'needs_attention', error: `Printful: ${String(e?.message || e).slice(0, 400)}` };
      await db.entities.MerchOrder.update(order.id, update);
      return { ...order, ...update };
    }
  }
  const update = {
    printful_order_id: pf?.id,
    printful_status: String(pf?.status || ''),
    status: mapPrintfulStatus(pf?.status, 'submitted'),
    submitted_at: new Date().toISOString(),
    error: '',
  };
  await db.entities.MerchOrder.update(order.id, update);
  return { ...order, ...update };
}

// Re-reads an order from Printful and copies status + tracking onto ours.
// newShipments are tracking numbers we hadn't recorded before (for the
// "your order shipped" email).
export async function refreshOrderFromPrintful(db: any, order: any): Promise<{ order: any; newShipments: any[] }> {
  const ref = order.printful_order_id ? String(order.printful_order_id) : `@${order.id}`;
  const pf = (await printfulFetch(`/orders/${ref}`))?.result || {};
  const shipments = shipmentsFrom(pf);
  const manualShipments = (order.shipments || []).filter((s: any) => s.note === 'manual');
  const status = mapPrintfulStatus(pf.status, order.status);
  const update: any = {
    printful_order_id: pf.id || order.printful_order_id,
    printful_status: String(pf.status || ''),
    status,
    shipments: [...shipments, ...manualShipments],
    error: status === 'needs_attention' ? (order.error || 'Printful reported a problem with this order. Check it in Printful.') : '',
  };
  const known = new Set((order.shipments || []).map((s: any) => s.tracking_number).filter(Boolean));
  const newShipments = shipments.filter((s: any) => s.tracking_number && !known.has(s.tracking_number));
  if (shipments.length && !order.shipped_at) update.shipped_at = new Date().toISOString();
  await db.entities.MerchOrder.update(order.id, update);
  return { order: { ...order, ...update }, newShipments };
}

// Printful's standard US shipping for one catalog variant: the first-item rate
// (1 unit) and the additional-item rate (2 units minus 1). Used to fill in a
// product's shipping. Rates abroad are higher.
// A US address for quotes and cost estimates (nothing is ordered).
const QUOTE_ADDRESS = { name: 'Price check', address1: '100 Congress Ave', city: 'Austin', state_code: 'TX', country_code: 'US', zip: '78701' };

export async function usShippingRates(variantId: number) {
  const quote = async (quantity: number) => {
    const res = await printfulFetch('/shipping/rates', {
      method: 'POST',
      body: { recipient: { country_code: 'US', state_code: 'TX', zip: '78701' }, items: [{ variant_id: String(variantId), quantity }], currency: 'USD' },
    });
    const rates = res?.result || [];
    const standard = rates.find((r: any) => String(r.id).toUpperCase() === 'STANDARD') || rates[0];
    if (!standard) throw new Error('Printful returned no shipping rates');
    return Number(standard.rate);
  };
  const one = await quote(1);
  const two = await quote(2);
  return { first: Math.round(one * 100) / 100, additional: Math.max(0, Math.round((two - one) * 100) / 100) };
}

type Rates = { first: number; additional: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sizeOf = (v: any) => v.size || v.label || 'One size';

// Printful's US rates for each size of a product (bigger sizes and heavier
// items can cost more). The most common rate becomes the product's; sizes that
// differ get their own. `cache` holds quotes by catalog variant so products on
// the same blank cost one lookup; `pause` runs before each new lookup.
export async function ratesBySize(product: any, cache = new Map<number, Rates>(), pause: () => Promise<void> = async () => {}) {
  const bySize = new Map<string, any>();
  for (const v of product.variants || []) {
    if (!bySize.has(sizeOf(v)) && v.printful_variant_id) bySize.set(sizeOf(v), v);
  }
  const sizes: Record<string, Rates> = {};
  for (const [size, v] of [...bySize.entries()].slice(0, 12)) {
    const id = Number(v.printful_variant_id);
    if (!cache.has(id)) {
      await pause();
      cache.set(id, await usShippingRates(id));
    }
    sizes[size] = cache.get(id)!;
  }
  const values = Object.values(sizes);
  if (!values.length) return null;
  const tally = new Map<string, number>();
  for (const r of values) tally.set(`${r.first}|${r.additional}`, (tally.get(`${r.first}|${r.additional}`) || 0) + 1);
  const [first, additional] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0].split('|').map(Number);
  return { product: { first, additional }, sizes };
}

// Lookups a product still needs (two quotes per uncached size).
function quotesNeeded(product: any, cache: Map<number, Rates>) {
  const ids = new Set<number>();
  const seen = new Set<string>();
  for (const v of product.variants || []) {
    if (seen.has(sizeOf(v)) || !v.printful_variant_id) continue;
    seen.add(sizeOf(v));
    if (seen.size <= 12 && !cache.has(Number(v.printful_variant_id))) ids.add(Number(v.printful_variant_id));
  }
  return ids.size * 2;
}

// Puts Printful's current US shipping on every Printful product that's on
// automatic rates (ship_auto) and was last updated before `staleBefore`,
// stalest first. Products with rates an admin typed in are left alone. Stops
// early at the quote or time budget, or if Printful rate-limits us; whatever
// is left goes first on the next run.
export async function refreshShippingRates(db: any, opts: { staleBefore?: string; maxQuotes?: number; deadlineMs?: number; delayMs?: number } = {}) {
  const { staleBefore = new Date().toISOString(), maxQuotes = 80, deadlineMs = 45_000, delayMs = 1000 } = opts;
  const started = Date.now();
  const products = await db.entities.MerchProduct.filter({ source: 'printful' }, 'sort_order', 500);
  const due = (products || [])
    .filter((p: any) => !p.printful_missing && p.ship_auto !== false && String(p.ship_rates_updated_at || '') < staleBefore)
    .sort((a: any, b: any) => String(a.ship_rates_updated_at || '').localeCompare(String(b.ship_rates_updated_at || '')));
  const cache = new Map<number, Rates>();
  let lookups = 0;
  const pause = async () => { if (lookups++ && delayMs) await sleep(delayMs); };
  const result = { due: due.length, updated: 0, changed: 0, failed: 0, remaining: 0, quotes: 0, rate_limited: false, errors: [] as string[] };
  for (let i = 0; i < due.length; i++) {
    const p = due[i];
    const need = quotesNeeded(p, cache);
    if (result.updated + result.failed > 0 && (result.quotes + need > maxQuotes || Date.now() - started > deadlineMs)) {
      result.remaining = due.length - i;
      break;
    }
    let rates: any = null;
    try {
      rates = await ratesBySize(p, cache, pause);
    } catch (e: any) {
      result.quotes += need;
      if (e?.status === 429) { result.rate_limited = true; result.remaining = due.length - i; break; }
      result.failed++;
      result.errors.push(`${p.name}: ${e?.message || e}`.slice(0, 200));
      continue;
    }
    result.quotes += need;
    if (!rates) { result.failed++; result.errors.push(`${p.name}: no Printful variants to price`); continue; }
    const { first, additional } = rates.product;
    const variants = (p.variants || []).map((v: any) => {
      const r = rates.sizes[sizeOf(v)];
      const own = r && (r.first !== first || r.additional !== additional);
      return { ...v, ship_first: own ? r.first : null, ship_additional: own ? r.additional : null };
    });
    const changed = p.ship_first !== first || p.ship_additional !== additional
      || variants.some((v: any, j: number) => (p.variants[j]?.ship_first ?? null) !== v.ship_first || (p.variants[j]?.ship_additional ?? null) !== v.ship_additional);
    await db.entities.MerchProduct.update(p.id, { ship_first: first, ship_additional: additional, variants, ship_auto: true, ship_rates_updated_at: new Date().toISOString() });
    result.updated++;
    if (changed) result.changed++;
  }
  return result;
}

// The token's permissions, e.g. ['orders', 'sync_products/read', 'webhooks'].
// 'sync_products' (without /read) lets us change prices on Printful too.
export async function tokenScopes(): Promise<string[]> {
  const res = await printfulFetch('/oauth/scopes');
  return (res?.result?.scopes || []).map((s: any) => String(s?.scope ?? s));
}
export const canEditProducts = (scopes: string[]) => scopes.includes('sync_products');

// What Printful charges you to make one of each size of a product (item and
// print, before shipping and tax), from Printful's own order estimate. Nothing
// is ordered.
export async function costsBySize(product: any, pause: () => Promise<void> = async () => {}) {
  const bySize = new Map<string, any>();
  for (const v of product.variants || []) {
    if (!bySize.has(sizeOf(v)) && v.printful_sync_variant_id) bySize.set(sizeOf(v), v);
  }
  const sizes: Record<string, number> = {};
  for (const [size, v] of [...bySize.entries()].slice(0, 12)) {
    await pause();
    const res = await printfulFetch('/orders/estimate-costs', {
      method: 'POST',
      body: { recipient: QUOTE_ADDRESS, items: [{ sync_variant_id: Number(v.printful_sync_variant_id), quantity: 1 }] },
    });
    const c = res?.result?.costs || {};
    if (c.currency && String(c.currency).toUpperCase() !== 'USD') throw new Error(`Printful quoted in ${c.currency}. Set your Printful store currency to USD.`);
    const cost = Number(c.subtotal || 0) - Number(c.discount || 0) + Number(c.additional_fee || 0) + Number(c.fulfillment_fee || 0);
    if (!(cost > 0)) throw new Error('Printful returned no cost for this product');
    sizes[size] = Math.round(cost * 100) / 100;
  }
  return sizes;
}

// Copies our prices to Printful's own listing for the variants whose price
// changed here (pf_price_pending). Stops at the time budget or a 429 and
// leaves the rest pending for the next call. Needs the sync_products permission.
export async function pushPendingPrices(db: any, productId: string, { deadlineMs = 20_000, delayMs = 250 } = {}) {
  const started = Date.now();
  const product = (await db.entities.MerchProduct.filter({ id: productId }))?.[0];
  const done = new Map<string, number>();
  const errors: string[] = [];
  let failed = 0;
  for (const v of product?.variants || []) {
    if (!v.pf_price_pending) continue;
    if (Date.now() - started > deadlineMs) break;
    if (done.size + failed) await sleep(delayMs);
    try {
      if (v.printful_sync_variant_id) await printfulFetch(`/store/variants/${v.printful_sync_variant_id}`, { method: 'PUT', body: { retail_price: Number(v.price || 0).toFixed(2) } });
      done.set(v.key, Number(v.price));
    } catch (e: any) {
      if (e?.status === 429) break;
      if (e?.status === 401 || e?.status === 403) throw e;
      // Gone or refused at Printful: report it and stop retrying this one.
      failed++;
      errors.push(`${v.label}: ${e?.message || e}`.slice(0, 160));
      done.set(v.key, Number(v.price));
    }
  }
  if (done.size) {
    // Re-read so an edit made meanwhile isn't overwritten; a price changed
    // again since we sent it stays pending.
    const fresh = (await db.entities.MerchProduct.filter({ id: productId }))?.[0];
    if (fresh) {
      const variants = (fresh.variants || []).map((v: any) => (done.has(v.key) && done.get(v.key) === Number(v.price) ? { ...v, pf_price_pending: false } : v));
      await db.entities.MerchProduct.update(productId, { variants });
      const remaining = variants.filter((v: any) => v.pf_price_pending).length;
      return { pushed: done.size - failed, failed, remaining, errors };
    }
  }
  return { pushed: 0, failed, remaining: (product?.variants || []).filter((v: any) => v.pf_price_pending).length, errors };
}

function guessCategory(name: string): string {
  const n = name.toLowerCase();
  if (/shirt|tee\b|t-shirt|hoodie|sweat|tank|jacket|crewneck|polo/.test(n)) return 'Apparel';
  if (/hat|cap\b|beanie|visor/.test(n)) return 'Headwear';
  if (/sticker|decal|magnet/.test(n)) return 'Stickers';
  if (/mug|bottle|tumbler|cup/.test(n)) return 'Drinkware';
  return 'Accessories';
}

export function variantFromSync(v: any, existing: any = null) {
  const preview = (v.files || []).find((f: any) => f?.type === 'preview');
  const status = String(v.availability_status || '').toLowerCase();
  return {
    key: `pf-${v.id}`,
    label: [v.color, v.size].filter(Boolean).join(' / ') || String(v.name || '').split(' - ').pop() || 'Standard',
    size: String(v.size || ''),
    color: String(v.color || ''),
    price: existing?.price ?? (Number(v.retail_price) || 0),
    image_url: preview?.preview_url || preview?.thumbnail_url || v.product?.image || '',
    available: !v.is_ignored && !/discontinued|out_of_stock/.test(status),
    printful_sync_variant_id: v.id,
    printful_variant_id: v.variant_id,
    sku: String(v.sku || ''),
  };
}

export function priceFrom(variants: any[]): number {
  const prices = (variants || []).filter((v) => v.available !== false && Number(v.price) > 0).map((v) => Number(v.price));
  return prices.length ? Math.min(...prices) : 0;
}

// Pulls every Printful sync product into MerchProduct. New products arrive
// hidden (active=false) so nothing appears in the store before an admin
// reviews it. Our prices, descriptions and visibility survive a re-sync.
export async function syncPrintfulProducts(db: any) {
  const summaries: any[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const res = await printfulFetch(`/store/products?offset=${offset}&limit=100`);
    const page = res?.result || [];
    summaries.push(...page);
    const total = Number(res?.paging?.total ?? page.length);
    if (page.length < 100 || summaries.length >= total) break;
  }
  const existing = await db.entities.MerchProduct.filter({ source: 'printful' }, 'sort_order', 500);
  const byPfId = new Map((existing || []).map((p: any) => [Number(p.printful_sync_product_id), p]));
  const seen = new Set<number>();
  let created = 0, updated = 0;
  for (const s of summaries) {
    if (s.is_ignored) continue;
    const detail = (await printfulFetch(`/store/products/${s.id}`))?.result || {};
    const sp = detail.sync_product || s;
    const old: any = byPfId.get(Number(sp.id));
    const oldVariants = new Map((old?.variants || []).map((v: any) => [v.key, v]));
    const variants = (detail.sync_variants || [])
      .filter((v: any) => !v.is_ignored)
      .map((v: any) => variantFromSync(v, oldVariants.get(`pf-${v.id}`)));
    const images = [...new Set([sp.thumbnail_url, ...variants.map((v: any) => v.image_url)].filter(Boolean))].slice(0, 12);
    const record: any = {
      name: old?.name || sp.name,
      image_url: old?.image_url && images.includes(old.image_url) ? old.image_url : (images[0] || ''),
      images,
      variants,
      price_from: priceFrom(variants),
      source: 'printful',
      printful_sync_product_id: Number(sp.id),
      printful_missing: false,
      last_synced_at: new Date().toISOString(),
    };
    seen.add(Number(sp.id));
    if (old) {
      await db.entities.MerchProduct.update(old.id, record);
      updated++;
    } else {
      // New product: start it on Printful's own US shipping rates for its
      // first variant (best effort; the admin can adjust or refresh per size).
      let ship: any = {};
      const sample = variants.find((v: any) => v.available !== false && v.printful_variant_id);
      if (sample) {
        try { const r = await usShippingRates(sample.printful_variant_id); ship = { ship_first: r.first, ship_additional: r.additional }; }
        catch (e: any) { console.error('printful: shipping rate lookup failed', e?.message || e); }
      }
      await db.entities.MerchProduct.create({ ...record, ...ship, ship_auto: true, category: guessCategory(sp.name || ''), description: '', active: false, featured: false, sort_order: 100 });
      created++;
    }
  }
  let missing = 0;
  for (const p of existing || []) {
    if (!seen.has(Number(p.printful_sync_product_id)) && !p.printful_missing) {
      await db.entities.MerchProduct.update(p.id, { printful_missing: true, active: false });
      missing++;
    }
  }
  return { found: summaries.length, created, updated, missing };
}
