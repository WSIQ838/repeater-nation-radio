import { useEffect, useState } from 'react';
import { Store, AlertTriangle, Truck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/admin/parts';
import { loadMerchSettings, shipRates, money } from '@/lib/merch';
import { merchAdmin } from './api';

const LBL = 'text-xs font-semibold text-muted-foreground';

// Display-only switches: they hide text on the Merch page, never change what checkout charges.
const SHOWS = [
  ['show_shipping_badge', 'Shipping price badge', 'The "Shipping from $X" badge at the top of the Merch page.'],
  ['show_product_shipping', 'Shipping in product windows', 'The "Shipping $X, or $Y as an extra item" line when someone opens a product.'],
  ['show_shipping_details', 'How shipping works', 'The sentence about per-item shipping (and free shipping) in the Shipping & returns box.'],
  ['show_member_badge', 'Member discount badge', 'The "% off for verified operators" badge at the top. Only shows when a discount is set.'],
  ['show_tax_note', 'Sales tax note in the cart', '"Sales tax is added at checkout." Only shows when tax collection is on.'],
];

// Each product's shipping as checkout charges it: its own rates (a size that
// costs more has its own), or the fallback below when it has none.
function ItemShipping({ products, form }) {
  if (products === null) return <div className="text-xs text-muted-foreground">Loading items…</div>;
  if (!products.length) return <div className="text-xs text-muted-foreground">No products yet. Sync from Printful in the Products tab.</div>;
  return (
    <div className="rounded-lg border border-border divide-y divide-border text-sm">
      <div className="hidden sm:flex gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"><span className="flex-1">Item</span><span className="w-20 text-right">First item</span><span className="w-20 text-right">Each extra</span><span className="w-28">From</span></div>
      {products.map((p) => {
        const r = shipRates(p, null, form);
        const own = p.ship_first !== null && p.ship_first !== undefined && p.ship_first !== '';
        const sizes = (p.variants || []).filter((v) => v.ship_first !== null && v.ship_first !== undefined && v.ship_first !== '');
        const from = !own ? 'Fallback below' : p.source === 'printful' && p.ship_auto !== false ? 'Printful, daily' : 'Your rate';
        return (
          <div key={p.id} className="flex flex-wrap sm:flex-nowrap gap-x-3 gap-y-0.5 px-3 py-2">
            <span className="flex-1 min-w-0 basis-full sm:basis-auto">
              <span className="font-medium">{p.name}</span>
              {sizes.length > 0 && <span className="block text-xs text-muted-foreground">{[...new Map(sizes.map((v) => [v.size || v.label, v])).values()].map((v) => `${v.size || v.label}: ${money(v.ship_first)} / ${money(v.ship_additional)}`).join(' · ')}</span>}
            </span>
            <span className="sm:w-20 sm:text-right tabular-nums"><span className="sm:hidden text-muted-foreground">First </span>{money(r.first)}</span>
            <span className="sm:w-20 sm:text-right tabular-nums"><span className="sm:hidden text-muted-foreground">· extra </span>{money(r.additional)}</span>
            <span className={`sm:w-28 text-xs ${own ? 'text-muted-foreground' : 'text-warning'}`}>{from}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function SettingsTab({ settings, onSaved, printfulConfigured }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...settings, ship_countries: (settings.ship_countries || ['US']).join(', ') });
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e });
  const [products, setProducts] = useState(null);
  useEffect(() => {
    base44.entities.MerchProduct.list('sort_order', 200)
      .then((rows) => setProducts((rows || []).filter((p) => !p.printful_missing)))
      .catch(() => setProducts([]));
  }, []);
  const freeOn = Number(form.free_shipping_over) > 0;
  const usingFallback = (products || []).filter((p) => p.ship_first === null || p.ship_first === undefined || p.ship_first === '').length;

  const save = async (patch = {}) => {
    setBusy(true);
    try {
      const r = await merchAdmin('settings:save', { settings: { ...form, ...patch } });
      setForm({ ...r.settings, ship_countries: r.settings.ship_countries.join(', ') });
      loadMerchSettings(true);
      toast({ title: patch.enabled === true ? 'Merch is open' : patch.enabled === false ? 'Merch is closed' : 'Settings saved' });
      onSaved?.(r.settings);
    } catch (e) { toast({ title: e.message, variant: 'destructive' }); }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <Card className={`p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${form.enabled ? 'border-success/50' : ''}`}>
        <div className={`w-12 h-12 rounded-xl grid place-items-center shrink-0 ${form.enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}><Store className="w-6 h-6" /></div>
        <div className="flex-1">
          <div className="font-semibold">{form.enabled ? 'Merch is open to everyone' : 'Merch is closed'}</div>
          <div className="text-sm text-muted-foreground">{form.enabled ? 'Shoppers see Merch in the menu and can check out.' : 'Only admins can see the Merch page and place test orders. Nothing shows in the menu.'}</div>
        </div>
        <Button variant={form.enabled ? 'outline' : 'default'} disabled={busy} onClick={() => (form.enabled ? save({ enabled: false }) : setConfirmOpen(true))}>{form.enabled ? 'Close Merch' : 'Open Merch'}</Button>
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-semibold">Store details</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><div className={LBL}>Store name</div><Input value={form.store_name} onChange={set('store_name')} maxLength={80} /></div>
          <div><div className={LBL}>Contact email (order questions; gets a copy of each order)</div><Input type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="store@yourdomain.com" /></div>
        </div>
        <div><div className={LBL}>Tagline</div><Input value={form.tagline} onChange={set('tagline')} maxLength={160} /></div>
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-semibold">Prices, shipping &amp; tax</h3>
        <div className="space-y-2">
          <div className="text-sm font-medium flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> Shipping comes from each item</div>
          <p className="text-xs text-muted-foreground">Checkout charges each item's own shipping, the way Printful bills you: the highest first-item rate in the order once, plus the extra-item rate for every other item (so 2 of the same hoodie = first + one extra). Printful items follow Printful's current US rates, updated daily. Change any item in Products → Edit.</p>
          <ItemShipping products={products} form={form} />
        </div>
        <label className="flex items-start gap-3 text-sm"><Switch checked={freeOn} onCheckedChange={(v) => setForm({ ...form, free_shipping_over: v ? (Number(settings.free_shipping_over) > 0 ? settings.free_shipping_over : 100) : 0 })} className="mt-0.5" aria-label="Free shipping on big orders" /><span className="flex-1"><span className="font-medium">Free shipping on big orders</span><span className="block text-xs text-muted-foreground">{freeOn ? 'Orders at or over this amount ship free, and you pay Printful the shipping out of your profit.' : 'Off: every order pays its items\' shipping.'}</span>
          {freeOn && <span className="mt-2 flex items-center gap-2 text-xs"><span className="text-muted-foreground">Free at</span><Input className="h-8 w-28" type="number" step="1" min="1" value={form.free_shipping_over} onChange={set('free_shipping_over')} aria-label="Free shipping at this order total ($)" /><span className="text-muted-foreground">and up</span></span>}</span></label>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><div className={LBL}>Member discount (%) for verified operators</div><Input type="number" step="1" min="0" max="50" value={form.member_discount_percent} onChange={set('member_discount_percent')} /></div>
          <div><div className={LBL}>Ship to countries (2-letter codes, comma-separated)</div><Input value={form.ship_countries} onChange={set('ship_countries')} placeholder="US, CA" /></div>
        </div>
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="text-sm font-medium">Fallback for items with no shipping set</div>
          <p className="text-xs text-muted-foreground">{usingFallback ? `${usingFallback} item(s) above have no shipping of their own and use these.` : 'Every item has its own shipping, so these aren\'t used right now.'} New Printful products get their own rates when synced.</p>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div><div className={LBL}>First item ($)</div><Input type="number" step="0.01" min="0" value={form.shipping_flat_rate} onChange={set('shipping_flat_rate')} /></div>
            <div><div className={LBL}>Each extra item ($)</div><Input type="number" step="0.01" min="0" value={form.shipping_additional_item} onChange={set('shipping_additional_item')} /></div>
          </div>
          {Number(form.shipping_flat_rate) === 0 && usingFallback > 0 && <p className="text-xs text-warning flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> At $0, those items ship free.</p>}
        </div>
        <label className="flex items-start gap-3 text-sm"><Switch checked={!!form.collect_tax} onCheckedChange={set('collect_tax')} className="mt-0.5" /><span><span className="font-medium">Collect sales tax at checkout (Stripe Tax)</span><span className="block text-xs text-muted-foreground">Turn on Stripe Tax and add your tax registrations in the Stripe dashboard first, or checkout will fail.</span></span></label>
        <label className="flex items-start gap-3 text-sm"><Switch checked={form.auto_submit !== false} onCheckedChange={set('auto_submit')} className="mt-0.5" /><span><span className="font-medium">Send paid orders straight to Printful for printing</span><span className="block text-xs text-muted-foreground">Off: orders wait as drafts in your Printful dashboard until you confirm them there.</span></span></label>
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <h3 className="font-semibold">What shoppers see</h3>
          <p className="text-xs text-muted-foreground mt-1">Hide any of these from the Merch page. This only changes what's shown: checkout still charges shipping, discounts and tax the same way, and the cart and Stripe checkout always show the real totals.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {SHOWS.map(([key, title, hint]) => (
            <label key={key} className="flex items-start gap-3 text-sm"><Switch checked={form[key] !== false} onCheckedChange={set(key)} className="mt-0.5" aria-label={title} /><span><span className="font-medium">{title}</span><span className="block text-xs text-muted-foreground">{hint}</span></span></label>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Returns policy</h3>
        <Textarea rows={4} value={form.returns_policy} onChange={set('returns_policy')} maxLength={4000} />
        <p className="text-xs text-muted-foreground">Shown on the Merch page. Printful replaces items that arrive damaged or misprinted if you report it to them within 30 days of delivery.</p>
      </Card>

      <div className="flex justify-end"><Button onClick={() => save()} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button></div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Open Merch to everyone?"
        description={<span className="block space-y-2"><span className="block">Merch appears in the menu and anyone can buy. Real cards are charged through your Stripe account.</span>{!printfulConfigured && <span className="flex gap-2 text-destructive"><AlertTriangle className="w-4 h-4 shrink-0" /> Printful isn't connected yet, so Printful items can't be sent for printing automatically.</span>}</span>}
        confirmLabel="Open Merch"
        loading={busy}
        onConfirm={async () => { await save({ enabled: true }); setConfirmOpen(false); }}
      />
    </div>
  );
}
