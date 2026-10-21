import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { cachedConfig, forgetConfig } from '@/lib/configCache';

// Mirrors SETTINGS_DEFAULTS in base44/shared/merch.ts (the server's copy is
// what checkout actually uses).
export const MERCH_DEFAULTS = {
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
  returns_policy: '',
};

let settingsPromise = null;
export function loadMerchSettings(force = false) {
  if (force) forgetConfig('merch');
  if (!settingsPromise || force) {
    settingsPromise = cachedConfig('merch', () => base44.entities.MerchSettings.list('-updated_date', 1)
      .then((rows) => ({ ...MERCH_DEFAULTS, ...(rows?.[0] || {}) })))
      .catch(() => ({ ...MERCH_DEFAULTS }));
  }
  return settingsPromise;
}

export function useMerchSettings() {
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    let alive = true;
    loadMerchSettings().then((s) => { if (alive) setSettings(s); });
    return () => { alive = false; };
  }, []);
  return settings;
}

export const money = (n) => `$${Number(n || 0).toFixed(2)}`;
export const memberPrice = (price, pct) => Math.round(Number(price || 0) * (100 - (pct || 0))) / 100;
export const discountFor = (user, settings) => (user?.callsign_verified === true ? Math.min(50, Number(settings?.member_discount_percent || 0)) : 0);

const isRate = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;

// Mirrors shipRates/shippingCentsFor in base44/shared/merch.ts, which is what
// checkout actually charges: a size's own rates, else the product's, else the
// store default; the highest first-item rate once, plus every other unit's
// additional-item rate.
export function shipRates(product, variant, settings) {
  const first = [variant?.ship_first, product?.ship_first, settings?.shipping_flat_rate].find(isRate);
  const additional = [variant?.ship_additional, product?.ship_additional, settings?.shipping_additional_item ?? MERCH_DEFAULTS.shipping_additional_item].find(isRate);
  return { first: Number(first ?? 0), additional: Number(additional ?? 0) };
}

// lines: [{ product, variant, quantity }]
export function shippingFor(lines, amount, settings) {
  const units = lines.filter((l) => l.quantity > 0).map((l) => ({ ...shipRates(l.product, l.variant, settings), quantity: l.quantity }));
  const over = Number(settings?.free_shipping_over || 0);
  if (!units.length || (over > 0 && amount >= over)) return 0;
  const base = units.reduce((best, u) => (u.first > best.first ? u : best), units[0]);
  const cents = Math.round(base.first * 100) + units.reduce((t, u) => t + Math.round(u.additional * 100) * u.quantity, 0) - Math.round(base.additional * 100);
  return cents / 100;
}

export function shippingNote(settings, products = []) {
  if (!settings) return '';
  const firsts = [];
  for (const p of products || []) for (const v of p.variants || []) if (v.available !== false) firsts.push(shipRates(p, v, settings).first);
  const from = firsts.length ? Math.min(...firsts) : Number(settings.shipping_flat_rate || 0);
  const over = Number(settings.free_shipping_over || 0);
  const base = from > 0 ? `Shipping from ${money(from)}` : 'Free shipping';
  return over > 0 ? `${base} · free over ${money(over)}` : base;
}

export const ORDER_STATUS = {
  pending_payment: { label: 'Awaiting payment', tone: 'muted' },
  paid: { label: 'Paid — getting ready', tone: 'primary' },
  submitted: { label: 'Sent for printing', tone: 'primary' },
  in_production: { label: 'Being printed', tone: 'primary' },
  on_hold: { label: 'On hold', tone: 'warn' },
  partially_shipped: { label: 'Partly shipped', tone: 'success' },
  shipped: { label: 'Shipped', tone: 'success' },
  canceled: { label: 'Canceled', tone: 'muted' },
  refunded: { label: 'Refunded', tone: 'muted' },
  failed: { label: 'Failed', tone: 'destructive' },
  needs_attention: { label: 'Needs attention', tone: 'destructive' },
  abandoned: { label: 'Not completed', tone: 'muted' },
};

// ---- cart (this browser only) ----
const CART_KEY = 'rn.merch.cart';
const CART_EVENT = 'rn-merch-cart';

function readCart() {
  try {
    const items = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(items) ? items.filter((i) => i?.product_id && i?.variant_key && i.quantity > 0) : [];
  } catch { return []; }
}

function writeCart(items) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* private mode: cart lasts this page only */ }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: items }));
}

export function useCart() {
  const [items, setItems] = useState(readCart);
  useEffect(() => {
    const onChange = (e) => setItems(e?.detail || readCart());
    const onStorage = (e) => { if (e.key === CART_KEY) setItems(readCart()); };
    window.addEventListener(CART_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(CART_EVENT, onChange); window.removeEventListener('storage', onStorage); };
  }, []);
  const update = useCallback((fn) => { const next = fn(readCart()); writeCart(next); setItems(next); }, []);
  const add = useCallback((product_id, variant_key, quantity = 1) => update((cur) => {
    const hit = cur.find((i) => i.product_id === product_id && i.variant_key === variant_key);
    if (hit) return cur.map((i) => (i === hit ? { ...i, quantity: Math.min(10, i.quantity + quantity) } : i));
    return [...cur, { product_id, variant_key, quantity: Math.min(10, quantity) }];
  }), [update]);
  const setQty = useCallback((product_id, variant_key, quantity) => update((cur) => cur
    .map((i) => (i.product_id === product_id && i.variant_key === variant_key ? { ...i, quantity: Math.max(0, Math.min(10, quantity)) } : i))
    .filter((i) => i.quantity > 0)), [update]);
  const remove = useCallback((product_id, variant_key) => setQty(product_id, variant_key, 0), [setQty]);
  const clear = useCallback(() => update(() => []), [update]);
  return { items, count: items.reduce((t, i) => t + i.quantity, 0), add, setQty, remove, clear };
}
