import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2, Loader2, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { money, memberPrice, shippingFor } from '@/lib/merch';
import { errMsg } from '@/lib/utils';

export default function CartSheet({ open, onOpenChange, cart, products, settings, discountPct, canCheckout }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const byId = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);

  const lines = cart.items.map((i) => {
    const p = byId.get(i.product_id);
    const v = p?.variants?.find((x) => x.key === i.variant_key);
    return { ...i, product: p, variant: v, ok: !!(p && v && v.available !== false && Number(v.price) > 0) };
  });
  const good = lines.filter((l) => l.ok);
  const list = good.reduce((t, l) => t + l.variant.price * l.quantity, 0);
  const afterDiscount = good.reduce((t, l) => t + memberPrice(l.variant.price, discountPct) * l.quantity, 0);
  const shipping = shippingFor(good, afterDiscount, settings);
  const hasBad = lines.some((l) => !l.ok);

  const checkout = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await base44.functions.invoke('merch-checkout', { items: good.map(({ product_id, variant_key, quantity }) => ({ product_id, variant_key, quantity })) });
      if (res?.data?.url) { window.location.assign(res.data.url); return; }
      setError(res?.data?.error || 'Could not start checkout.');
    } catch (e) {
      setError(errMsg(e) || e?.message || 'Could not start checkout.');
    }
    setBusy(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="p-5 border-b border-border text-left">
          <SheetTitle className="flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-primary" /> Your cart</SheetTitle>
          <SheetDescription>{cart.count ? `${cart.count} item${cart.count === 1 ? '' : 's'}` : 'Nothing here yet.'}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border">
          {lines.map((l) => (
            <div key={`${l.product_id}|${l.variant_key}`} className="flex gap-3 p-4">
              <div className="w-16 h-16 rounded-md bg-white border border-border shrink-0 grid place-items-center overflow-hidden">
                {l.variant?.image_url || l.product?.image_url ? <img src={l.variant?.image_url || l.product?.image_url} alt="" className="w-full h-full object-contain" /> : <ShoppingBag className="w-6 h-6 text-zinc-300" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{l.product?.name || 'Item'}</div>
                <div className="text-xs text-muted-foreground truncate">{l.variant?.label || ''}</div>
                {l.ok ? (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center rounded-md border border-border">
                      <button type="button" className="w-7 h-7 grid place-items-center hover:bg-accent rounded-l-md" onClick={() => cart.setQty(l.product_id, l.variant_key, l.quantity - 1)} aria-label="One fewer"><Minus className="w-3.5 h-3.5" /></button>
                      <span className="w-7 text-center text-xs font-semibold tabular-nums">{l.quantity}</span>
                      <button type="button" className="w-7 h-7 grid place-items-center hover:bg-accent rounded-r-md" onClick={() => cart.setQty(l.product_id, l.variant_key, l.quantity + 1)} aria-label="One more"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => cart.remove(l.product_id, l.variant_key)} aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-destructive flex items-center gap-2">No longer available <button type="button" className="underline" onClick={() => cart.remove(l.product_id, l.variant_key)}>Remove</button></div>
                )}
              </div>
              {l.ok && <div className="text-sm font-semibold tabular-nums whitespace-nowrap">{money(memberPrice(l.variant.price, discountPct) * l.quantity)}</div>}
            </div>
          ))}
        </div>

        <div className="border-t border-border p-5 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{money(list)}</span></div>
          {discountPct > 0 && good.length > 0 && <div className="flex justify-between text-primary"><span>Member discount ({discountPct}%)</span><span className="tabular-nums">−{money(list - afterDiscount)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="tabular-nums">{good.length ? (shipping ? money(shipping) : Number(settings?.free_shipping_over) > 0 && afterDiscount >= Number(settings.free_shipping_over) ? `Free (over ${money(settings.free_shipping_over)})` : 'Free') : '—'}</span></div>
          {settings?.collect_tax && settings.show_tax_note !== false && <div className="text-xs text-muted-foreground">Sales tax is added at checkout.</div>}
          <div className="flex justify-between font-semibold text-base pt-1"><span>Total</span><span className="tabular-nums">{money(afterDiscount + shipping)}</span></div>
          {error && <div className="text-xs text-destructive">{error}</div>}
          <Button className="w-full h-11 mt-2" disabled={!good.length || hasBad || busy || !canCheckout} onClick={checkout}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />} Checkout
          </Button>
          {hasBad && <div className="text-xs text-destructive">Remove unavailable items to continue.</div>}
          <p className="text-[11px] text-muted-foreground text-center">You'll enter your shipping address on Stripe's secure checkout page.{discountPct === 0 && Number(settings?.member_discount_percent) > 0 ? <> Verified operators get {settings.member_discount_percent}% off — <Link to="/login" className="underline">sign in</Link>.</> : null}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
