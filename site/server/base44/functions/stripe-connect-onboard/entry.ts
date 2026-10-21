// Stripe Connect onboarding for club owners.
// Creates a Stripe Express account for the club (if none) and returns a hosted
// onboarding URL the owner is redirected to. Only the club creator (or an admin)
// may start onboarding.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { stripeFetch, toForm, appUrlFromReq } from '../../shared/stripe.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const clubId = String(body.clubId ?? '');
    if (!clubId) return Response.json({ error: 'Missing clubId' }, { status: 400 });

    const club = (await base44.entities.Club.filter({ id: clubId }))[0];
    if (!club) return Response.json({ error: 'Club not found' }, { status: 404 });
    if (club.creator_callsign !== user.callsign && user.role !== 'admin' && user.role !== 'super_admin' && user._app_role !== 'admin' && user._app_role !== 'super_admin') {
      return Response.json({ error: 'Only the club creator can connect Stripe' }, { status: 403 });
    }

    const base = appUrlFromReq(req);
    if (!base) {
      return Response.json({ error: 'App URL not configured' }, { status: 500 });
    }

    let accountId = club.stripe_account_id || '';
    if (!accountId) {
      const acct = await stripeFetch('/v1/accounts', {
        method: 'POST',
        body: toForm({
          type: 'express',
          email: user.email || undefined,
          metadata: {
            user_id: user.id,
            club_id: clubId,
            callsign: user.callsign || '',
          },
        }),
      });
      accountId = acct.id;
      await base44.asServiceRole.entities.Club.update(clubId, {
        stripe_account_id: accountId,
        stripe_charges_enabled: false,
      });
    }

    const accountLink = await stripeFetch('/v1/account_links', {
      method: 'POST',
      body: toForm({
        account: accountId,
        refresh_url: `${base}/clubs/${clubId}?stripe_refresh=1`,
        return_url: `${base}/clubs/${clubId}?stripe_return=1`,
        type: 'account_onboarding',
      }),
    });

    return Response.json({ url: accountLink.url, accountId });
  } catch (err) {
    console.error('stripe-connect-onboard error', err);
    return Response.json({ error: (err && err.message) || 'Internal error' }, { status: 500 });
  }
}