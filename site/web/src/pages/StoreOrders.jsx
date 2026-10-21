import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Package, ShoppingBag } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import OrderSummary, { OrderStatusBadge } from '@/components/store/OrderSummary';

export default function StoreOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    base44.entities.MerchOrder.filter({ user_id: user.id }, '-created_date', 100)
      .then((rows) => setOrders((rows || []).filter((o) => !['pending_payment', 'abandoned'].includes(o.status))))
      .catch(() => setOrders([]));
  }, [user?.id]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-5 py-16 text-center">
        <h1 className="text-2xl font-heading font-bold">My orders</h1>
        <p className="mt-2 text-muted-foreground">Sign in to see orders placed with your account. Orders placed without signing in are in your email.</p>
        <Link to="/login"><Button className="mt-5">Sign in</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2"><Package className="w-6 h-6 text-primary" /> My orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Merch orders placed while signed in to this account.</p>
        </div>
        <Link to="/merch"><Button variant="outline"><ShoppingBag className="w-4 h-4 mr-2" /> Merch</Button></Link>
      </div>
      {orders === null ? (
        <div className="py-12 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : orders.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No orders yet.</div>
      ) : (
        <div className="space-y-5">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-border p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <div className="font-mono font-semibold">{o.order_number}</div>
                  <div className="text-xs text-muted-foreground">{new Date(o.paid_at || o.created_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                </div>
                <OrderStatusBadge status={o.status} />
              </div>
              <OrderSummary order={o} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
