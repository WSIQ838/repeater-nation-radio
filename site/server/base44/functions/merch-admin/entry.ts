// Admin actions for the merch store (administrators only): settings,
// product sync from Printful, product edits, order fulfillment (send to
// Printful, refresh, mark shipped by hand, cancel/refund) and Printful
// webhook setup. Every change is written to the audit log.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { requireAdmin, writeAudit, getIp } from '../../shared/adminGuard.ts';
import { stripeFetch, toForm, appUrlFromReq } from '../../shared/stripe.ts';
import { getMerchSettings, sendShippedEmail, SETTINGS_DEFAULTS, saveRatesRefresh, shipRates, breakEvenPrice } from '../../shared/merch.ts';
import {
  printfulConfigured, printfulFetch, submitOrderToPrintful, refreshOrderFromPrintful,
  syncPrintfulProducts, priceFrom, webhookToken, WEBHOOK_TYPES, ratesBySize, refreshShippingRates,
  tokenScopes, canEditProducts, costsBySize, pushPendingPrices,
} from '../../shared/printful.ts';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const CATEGORIES = ['Apparel', 'Headwear', 'Stickers', 'Drinkware', 'Accessories', 'Other'];
const bad = (error: string, status = 400) => Response.json({ error }, { status });
const str = (v: any, max: number) => String(v ?? '').trim().slice(0, max);
const num = (v: any, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : dflt;
};
const isUrl = (u: string) => !u || /^https?:\/\/[^\s]+$/i.test(u);
// A shipping rate, or null to fall back (variant -> product -> store default).
const rate = (v: any, fallback: any = null) => {
  if (v === undefined) return fallback;
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n * 100) / 100)) : fallback;
};

function cleanVariants(input: any[], existing: any[], source: string) {
  const old = new Map((existing || []).map((v: any) => [v.key, v]));
  if (source === 'printful') {
    // Printful variants come from sync; only price, label and availability are ours to edit.
    return (existing || []).map((v: any) => {
      const edit = (input || []).find((x: any) => x?.key === v.key) || {};
      const price = num(edit.price ?? v.price, 0, 1000, v.price);
      return {
        ...v,
        label: str(edit.label ?? v.label, 80) || v.label,
        price,
        // A changed price is copied to Printful's listing when the token allows it.
        pf_price_pending: price !== Number(v.price) ? true : !!v.pf_price_pending,
        available: edit.available === undefined ? v.available !== false : !!edit.available,
        ship_first: rate(edit.ship_first, v.ship_first ?? null),
        ship_additional: rate(edit.ship_additional, v.ship_additional ?? null),
      };
    });
  }
  const out: any[] = [];
  (input || []).slice(0, 50).forEach((v: any, i: number) => {
    const label = str(v?.label, 80);
    if (!label) return;
    const key = str(v?.key, 64) || `v${Date.now().toString(36)}${i}`;
    const prev: any = old.get(key) || {};
    const image = str(v?.image_url ?? prev.image_url, 1000);
    out.push({
      key, label, size: str(v?.size, 40), color: str(v?.color, 40), price: num(v?.price, 0, 1000, 0), image_url: isUrl(image) ? image : '', available: v?.available !== false,
      ship_first: rate(v?.ship_first, prev.ship_first ?? null), ship_additional: rate(v?.ship_additional, prev.ship_additional ?? null),
    });
  });
  return out;
}

