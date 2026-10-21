import { ShoppingBag, ExternalLink } from 'lucide-react';
import { money, ORDER_STATUS } from '@/lib/merch';

const TONES = {
  muted: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warn: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
};

export function OrderStatusBadge({ status }) {
  const s = ORDER_STATUS[status] || { label: status, tone: 'muted' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[s.tone] || TONES.muted}`}>{s.label}</span>;
}

export default function OrderSummary({ order }) {
  return (
    <div className="space-y-4">
      <div className="divide-y divide-border rounded-xl border border-border">
        {(order.items || []).map((i, idx) => (
          <div key={idx} className="flex items-center gap-3 p-3">
            <div className="w-12 h-12 rounded-md bg-white border border-border shrink-0 grid place-items-center overflow-hidden">
              {i.image_url ? <img src={i.image_url} alt="" className="w-full h-full object-contain" /> : <ShoppingBag className="w-5 h-5 text-zinc-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{i.product_name}</div>
              <div className="text-xs text-muted-foreground">{[i.variant_label, `Qty ${i.quantity}`].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="text-sm tabular-nums">{money(i.unit_price * i.quantity)}</div>
          </div>
        ))}
      </div>
      <div className="text-sm space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{money(order.subtotal)}</span></div>
        {order.discount > 0 && <div className="flex justify-between text-primary"><span>Member discount</span><span className="tabular-nums">−{money(order.discount)}</span></div>}
        <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="tabular-nums">{order.shipping ? money(order.shipping) : 'Free'}</span></div>
        {order.tax > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{money(order.tax)}</span></div>}
        <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{money(order.total)}</span></div>
      </div>
      {order.shipments?.length > 0 && (
        <div className="rounded-xl bg-success/10 border border-success/30 p-3 text-sm space-y-1">
          <div className="font-semibold">Tracking</div>
          {order.shipments.map((s, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <span>{[s.carrier, s.tracking_number].filter(Boolean).join(' · ') || 'Shipped'}</span>
              {s.tracking_url && <a href={s.tracking_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">Track <ExternalLink className="w-3 h-3" /></a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
