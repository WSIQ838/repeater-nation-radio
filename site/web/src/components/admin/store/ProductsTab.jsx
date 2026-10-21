import { useEffect, useState } from 'react';
import { RefreshCw, Plus, Pencil, Trash2, Star, ShoppingBag, AlertTriangle, Upload, Loader2, Truck, Calculator } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loading, EmptyState, Badge, ConfirmDialog } from '@/components/admin/parts';
import { money } from '@/lib/merch';
import { merchAdmin } from './api';

const CATEGORIES = ['Apparel', 'Headwear', 'Stickers', 'Drinkware', 'Accessories', 'Other'];
const LBL = 'text-xs font-semibold text-muted-foreground';

export default function ProductsTab({ printfulConfigured, settings }) {
  const { toast } = useToast();
  const [products, setProducts] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState(null);
  const load = () => base44.entities.MerchProduct.list('sort_order', 500).then((r) => setProducts(r || [])).catch(() => setProducts([]));
  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await merchAdmin('products:sync');
      toast({ title: `Synced ${r.found} Printful product(s)`, description: `${r.created} new (hidden until you switch them on), ${r.updated} updated${r.missing ? `, ${r.missing} no longer in Printful` : ''}.` });
      await load();
    } catch (e) { toast({ title: e.message, variant: 'destructive' }); }
    setSyncing(false);
  };
  const quickSave = async (p, patch) => {
    setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    try { await merchAdmin('product:save', { id: p.id, product: patch }); }
    catch (e) { toast({ title: e.message, variant: 'destructive' }); load(); }
  };

  if (!products) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={sync} disabled={syncing || !printfulConfigured} title={printfulConfigured ? 'Pull products you designed in Printful' : 'Connect Printful first (Printful tab)'}>
          {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Sync from Printful
        </Button>
        <Button variant="outline" onClick={() => setEditing({ source: 'manual', variants: [{ label: 'One size', price: '' }], category: 'Stickers', active: false })}>
          <Plus className="w-4 h-4 mr-2" /> Add a product you ship yourself
        </Button>
        <span className="text-xs text-muted-foreground">Switch a product on to show it on the Merch page. Prices are set here; re-syncing keeps them.</span>
      </div>
      {products.length === 0 ? (
        <Card><EmptyState icon={ShoppingBag} title="No products yet" description={printfulConfigured ? 'Design products in Printful, then press Sync from Printful.' : 'Connect Printful (Printful tab) and sync, or add a product you ship yourself.'} /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map((p) => {
            const prices = (p.variants || []).map((v) => Number(v.price)).filter((n) => n > 0);
            const range = prices.length ? (Math.min(...prices) === Math.max(...prices) ? money(prices[0]) : `${money(Math.min(...prices))}–${money(Math.max(...prices))}`) : 'No price';
            return (
              <Card key={p.id} className="overflow-hidden flex flex-col">
                <div className="aspect-[4/3] bg-white grid place-items-center p-2 relative">
                  {p.image_url ? <img src={p.image_url} alt={p.name} className="max-h-full max-w-full object-contain" /> : <ShoppingBag className="w-10 h-10 text-zinc-300" />}
                  {p.printful_missing && <span className="absolute top-2 left-2"><Badge tone="destructive">Gone from Printful</Badge></span>}
                </div>
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="font-semibold truncate">{p.name}</div><div className="text-xs text-muted-foreground">{p.category} · {range} · {(p.variants || []).length} option(s)</div></div>
                    <Badge tone={p.source === 'printful' ? 'primary' : 'navy'}>{p.source === 'printful' ? 'Printful' : 'You ship'}</Badge>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 text-sm"><Switch checked={!!p.active} disabled={p.printful_missing} onCheckedChange={(v) => quickSave(p, { active: v })} /> {p.active ? 'On Merch' : 'Hidden'}</label>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" title={p.featured ? 'Unfeature' : 'Feature (shows first)'} onClick={() => quickSave(p, { featured: !p.featured })}><Star className={`w-4 h-4 ${p.featured ? 'fill-primary text-primary' : ''}`} /></Button>
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(p)}><Pencil className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <ProductDialog product={editing} settings={settings} printfulConfigured={printfulConfigured} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

// What happened to Printful's own prices after a save.
function printfulPriceNote(pp) {
  if (!pp) return undefined;
  if (pp.skipped === 'read_only') return "Printful's own prices weren't changed: your Printful token can only read products (see the Printful tab).";
  if (pp.skipped === 'error') return `Couldn't update Printful's prices (${pp.error}). They'll be retried in a few hours.`;
  const parts = [];
  if (pp.pushed) parts.push(`Prices updated on Printful too (${pp.pushed}).`);
  if (pp.remaining) parts.push(`${pp.remaining} more will reach Printful within a few hours.`);
  if (pp.failed) parts.push(`${pp.failed} couldn't be changed on Printful: ${pp.errors?.[0] || 'unknown error'}`);
  return parts.join(' ') || undefined;
}

function ProductDialog({ product, settings, printfulConfigured, onClose, onSaved }) {
  const { toast } = useToast();
  const isNew = !product.id;
  const manual = product.source !== 'printful';
  const [form, setForm] = useState({
    name: product.name || '', description: product.description || '', category: product.category || 'Other',
    image_url: product.image_url || '', sort_order: product.sort_order ?? 100, active: !!product.active, featured: !!product.featured,
    ship_first: product.ship_first ?? '', ship_additional: product.ship_additional ?? '', ship_auto: !manual && product.ship_auto !== false,
    variants: (product.variants || []).map((v) => ({ ...v, price: v.price ?? '', ship_first: v.ship_first ?? '', ship_additional: v.ship_additional ?? '' })),
  });
  const [ratesBusy, setRatesBusy] = useState(false);
  const [costs, setCosts] = useState(null);
  const [costBusy, setCostBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e });
  const setVariant = (i, patch) => setForm({ ...form, variants: form.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  // Typing a shipping rate yourself takes the product off the daily Printful update.
  const setShip = (k) => (e) => setForm({ ...form, [k]: e.target.value, ship_auto: false });
  const setVariantShip = (i, patch) => setForm({ ...form, ship_auto: false, variants: form.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try { const { file_url } = await base44.integrations.Core.UploadFile({ file }); setForm((f) => ({ ...f, image_url: file_url })); }
    catch (e) { toast({ title: e?.message || 'Upload failed', variant: 'destructive' }); }
    setUploading(false);
  };
  const save = async () => {
    setBusy(true);
    // Empty shipping fields are sent as null, which means "use the next level up".
    const shipVal = (x) => (x === '' || x === null || x === undefined ? null : Number(x));
    const payload = {
      ...form, sort_order: Number(form.sort_order) || 100,
      ship_first: shipVal(form.ship_first), ship_additional: shipVal(form.ship_additional),
      variants: form.variants.map((v) => ({ ...v, price: Number(v.price) || 0, ship_first: shipVal(v.ship_first), ship_additional: shipVal(v.ship_additional) })),
    };
    try {
      if (isNew) await merchAdmin('product:create', { product: payload });
      else {
        let pp = (await merchAdmin('product:save', { id: product.id, product: payload })).printful_prices;
        // Big products are sent to Printful in a few rounds.
        for (let i = 0; i < 8 && pp?.remaining > 0 && (pp.pushed || pp.failed); i++) pp = (await merchAdmin('product:pushPrices', { id: product.id })).printful_prices;
        toast({ title: 'Product saved', description: printfulPriceNote(pp) });
        onSaved();
        return;
      }
      toast({ title: 'Product saved' });
      onSaved();
    } catch (e) { toast({ title: e.message, variant: 'destructive' }); }
    setBusy(false);
  };
  const fetchRates = async () => {
    setRatesBusy(true);
    try {
      const r = await merchAdmin('product:shippingRates', { id: product.id });
      setForm((f) => ({
        ...f,
        ship_auto: true,
        ship_first: r.product.first, ship_additional: r.product.additional,
        variants: f.variants.map((v) => {
          const s = r.sizes[v.size || v.label] || r.sizes['One size'];
          const differs = s && (s.first !== r.product.first || s.additional !== r.product.additional);
          return { ...v, ship_first: differs ? s.first : '', ship_additional: differs ? s.additional : '' };
        }),
      }));
      toast({ title: 'Shipping filled in from Printful', description: `US rates: ${money(r.product.first)} first item, ${money(r.product.additional)} each extra${Object.keys(r.sizes).length > 1 ? '; sizes that cost more have their own' : ''}. Save to keep them.` });
    } catch (e) { toast({ title: e.message, variant: 'destructive' }); }
    setRatesBusy(false);
  };
  // Fills every option's price with its break-even price; nothing is saved
  // until the admin presses Save.
  const priceAtCost = async () => {
    setCostBusy(true);
    try {
      const r = await merchAdmin('product:costPrices', { id: product.id });
      setCosts(r.variants);
      setForm((f) => ({ ...f, variants: f.variants.map((v) => (r.variants[v.key] ? { ...v, price: r.variants[v.key].break_even } : v)) }));
      const list = Object.values(r.variants).map((x) => x.break_even);
      toast({ title: 'Prices set to break even', description: `${money(Math.min(...list))}${Math.max(...list) !== Math.min(...list) ? `–${money(Math.max(...list))}` : ''}: Printful's cost plus Stripe's fee. Save to keep them.` });
    } catch (e) { toast({ title: e.message, variant: 'destructive' }); }
    setCostBusy(false);
  };
  const belowCost = costs ? form.variants.filter((v) => costs[v.key] && Number(v.price) < costs[v.key].break_even && v.available !== false).length : 0;

  const remove = async () => {
    setBusy(true);
    try { await merchAdmin('product:delete', { id: product.id }); toast({ title: 'Product deleted' }); onSaved(); }
    catch (e) { toast({ title: e.message, variant: 'destructive' }); setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add a product you ship yourself' : `Edit ${product.name}`}</DialogTitle>
          <DialogDescription>{manual ? 'You pack and post these yourself; paid orders show up in Orders for you to mark shipped.' : 'Printed and shipped by Printful. Design and options come from Printful; you set the name, description and prices here.'}</DialogDescription>
        </DialogHeader>
        {product.printful_missing && <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-sm p-3 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 text-destructive shrink-0" /> This product was removed from Printful, so it can't be sold. Delete it, or restore it in Printful and sync again.</div>}
        <div className="grid sm:grid-cols-[8rem_1fr] gap-4">
          <div className="space-y-2">
            <div className="aspect-square rounded-lg border border-border bg-white grid place-items-center overflow-hidden">{form.image_url ? <img src={form.image_url} alt="" className="max-w-full max-h-full object-contain" /> : <ShoppingBag className="w-8 h-8 text-zinc-300" />}</div>
            {manual && <label className="flex items-center justify-center gap-1.5 text-xs rounded-md border border-border h-8 cursor-pointer hover:bg-accent">{uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload photo<input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /></label>}
          </div>
          <div className="space-y-3">
            <div><div className={LBL}>Name</div><Input value={form.name} onChange={set('name')} maxLength={120} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><div className={LBL}>Category</div><select value={form.category} onChange={set('category')} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div><div className={LBL}>Sort order (lower shows first)</div><Input type="number" value={form.sort_order} onChange={set('sort_order')} /></div>
            </div>
          </div>
        </div>
        {!manual && (product.images || []).length > 1 && (
          <div><div className={LBL}>Main photo</div><div className="mt-1 flex gap-2 overflow-x-auto scrollbar-thin">{product.images.map((src) => <button key={src} type="button" onClick={() => setForm({ ...form, image_url: src })} className={`shrink-0 w-14 h-14 rounded-md border bg-white p-1 ${form.image_url === src ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}><img src={src} alt="" className="w-full h-full object-contain" /></button>)}</div></div>
        )}
        <div><div className={LBL}>Description</div><Textarea rows={3} value={form.description} onChange={set('description')} maxLength={4000} placeholder="Fabric, fit, print details…" /></div>
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold flex items-center gap-2"><Truck className="w-4 h-4" /> Shipping (US)</div>
            {!manual && <Button type="button" variant="outline" size="sm" onClick={fetchRates} disabled={ratesBusy || !printfulConfigured} title={printfulConfigured ? '' : 'Connect Printful first'}>{ratesBusy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />} Get rates from Printful</Button>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className={LBL}>First item ($)</div><Input type="number" step="0.01" min="0" value={form.ship_first} onChange={setShip('ship_first')} placeholder={`Store default ${money(settings?.shipping_flat_rate)}`} /></div>
            <div><div className={LBL}>Each additional ($)</div><Input type="number" step="0.01" min="0" value={form.ship_additional} onChange={setShip('ship_additional')} placeholder={`Store default ${money(settings?.shipping_additional_item ?? 2.5)}`} /></div>
          </div>
          {!manual && (
            <label className="flex items-start gap-3 text-sm"><Switch checked={!!form.ship_auto} onCheckedChange={(v) => setForm({ ...form, ship_auto: v })} className="mt-0.5" aria-label="Update shipping daily from Printful" /><span><span className="font-medium">Update daily from Printful</span><span className="block text-xs text-muted-foreground">{form.ship_auto ? `Every day these follow Printful's current US rates, per size.${product.ship_rates_updated_at ? ` Last updated ${new Date(product.ship_rates_updated_at).toLocaleString()}.` : ' First update within a few hours, or press Update now in the Printful tab.'}` : 'Off: your own rates stay as typed. Typing a rate turns this off; "Get rates from Printful" turns it back on.'}</span></span></label>
          )}
          <p className="text-xs text-muted-foreground">Leave empty to use the store default. A size that ships for more (set below) overrides these.</p>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div className={LBL}>Options, prices and size-specific shipping</div>
            {!manual && !isNew && <Button type="button" variant="outline" size="sm" onClick={priceAtCost} disabled={costBusy || !printfulConfigured} title={printfulConfigured ? "Set each price to Printful's cost plus Stripe's fee" : 'Connect Printful first'}>{costBusy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Calculator className="w-4 h-4 mr-1.5" />} Price at cost</Button>}
          </div>
          <div className="hidden sm:flex items-center gap-2 px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground"><span className="flex-1">Option</span><span className="w-24">Price</span><span className="w-[4.5rem]">Ship 1st</span><span className="w-[4.5rem]">Each extra</span><span className="w-24">Status</span>{manual && <span className="w-8" />}</div>
          <div className="rounded-lg border border-border divide-y divide-border">
            {form.variants.map((v, i) => (
              <div key={v.key || i} className="flex items-center gap-2 p-2">
                {manual ? <Input className="h-8 flex-1" value={v.label} onChange={(e) => setVariant(i, { label: e.target.value })} placeholder="Option, e.g. One size" /> : <div className="flex-1 min-w-0 text-sm"><div className="truncate">{v.label}{v.sku ? <span className="text-xs text-muted-foreground"> · {v.sku}</span> : null}</div>{costs?.[v.key] && <div className={`text-[11px] ${Number(v.price) < costs[v.key].break_even ? 'text-destructive' : 'text-muted-foreground'}`}>Printful cost {money(costs[v.key].cost)} · break-even {money(costs[v.key].break_even)}</div>}</div>}
                <div className="relative w-24"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><Input className="h-8 pl-5" type="number" step="0.01" min="0" value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} aria-label={`Price for ${v.label}`} /></div>
                <Input className="h-8 w-[4.5rem] px-2" type="number" step="0.01" min="0" value={v.ship_first} onChange={(e) => setVariantShip(i, { ship_first: e.target.value })} placeholder={form.ship_first !== '' ? String(form.ship_first) : '—'} aria-label={`First-item shipping for ${v.label}`} title="Shipping as the first item (empty = product's)" />
                <Input className="h-8 w-[4.5rem] px-2" type="number" step="0.01" min="0" value={v.ship_additional} onChange={(e) => setVariantShip(i, { ship_additional: e.target.value })} placeholder={form.ship_additional !== '' ? String(form.ship_additional) : '—'} aria-label={`Additional-item shipping for ${v.label}`} title="Shipping as an extra item (empty = product's)" />
                <label className="flex items-center gap-1.5 text-xs w-24 shrink-0"><Switch checked={v.available !== false} onCheckedChange={(c) => setVariant(i, { available: c })} /> {v.available !== false ? 'For sale' : 'Off'}</label>
                {manual && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })} aria-label="Remove option"><Trash2 className="w-4 h-4" /></Button>}
              </div>
            ))}
          </div>
          {manual && <Button variant="ghost" size="sm" className="mt-1" onClick={() => setForm({ ...form, variants: [...form.variants, { label: '', price: '' }] })}><Plus className="w-4 h-4 mr-1" /> Add option</Button>}
          {costs && <p className="mt-1.5 text-xs text-muted-foreground">Break-even = what Printful charges you to make it, plus Stripe's 2.9% + 30¢ on the item and its shipping. Charge more to make a profit.{belowCost ? <span className="text-destructive"> {belowCost} option(s) are below break-even and would lose money.</span> : null}</p>}
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={set('active')} /> Show on the Merch page</label>
          <label className="flex items-center gap-2"><Switch checked={form.featured} onCheckedChange={set('featured')} /> Featured</label>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {!isNew ? <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}><Trash2 className="w-4 h-4 mr-1.5" /> Delete</Button> : <span />}
          <div className="flex gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy || uploading}>{busy ? 'Saving…' : 'Save'}</Button></div>
        </DialogFooter>
        <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${product.name}?`} description={manual ? 'It disappears from the Merch page. Past orders keep their details.' : 'It disappears from the Merch page. Syncing from Printful again brings it back, hidden.'} confirmLabel="Delete" destructive loading={busy} onConfirm={remove} />
      </DialogContent>
    </Dialog>
  );
}
