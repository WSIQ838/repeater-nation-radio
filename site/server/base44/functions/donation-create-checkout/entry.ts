// Creates a Stripe Checkout Session for a one-time platform donation, charged
// directly to the platform's own connected Stripe account (the STRIPE_SECRET_KEY
// secret) — unlike club membership checkout, there's no Connect destination
// routing here since the money isn't going to a third party.
//
// Public endpoint: donors don't need to be signed in, but we capture their
// account when they are so the receipt/thank-you flow can be personalized.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { stripeFetch, toForm, appUrlFromReq } from '../../shared/stripe.ts';

export default async function(req: Request): Promise<Response> {
  try {
    if (!secrets.get('STRIPE_SECRET_KEY')) {
      return Response.json({ error: 'Donations are not set up yet' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    let user: any = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!(amount >= 1) || amount > 100000) {
      return Response.json({ error: 'Enter an amount between $1 and $100,000' }, { status: 400 });
    }

    const donorName = String(body.donorName || user?.full_name || '').slice(0, 200);
    const donorEmail = String(body.donorEmail || user?.email || '').slice(0, 200);
    const message = String(body.message || '').slice(0, 500);

    const base = appUrlFromReq(req);
    if (!base) return Response.json({ error: 'App URL not configured' }, { status: 500 });

    const amountCents = Math.round(amount * 100);
    const metadata: Record<string, string> = {
      type: 'donation',
      app_user_id: user?.id || '',
      donor_name: donorName,
    };

    const form: any = {
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': 'Donation to Repeater Nation',
      'line_items[0][price_data][unit_amount]': String(amountCents),
      success_url: `${base}/ThankYou?donation=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/`,
      ...(donorEmail ? { customer_email: donorEmail } : {}),
    };
    for (const [k, v] of Object.entries(metadata)) {
      form[`payment_intent_data[metadata][${k}]`] = v;
      form[`metadata[${k}]`] = v;
    }

    const session = await stripeFetch('/v1/checkout/sessions', {
      method: 'POST',
      body: toForm(form),
    });

    await base44.asServiceRole.entities.Base44Purchase.create({
      checkoutSessionId: session.id,
      status: 'pending',
      appUserId: user?.id || null,
      buyerEmail: donorEmail || null,
      productId: 'donation',
      productName: 'Donation',
      quantity: 1,
      amount: amount.toFixed(2),
      currency: 'USD',
      description: [donorName, message].filter(Boolean).join(' — ') || undefined,
    });

    return Response.json({ redirectUrl: session.url });
  } catch (err) {
    console.error('donation-create-checkout error', err);
    return Response.json({ error: (err && err.message) || 'Internal error' }, { status: 500 });
  }
}
