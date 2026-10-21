import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ===== APP-SPECIFIC =====
// Links repeaters to the member who owns them by callsign.
// When a member signs up or logs in, the auth workflow calls this with their
// user_id. We read their callsign from their User record, then stamp
// owner_user_id onto every Repeater whose callsign (or owner field) matches —
// so the directory repeaters they operate become editable by them (per the
// Repeater entity's owner RLS rule).
//
// Runs as service role because the trigger has no user session and the
// repeaters being linked were created by other members (e.g. bulk imports).
// Idempotent: re-running on later logins just re-affirms the same links.
// ===== END APP-SPECIFIC =====

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user_id = String(body?.user_id || '').trim();
    if (!user_id) {
      return Response.json({ error: 'user_id is required' }, { status: 400 });
    }

    // This function is invoked by the app_user_auth workflow. Workflow
    // invocations do not reliably carry the new user's browser session, so
    // requiring base44.auth.me() here prevents the automatic linking from
    // ever running. The workflow itself is the trusted trigger; use the
    // service role for the account/repeater lookup.
    //
    // Because this endpoint can't tell a workflow call from a direct one, it
    // must be harmless when called for any user_id: it only does what that
    // user's own login would do. Repeaters are linked only by the account's
    // VERIFIED callsign (never the free-text Profile callsign, which any
    // member can set to someone else's call), and never taken from another
    // owner.
    let callsign = '';
    let userName = '';
    let currentRole = '';
    try {
      const user = await base44.asServiceRole.entities.User.get(user_id);
      callsign = user?.callsign_verified === true ? String(user?.callsign || '').trim() : '';
      userName = user?.full_name || '';
      currentRole = String(user?.role || '').trim();
    } catch (err) {
      console.error('[assignUserRepeaters] User fetch failed:', err?.message || err);
      return Response.json({ error: 'user not found', linked: 0 }, { status: 404 });
    }

    // Every member gets the "member" role on join (unless they already hold a
    // higher role like admin/moderator/editor). Role is a platform-protected
    // field, so it must be written from here (service role), not from the client.
    // Every role the User schema defines is valid and must survive a login;
    // only a missing/unknown value is normalized. (super_admin and
    // support_staff used to be missing here, so they were reset to member.)
    const privileged = ['admin', 'super_admin', 'moderator', 'editor', 'support_staff'];
    if (currentRole === '' || currentRole === 'user' || currentRole === 'member') {
      if (currentRole !== 'member') {
        try {
          await base44.asServiceRole.entities.User.update(user_id, { role: 'member' });
          console.log(`[assignUserRepeaters] set role=member for ${user_id}`);
        } catch (err) {
          console.error('[assignUserRepeaters] role update failed:', err?.message || err);
        }
      }
    } else if (!privileged.includes(currentRole)) {
      // Unknown role value — normalize to member.
      try {
        await base44.asServiceRole.entities.User.update(user_id, { role: 'member' });
      } catch (err) {
        console.error('[assignUserRepeaters] role normalize failed:', err?.message || err);
      }
    }

    if (!callsign) {
      // No callsign on file yet (e.g. brand-new signup before profile save).
      // Later logins will pick it up once the member sets/verifies their callsign.
      return Response.json({ linked: 0, reason: 'no_callsign' });
    }

    const cs = callsign.toUpperCase();

    // Match callsigns case-insensitively. Imported repeater data may contain
    // mixed-case callsigns, so an exact uppercase query can miss valid matches.
    // Runs on every login, so only read the repeaters that can match this
    // callsign (2 small queries) instead of paging through the whole table,
    // and only write the ones that actually need changing -- each write also
    // fans out a realtime event to every open Repeaters page.
    let matches: any[] = [];
    try {
      const [byCallsign, byOwner] = await Promise.all([
        base44.asServiceRole.entities.Repeater.filter({ callsign: { $in: [...new Set([cs, callsign, cs.toLowerCase()])] } }, '-created_date', 500),
        base44.asServiceRole.entities.Repeater.filter({ owner: { $in: [...new Set([cs, callsign, cs.toLowerCase()])] } }, '-created_date', 500),
      ]);
      const seen = new Set();
      matches = [...(byCallsign || []), ...(byOwner || [])].filter((r) => {
        if (!r?.id || seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    } catch (err) {
      console.error('[assignUserRepeaters] repeater lookup failed:', err?.message || err);
      return Response.json({ error: err?.message || 'failed to read repeaters' }, { status: 500 });
    }
    // Unclaimed repeaters only -- one already owned by another account is
    // left alone (an admin can reassign it).
    const toLink = matches.filter((r) => !r.owner_user_id).map((r) => r.id);
    let linked = 0;
    if (toLink.length) {
      try {
        const result = await base44.asServiceRole.entities.Repeater.updateMany(
          { id: { $in: toLink } },
          { $set: { owner_user_id: user_id } },
        );
        linked = result?.updated ?? result?.modified_count ?? result?.count ?? toLink.length;
      } catch (err) {
        console.error('[assignUserRepeaters] updateMany failed:', err?.message || err);
        return Response.json({ error: err?.message || 'failed to link repeaters' }, { status: 500 });
      }
    }
    for (const repeater of matches) {
      if (String(repeater?.callsign || '').trim().toUpperCase() === cs && repeater.callsign !== cs) {
        try {
          await base44.asServiceRole.entities.Repeater.update(repeater.id, { callsign: cs });
        } catch (err) {
          console.error('[assignUserRepeaters] callsign normalize failed:', err?.message || err);
        }
      }
    }
    console.log(`[assignUserRepeaters] found ${matches.length}, linked ${linked} repeaters to ${cs} (${userName || user_id})`);
    return Response.json({ linked, found: matches.length, callsign: cs, user_id });
  } catch (error) {
    console.error('[assignUserRepeaters] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}