// Copies changed prices to Printful when the token may edit store products.
async function sendPricesToPrintful(db: any, productId: string) {
  if (!productId || !printfulConfigured()) return null;
  try {
    if (!canEditProducts(await tokenScopes())) return { skipped: 'read_only' };
    return await pushPendingPrices(db, productId);
  } catch (e: any) {
    return { skipped: 'error', error: e?.message || String(e) };
  }
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const { caller, error } = await requireAdmin(base44);
    if (error) return error;
    if (!ADMIN_ROLES.has(caller.role) && !ADMIN_ROLES.has(caller._app_role)) return bad('Administrators only', 403);
    const db = base44.asServiceRole;
    const ip = getIp(req);
    const audit = (action: string, target_type: string, target_id: string, target_label: string, after?: any, before?: any) =>
      writeAudit(base44, { admin_id: caller.id, admin_name: caller.full_name || caller.email || 'admin', action, category: 'settings', target_type, target_id, target_label, after, before, ip });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    switch (action) {
      case 'status': {
        const { settings } = await getMerchSettings(db);
        const printful: any = { configured: printfulConfigured() };
        if (printful.configured) {
          try {
            const res = await printfulFetch('/store/products?offset=0&limit=1');
            printful.ok = true;
            printful.product_count = Number(res?.paging?.total ?? 0);
          } catch (e: any) { printful.ok = false; printful.error = e.message; }
          try {
            const wh = (await printfulFetch('/webhooks'))?.result || {};
            const token = await webhookToken();
            printful.webhook = { set: !!wh.url, ours: !!wh.url && String(wh.url).includes(`token=${token}`), types: wh.types || [] };
          } catch (e: any) { printful.webhook = { set: false, error: e.message }; }
          try {
            printful.scopes = await tokenScopes();
            printful.can_edit_products = canEditProducts(printful.scopes);
          } catch { printful.scopes = null; }
        }
        const pf = await db.entities.MerchProduct.filter({ source: 'printful' }, 'sort_order', 500).catch(() => []);
        const live = (pf || []).filter((p: any) => !p.printful_missing);
        const rates = {
          refreshed_at: settings.rates_refreshed_at || null,
          summary: settings.rates_refresh_summary || '',
          auto: live.filter((p: any) => p.ship_auto !== false).length,
          manual: live.filter((p: any) => p.ship_auto === false).length,
        };
        return Response.json({ settings, printful, rates, stripe_configured: !!secrets.get('STRIPE_SECRET_KEY') });
      }

      case 'settings:save': {
        const s = body.settings || {};
        const email = str(s.contact_email, 200);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('Enter a valid contact email, or leave it blank.');
        const countries = (Array.isArray(s.ship_countries) ? s.ship_countries : String(s.ship_countries || '').split(/[\s,]+/))
          .map((c: any) => String(c).trim().toUpperCase()).filter((c: string) => /^[A-Z]{2}$/.test(c));
        const clean = {
          enabled: !!s.enabled,
          store_name: str(s.store_name, 80) || SETTINGS_DEFAULTS.store_name,
          tagline: str(s.tagline, 160),
          contact_email: email,
          shipping_flat_rate: num(s.shipping_flat_rate, 0, 100, SETTINGS_DEFAULTS.shipping_flat_rate),
          shipping_additional_item: num(s.shipping_additional_item, 0, 50, SETTINGS_DEFAULTS.shipping_additional_item),
          free_shipping_over: num(s.free_shipping_over, 0, 1000, 0),
          ship_countries: [...new Set(countries)].slice(0, 50).length ? [...new Set(countries)].slice(0, 50) : ['US'],
          collect_tax: !!s.collect_tax,
          member_discount_percent: num(s.member_discount_percent, 0, 50, 0),
          auto_submit: s.auto_submit !== false,
          show_shipping_badge: s.show_shipping_badge !== false,
          show_member_badge: s.show_member_badge !== false,
          show_product_shipping: s.show_product_shipping !== false,
          show_shipping_details: s.show_shipping_details !== false,
          show_tax_note: s.show_tax_note !== false,
          returns_policy: str(s.returns_policy, 4000),
        };
        const { row } = await getMerchSettings(db);
        const saved = row ? await db.entities.MerchSettings.update(row.id, clean) : await db.entities.MerchSettings.create(clean);
        await audit(clean.enabled !== !!row?.enabled ? (clean.enabled ? 'store.open' : 'store.close') : 'store.settings', 'MerchSettings', saved?.id || row?.id || '', 'Store settings', clean, row || undefined);
        return Response.json({ ok: true, settings: { ...SETTINGS_DEFAULTS, ...clean } });
      }

      case 'products:sync': {
        if (!printfulConfigured()) return bad('Add the PRINTFUL_API_KEY secret first.');
        const result = await syncPrintfulProducts(db);
        await audit('store.sync', 'MerchProduct', '', 'Printful sync', result);
        return Response.json({ ok: true, ...result });
      }

      case 'product:create': {
        const p = body.product || {};
        const name = str(p.name, 120);
        if (!name) return bad('Give the product a name.');
        const variants = cleanVariants(p.variants, [], 'manual');
        if (!variants.length) return bad('Add at least one option with a price (e.g. "One size — $4").');
        const image = str(p.image_url, 1000);
        if (!isUrl(image)) return bad('The image must be a web address.');
        const created = await db.entities.MerchProduct.create({
          name, description: str(p.description, 4000), category: CATEGORIES.includes(p.category) ? p.category : 'Other',
          image_url: image, images: [image, ...variants.map((v: any) => v.image_url)].filter(Boolean).slice(0, 12),
          variants, price_from: priceFrom(variants), active: !!p.active, featured: !!p.featured,
          ship_first: rate(p.ship_first), ship_additional: rate(p.ship_additional),
          sort_order: Math.round(num(p.sort_order, 0, 9999, 100)), source: 'manual',
        });
        await audit('store.product_create', 'MerchProduct', created.id, name);
        return Response.json({ ok: true, product: created });
      }

      case 'product:save': {
        const id = str(body.id, 64);
        const before = id ? (await db.entities.MerchProduct.filter({ id }))?.[0] : null;
        if (!before) return bad('Product not found', 404);
        const p = body.product || {};
        const image = p.image_url === undefined ? before.image_url : str(p.image_url, 1000);
        if (!isUrl(image)) return bad('The image must be a web address.');
        const variants = p.variants === undefined ? before.variants : cleanVariants(p.variants, before.variants, before.source);
        const update: any = {
          name: p.name === undefined ? before.name : (str(p.name, 120) || before.name),
          description: p.description === undefined ? before.description : str(p.description, 4000),
          category: CATEGORIES.includes(p.category) ? p.category : before.category,
          image_url: image,
          variants,
          price_from: priceFrom(variants),
          active: p.active === undefined ? !!before.active : !!p.active,
          featured: p.featured === undefined ? !!before.featured : !!p.featured,
          sort_order: p.sort_order === undefined ? before.sort_order : Math.round(num(p.sort_order, 0, 9999, 100)),
          ship_first: rate(p.ship_first, before.ship_first ?? null),
          ship_additional: rate(p.ship_additional, before.ship_additional ?? null),
          ship_auto: before.source === 'printful' && (p.ship_auto === undefined ? before.ship_auto !== false : !!p.ship_auto),
        };
        if (before.source === 'manual') update.images = [image, ...variants.map((v: any) => v.image_url)].filter(Boolean).slice(0, 12);
        if (update.active && !variants.some((v: any) => v.available !== false && Number(v.price) > 0)) return bad('Set a price on at least one option before showing this product.');
        await db.entities.MerchProduct.update(id, update);
        await audit('store.product_save', 'MerchProduct', id, update.name, { active: update.active, price_from: update.price_from }, { active: before.active, price_from: before.price_from });
        const printful_prices = await sendPricesToPrintful(db, before.source === 'printful' && variants.some((v: any) => v.pf_price_pending) ? id : '');
        return Response.json({ ok: true, printful_prices });
      }

      // Printful's standard US shipping for this product, per size (bigger sizes
      // and heavier items can cost more). Nothing is saved: the edit dialog
      // fills the fields and the admin reviews and saves.
      case 'product:shippingRates': {
        const id = str(body.id, 64);
        const product = id ? (await db.entities.MerchProduct.filter({ id }))?.[0] : null;
        if (!product) return bad('Product not found', 404);
        if (product.source !== 'printful') return bad('Only Printful products have Printful shipping rates. Enter your own for this one.');
        if (!printfulConfigured()) return bad('Add the PRINTFUL_API_KEY secret first.');
        let rates: any = null;
        try { rates = await ratesBySize(product); }
        catch (e: any) { return bad(`Printful: ${e.message}`, 502); }
        if (!rates) return bad('No Printful variants to price.');
        return Response.json({ ok: true, ...rates });
      }

      // "Update now": the daily refresh, on demand. The page repeats the call
      // with the same started_at until nothing is left, so a big catalog is
      // done in a few short requests instead of one long one.
      case 'rates:refresh': {
        if (!printfulConfigured()) return bad('Add the PRINTFUL_API_KEY secret first.');
        const now = new Date().toISOString();
        const since = typeof body.started_at === 'string' && !Number.isNaN(Date.parse(body.started_at)) ? new Date(Math.min(Date.parse(body.started_at), Date.now())).toISOString() : now;
        const result = await refreshShippingRates(db, { staleBefore: since });
        const summary = await saveRatesRefresh(db, result);
        if (!result.remaining) await audit('store.rates_refresh', 'MerchProduct', '', 'Printful shipping rates', { summary });
        return Response.json({ ok: true, started_at: since, summary, ...result });
      }

      // Printful's cost for each size and the break-even price (cost plus
      // Stripe's fee on the item and its shipping). Nothing is saved: the edit
      // dialog fills the prices and the admin reviews and saves.
      case 'product:costPrices': {
        const id = str(body.id, 64);
        const product = id ? (await db.entities.MerchProduct.filter({ id }))?.[0] : null;
        if (!product) return bad('Product not found', 404);
        if (product.source !== 'printful') return bad('Only Printful products have a Printful cost.');
        if (!printfulConfigured()) return bad('Add the PRINTFUL_API_KEY secret first.');
        let costs: Record<string, number>;
        try { costs = await costsBySize(product); }
        catch (e: any) { return bad(`Printful: ${e.message}`, 502); }
        if (!Object.keys(costs).length) return bad('No Printful variants to price.');
        const { settings } = await getMerchSettings(db);
        const variants: Record<string, { cost: number; break_even: number }> = {};
        for (const v of product.variants || []) {
          const cost = costs[v.size || v.label || 'One size'];
          if (cost !== undefined) variants[v.key] = { cost, break_even: breakEvenPrice(cost, shipRates(product, v, settings).firstCents / 100) };
        }
        return Response.json({ ok: true, sizes: costs, variants });
      }

      // Sends price changes that are still waiting to Printful (the page
      // repeats this until none are left).
      case 'product:pushPrices': {
        const id = str(body.id, 64);
        if (!id) return bad('Product not found', 404);
        return Response.json({ ok: true, printful_prices: await sendPricesToPrintful(db, id) });
      }

      case 'product:delete': {
        const id = str(body.id, 64);
        const before = id ? (await db.entities.MerchProduct.filter({ id }))?.[0] : null;
        if (!before) return bad('Product not found', 404);
        await db.entities.MerchProduct.delete(id);
        await audit('store.product_delete', 'MerchProduct', id, before.name);
        return Response.json({ ok: true });
      }

      case 'order:submit':
      case 'order:refresh':
      case 'order:ship':
      case 'order:cancel':
      case 'order:note': {
        const id = str(body.id, 64);
        const order = id ? (await db.entities.MerchOrder.filter({ id }))?.[0] : null;
        if (!order) return bad('Order not found', 404);
        const { settings } = await getMerchSettings(db);

        if (action === 'order:note') {
          await db.entities.MerchOrder.update(id, { admin_notes: str(body.admin_notes, 2000) });
          return Response.json({ ok: true });
        }

        if (action === 'order:submit') {
          if (!order.has_printful_items) return bad('This order has no Printful items.');
          if (!['paid', 'needs_attention'].includes(order.status)) return bad(`Only paid orders that haven't gone to Printful can be sent (this one is ${order.status.replace('_', ' ')}).`);
          if (order.printful_order_id) return bad('This order is already in Printful. Use Refresh, or fix it in Printful.');
          if (!printfulConfigured()) return bad('Add the PRINTFUL_API_KEY secret first.');
          const result = await submitOrderToPrintful(db, order, settings);
          await audit('store.order_submit', 'MerchOrder', id, order.order_number, { status: result.status, error: result.error || undefined });
          if (result.status === 'needs_attention') return bad(result.error || 'Printful refused the order.', 502);
          return Response.json({ ok: true, status: result.status });
        }

        if (action === 'order:refresh') {
          if (!order.has_printful_items || !printfulConfigured()) return bad('Nothing to refresh from Printful for this order.');
          const { order: fresh, newShipments } = await refreshOrderFromPrintful(db, order);
          if (newShipments.length) await sendShippedEmail(db, fresh, newShipments, settings).catch(() => {});
          return Response.json({ ok: true, status: fresh.status, shipments: fresh.shipments });
        }

        if (action === 'order:ship') {
          if (!['paid', 'submitted', 'in_production', 'partially_shipped', 'shipped', 'needs_attention', 'on_hold'].includes(order.status)) return bad('Only paid orders can be marked shipped.');
          const trackingUrl = str(body.tracking_url, 500);
          if (!isUrl(trackingUrl)) return bad('The tracking link must be a web address.');
          const shipment = { carrier: str(body.carrier, 60), service: '', tracking_number: str(body.tracking_number, 80), tracking_url: trackingUrl, shipped_at: new Date().toISOString(), note: 'manual' };
          const allShipped = !order.has_printful_items || order.status === 'shipped';
          const update: any = { shipments: [...(order.shipments || []), shipment], status: allShipped ? 'shipped' : (order.status === 'paid' ? 'partially_shipped' : order.status), shipped_at: order.shipped_at || shipment.shipped_at };
          await db.entities.MerchOrder.update(id, update);
          if (body.notify !== false) await sendShippedEmail(db, { ...order, ...update }, [shipment], settings).catch(() => {});
          await audit('store.order_ship', 'MerchOrder', id, order.order_number, shipment);
          return Response.json({ ok: true, status: update.status });
        }

        // order:cancel — cancel at Printful when it hasn't started printing, then refund in Stripe.
        if (['canceled', 'refunded', 'pending_payment', 'abandoned'].includes(order.status)) return bad(`This order is already ${order.status.replace('_', ' ')}.`);
        if (['in_production', 'partially_shipped', 'shipped'].includes(order.status)) return bad('This order is already being printed or has shipped, so it can\'t be canceled here. Sort it out in Printful, then refund in Stripe if needed.');
        if (order.printful_order_id && printfulConfigured()) {
          try { await printfulFetch(`/orders/${order.printful_order_id}`, { method: 'DELETE' }); }
          catch (e: any) { return bad(`Printful wouldn't cancel it: ${e.message}`, 502); }
        }
        let refunded = false;
        if (body.refund !== false && order.stripe_payment_intent_id) {
          try {
            await stripeFetch('/v1/refunds', { method: 'POST', body: toForm({ payment_intent: order.stripe_payment_intent_id, reason: 'requested_by_customer', 'metadata[merch_order_id]': id }) });
            refunded = true;
          } catch (e: any) {
            await db.entities.MerchOrder.update(id, { status: 'canceled', error: `Canceled, but the Stripe refund failed: ${e.message}` });
            return bad(`Canceled, but the refund failed: ${e.message}. Refund it in the Stripe dashboard.`, 502);
          }
        }
        await db.entities.MerchOrder.update(id, { status: refunded ? 'refunded' : 'canceled', error: '' });
        await audit(refunded ? 'store.order_refund' : 'store.order_cancel', 'MerchOrder', id, order.order_number, { total: order.total });
        return Response.json({ ok: true, status: refunded ? 'refunded' : 'canceled' });
      }

      case 'webhook:setup': {
        if (!printfulConfigured()) return bad('Add the PRINTFUL_API_KEY secret first.');
        const base = appUrlFromReq(req);
        if (!base) return bad('App URL not configured', 500);
        const url = `${base}/functions/printful-webhook?token=${await webhookToken()}`;
        await printfulFetch('/webhooks', { method: 'POST', body: { url, types: WEBHOOK_TYPES } });
        await audit('store.webhook_setup', 'MerchSettings', '', 'Printful webhook', { types: WEBHOOK_TYPES });
        return Response.json({ ok: true });
      }

      default:
        return bad('Unknown action');
    }
  } catch (err: any) {
    console.error('merch-admin error', err?.message || err);
    return Response.json({ error: err?.message || 'unexpected error' }, { status: 500 });
  }
}
