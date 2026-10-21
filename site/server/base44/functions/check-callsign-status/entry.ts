import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { ulsLookup } from '../../shared/fcc.ts';
import { normalizeCallsign, writeCallsignAudit } from '../../shared/callsign.ts';
import { setUserCallsignVerified } from '../../shared/verifiedCallsign.ts';
import { listAll } from '../../shared/adminGuard.ts';

// ===== APP-SPECIFIC =====
// Re-verifies a GMRS callsign against the FCC ULS database and updates the
// Callsign record and the user's callsign_verified flag accordingly.
//
// Can be called by:
//   - The user themselves (no args) to re-check their own callsign
//   - An admin ({ user_id }) to check a specific user
//   - A scheduled workflow ({ all: true }) to batch-check all verified callsigns
//
// If the license is no longer active, expired, or suspended, the user's
// callsign_verified is set to false — automatically restricting protected actions.
// ===== END APP-SPECIFIC =====

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const now = new Date().toISOString();

    const caller = await base44.auth.me().catch(() => null);
    if (!caller) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const isAdmin = caller.role === 'admin' || caller.role === 'super_admin';

    // ── BATCH: re-check all verified callsigns (admin / workflow only) ──
    if (body.all) {
      if (!isAdmin) {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }
      // Paginated the same way admin-api's reverify_all is: checking every
      // verified callsign against live FCC/ULS providers can take far longer
      // than a single invocation should run. The previous single, uncapped
      // fetch of up to 500 records sorted newest-first silently never
      // reached anything past that -- meaning the OLDEST, most
      // overdue-for-a-recheck callsigns were exactly the ones that never got
      // re-checked once the table passed 500 rows. A stable id cursor fixes
      // both: no invocation is unboundedly long, and repeated calls (from an
      // admin action or a scheduled workflow looping this itself) eventually
      // cover every verified callsign regardless of table size.
      const afterId = String(body.after_id || '');
      const batchSize = Math.min(15, Math.max(1, Number(body.batchSize) || 10));

      const allCallsigns = await listAll(base44.asServiceRole.entities.Callsign).catch(() => []);
      const eligible = (allCallsigns || [])
        .filter((cs: any) => cs.verification_status === 'verified' && cs.duplicate_flagged !== true)
        .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));

      if (body.dry_run === true) {
        return Response.json({ ok: true, total: eligible.length });
      }

      const startIdx = afterId ? eligible.findIndex((cs: any) => String(cs.id) > afterId) : 0;
      const slice = startIdx === -1 ? [] : eligible.slice(startIdx, startIdx + batchSize);

      let checked = 0;
      let revoked = 0;
      for (const cs of slice) {
        checked++;
        try {
          const result = await ulsLookup(base44, cs.normalized_callsign);
          // An FCC outage is not an invalid license: leave this callsign and its owner untouched.
          if (result.fccReachable === false) continue;
          const licenseActive = result.verified === true;
          // The FCC lookup often gives a status label but no expiration date, so read
          // cancelled / expired / suspended from the label too instead of calling every
          // such license "inactive" (which shows as "None"). Cancelled/terminated is its
          // own bucket -- it's not the same thing as a license that simply lapsed.
          const statusText = String(result.status || '');
          const licenseSuspended = result.found && /suspend/i.test(statusText);
          const licenseCancelled = result.found && /cancel|terminat/i.test(statusText);
          const licenseExpired = result.found && (/expired/i.test(statusText) ||
            (result.expiration && new Date(result.expiration).getTime() < Date.now()));

          const newStatus = !result.fccReachable ? cs.license_status :
            licenseActive ? 'active' :
            licenseSuspended ? 'suspended' :
            licenseCancelled ? 'cancelled' :
            licenseExpired ? 'expired' :
            'inactive';

          await base44.asServiceRole.entities.Callsign.update(cs.id, {
            license_status: newStatus,
            expiration_date: result.expiration || cs.expiration_date || '',
            ...(result.radioService ? { radio_service: result.radioService } : {}),
            last_check_date: now,
            verification_status: licenseActive ? 'verified' : 'pending',
          }).catch(() => {});

          if (!licenseActive && cs.primary_user_id) {
            await setUserCallsignVerified(base44, cs.primary_user_id, false, {
              license_status: newStatus === 'active' ? 'Active' :
                newStatus === 'expired' ? 'Expired' :
                newStatus === 'cancelled' ? 'Cancelled' :
                newStatus === 'suspended' ? 'Suspended' : 'None',
              license_service: result.radioService || undefined,
              license_expiry: result.expiration || '',
              last_check: now,
            });
            revoked++;
            // Log the state transition, not every routine still-verified check
            // in a batch that can cover thousands of callsigns -- the audit
            // trail should capture what changed, not create noise.
            await writeCallsignAudit(base44, {
              callsign_id: cs.id,
              normalized_callsign: cs.normalized_callsign,
              actor_user_id: caller.id,
              actor_name: caller.full_name || caller.email || 'admin',
              action: 'verification_revoked',
              affected_user_id: cs.primary_user_id,
              affected_name: cs.primary_user_name || '',
              primary_user_id: cs.primary_user_id,
              reason: `Batch reverify: license status is now "${newStatus}".`,
            });
          }
        } catch (e) {
          console.error('[check-callsign-status] batch item failed:', cs.normalized_callsign, e?.message || e);
        }
      }
      const nextAfterId = slice.length ? String(slice[slice.length - 1].id) : afterId;
      const done = slice.length < batchSize;
      return Response.json({ ok: true, checked, revoked, total: eligible.length, after_id: nextAfterId, done });
    }

    // ── SINGLE: re-check a specific user's callsign ──
    const targetUserId = body.user_id || (isAdmin ? null : caller.id);
    const targetUser = targetUserId
      ? await base44.asServiceRole.entities.User.get(targetUserId).catch(() => null)
      : caller;

    if (!targetUser) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    if (!isAdmin && targetUserId && targetUserId !== caller.id) {
      return Response.json({ error: 'You can only check your own callsign' }, { status: 403 });
    }

    const callsign = targetUser.callsign ? normalizeCallsign(targetUser.callsign) : '';
    if (!callsign) {
      return Response.json({ ok: false, message: 'No callsign on file.' });
    }

    const result = await ulsLookup(base44, callsign);
    // An FCC outage is not an invalid license. Change nothing (in particular, do not switch
    // the member's verification off) and let the caller retry later.
    if (result.fccReachable === false) {
      return Response.json({
        ok: true,
        callsign,
        verified: !!targetUser.callsign_verified,
        license_status: null,
        expiration: null,
        unavailable: true,
        message: 'FCC lookup unavailable. Your status was not changed and will be checked again later.',
      });
    }
    const licenseActive = result.verified === true;
    const wasVerified = targetUser.callsign_verified === true;
    // See the note above: read cancelled / expired / suspended from the status label as well.
    const statusText = String(result.status || '');
    const licenseSuspended = result.found && /suspend/i.test(statusText);
    const licenseCancelled = result.found && /cancel|terminat/i.test(statusText);
    const licenseExpired = result.found && (/expired/i.test(statusText) ||
      (result.expiration && new Date(result.expiration).getTime() < Date.now()));

    const newLicenseStatus = !result.fccReachable ? 'pending' :
      licenseActive ? 'active' :
      licenseSuspended ? 'suspended' :
      licenseCancelled ? 'cancelled' :
      licenseExpired ? 'expired' :
      'inactive';

    // Update the Callsign record
    const callsignRecords = await base44.asServiceRole.entities.Callsign.filter(
      { normalized_callsign: callsign, duplicate_flagged: { $ne: true } }, '-created_date', 1
    ).catch(() => []);

    if (callsignRecords && callsignRecords.length > 0) {
      const cs = callsignRecords[0];
      await base44.asServiceRole.entities.Callsign.update(cs.id, {
        license_status: newLicenseStatus,
        expiration_date: result.expiration || cs.expiration_date || '',
        licensee_name: result.licensee || cs.licensee_name || '',
        frn: result.frn || cs.frn || '',
        ...(result.radioService ? { radio_service: result.radioService } : {}),
        last_check_date: now,
        verification_status: licenseActive ? 'verified' : 'pending',
      }).catch(() => {});
    }

    // Update the user's verified flag
    const userLicenseStatus = newLicenseStatus === 'active' ? 'Active' :
      newLicenseStatus === 'expired' ? 'Expired' :
      newLicenseStatus === 'cancelled' ? 'Cancelled' :
      newLicenseStatus === 'suspended' ? 'Suspended' :
      newLicenseStatus === 'inactive' ? 'None' : 'Pending';

    await setUserCallsignVerified(base44, targetUser.id, licenseActive, {
      license_status: userLicenseStatus,
      license_service: result.radioService || undefined,
      license_expiry: result.expiration || '',
      last_check: now,
    });

    if (wasVerified !== licenseActive) {
      await base44.asServiceRole.entities.UserNotification.create({
        user_id: targetUser.id,
        title: licenseActive ? '📻 Callsign Verified' : '⚠️ Callsign Verification Changed',
        message: licenseActive
          ? `${callsign} is verified and active again.`
          : `${callsign} is no longer verified as an active callsign. Current status: ${userLicenseStatus}.`,
        type: licenseActive ? 'system' : 'alert',
        sender_name: 'Repeater Nation',
        link_url: '/profile',
        link_label: 'View Callsign',
        description: `callsign_status:${callsign}:${licenseActive ? 'verified' : 'revoked'}`,
      }).catch(()=>{});
    }

    if (callsignRecords && callsignRecords.length > 0) {
      await writeCallsignAudit(base44, {
        callsign_id: callsignRecords[0].id,
        normalized_callsign: callsign,
        actor_user_id: caller.id,
        actor_name: caller.full_name || caller.email || '',
        action: licenseActive ? 'verification_completed' : 'verification_revoked',
        affected_user_id: targetUser.id,
        affected_name: targetUser.email || targetUser.full_name || '',
        primary_user_id: callsignRecords[0].primary_user_id || targetUser.id,
        reason: isAdmin && targetUserId && targetUserId !== caller.id
          ? `Admin-triggered reverify: license status is now "${newLicenseStatus}".`
          : `Self-service reverify: license status is now "${newLicenseStatus}".`,
      });
    }

    return Response.json({
      ok: true,
      callsign,
      verified: licenseActive,
      license_status: newLicenseStatus,
      expiration: result.expiration || null,
      message: licenseActive
        ? 'Callsign verified and active.'
        : result.fccReachable
          ? 'Callsign is not currently active. Protected features are restricted.'
          : 'FCC lookup unavailable. Status will be checked again later.',
    });
  } catch (error) {
    console.error('[check-callsign-status] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}