// Base44 Payments fulfillment webhook — base44/functions/payments-webhook/entry.ts
//
// Provided by the platform. Do NOT rewrite the plumbing (JWT verification, envelope parsing,
// purchase resolution, idempotency). Only edit the region marked
// `// ===== APP-SPECIFIC =====` to define what "grant access" means for this app.
//
// It receives Wix `ORDER_APPROVED` events (and optional subscription lifecycle events),
// verifies the RS256 JWT, resolves the buyer's pending Purchase by checkout id, and marks
// it paid exactly once. It pairs with `create-checkout`, which MUST persist
// `checkoutSession.id` on the Purchase — Wix has no custom-metadata field, so the checkout
// id is the ONLY correlation key back to this app's user.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { importSPKI, jwtVerify } from "npm:jose@5.9.6";
import { postDiscordNotification } from "../../shared/discordWebhook.ts";

// Wix event types (verbatim from Wix docs).
const ORDER_APPROVED = "wix.ecom.v1.order_approved";
const SUBSCRIPTION_CANCELED = "wix.ecom.subscription_contracts.v1.subscription_contract_canceled";
const SUBSCRIPTION_EXPIRED = "wix.ecom.subscription_contracts.v1.subscription_contract_expired";

// Unwrap Wix's triple-nested envelope: the request body is a JWT whose verified
// payload has a `data` JSON string; that parses to an envelope with `eventType` and
// another `data` JSON string; that parses to the event data holding the order.
function parseWixEnvelope(payload: Record<string, unknown>): { eventType: string; eventData: any } {
  const outer = typeof payload.data === "string" ? JSON.parse(payload.data) : payload.data;
  // eventType lives on the parsed envelope; newer DomainEvent envelopes may also carry it as a
  // top-level JWT claim — fall back to that so the event isn't misrouted to the ignore branch.
  const eventType: string = outer?.eventType ?? (payload.eventType as string) ?? "";
  const eventData = typeof outer?.data === "string" ? JSON.parse(outer.data) : outer?.data;
  return { eventType, eventData };
}

// For order_approved, the order is at eventData.order (per Wix Payments docs:
// `eventData.order.checkoutId === checkoutSession.id`).
function extractOrder(eventData: any): any | null {
  return eventData?.order ?? null;
}

// The buyer's email, as entered on Wix's hosted checkout page. This is the ONLY identity for an
// anonymous buyer (one who wasn't signed in when create-checkout ran, so appUserId is null). Wix
// exposes it in a few places depending on the flow; check the common ones.
function extractBuyerEmail(order: any): string | null {
  return (
    order?.buyerInfo?.email ??
    order?.billingInfo?.contactDetails?.email ??
    order?.billingInfo?.email ??
    null
  );
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Read per request, never at module scope: the key is stored when the webhook is registered, so
    // a warm isolate that captured it at startup would stay keyless and 500 every ORDER_APPROVED.
    const WEBHOOK_PUBLIC_KEY = Deno.env.get("WIX_CHECKOUT_WEBHOOK_PUBLIC_KEY");
    if (!WEBHOOK_PUBLIC_KEY) {
      // Never process an unverifiable event. Missing key = misconfiguration, not a retry case.
      console.error("payments-webhook: WIX_CHECKOUT_WEBHOOK_PUBLIC_KEY is not set");
      return new Response("Webhook not configured", { status: 500 });
    }

    // The raw body IS the JWT (Wix signs the whole payload, RS256).
    const token = await req.text();

    let payload: Record<string, unknown>;
    try {
      const key = await importSPKI(WEBHOOK_PUBLIC_KEY, "RS256");
      const verified = await jwtVerify(token, key);
      payload = verified.payload as Record<string, unknown>;
    } catch (err) {
      // Signature invalid / malformed. Reject — do NOT grant anything.
      console.error("payments-webhook: JWT verification failed", err);
      return new Response("Invalid signature", { status: 401 });
    }

    const { eventType, eventData } = parseWixEnvelope(payload);
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole; // No end user is authenticated on a webhook call.

    if (eventType === ORDER_APPROVED) {
      return await handleOrderApproved(base44, db, eventData);
    }

    if (eventType === SUBSCRIPTION_CANCELED || eventType === SUBSCRIPTION_EXPIRED) {
      return await handleSubscriptionEnded(base44, db, eventData);
    }

    // Unknown/irrelevant event — acknowledge so Wix stops retrying.
    console.log(`payments-webhook: ignoring event ${eventType}`);
    return new Response("OK", { status: 200 });
  } catch (err) {
    // Unexpected failure: 500 tells Wix to retry later (the handler is idempotent, so a
    // retry after a partial failure is safe).
    console.error("payments-webhook: unhandled error", err);
    return new Response("Internal error", { status: 500 });
  }
});

