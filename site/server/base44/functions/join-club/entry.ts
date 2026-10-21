import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireVerifiedCallsign } from '../../shared/verifiedCallsign.ts';
import { postDiscordNotification } from '../../shared/discordWebhook.ts';

// ===== APP-SPECIFIC =====
// Handles free club joins: creates the Membership record and increments the
// club's members_count as service role. This is needed because Club.update
// is locked to the club owner (RLS), so a joining member cannot increment
// the count client-side. Paid clubs normally go through stripe-create-checkout
// and the stripe-webhook instead -- except for admins/super_admins, who join
// any club (including paid ones) through this same free path, no payment
// required. Requires a verified active callsign.
// ===== END APP-SPECIFIC =====

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { user, error } = await requireVerifiedCallsign(base44);
    if (error) return error;
    if (!user.callsign) return Response.json({ error: 'Add your GMRS callsign in your profile before joining.' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const clubId = body?.clubId;
    if (!clubId) return Response.json({ error: 'Club ID required' }, { status: 400 });

    const db = base44.asServiceRole;
    const club = (await db.entities.Club.filter({ id: clubId }))[0];
    if (!club) return Response.json({ error: 'Club not found' }, { status: 404 });

    // Only free clubs are handled here; paid clubs go through Stripe checkout --
    // except for admins/super_admins, who always join free through this path.
    const isAdmin = user.role === 'admin' || user.role === 'super_admin' || user._app_role === 'admin' || user._app_role === 'super_admin';
    const fee = Number(club.membership_fee || 0);
    if (fee > 0 && !isAdmin) {
      return Response.json({ error: 'This club requires payment. Use the checkout flow.' }, { status: 400 });
    }

    // Idempotency: skip if already a member.
    const existing = await db.entities.Membership.filter({ club_id: clubId, member_callsign: user.callsign });
    if (existing && existing.length > 0) {
      return Response.json({ ok: true, alreadyMember: true });
    }

    await db.entities.Membership.create({
      club_id: clubId,
      club_name: club.name,
      member_callsign: user.callsign,
      member_name: user.full_name || '',
      fee_amount: 0,
      fee_period: club.fee_period || 'One-time',
      status: 'Active',
      payment_status: 'Free',
      payment_note: fee > 0 ? 'Admin account — comped, no payment required.' : undefined,
      club_owner_id: club.created_by_id || null,
    });
    await db.entities.Club.update(clubId, { members_count: (club.members_count || 0) + 1 });

    // The existence check above and this create are not atomic -- two
    // near-simultaneous requests (a double-click, a retried request) can both
    // pass it and each create their own Membership. Re-check now and collapse
    // down to a single membership, backing out the extra members_count
    // increments those duplicate requests each applied.
    const dupes = await db.entities.Membership.filter({ club_id: clubId, member_callsign: user.callsign }, 'created_date');
    if (dupes && dupes.length > 1) {
      const [, ...extra] = dupes;
      for (const d of extra) {
        await db.entities.Membership.delete(d.id).catch((e) => console.error('[join-club] dup cleanup failed:', e?.message || e));
      }
      const freshClub = await db.entities.Club.get(clubId).catch(() => null);
      if (freshClub) {
        await db.entities.Club.update(clubId, {
          members_count: Math.max(0, (freshClub.members_count || 0) - extra.length),
        }).catch((e) => console.error('[join-club] count correction failed:', e?.message || e));
      }
    }

    await db.entities.ClubMembershipLog.create({
      club_id: clubId,
      club_name: club.name,
      member_callsign: user.callsign,
      member_name: user.full_name || '',
      action: 'Joined',
      reason: fee > 0 ? 'Admin account — joined free, no payment required' : 'Free membership',
      club_owner_id: club.created_by_id || null,
    }).catch((e) => console.error('[join-club] log create failed:', e?.message || e));

    if (club.created_by_id && club.created_by_id !== user.id) {
      await db.entities.UserNotification.create({
        user_id: club.created_by_id,
        title: 'New Club Member',
        message: (user.full_name || user.callsign || 'A member') + ' joined ' + club.name + '.',
        type: 'system',
        sender_name: user.full_name || user.callsign || 'Repeater Nation member',
        link_url: '/clubs/' + clubId,
        link_label: 'View Club',
        description: 'club_join:' + clubId + ':' + user.id,
      }).catch((e) => console.error('[join-club] notification failed:', e?.message || e));
    }

    await postDiscordNotification(base44, 'club_join', 'club_join', {
      member_name: user.full_name || user.callsign || 'A member',
      club_name: club.name,
    }, {
      fields: [
        { name: 'Club', value: club.name, inline: true },
        { name: 'Member', value: user.full_name || user.callsign || '—', inline: true },
      ],
    });

    console.log('[join-club] granted free membership', { clubId, callsign: user.callsign });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[join-club] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}