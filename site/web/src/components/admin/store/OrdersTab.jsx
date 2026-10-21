import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Send, Truck, Undo2, AlertTriangle, ShoppingBag, DollarSign, Inbox } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loading, EmptyState, StatCard, ConfirmDialog, formatDateTime } from '@/components/admin/parts';
import OrderSummary, { OrderStatusBadge } from '@/components/store/OrderSummary';
import { money } from '@/lib/merch';
import { merchAdmin } from './api';

const NEEDS_ACTION = (o) => o.status === 'needs_attention' || o.status === 'on_hold' || (o.has_manual_items && ['paid', 'submitted', 'in_production', 'partially_shipped'].includes(o.status) && !(o.shipments || []).some((s) => s.note === 'manual'));
const FILTERS = [
  { key: 'action', label: 'Needs action', test: NEEDS_ACTION },
  { key: 'open', label: 'In progress', test: (o) => ['paid', 'submitted', 'in_production', 'on_hold', 'partially_shipped', 'needs_attention'].includes(o.status) },
  { key: 'all', label: 'All orders', test: (o) => !['pending_payment', 'abandoned'].includes(o.status) },
  { key: 'unfinished', label: 'Unfinished checkouts', test: (o) => ['pending_payment', 'abandoned'].includes(o.status) },
];