async function handleOrderApproved(base44: any, db: any, eventData: any): Promise<Response> {
  const order = extractOrder(eventData);
  const checkoutId: string | undefined = order?.checkoutId;
  const orderId: string | undefined = order?.id;
  // Subscription id (if any) — persisted below so SUBSCRIPTION_CANCELED/EXPIRED can later
  // resolve this purchase by subscriptionId and revoke access.
  const subscriptionId: string | undefined = (order?.lineItems ?? [])
    .map((li: any) => li?.subscriptionInfo?.id)
    .find((id: any) => !!id);

  if (!checkoutId) {
    // Nothing to correlate on. Acknowledge to stop retries; log for investigation.
    console.error("payments-webhook: ORDER_APPROVED missing order.checkoutId", { orderId });
    return new Response("OK", { status: 200 });
  }

  // Resolve the pending purchase created by `create-checkout` (join key: checkoutSessionId).
  const matches = await db.entities.Base44Purchase.filter({ checkoutSessionId: checkoutId });
  const purchase = matches?.[0];

  if (!purchase) {
    // The pending Base44Purchase is written by create-checkout before the buyer pays, so a miss
    // here is a transient race (entity not yet visible) — return 500 so Wix retries, rather
    // than ACKing a paid order we can't fulfill. (Wix stops after its retry window.)
    console.warn("payments-webhook: no Base44Purchase for checkoutId yet, asking Wix to retry", { checkoutId, orderId });
    return new Response("Purchase not found yet", { status: 500 });
  }

  // IDEMPOTENCY + terminal states: Wix delivers ORDER_APPROVED more than once, and may deliver
  // a stale approval after a cancellation. Skip if already "paid" (prevents double-grant) or
  // "canceled" (a late approval must not resurrect a revoked subscription).
  if (purchase.status === "paid" || purchase.status === "canceled") {
    console.log("payments-webhook: purchase already terminal, skipping", { checkoutId, status: purchase.status });
    return new Response("OK", { status: 200 });
  }

  // The buyer's email: from create-checkout if they were signed in, otherwise from the Wix order
  // (the only identity an anonymous buyer has). Persisted below and used by the grant block.
  const buyerEmail: string | null = purchase.buyerEmail ?? extractBuyerEmail(order);

  // ===== APP-SPECIFIC =====
  // Grant club membership. The club id is purchase.productId; the member is the signed-in app
  // user (purchase.appUserId) — paid joins require a logged-in GMRS user. Idempotent: the
  // Membership is keyed on (club_id, member_callsign), and the "already terminal" check above
  // plus this filter guard make duplicate ORDER_APPROVED deliveries safe.
  try {
    const clubId = purchase.productId;
    if (clubId && purchase.appUserId) {
      const club = (await db.entities.Club.filter({ id: clubId }))[0];
      const member = (await db.entities.User.filter({ id: purchase.appUserId }))[0] as any;
      const callsign = member?.callsign;
      if (club && callsign) {
        const existing = await db.entities.Membership.filter({ club_id: clubId, member_callsign: callsign });
        if (!existing || existing.length === 0) {
          await db.entities.Membership.create({
            club_id: clubId,
            club_name: club.name,
            member_callsign: callsign,
            member_name: member?.full_name || null,
            fee_amount: Number(club.membership_fee || 0),
            fee_period: club.fee_period || "One-time",
            status: "Active",
            payment_status: "Paid",
          });
          await db.entities.Club.update(clubId, { members_count: (club.members_count || 0) + 1 });
          console.log("payments-webhook: granted club membership", { clubId, callsign });

          await postDiscordNotification(base44, 'payment', 'payment_received', {
            member_name: member?.full_name || callsign || buyerEmail || 'A member',
            club_name: club.name,
            amount: `$${Number(club.membership_fee || 0).toFixed(2)}`,
            fee_period: club.fee_period || 'One-time',
            provider: 'Base44 Payments',
          }, {
            fields: [
              { name: 'Club', value: club.name, inline: true },
              { name: 'Member', value: member?.full_name || callsign || buyerEmail || '—', inline: true },
              { name: 'Amount', value: `$${Number(club.membership_fee || 0).toFixed(2)} (${club.fee_period || 'One-time'})`, inline: true },
              { name: 'Provider', value: 'Base44 Payments', inline: true },
            ],
          });
        }
      } else {
        console.error("payments-webhook: cannot resolve club/member for grant", { clubId, appUserId: purchase.appUserId });
      }
    }
  } catch (grantErr) {
    console.error("payments-webhook: membership grant failed", grantErr);
    throw grantErr; // stay pending so Wix retries the grant
  }
  // ===== END APP-SPECIFIC =====

  // Mark paid LAST, so "paid" always implies the grant above completed. The idempotency
  // check at the top short-circuits on this status, so it must only be set after fulfillment.
  // subscriptionId is stored here so SUBSCRIPTION_CANCELED/EXPIRED can resolve this purchase.
  await db.entities.Base44Purchase.update(purchase.id, {
    status: "paid",
    orderId: orderId ?? purchase.orderId ?? null,
    subscriptionId: subscriptionId ?? purchase.subscriptionId ?? null,
    // Persist the buyer email (backfilled from the Wix order for anonymous buyers) so the record
    // always shows who paid, even when create-checkout had no signed-in user.
    buyerEmail: buyerEmail ?? purchase.buyerEmail ?? null,
    paidAt: new Date().toISOString(),
  });

  console.log("payments-webhook: fulfilled purchase", { purchaseId: purchase.id, checkoutId, orderId });
  return new Response("OK", { status: 200 });
}

