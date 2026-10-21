import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShoppingBag, Truck, BadgePercent, Eye, PackageCheck, Mail, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isAdminRole } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import ProductDialog from '@/components/store/ProductDialog';
import CartSheet from '@/components/store/CartSheet';
import { useMerchSettings, useCart, money, memberPrice, discountFor, shippingNote } from '@/lib/merch';
import Linkify from '@/components/shared/Linkify';

export default function Store() {
  const { user } = useAuth();
  const settings = useMerchSettings();
  const cart = useCart();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState(null);
  const [category, setCategory] = useState('All');
  const [open, setOpen] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const admin = isAdminRole(user);
  const discountPct = discountFor(user, settings);

  useEffect(() => {
    base44.entities.MerchProduct.filter({ active: true }, 'sort_order', 200)
      .then((rows) => setProducts((rows || []).filter((p) => p.active)))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (params.get('canceled')) {
      toast({ title: 'Checkout canceled', description: 'Your cart is still here when you\'re ready.' });
      params.delete('canceled');
      setParams(params, { replace: true });
    }
    // The cart icon in the site header links here with ?cart=1.
    if (params.get('cart')) {
      setCartOpen(true);
      params.delete('cart');
      setParams(params, { replace: true });
    }
  }, [params, setParams, toast]);

  const sorted = useMemo(() => [...(products || [])].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.name.localeCompare(b.name)), [products]);
  const categories = useMemo(() => ['All', ...new Set(sorted.map((p) => p.category || 'Other'))], [sorted]);
  const shown = category === 'All' ? sorted : sorted.filter((p) => (p.category || 'Other') === category);

  if (!settings) return <div className="p-10 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!settings.enabled && !admin) {
    return (
      <div className="max-w-xl mx-auto px-5 py-20 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl grid place-items-center bg-primary/10 text-primary mb-4"><ShoppingBag className="w-7 h-7" /></div>
        <h1 className="text-2xl font-heading font-bold">Merch is coming soon</h1>
        <p className="mt-2 text-muted-foreground">Repeater Nation shirts, hats and stickers are on the way. Check back soon.</p>
      </div>
    );
  }

  const addToCart = (product, variant, qty) => {
    cart.add(product.id, variant.key, qty);
    setOpen(null);
    setCartOpen(true); // the opening cart is the confirmation; a toast here would cover Checkout
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {!settings.enabled && (
        <div className="mb-5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm flex items-start gap-3">
          <Eye className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
          <div><span className="font-semibold">Preview.</span> Merch is switched off, so only admins can see this page. Test orders work. Open it to everyone in <Link to="/admin/merch" className="underline font-medium">Admin → Merch</Link>.</div>
        </div>
      )}

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-navy-light text-white px-6 py-8 sm:px-10 sm:py-10">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-end gap-5">
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-[0.16em] text-white/60 font-semibold">Official merch</div>
            <h1 className="mt-1 text-3xl sm:text-4xl font-heading font-bold">{settings.store_name}</h1>
            {settings.tagline && <p className="mt-2 text-white/70 max-w-xl">{settings.tagline}</p>}
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {settings.show_shipping_badge !== false && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1"><Truck className="w-3.5 h-3.5" /> {shippingNote(settings, products)}</span>}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1"><PackageCheck className="w-3.5 h-3.5" /> Printed to order</span>
              {Number(settings.member_discount_percent) > 0 && settings.show_member_badge !== false && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/90 text-primary-foreground px-3 py-1 font-semibold"><BadgePercent className="w-3.5 h-3.5" /> {discountPct ? `Your member price: ${discountPct}% off` : `${settings.member_discount_percent}% off for verified operators`}</span>
              )}
            </div>
          </div>
          <Button size="lg" className="h-12 shrink-0" onClick={() => setCartOpen(true)}>
            <ShoppingBag className="w-4 h-4 mr-2" /> Cart{cart.count ? ` (${cart.count})` : ''}
          </Button>
        </div>
      </div>

      {categories.length > 2 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)} className={`h-8 px-3.5 rounded-full border text-sm ${c === category ? 'border-primary bg-primary text-primary-foreground font-semibold' : 'border-border text-muted-foreground hover:text-foreground'}`}>{c}</button>
          ))}
        </div>
      )}

      {products === null ? (
        <div className="py-16 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <div className="font-medium text-foreground">No products yet</div>
          <div className="text-sm mt-1">{admin ? <>Add or sync products in <Link to="/admin/merch" className="underline">Admin → Merch</Link>, then switch them on.</> : 'Check back soon.'}</div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {shown.map((p) => {
            const anyAvail = (p.variants || []).some((v) => v.available !== false && Number(v.price) > 0);
            const many = new Set((p.variants || []).map((v) => v.price)).size > 1;
            return (
              <button key={p.id} type="button" onClick={() => setOpen(p)} className="group text-left rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <div className="relative aspect-square bg-white grid place-items-center p-3">
                  {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" className="max-h-full max-w-full object-contain transition-transform group-hover:scale-[1.03]" /> : <ShoppingBag className="w-10 h-10 text-zinc-300" />}
                  {p.featured && <span className="absolute top-2 left-2 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">Featured</span>}
                  {!anyAvail && <span className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-xs font-semibold text-center py-1.5">Sold out</span>}
                </div>
                <div className="p-3 sm:p-4">
                  <div className="font-semibold text-sm sm:text-base leading-snug line-clamp-2">{p.name}</div>
                  <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
                    <span className="font-bold">{many ? 'From ' : ''}{money(memberPrice(p.price_from, discountPct))}</span>
                    {discountPct > 0 && <span className="text-xs line-through text-muted-foreground">{money(p.price_from)}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-10 grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border p-5">
          <h2 className="font-heading font-semibold flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> Shipping &amp; returns</h2>
          <p className="mt-2 text-sm text-muted-foreground">Items are printed when you order and usually ship within 2–7 business days.{settings.show_shipping_details !== false ? <> Shipping is charged per item like the printer charges it: the first item at its full rate, each extra item for less (bigger items like hoodies cost more to ship){Number(settings.free_shipping_over) > 0 ? `, and it's free over ${money(settings.free_shipping_over)}` : ''}.</> : null} Ships to {settings.ship_countries.join(', ')}.</p>
          {settings.returns_policy && <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line"><Linkify text={settings.returns_policy} /></p>}
        </div>
        <div className="rounded-2xl border border-border p-5">
          <h2 className="font-heading font-semibold flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Questions about an order?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {settings.contact_email ? <>Email <a href={`mailto:${settings.contact_email}`} className="underline">{settings.contact_email}</a> with your order number (it starts with RN-).</> : 'Contact us from the Contact page with your order number (it starts with RN-).'}
            {user ? <> You can also see your orders and tracking in <Link to="/merch/orders" className="underline">My orders</Link>.</> : null}
          </p>
        </div>
      </div>

      <ProductDialog product={open} open={!!open} onOpenChange={(v) => !v && setOpen(null)} discountPct={discountPct} settings={settings} onAdd={addToCart} />
      <CartSheet open={cartOpen} onOpenChange={setCartOpen} cart={cart} products={products} settings={settings} discountPct={discountPct} canCheckout={settings.enabled || admin} />
    </div>
  );
}
