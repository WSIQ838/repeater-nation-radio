// Stripe webhook: verifies the signature, then fulfills membership grants on
// checkout.session.completed, revokes on subscription deletion, and syncs the
// club's charges-enabled status on account.updated. Fulfillment is idempotent.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { verifyStripeSignature, appUrlFromReq } from '../../shared/stripe.ts';
import { postDiscordNotification } from '../../shared/discordWebhook.ts';
import { fulfillPaidMerchOrder } from '../../shared/merch.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole; // no end user on a webhook call
    const secret = secrets.get('STRIPE_WEBHOOK_SECRET');
    const sig = req.headers.get('stripe-signature') || '';
    const rawBody = await req.text();

    const ok = await verifyStripeSignature(rawBody, sig, secret);
    if (!ok) {
      console.error('stripe-webhook: invalid signature');
      return Response.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const obj = event?.data?.object || {};

    switch (event.type) {
      case 'checkout.session.completed':
      // Delayed-notification payment methods (ACH debit, SEPA, etc.) fire
      // checkout.session.completed immediately with payment_status "unpaid" --
      // the real result arrives later as one of these two events, whose
      // object is the same checkout session, now with the final status.
      case 'checkout.session.async_payment_succeeded':
        if (obj?.metadata?.type === 'merch') return await handleMerchPaid(base44, db, obj, appUrlFromReq(req));
        return await handleCompleted(base44, db, obj);
      case 'checkout.session.async_payment_failed':
        if (obj?.metadata?.type === 'merch') return await handleMerchUnpaid(db, obj, 'canceled');
        return await handleAsyncPaymentFailed(db, obj);
      case 'checkout.session.expired':
        if (obj?.metadata?.type === 'merch') return await handleMerchUnpaid(db, obj, 'abandoned');
        return Response.json({ received: true });
      case 'customer.subscription.deleted':
        return await handleSubscriptionDeleted(base44, db, obj);
      case 'account.updated':
        return await handleAccountUpdated(db, obj);
      default:
        console.log('stripe-webhook: unhandled event', event.type);
        return Response.json({ received: true });
    }
  } catch (err) {
    console.error('stripe-webhook: unhandled error', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function handleCompleted(base44: any, db: any, session: any): Promise<Response> {
  try {
    // For delayed-notification payment methods, checkout.session.completed fires
    // before funds actually clear (payment_status "unpaid"). Don't grant anything
    // yet -- wait for the async_payment_succeeded re-delivery of this same event
    // (payment_status will be "paid" by then) or async_payment_failed, which
    // marks the purchase canceled instead.
    const paymentStatus = String(session.payment_status || '');
    if (paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') {
      console.log('stripe-webhook: checkout completed but payment not yet settled', { sessionId: session.id, paymentStatus });
      return Response.json({ ok: true });
    }

    const meta = session.metadata || {};

    if (meta.type === 'donation') {
      return await handleDonationCompleted(db, session, meta);
    }

    const clubId = meta.club_id;
    const appUserId = meta.app_user_id;
    const callsign = meta.callsign;
    const memberName = meta.member_name;
    if (!clubId || !appUserId || !callsign) {
      console.error('stripe-webhook: missing session metadata', meta);
      return Response.json({ ok: true });
    }

    // Idempotency: skip if the purchase is already terminal.
    const matches = await db.entities.Base44Purchase.filter({ checkoutSessionId: session.id });
    const purchase = matches?.[0];
    if (purchase && (purchase.status === 'paid' || purchase.status === 'canceled')) {
      return Response.json({ ok: true });
    }

    const club = (await db.entities.Club.filter({ id: clubId }))[0];
    const member = (await db.entities.User.filter({ id: appUserId }))[0];
    if (club && member) {
      const existing = await db.entities.Membership.filter({ club_id: clubId, member_callsign: callsign });
      if (!existing || existing.length === 0) {
        await db.entities.Membership.create({
          club_id: clubId,
          club_name: club.name,
          member_callsign: callsign,
          member_name: memberName || member?.full_name || null,
          fee_amount: Number(club.membership_fee || 0),
          fee_period: club.fee_period || 'One-time',
          status: 'Active',
          payment_status: 'Paid',
          club_owner_id: club.created_by_id || null,
        });
        await db.entities.Club.update(clubId, { members_count: (club.members_count || 0) + 1 });
        await db.entities.ClubMembershipLog.create({
          club_id: clubId,
          club_name: club.name,
          member_callsign: callsign,
          member_name: memberName || member?.full_name || null,
          action: 'Joined',
          reason: `Paid via Stripe ($${Number(club.membership_fee || 0).toFixed(2)} ${club.fee_period || 'One-time'})`,
          club_owner_id: club.created_by_id || null,
        }).catch((e) => console.error('stripe-webhook: log create failed:', e?.message || e));
      }
    } else {
      console.error('stripe-webhook: could not resolve club/member for grant', { clubId, appUserId });
    }

    if (purchase) {
      await db.entities.Base44Purchase.update(purchase.id, {
        status: 'paid',
        orderId: session.id,
        subscriptionId: session.subscription || purchase.subscriptionId || null,
        paidAt: new Date().toISOString(),
      });
    }
    console.log('stripe-webhook: granted membership', { clubId, appUserId, callsign });

    await postDiscordNotification(base44, 'payment', 'payment_received', {
      member_name: memberName || member?.full_name || callsign || 'A member',
      club_name: club?.name || 'a club',
      amount: `$${Number(club?.membership_fee || 0).toFixed(2)}`,
      fee_period: club?.fee_period || 'One-time',
      provider: 'Stripe',
    }, {
      fields: [
        { name: 'Club', value: club?.name || '—', inline: true },
        { name: 'Member', value: memberName || member?.full_name || callsign || '—', inline: true },
        { name: 'Amount', value: `$${Number(club?.membership_fee || 0).toFixed(2)} (${club?.fee_period || 'One-time'})`, inline: true },
        { name: 'Provider', value: 'Stripe', inline: true },
      ],
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error('stripe-webhook: handleCompleted error', err);
    throw err;
  }
}

// Store orders: see shared/merch.ts. A payment still clearing (ACH etc.)
// waits for async_payment_succeeded, like memberships do.
async function handleMerchPaid(base44: any, db: any, session: any, appUrl: string): Promise<Response> {
  const paymentStatus = String(session.payment_status || '');
  if (paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') {
    console.log('stripe-webhook: merch checkout completed but payment not yet settled', { sessionId: session.id, paymentStatus });
    return Response.json({ ok: true });
  }
  const result = await fulfillPaidMerchOrder(base44, db, session, appUrl);
  console.log('stripe-webhook: merch order', result);
  return Response.json({ ok: true });
}

async function handleMerchUnpaid(db: any, session: any, status: string): Promise<Response> {
  const id = session?.metadata?.merch_order_id;
  const order = id ? (await db.entities.MerchOrder.filter({ id }).catch(() => []))?.[0] : null;
  if (order && order.status === 'pending_payment') await db.entities.MerchOrder.update(order.id, { status });
  return Response.json({ ok: true });
}

async function handleDonationCompleted(db: any, session: any, meta: any): Promise<Response> {
  try {
    const matches = await db.entities.Base44Purchase.filter({ checkoutSessionId: session.id });
    const purchase = matches?.[0];
    if (purchase && purchase.status === 'paid') {
      return Response.json({ ok: true });
    }
    if (purchase) {
      await db.entities.Base44Purchase.update(purchase.id, {
        status: 'paid',
        orderId: session.id,
        paidAt: new Date().toISOString(),
      });
    }
    console.log('stripe-webhook: donation received', {
      sessionId: session.id,
      donor: meta.donor_name || 'Anonymous',
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('stripe-webhook: handleDonationCompleted error', err);
    throw err;
  }
}

async function handleAsyncPaymentFailed(db: any, session: any): Promise<Response> {
  try {
    const matches = await db.entities.Base44Purchase.filter({ checkoutSessionId: session.id });
    const purchase = matches?.[0];
    if (purchase && purchase.status !== 'paid') {
      await db.entities.Base44Purchase.update(purchase.id, {
        status: 'canceled',
        canceledAt: new Date().toISOString(),
      });
    }
    console.log('stripe-webhook: async payment failed, purchase canceled', { sessionId: session.id });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('stripe-webhook: handleAsyncPaymentFailed error', err);
    throw err;
  }
}

async function handleSubscriptionDeleted(base44: any, db: any, sub: any): Promise<Response> {
  try {
    const matches = await db.entities.Base44Purchase.filter({ subscriptionId: sub.id });
    const purchase = matches?.[0];
    if (!purchase) return Response.json({ ok: true });
    if (purchase.status === 'canceled') return Response.json({ ok: true });

    const clubId = purchase.productId;
    const member = (await db.entities.User.filter({ id: purchase.appUserId }))[0];
    const callsign = member?.callsign;
    if (clubId && callsign) {
      const mems = await db.entities.Membership.filter({ club_id: clubId, member_callsign: callsign });
      for (const m of mems) {
        await db.entities.Membership.update(m.id, { status: 'Expired' });
      }
      const club = (await db.entities.Club.filter({ id: clubId }))[0];
      await db.entities.ClubMembershipLog.create({
        club_id: clubId,
        club_name: club?.name || mems[0]?.club_name || '',
        member_callsign: callsign,
        member_name: member?.full_name || mems[0]?.member_name || '',
        action: 'Left',
        reason: 'Subscription ended',
        club_owner_id: club?.created_by_id || mems[0]?.club_owner_id || null,
      }).catch((e) => console.error('stripe-webhook: log create failed:', e?.message || e));
    }
    await db.entities.Base44Purchase.update(purchase.id, {
      status: 'canceled',
      canceledAt: new Date().toISOString(),
    });
    console.log('stripe-webhook: revoked subscription', { subscriptionId: sub.id });

    await postDiscordNotification(base44, 'payment', 'subscription_ended', {
      club_name: clubId || '—',
      provider: 'Stripe',
    }, {
      fields: [
        { name: 'Club', value: clubId || '—', inline: true },
        { name: 'Member', value: member?.full_name || callsign || '—', inline: true },
        { name: 'Provider', value: 'Stripe', inline: true },
      ],
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error('stripe-webhook: handleSubscriptionDeleted error', err);
    throw err;
  }
}

async function handleAccountUpdated(db: any, account: any): Promise<Response> {
  try {
    const accountId = account.id;
    if (!accountId) return Response.json({ ok: true });
    const clubs = await db.entities.Club.filter({ stripe_account_id: accountId });
    for (const c of clubs) {
      await db.entities.Club.update(c.id, {
        stripe_charges_enabled: !!account.charges_enabled,
      });
    }
    console.log('stripe-webhook: synced account status', { accountId, chargesEnabled: !!account.charges_enabled });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('stripe-webhook: handleAccountUpdated error', err);
    throw err;
  }
}