export default function OrdersTab() {
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const load = () => base44.entities.MerchOrder.list('-created_date', 300).then((r) => setOrders(r || [])).catch(() => setOrders([]));
  useEffect(() => { load(); }, []);

  const paid = useMemo(() => (orders || []).filter((o) => !['pending_payment', 'abandoned', 'canceled', 'refunded'].includes(o.status)), [orders]);
  const revenue = paid.reduce((t, o) => t + Number(o.total || 0), 0);
  const actionCount = (orders || []).filter(NEEDS_ACTION).length;
  const shown = (orders || []).filter(FILTERS.find((f) => f.key === filter).test);
  const current = (orders || []).find((o) => o.id === openId);

  if (!orders) return <Loading />;
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon={ShoppingBag} label="Paid orders" value={paid.length} />
        <StatCard icon={DollarSign} label="Sales (incl. shipping & tax)" value={money(revenue)} tone="success" />
        <StatCard icon={AlertTriangle} label="Need your attention" value={actionCount} tone={actionCount ? 'warn' : 'muted'} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={`h-8 px-3 rounded-full border text-sm ${filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{f.label}</button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto" onClick={load}><RefreshCw className="w-4 h-4 mr-1.5" /> Reload</Button>
      </div>
      <Card className="overflow-hidden">
        {shown.length === 0 ? <EmptyState icon={Inbox} title="No orders here" description={filter === 'action' ? 'Nothing waiting on you.' : 'Orders appear here once customers check out.'} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr><th className="text-left px-4 py-3">Order</th><th className="text-left px-4 py-3">Customer</th><th className="text-left px-4 py-3">Items</th><th className="text-right px-4 py-3">Total</th><th className="text-left px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(o.id)}>
                    <td className="px-4 py-3"><div className="font-mono font-semibold">{o.order_number || '—'}</div><div className="text-xs text-muted-foreground">{formatDateTime(o.paid_at || o.created_date)}</div></td>
                    <td className="px-4 py-3 max-w-[14rem]"><div className="truncate">{o.name || '—'}</div><div className="text-xs text-muted-foreground truncate">{o.email}</div></td>
                    <td className="px-4 py-3 text-muted-foreground">{(o.items || []).reduce((t, i) => t + i.quantity, 0)} item(s){o.has_manual_items ? ' · ships by you' : ''}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(o.total)}</td>
                    <td className="px-4 py-3"><OrderStatusBadge status={o.status} />{o.error && <AlertTriangle className="inline w-4 h-4 ml-1.5 text-destructive" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {current && <OrderDialog order={current} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

function OrderDialog({ order, onClose, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState('');
  const [ship, setShip] = useState({ carrier: '', tracking_number: '', tracking_url: '', notify: true });
  const [notes, setNotes] = useState(order.admin_notes || '');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const a = order.shipping_address || {};
  const run = async (action, payload, done) => {
    setBusy(action);
    try { const r = await merchAdmin(action, { id: order.id, ...payload }); toast({ title: done(r) }); await onChanged(); }
    catch (e) { toast({ title: e.message, variant: 'destructive' }); }
    setBusy('');
  };
  const canSend = order.has_printful_items && ['paid', 'needs_attention'].includes(order.status) && !order.printful_order_id;
  const canShip = ['paid', 'submitted', 'in_production', 'partially_shipped', 'needs_attention', 'on_hold'].includes(order.status) && (order.has_manual_items || !order.has_printful_items);
  const canCancel = ['paid', 'submitted', 'needs_attention', 'on_hold'].includes(order.status);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap"><span className="font-mono">{order.order_number || order.id}</span> <OrderStatusBadge status={order.status} /></DialogTitle>
          <DialogDescription>{formatDateTime(order.paid_at || order.created_date)}{order.printful_order_id ? ` · Printful #${order.printful_order_id} (${order.printful_status || '—'})` : ''}</DialogDescription>
        </DialogHeader>
        {order.error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-sm p-3 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" /> {order.error}</div>}
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div><div className="text-xs uppercase text-muted-foreground font-semibold mb-1">Customer</div><div>{order.name || '—'}</div><div className="text-muted-foreground break-all">{order.email}</div>{order.phone && <div className="text-muted-foreground">{order.phone}</div>}{order.user_id ? <div className="text-xs text-muted-foreground mt-1">Signed-in member</div> : <div className="text-xs text-muted-foreground mt-1">Guest checkout</div>}</div>
          <div><div className="text-xs uppercase text-muted-foreground font-semibold mb-1">Ship to</div><div className="whitespace-pre-line">{[a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country].filter(Boolean).join('\n') || '—'}</div></div>
        </div>
        <OrderSummary order={order} />
        <div className="flex flex-wrap gap-2">
          {canSend && <Button size="sm" disabled={!!busy} onClick={() => run('order:submit', {}, (r) => `Sent to Printful (${r.status})`)}><Send className="w-4 h-4 mr-1.5" /> Send to Printful</Button>}
          {order.printful_order_id && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('order:refresh', {}, (r) => `Updated: ${r.status}`)}><RefreshCw className="w-4 h-4 mr-1.5" /> Refresh from Printful</Button>}
          {canCancel && <Button size="sm" variant="outline" className="text-destructive" disabled={!!busy} onClick={() => setConfirmCancel(true)}><Undo2 className="w-4 h-4 mr-1.5" /> Cancel &amp; refund</Button>}
        </div>
        {canShip && (
          <div className="rounded-xl border border-border p-3 space-y-2">
            <div className="text-sm font-semibold flex items-center gap-2"><Truck className="w-4 h-4" /> Mark items you shipped yourself</div>
            <div className="grid sm:grid-cols-3 gap-2">
              <Input placeholder="Carrier (USPS…)" value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} />
              <Input placeholder="Tracking number" value={ship.tracking_number} onChange={(e) => setShip({ ...ship, tracking_number: e.target.value })} />
              <Input placeholder="Tracking link (optional)" value={ship.tracking_url} onChange={(e) => setShip({ ...ship, tracking_url: e.target.value })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={ship.notify} onChange={(e) => setShip({ ...ship, notify: e.target.checked })} /> Email the customer</label>
              <Button size="sm" disabled={!!busy} onClick={() => run('order:ship', ship, () => 'Marked shipped')}>Mark shipped</Button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <div className="text-xs uppercase text-muted-foreground font-semibold">Admin notes</div>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only admins see this" />
          <div className="flex justify-end"><Button size="sm" variant="outline" disabled={!!busy || notes === (order.admin_notes || '')} onClick={() => run('order:note', { admin_notes: notes }, () => 'Notes saved')}>Save notes</Button></div>
        </div>
        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          title={`Cancel ${order.order_number} and refund ${money(order.total)}?`}
          description={order.printful_order_id ? 'The Printful order is canceled first (only possible before printing starts), then the full amount is refunded through Stripe.' : 'The full amount is refunded through Stripe.'}
          confirmLabel="Cancel and refund"
          destructive
          loading={busy === 'order:cancel'}
          onConfirm={async () => { await run('order:cancel', { refund: true }, (r) => (r.status === 'refunded' ? 'Canceled and refunded' : 'Canceled')); setConfirmCancel(false); }}
        />
      </DialogContent>
    </Dialog>
  );
}
