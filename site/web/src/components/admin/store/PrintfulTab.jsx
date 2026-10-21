import { useState } from 'react';
import { CheckCircle2, XCircle, Webhook, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { merchAdmin } from './api';

function Row({ ok, title, children }) {
  return (
    <div className="flex items-start gap-3 py-3">
      {ok ? <CheckCircle2 className="w-5 h-5 text-success shrink-0" /> : <XCircle className="w-5 h-5 text-muted-foreground shrink-0" />}
      <div className="min-w-0"><div className="font-medium text-sm">{title}</div><div className="text-sm text-muted-foreground">{children}</div></div>
    </div>
  );
}

export default function PrintfulTab({ status, onRefresh }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [ratesBusy, setRatesBusy] = useState(false);
  const pf = status?.printful || {};
  const rates = status?.rates || {};
  // Same job the daily schedule runs, done now. Repeats with the same start
  // time until every product is done (each call does a share of them).
  const updateRates = async () => {
    setRatesBusy(true);
    try {
      let r = await merchAdmin('rates:refresh');
      for (let i = 0; i < 8 && r.remaining && !r.rate_limited; i++) r = await merchAdmin('rates:refresh', { started_at: r.started_at });
      toast({ title: 'Shipping rates updated', description: r.summary });
      onRefresh();
    } catch (e) { toast({ title: e.message, variant: 'destructive' }); }
    setRatesBusy(false);
  };
  const setupWebhook = async () => {
    setBusy(true);
    try { await merchAdmin('webhook:setup'); toast({ title: 'Shipping updates are on', description: 'Printful will tell the site when orders ship, and buyers get tracking emails.' }); onRefresh(); }
    catch (e) { toast({ title: e.message, variant: 'destructive' }); }
    setBusy(false);
  };
  return (
    <div className="space-y-5">
      <Card className="p-5 divide-y divide-border">
        <Row ok={!!status?.stripe_configured} title="Stripe payments">{status?.stripe_configured ? 'Connected — the same Stripe account as donations.' : 'STRIPE_SECRET_KEY is missing.'}</Row>
        <Row ok={pf.configured && pf.ok} title="Printful connection">
          {!pf.configured ? 'Not connected. Follow the steps below.' : pf.ok ? `Connected · ${pf.product_count} product(s) in your Printful store.` : `The key didn't work: ${pf.error}`}
        </Row>
        <Row ok={pf.webhook?.ours} title="Shipping updates from Printful">
          {!pf.configured ? 'Available once Printful is connected.' : pf.webhook?.ours ? 'On — orders update automatically and buyers get tracking emails.' : (
            <span className="flex flex-col items-start gap-2">
              <span>{pf.webhook?.set ? 'Printful is sending updates somewhere else.' : 'Off.'} Turn this on so tracking reaches your customers.</span>
              <Button size="sm" onClick={setupWebhook} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Webhook className="w-4 h-4 mr-1.5" />} Turn on shipping updates</Button>
            </span>
          )}
        </Row>
        <Row ok={!!pf.can_edit_products} title="Prices copied to Printful">
          {!pf.configured ? 'Available once Printful is connected.' : pf.can_edit_products ? 'On — when you change a price here, it changes on Printful too.' : pf.scopes === null ? "Couldn't check your token's permissions." : (
            <span>Off — your token can only read products, so prices change on this site only (checkout is unaffected). To turn it on, create a new token at <a className="underline" href="https://developers.printful.com/" target="_blank" rel="noopener noreferrer">developers.printful.com</a> for the same store with <b>View and manage store products</b> (<code className="px-1 rounded bg-muted">sync_products</code>), orders and webhooks, then replace the <code className="px-1 rounded bg-muted">PRINTFUL_API_KEY</code> secret.</span>
          )}
        </Row>
        <Row ok={pf.configured && !!rates.refreshed_at} title="Shipping rates from Printful">
          {!pf.configured ? 'Available once Printful is connected.' : (
            <span className="flex flex-col items-start gap-2">
              <span>Updated every day to Printful's current US rates{rates.manual ? `, except ${rates.manual} product(s) where you typed your own` : ''}. {rates.refreshed_at ? `Last update ${new Date(rates.refreshed_at).toLocaleString()}: ${rates.summary}` : 'Not run yet.'}</span>
              <Button size="sm" variant="outline" onClick={updateRates} disabled={ratesBusy}>{ratesBusy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />} Update now</Button>
            </span>
          )}
        </Row>
      </Card>
      {!pf.configured && (
        <Card className="p-5 text-sm space-y-2">
          <h3 className="font-semibold">Connect Printful</h3>
          <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
            <li>Sign in at <a className="underline" href="https://www.printful.com" target="_blank" rel="noopener noreferrer">printful.com</a>, go to <b>Stores → Add store</b> and pick <b>Manual order platform / API</b>.</li>
            <li>Design your products in that store and set their retail prices (you can change prices here later).</li>
            <li>Go to <a className="underline inline-flex items-center gap-0.5" href="https://developers.printful.com/" target="_blank" rel="noopener noreferrer">developers.printful.com <ExternalLink className="w-3 h-3" /></a> → <b>Create token</b>, pick that store, and tick only: <b>View and manage orders</b> (<code className="px-1 rounded bg-muted">orders</code>), <b>View and manage store products</b> (<code className="px-1 rounded bg-muted">sync_products</code>, so price changes here reach Printful too) and <b>View and manage webhooks</b> (<code className="px-1 rounded bg-muted">webhooks</code>).</li>
            <li>In Base44, add a secret named <code className="px-1 rounded bg-muted">PRINTFUL_API_KEY</code> with the token, then reload this page.</li>
            <li>Add a payment card under Billing in Printful; Printful charges it for each order it prints.</li>
          </ol>
        </Card>
      )}
    </div>
  );
}
