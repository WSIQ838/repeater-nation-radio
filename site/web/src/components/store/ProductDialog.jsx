import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { money, memberPrice, shipRates } from '@/lib/merch';
import Linkify from '@/components/shared/Linkify';

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL', '5XL'];
const sizeRank = (s) => { const i = SIZE_ORDER.indexOf(String(s).toUpperCase()); return i === -1 ? 99 : i; };
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

export default function ProductDialog({ product, open, onOpenChange, discountPct = 0, settings, onAdd }) {
  const variants = useMemo(() => (product?.variants || []).filter((v) => Number(v.price) > 0), [product]);
  const colors = useMemo(() => uniq(variants.map((v) => v.color)), [variants]);
  const [color, setColor] = useState('');
  const [key, setKey] = useState('');
  const [qty, setQty] = useState(1);
  const [image, setImage] = useState('');

  useEffect(() => {
    if (!product) return;
    const first = variants.find((v) => v.available !== false) || variants[0];
    setColor(first?.color || '');
    setKey(first?.key || '');
    setQty(1);
    setImage('');
  }, [product, variants]);

  const forColor = colors.length ? variants.filter((v) => v.color === color) : variants;
  const sized = forColor.some((v) => v.size) ? [...forColor].sort((a, b) => sizeRank(a.size) - sizeRank(b.size)) : forColor;
  const selected = variants.find((v) => v.key === key);
  const unit = selected ? memberPrice(selected.price, discountPct) : 0;
  const shown = image || selected?.image_url || product?.image_url || '';
  const gallery = uniq([product?.image_url, ...(product?.images || [])]).slice(0, 8);

  const pickColor = (c) => {
    setColor(c);
    setImage('');
    const same = variants.filter((v) => v.color === c);
    const keep = same.find((v) => v.size && v.size === selected?.size && v.available !== false);
    setKey((keep || same.find((v) => v.available !== false) || same[0])?.key || '');
  };

  if (!product) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <div className="grid md:grid-cols-2">
          <div className="bg-white p-4 sm:p-6">
            <div className="aspect-square grid place-items-center">
              {shown ? <img src={shown} alt={`${product.name}${selected ? ` — ${selected.label}` : ''}`} className="max-h-full max-w-full object-contain" /> : <ShoppingBag className="w-16 h-16 text-zinc-300" />}
            </div>
            {gallery.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-thin">
                {gallery.map((src) => (
                  <button key={src} type="button" onClick={() => setImage(src)} className={`shrink-0 w-14 h-14 rounded-md border bg-white p-1 ${shown === src ? 'border-primary ring-2 ring-primary/30' : 'border-zinc-200'}`} aria-label="Show this photo">
                    <img src={src} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-5 sm:p-6 flex flex-col gap-4 min-w-0">
            <DialogHeader className="text-left space-y-1">
              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{product.category}</div>
              <DialogTitle className="text-xl font-heading">{product.name}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex items-baseline gap-2 pt-1">
                  <span className="text-2xl font-bold text-foreground">{money(unit)}</span>
                  {discountPct > 0 && selected && <span className="text-sm line-through text-muted-foreground">{money(selected.price)}</span>}
                  {discountPct > 0 && <span className="text-xs font-medium text-primary">Member price</span>}
                </div>
              </DialogDescription>
            </DialogHeader>

            {product.description && <p className="text-sm text-muted-foreground whitespace-pre-line"><Linkify text={product.description} /></p>}
            {selected && settings && settings.show_product_shipping !== false && (() => {
              const r = shipRates(product, selected, settings);
              return <p className="text-xs text-muted-foreground">Shipping {money(r.first)}{r.additional !== r.first ? `, or ${money(r.additional)} as an extra item in a bigger order` : ''}.</p>;
            })()}

            {colors.length > 1 && (
              <div>
                <div className="text-xs font-semibold mb-2">Color: <span className="font-normal text-muted-foreground">{color}</span></div>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <button key={c} type="button" onClick={() => pickColor(c)} className={`px-3 h-8 rounded-full border text-xs ${c === color ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border hover:border-foreground/40'}`}>{c}</button>
                  ))}
                </div>
              </div>
            )}

            {sized.length > 1 && (
              <div>
                <div className="text-xs font-semibold mb-2">{sized.some((v) => v.size) ? 'Size' : 'Option'}</div>
                <div className="flex flex-wrap gap-2">
                  {sized.map((v) => {
                    const off = v.available === false;
                    return (
                      <button key={v.key} type="button" disabled={off} onClick={() => { setKey(v.key); setImage(''); }}
                        className={`min-w-[3rem] px-3 h-9 rounded-md border text-sm ${v.key === key ? 'border-primary bg-primary text-primary-foreground font-semibold' : 'border-border hover:border-foreground/40'} ${off ? 'opacity-40 line-through cursor-not-allowed' : ''}`}
                        title={off ? 'Sold out' : undefined}>
                        {v.size || v.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 mt-auto pt-2">
              <div className="flex items-center rounded-md border border-border">
                <Button type="button" variant="ghost" size="icon" className="h-10 w-10" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="One fewer"><Minus className="w-4 h-4" /></Button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{qty}</span>
                <Button type="button" variant="ghost" size="icon" className="h-10 w-10" onClick={() => setQty((q) => Math.min(10, q + 1))} aria-label="One more"><Plus className="w-4 h-4" /></Button>
              </div>
              <Button type="button" className="flex-1 h-10" disabled={!selected || selected.available === false} onClick={() => onAdd?.(product, selected, qty)}>
                <ShoppingBag className="w-4 h-4 mr-2" /> {selected?.available === false ? 'Sold out' : 'Add to cart'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