async function handleSubscriptionEnded(base44: any, db: any, eventData: any): Promise<Response> {
  // Canceled = ended early; Expired = ran all billing cycles. Both revoke access.
  // Mirrors the order path (eventData.<entity>); keep a fallback since the subscription
  // contract webhook body isn't as tightly documented as order_approved.
  const contract = eventData?.subscriptionContract ?? eventData?.entity ?? null;
  const subscriptionId: string | undefined = contract?.id;

  if (!subscriptionId) {
    console.error("payments-webhook: subscription event missing contract id");
    return new Response("OK", { status: 200 });
  }

  const matches = await db.entities.Base44Purchase.filter({ subscriptionId });
  const purchase = matches?.[0];
  if (!purchase) {
    // The subscriptionId is written on the Purchase by the ORDER_APPROVED handler. If a
    // cancel/expire arrives before (or racing) that approval, no Purchase matches yet —
    // return 500 so Wix retries until the approval has linked it, instead of losing the
    // revoke by acking a not-yet-linkable event.
    console.warn("payments-webhook: no Purchase for subscription yet, asking Wix to retry", { subscriptionId });
    return new Response("Purchase not linkable yet", { status: 500 });
  }

  if (purchase.status === "canceled") {
    return new Response("OK", { status: 200 }); // Idempotent.
  }

  // ===== APP-SPECIFIC =====
  // Revoke club membership (mirror of the grant). Resolve the member from purchase.appUserId
  // and expire their Membership for this club. Idempotent via the "already canceled" check above.
  try {
    const clubId = purchase.productId;
    if (clubId && purchase.appUserId) {
      const member = (await db.entities.User.filter({ id: purchase.appUserId }))[0] as any;
      const callsign = member?.callsign;
      if (callsign) {
        const mems = await db.entities.Membership.filter({ club_id: clubId, member_callsign: callsign });
        for (const m of mems) {
          await db.entities.Membership.update(m.id, { status: "Expired" });
        }
      }
    }
  } catch (revErr) {
    console.error("payments-webhook: membership revoke failed", revErr);
    throw revErr; // stay non-canceled so Wix retries the revoke
  }
  // ===== END APP-SPECIFIC =====

  await postDiscordNotification(base44, 'payment', 'subscription_ended', {
    club_name: purchase.productId || '—',
    provider: 'Base44 Payments',
  }, {
    fields: [
      { name: 'Club', value: purchase.productId || '—', inline: true },
      { name: 'Provider', value: 'Base44 Payments', inline: true },
    ],
  });

  // Mark canceled LAST, so "canceled" always implies access was actually revoked.
  await db.entities.Base44Purchase.update(purchase.id, {
    status: "canceled",
    canceledAt: new Date().toISOString(),
  });

  console.log("payments-webhook: revoked subscription", { purchaseId: purchase.id, subscriptionId });
  return new Response("OK", { status: 200 });
}