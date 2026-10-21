import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ShoppingBag } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/merch';
import OrderSummary, { OrderStatusBadge } from '@/components/store/OrderSummary';

export default function StoreThanks() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id') || '';
  const { user } = useAuth();
  const cart = useCart();
  const [order, setOrder] = useState(null);
  const [missing, setMissing] = useState(false);

  // Paying sends you here at once; Stripe's webhook can land a few seconds
  // later, so poll briefly until the order shows as paid.
  useEffect(() => {
    cart.clear();
    let alive = true;
    let tries = 0;
    const load = async () => {
      tries++;
      try {
        const res = await base44.functions.invoke('merch-order-status', { session_id: sessionId });
        if (!alive) return;
        const o = res?.data?.order;
        if (o) setOrder(o);
        if (o && o.status === 'pending_payment' && tries < 8) setTimeout(load, 2500);
      } catch {
        if (alive) setMissing(true);
      }
    };
    if (sessionId) load(); else setMissing(true);
    return () => { alive = false; };
  }, [sessionId]);

  return (
    <div className="max-w-xl mx-auto px-5 py-10">
      <div className="text-center">
        <div className="mx-auto w-14 h-14 rounded-full grid place-items-center bg-success/15 text-success mb-4"><CheckCircle2 className="w-8 h-8" /></div>
        <h1 className="text-2xl font-heading font-bold">Thanks for your order!</h1>
        {order ? (
          <p className="mt-2 text-muted-foreground">Order <span className="font-mono font-semibold text-foreground">{order.order_number}</span> · <OrderStatusBadge status={order.status} /></p>
        ) : !missing ? (
          <p className="mt-2 text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading your order…</p>
        ) : (
          <p className="mt-2 text-muted-foreground">Your payment went through. You'll get a confirmation email shortly.</p>
        )}
      </div>
      {order && (
        <div className="mt-8 space-y-5">
          <OrderSummary order={order} />
          <p className="text-sm text-muted-foreground">
            We've emailed your receipt. Your items are printed to order and usually ship within 2–7 business days{order.ship_to ? ` to ${order.ship_to}` : ''}. We'll email tracking when they're on the way.
          </p>
        </div>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/merch"><Button variant="outline"><ShoppingBag className="w-4 h-4 mr-2" /> Back to Merch</Button></Link>
        {user && <Link to="/merch/orders"><Button>My orders</Button></Link>}
      </div>
    </div>
  );
}
