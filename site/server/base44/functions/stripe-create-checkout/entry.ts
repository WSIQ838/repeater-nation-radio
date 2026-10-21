// Creates a Stripe Checkout Session for a paid club membership and routes the
// payment to the club owner's connected Stripe account, keeping a platform
// application fee (PLATFORM_FEE_PERCENT). Persists a pending Base44Purchase
// (correlated by the Stripe session id) that the webhook fulfills.
//
// The buyer should be signed in (membership is granted to their account); we
// capture auth best-effort rather than hard-gating, so the UI can handle the
// "please log in" case.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { stripeFetch, toForm, appUrlFromReq, PLATFORM_FEE_PERCENT } from '../../shared/stripe.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }

    const body = await req.json().catch(() => ({}));
    const clubId = String(body.clubId ?? '');
    if (!clubId) return Response.json({ error: 'Missing clubId' }, { status: 400 });

    const club = (await base44.asServiceRole.entities.Club.filter({ id: clubId }))[0];
    if (!club) return Response.json({ error: 'Club not found' }, { status: 404 });
    if (!club.stripe_account_id) {
      return Response.json({ error: 'This club is not set up to accept payments yet' }, { status: 400 });
    }

    const fee = Number(club.membership_fee || 0);
    if (!(fee >= 0.5)) {
      return Response.json({ error: 'Membership fee too low to charge' }, { status: 400 });
    }
    // Read the configurable platform fee from AdminSetting; fall back to the
    // shared default when unset or invalid.
    let platformFeePercent = PLATFORM_FEE_PERCENT;
    try {
      const s = (await base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1))[0];
      const v = Number(s?.platform_fee_percent);
      if (!isNaN(v) && v >= 0 && v <= 100) platformFeePercent = v;
    } catch (e) {
      console.error('[stripe-create-checkout] platform fee lookup failed:', e?.message || e);
    }
    const amountCents = Math.round(fee * 100);
    const feeCents = Math.round(amountCents * platformFeePercent / 100);
    const productName = `${club.name} — Membership`;
    const isRecurring = club.fee_period === 'Monthly' || club.fee_period === 'Annual';
    const interval = club.fee_period === 'Monthly' ? 'month' : 'year';
    const base = appUrlFromReq(req);
    if (!base) return Response.json({ error: 'App URL not configured' }, { status: 500 });

    const metadata: Record<string, string> = {
      club_id: clubId,
      app_user_id: user?.id || String(body.appUserId || ''),
      callsign: user?.callsign || String(body.callsign || ''),
      member_name: user?.full_name || String(body.memberName || ''),
    };

    let session: any;
    if (isRecurring) {
      // Subscription on the connected account: the charge lives on the club
      // owner's Stripe account; the platform keeps PLATFORM_FEE_PERCENT.
      const form: any = {
        mode: 'subscription',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': productName,
        'line_items[0][price_data][unit_amount]': String(amountCents),
        'line_items[0][price_data][recurring][interval]': interval,
        'subscription_data[application_fee_percent]': String(platformFeePercent),
        success_url: `${base}/ThankYou?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/clubs/${clubId}`,
      };
      for (const [k, v] of Object.entries(metadata)) {
        form[`subscription_data[metadata][${k}]`] = v;
        form[`metadata[${k}]`] = v;
      }
      session = await stripeFetch('/v1/checkout/sessions', {
        method: 'POST',
        body: toForm(form),
        stripeAccount: club.stripe_account_id,
      });
    } else {
      // One-time: destination charge — platform charges, transfers to the
      // club owner, and retains the application fee.
      const form: any = {
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': productName,
        'line_items[0][price_data][unit_amount]': String(amountCents),
        'payment_intent_data[application_fee_amount]': String(feeCents),
        'payment_intent_data[transfer_data][destination]': club.stripe_account_id,
        success_url: `${base}/ThankYou?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/clubs/${clubId}`,
      };
      for (const [k, v] of Object.entries(metadata)) {
        form[`payment_intent_data[metadata][${k}]`] = v;
        form[`metadata[${k}]`] = v;
      }
      session = await stripeFetch('/v1/checkout/sessions', {
        method: 'POST',
        body: toForm(form),
      });
    }

    // Persist a pending purchase so the webhook can fulfill by session id.
    await base44.asServiceRole.entities.Base44Purchase.create({
      checkoutSessionId: session.id,
      status: 'pending',
      appUserId: metadata.app_user_id || null,
      buyerEmail: user?.email || null,
      productId: clubId,
      productName,
      quantity: 1,
      amount: fee.toFixed(2),
      currency: 'USD',
    });

    return Response.json({ redirectUrl: session.url });
  } catch (err) {
    console.error('stripe-create-checkout error', err);
    return Response.json({ error: (err && err.message) || 'Internal error' }, { status: 500 });
  }
}