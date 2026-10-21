import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { normalizeCallsign, writeCallsignAudit } from '../../shared/callsign.ts';
import { setUserCallsignVerified, hasOtherVerifiedCallsignAccess } from '../../shared/verifiedCallsign.ts';
import { ulsLookup } from '../../shared/fcc.ts';

// ===== APP-SPECIFIC =====
// Handles all callsign management actions. Every action verifies the caller's
// authority server-side — primary_user_id match or admin role — before touching
// data. Client-supplied user IDs, callsign IDs, and permission values are never
// trusted directly.
//
// Input: { action, request_id?, access_id?, callsign_id?, new_primary_user_id?, reason? }
// Actions: approve | deny | revoke | cancel | remove_owned | admin_change_primary
// ===== END APP-SPECIFIC =====

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action, request_id, access_id, callsign_id, new_primary_user_id, reason } = body || {};

    if (!action) {
      return Response.json({ error: 'Action required' }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const now = new Date().toISOString();

    // ── APPROVE ──────────────────────────────────────────────
    if (action === 'approve') {
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });

      const request = await base44.asServiceRole.entities.CallsignAccessRequest.get(request_id).catch(() => null);
      if (!request) return Response.json({ error: 'Request not found' }, { status: 404 });
      if (request.status !== 'pending') return Response.json({ error: 'Request is not pending' }, { status: 400 });

      const callsign = await base44.asServiceRole.entities.Callsign.get(request.callsign_id).catch(() => null);
      if (!callsign) return Response.json({ error: 'Callsign not found' }, { status: 404 });

      if (callsign.primary_user_id !== user.id && !isAdmin) {
        return Response.json({ error: 'Only the Primary Callsign Account holder or an admin can approve requests' }, { status: 403 });
      }
      // A user cannot approve their own request (rule 3 & 4)
      if (request.requester_user_id === user.id && !isAdmin) {
        return Response.json({ error: 'You cannot approve your own access request' }, { status: 403 });
      }

      await base44.asServiceRole.entities.CallsignAccessRequest.update(request_id, {
        status: 'approved',
        decision_reason: reason || '',
        decided_at: now,
        decided_by_user_id: user.id,
        decided_by_name: user.full_name || '',
      });

      // Create or reactivate CallsignAccess
      const existingAccess = await base44.asServiceRole.entities.CallsignAccess.filter({
        callsign_id: request.callsign_id,
        user_id: request.requester_user_id,
      }).catch(() => []);

      if (existingAccess && existingAccess.length > 0) {
        await base44.asServiceRole.entities.CallsignAccess.update(existingAccess[0].id, {
          status: 'approved',
          approved_at: now,
          approved_by_user_id: user.id,
          approved_by_name: user.full_name || '',
          revoked_at: '',
          revoked_by_user_id: '',
          revoked_by_name: '',
          revoke_reason: '',
          primary_user_id: callsign.primary_user_id,
        });
      } else {
        await base44.asServiceRole.entities.CallsignAccess.create({
          callsign_id: request.callsign_id,
          normalized_callsign: request.normalized_callsign,
          display_callsign: request.display_callsign,
          user_id: request.requester_user_id,
          user_name: request.requester_name,
          primary_user_id: callsign.primary_user_id,
          status: 'approved',
          approved_at: now,
          approved_by_user_id: user.id,
          approved_by_name: user.full_name || '',
        });
      }

      // If the requester does not already have a primary/owned callsign, make the
      // newly approved authorized callsign their legacy User.callsign value too.
      // This keeps older parts of the app populated without changing the Callsign
      // ownership model: Callsign.primary_user_id remains the actual owner.
      // IMPORTANT: never overwrite an existing primary callsign.
      const requester = await base44.asServiceRole.entities.User.get(request.requester_user_id).catch(() => null);
      const requesterAlreadyHasCallsign = String(requester?.callsign || '').trim().length > 0;
      if (requester && !requesterAlreadyHasCallsign) {
        await base44.asServiceRole.entities.User.update(request.requester_user_id, {
          callsign: callsign.display_callsign || callsign.normalized_callsign || request.display_callsign || request.normalized_callsign,
        });
      }

      // Set the requester's callsign_verified if the callsign is verified and active.
      if (callsign.verification_status === 'verified' && !callsign.suspended &&
          callsign.license_status !== 'expired' && callsign.license_status !== 'suspended' &&
          callsign.license_status !== 'cancelled') {
        await setUserCallsignVerified(base44, request.requester_user_id, true, {
          license_status: 'Active',
          license_expiry: callsign.expiration_date || '',
          last_check: now,
        });
      }

      await writeCallsignAudit(base44, {
        callsign_id: request.callsign_id,
        normalized_callsign: request.normalized_callsign,
        actor_user_id: user.id,
        actor_name: user.full_name || '',
        action: 'access_approved',
        affected_user_id: request.requester_user_id,
        affected_name: request.requester_name,
        primary_user_id: callsign.primary_user_id,
        reason: reason || 'Access approved',
      });

      try {
        await base44.asServiceRole.entities.UserNotification.create({
          user_id: request.requester_user_id,
          title: 'Callsign access approved',
          message: `Your request to use callsign ${request.display_callsign} has been approved.`,
          type: 'system',
          sender_name: user.full_name || 'System',
          link_url: '/callsign-management',
          link_label: 'View status',
          read: false,
        });
      } catch (e) { console.error('[callsign-manage] notify failed:', e?.message || e); }

      return Response.json({ ok: true, status: 'approved' });
    }

    // ── DENY ─────────────────────────────────────────────────
    if (action === 'deny') {
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });

      const request = await base44.asServiceRole.entities.CallsignAccessRequest.get(request_id).catch(() => null);
      if (!request) return Response.json({ error: 'Request not found' }, { status: 404 });
      if (request.status !== 'pending') return Response.json({ error: 'Request is not pending' }, { status: 400 });

      const callsign = await base44.asServiceRole.entities.Callsign.get(request.callsign_id).catch(() => null);
      if (!callsign) return Response.json({ error: 'Callsign not found' }, { status: 404 });

      if (callsign.primary_user_id !== user.id && !isAdmin) {
        return Response.json({ error: 'Only the Primary Callsign Account holder or an admin can deny requests' }, { status: 403 });
      }

      await base44.asServiceRole.entities.CallsignAccessRequest.update(request_id, {
        status: 'denied',
        decision_reason: reason || '',
        decided_at: now,
        decided_by_user_id: user.id,
        decided_by_name: user.full_name || '',
      });

      await writeCallsignAudit(base44, {
        callsign_id: request.callsign_id,
        normalized_callsign: request.normalized_callsign,
        actor_user_id: user.id,
        actor_name: user.full_name || '',
        action: 'access_denied',
        affected_user_id: request.requester_user_id,
        affected_name: request.requester_name,
        primary_user_id: callsign.primary_user_id,
        reason: reason || 'Access denied',
      });

      try {
        await base44.asServiceRole.entities.UserNotification.create({
          user_id: request.requester_user_id,
          title: 'Callsign access denied',
          message: `Your request to use callsign ${request.display_callsign} has been denied.`,
          type: 'system',
          sender_name: user.full_name || 'System',
          link_url: '/callsign-management',
          link_label: 'View status',
          read: false,
        });
      } catch (e) { console.error('[callsign-manage] notify failed:', e?.message || e); }

      return Response.json({ ok: true, status: 'denied' });
    }

    // ── REVOKE ───────────────────────────────────────────────
    if (action === 'revoke') {
      if (!access_id) return Response.json({ error: 'access_id required' }, { status: 400 });

      const access = await base44.asServiceRole.entities.CallsignAccess.get(access_id).catch(() => null);
      if (!access) return Response.json({ error: 'Access record not found' }, { status: 404 });
      if (access.status !== 'approved') return Response.json({ error: 'Access is not active' }, { status: 400 });

      const callsign = await base44.asServiceRole.entities.Callsign.get(access.callsign_id).catch(() => null);
      if (!callsign) return Response.json({ error: 'Callsign not found' }, { status: 404 });

      if (callsign.primary_user_id !== user.id && !isAdmin) {
        return Response.json({ error: 'Only the Primary Callsign Account holder or an admin can revoke access' }, { status: 403 });
      }

      // Revoking does NOT delete the record or any QSO history (rule 5, 6, 8, 9)
      await base44.asServiceRole.entities.CallsignAccess.update(access_id, {
        status: 'revoked',
        revoked_at: now,
        revoked_by_user_id: user.id,
        revoked_by_name: user.full_name || '',
        revoke_reason: reason || '',
      });

      // Check if the user has other verified callsign access. If not, revoke callsign_verified.
      const hasOther = await hasOtherVerifiedCallsignAccess(base44, access.user_id, access.callsign_id);
      if (!hasOther) {
        await setUserCallsignVerified(base44, access.user_id, false, {
          license_status: 'None',
          last_check: now,
        });
      }

      await writeCallsignAudit(base44, {
        callsign_id: access.callsign_id,
        normalized_callsign: access.normalized_callsign,
        actor_user_id: user.id,
        actor_name: user.full_name || '',
        action: 'access_revoked',
        affected_user_id: access.user_id,
        affected_name: access.user_name,
        primary_user_id: callsign.primary_user_id,
        reason: reason || 'Access revoked',
      });

      try {
        await base44.asServiceRole.entities.UserNotification.create({
          user_id: access.user_id,
          title: 'Callsign access revoked',
          message: `Your access to use callsign ${access.display_callsign} has been revoked.`,
          type: 'alert',
          sender_name: user.full_name || 'System',
          link_url: '/callsign-management',
          link_label: 'View status',
          read: false,
        });
      } catch (e) { console.error('[callsign-manage] notify failed:', e?.message || e); }

      return Response.json({ ok: true, status: 'revoked' });
    }

    // ── CANCEL (requester cancels their own pending request) ──
    if (action === 'cancel') {
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });

      const request = await base44.asServiceRole.entities.CallsignAccessRequest.get(request_id).catch(() => null);
      if (!request) return Response.json({ error: 'Request not found' }, { status: 404 });
      if (request.status !== 'pending') return Response.json({ error: 'Request is not pending' }, { status: 400 });

      if (request.requester_user_id !== user.id && !isAdmin) {
        return Response.json({ error: 'You can only cancel your own requests' }, { status: 403 });
      }

      await base44.asServiceRole.entities.CallsignAccessRequest.update(request_id, {
        status: 'cancelled',
        decided_at: now,
        decided_by_user_id: user.id,
        decided_by_name: user.full_name || '',
      });

      await writeCallsignAudit(base44, {
        callsign_id: request.callsign_id,
        normalized_callsign: request.normalized_callsign,
        actor_user_id: user.id,
        actor_name: user.full_name || '',
        action: 'request_cancelled',
        affected_user_id: request.requester_user_id,
        affected_name: request.requester_name,
        primary_user_id: request.primary_user_id,
        reason: 'Request cancelled by requester',
      });

      return Response.json({ ok: true, status: 'cancelled' });
    }

    // ── SELF-SERVICE RE-VERIFY ───────────────────────────────
    // Any authenticated user may re-check a callsign they own or have
    // approved access to. Re-verification refreshes the canonical Callsign
    // record and synchronizes verification status to every approved user.
    if (action === 'reverify') {
      if (!callsign_id) return Response.json({ error: 'callsign_id required' }, { status: 400 });

      const callsign = await base44.asServiceRole.entities.Callsign.get(callsign_id).catch(() => null);
      if (!callsign) return Response.json({ error: 'Callsign not found' }, { status: 404 });

      const isPrimary = callsign.primary_user_id === user.id;
      let isAuthorized = false;
      if (!isPrimary) {
        const access = await base44.asServiceRole.entities.CallsignAccess.filter({
          callsign_id,
          user_id: user.id,
          status: 'approved',
        }).catch(() => []);
        isAuthorized = (access || []).length > 0;
      }

      if (!isPrimary && !isAuthorized && !isAdmin) {
        return Response.json({ error: 'You are not authorized to re-verify this callsign' }, { status: 403 });
      }

      const normalized = normalizeCallsign(callsign.display_callsign || callsign.normalized_callsign);
      if (!normalized) return Response.json({ error: 'Callsign is invalid' }, { status: 400 });

      let lookup: any = null;
      try {
        lookup = await ulsLookup(base44, normalized);
      } catch (e) {
        console.error('[callsign-manage] reverify lookup failed:', e?.message || e);
        return Response.json({ error: 'Verification services are temporarily unavailable. Please try again later.' }, { status: 503 });
      }

      // An admin can mark a callsign verified without a lookup when the FCC/
      // OpenCallbook providers can't confirm a license that's genuinely valid
      // (see admin-api's set_callsign mark_verified). A re-verify that still
      // can't find the callsign afterward doesn't mean it's newly invalid --
      // it means the provider gap that required the override hasn't closed
      // yet. Don't let a routine re-verify silently undo that attestation;
      // only a lookup that actually finds the callsign should move it off it.
      if (!lookup || lookup.fccReachable === false) {
        return Response.json({
          ok: true,
          verified: true,
          unchanged: true,
          message: 'Verification services are temporarily unavailable. Your current callsign verification was not changed.',
        });
      }

      if (!lookup?.found && callsign.verification_method === 'admin_manual') {
        return Response.json({
          ok: true,
          verified: true,
          message: `${callsign.display_callsign || normalized} is still relying on an admin's manual verification -- the lookup providers still can't confirm it, so it was left as-is.`,
        });
      }

      const verified = lookup?.verified === true;
      const statusText = String(lookup?.status || '');
      // Matches the same status-text classification check-callsign-status and
      // admin-api's reverify actions use -- this path was missing the
      // suspended check, so a suspended license here fell through to
      // 'pending' and the shouldBeVerified guard's `!== 'suspended'` check
      // below could never actually fire.
      const licenseStatus = verified
        ? 'active'
        : (/cancel|terminat/i.test(statusText) ? 'cancelled'
          : /expired/i.test(statusText) ? 'expired'
          : /suspend/i.test(statusText) ? 'suspended'
          : 'pending');

      const refreshed: any = {
        verification_status: verified ? 'verified' : 'pending',
        license_status: licenseStatus,
        last_check_date: now,
      };
      if (lookup?.expiration) refreshed.expiration_date = lookup.expiration;
      if (lookup?.licensee) refreshed.licensee_name = lookup.licensee;
      if (lookup?.frn) refreshed.frn = lookup.frn;
      if (lookup?.country) refreshed.license_country = lookup.country;
      if (lookup?.radioService) refreshed.radio_service = lookup.radioService;
      if (lookup?.verificationSource) refreshed.verification_source = lookup.verificationSource;
      if (lookup?.verificationMethod) refreshed.verification_method = lookup.verificationMethod;

      await base44.asServiceRole.entities.Callsign.update(callsign.id, refreshed);

      const shouldBeVerified = verified && !callsign.suspended && licenseStatus !== 'expired' && licenseStatus !== 'cancelled' && licenseStatus !== 'suspended';
      const primaryOptions = {
        license_status: shouldBeVerified ? 'Active' : (licenseStatus === 'cancelled' ? 'Cancelled' : licenseStatus === 'expired' ? 'Expired' : licenseStatus === 'suspended' ? 'Suspended' : 'Pending'),
        license_service: refreshed.radio_service || callsign.radio_service || undefined,
        license_expiry: refreshed.expiration_date || callsign.expiration_date || '',
        last_check: now,
      };
      await setUserCallsignVerified(base44, callsign.primary_user_id, shouldBeVerified, primaryOptions);

      const accessRecords = await base44.asServiceRole.entities.CallsignAccess.filter({
        callsign_id: callsign.id,
        status: 'approved',
      }).catch(() => []);

      for (const access of accessRecords || []) {
        const hasOther = await hasOtherVerifiedCallsignAccess(base44, access.user_id, callsign.id);
        if (shouldBeVerified || !hasOther) {
          await setUserCallsignVerified(base44, access.user_id, shouldBeVerified, primaryOptions);
        }
      }

      await writeCallsignAudit(base44, {
        callsign_id: callsign.id,
        normalized_callsign: callsign.normalized_callsign,
        actor_user_id: user.id,
        actor_name: user.full_name || '',
        action: 'verification_completed',
        affected_user_id: callsign.primary_user_id,
        affected_name: callsign.primary_user_name || '',
        primary_user_id: callsign.primary_user_id,
        reason: shouldBeVerified ? 'Self-service re-verified: active' : 'Self-service re-verified: not currently active',
      });

      return Response.json({
        ok: true,
        verified: shouldBeVerified,
        message: shouldBeVerified
          ? `${callsign.display_callsign || normalized} re-verified — license is active.`
          : `${callsign.display_callsign || normalized} re-verified — license is not currently active.`,
      });
    }

    // ── REMOVE OWNED CALLSIGN ─────────────────────────────────
    // A primary account holder may remove a callsign they own. We keep this
    // server-side because Callsign RLS does not allow direct client deletion.
    // Shared callsigns with active authorized users cannot be removed until
    // those users' access is revoked.
    if (action === 'remove_owned') {
      if (!callsign_id) return Response.json({ error: 'callsign_id required' }, { status: 400 });

      const callsign = await base44.asServiceRole.entities.Callsign.get(callsign_id).catch(() => null);
      if (!callsign) return Response.json({ error: 'Callsign not found' }, { status: 404 });

      if (callsign.primary_user_id !== user.id && !isAdmin) {
        return Response.json({ error: 'Only the callsign owner can remove this callsign' }, { status: 403 });
      }

      const activeAccess = await base44.asServiceRole.entities.CallsignAccess.filter({
        callsign_id,
        status: 'approved',
      }).catch(() => []);

      if ((activeAccess || []).length > 0) {
        if (!isAdmin) {
          return Response.json({
            error: 'This callsign is still shared with another account. Revoke all authorized users before removing it.',
          }, { status: 409 });
        }
        // Admins may force-remove a callsign even while it's still shared (e.g. to
        // fix a mis-claimed or duplicate record). Revoke every authorized user's
        // access first instead of deleting the Callsign out from under them and
        // leaving their CallsignAccess rows pointing at a record that no longer
        // exists -- same cleanup the 'revoke' action already does per user.
        for (const access of activeAccess) {
          await base44.asServiceRole.entities.CallsignAccess.update(access.id, {
            status: 'revoked',
            revoked_at: now,
            revoked_by_user_id: user.id,
            revoked_by_name: user.full_name || '',
            revoke_reason: reason || 'Primary callsign removed by admin',
          });
          const hasOther = await hasOtherVerifiedCallsignAccess(base44, access.user_id, callsign_id);
          if (!hasOther) {
            await setUserCallsignVerified(base44, access.user_id, false, {
              license_status: 'None',
              last_check: now,
            });
          }
          try {
            await base44.asServiceRole.entities.UserNotification.create({
              user_id: access.user_id,
              title: 'Callsign access revoked',
              message: `Your access to use callsign ${access.display_callsign} has been revoked because the callsign was removed.`,
              type: 'alert',
              sender_name: user.full_name || 'System',
              link_url: '/callsign-management',
              link_label: 'View status',
              read: false,
            });
          } catch (e) { console.error('[callsign-manage] notify failed:', e?.message || e); }
        }
      }

      const pendingRequests = await base44.asServiceRole.entities.CallsignAccessRequest.filter({
        callsign_id,
        status: 'pending',
      }).catch(() => []);

      for (const request of pendingRequests || []) {
        await base44.asServiceRole.entities.CallsignAccessRequest.update(request.id, {
          status: 'cancelled',
          decided_at: now,
          decided_by_user_id: user.id,
          decided_by_name: user.full_name || '',
        });
      }

      const removedCallsign = {
        id: callsign.id,
        display_callsign: callsign.display_callsign,
        normalized_callsign: callsign.normalized_callsign,
      };

      await writeCallsignAudit(base44, {
        callsign_id: callsign.id,
        normalized_callsign: callsign.normalized_callsign,
        actor_user_id: user.id,
        actor_name: user.full_name || '',
        action: 'callsign_removed',
        affected_user_id: callsign.primary_user_id,
        affected_name: callsign.primary_user_name,
        primary_user_id: callsign.primary_user_id,
        reason: reason || 'Callsign removed by primary account holder',
      });

      await base44.asServiceRole.entities.Callsign.delete(callsign.id);

      // Keep the legacy User fields aligned with the remaining owned callsigns.
      // The multiple-callsign profile uses Callsign records as its source of truth,
      // but older features still read User.callsign.
      const remainingOwned = await base44.asServiceRole.entities.Callsign.filter({
        primary_user_id: user.id,
        duplicate_flagged: { $ne: true },
      }).catch(() => []);

      const next = (remainingOwned || [])
        .filter((c) => c.id !== callsign.id)
        .sort((a, z) => new Date(a.created_date || 0).getTime() - new Date(z.created_date || 0).getTime())[0];

      if (next) {
        const verified = next.verification_status === 'verified' && !next.suspended &&
          next.license_status !== 'expired' && next.license_status !== 'suspended' &&
          next.license_status !== 'cancelled';
        await base44.asServiceRole.entities.User.update(user.id, {
          callsign: next.display_callsign || next.normalized_callsign || '',
          callsign_verified: verified,
          license_status: verified ? 'Active' : 'Pending',
          license_service: next.radio_service === 'HAM' ? 'HAM' : 'GMRS',
          license_expiry: next.expiration_date || undefined,
          license_country: next.license_country || undefined,
          verification_source: next.verification_source || undefined,
          verification_method: next.verification_method || undefined,
        });
      } else {
        await base44.asServiceRole.entities.User.update(user.id, {
          callsign: '',
          callsign_verified: false,
          license_status: 'None',
          license_expiry: undefined,
          license_service: undefined,
          license_country: undefined,
          verification_source: undefined,
          verification_method: undefined,
          last_callsign_check: now,
        });
      }

      return Response.json({ ok: true, status: 'removed', callsign: removedCallsign });
    }

    // ── ADMIN CHANGE PRIMARY ─────────────────────────────────
    if (action === 'admin_change_primary') {
      if (!isAdmin) {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }
      if (!callsign_id || !new_primary_user_id) {
        return Response.json({ error: 'callsign_id and new_primary_user_id required' }, { status: 400 });
      }

      const callsign = await base44.asServiceRole.entities.Callsign.get(callsign_id).catch(() => null);
      if (!callsign) return Response.json({ error: 'Callsign not found' }, { status: 404 });

      const newPrimary = await base44.asServiceRole.entities.User.get(new_primary_user_id).catch(() => null);
      if (!newPrimary) return Response.json({ error: 'New primary user not found' }, { status: 404 });

      const previousPrimary = {
        primary_user_id: callsign.primary_user_id,
        primary_user_name: callsign.primary_user_name,
      };

      // Rule 10 & 11: ownership changes only through server-side logic
      await base44.asServiceRole.entities.Callsign.update(callsign_id, {
        primary_user_id: new_primary_user_id,
        primary_user_name: newPrimary.full_name || '',
      });

      // Update denormalized primary_user_id on all related records
      const accessRecords = await base44.asServiceRole.entities.CallsignAccess.filter({ callsign_id }).catch(() => []);
      for (const a of accessRecords) {
        await base44.asServiceRole.entities.CallsignAccess.update(a.id, { primary_user_id: new_primary_user_id });
      }

      const pendingRequests = await base44.asServiceRole.entities.CallsignAccessRequest.filter({
        callsign_id, status: 'pending',
      }).catch(() => []);
      for (const r of pendingRequests) {
        await base44.asServiceRole.entities.CallsignAccessRequest.update(r.id, { primary_user_id: new_primary_user_id });
      }

      await writeCallsignAudit(base44, {
        callsign_id,
        normalized_callsign: callsign.normalized_callsign,
        actor_user_id: user.id,
        actor_name: user.full_name || '',
        action: 'primary_changed',
        affected_user_id: new_primary_user_id,
        affected_name: newPrimary.full_name || '',
        primary_user_id: new_primary_user_id,
        reason: reason || 'Primary changed by admin',
        metadata: { previous_primary: previousPrimary },
      });

      // Also write to the admin AuditLog
      try {
        await base44.asServiceRole.entities.AuditLog.create({
          admin_id: user.id,
          admin_name: user.full_name || '',
          action: 'callsign.primary_changed',
          category: 'admin',
          target_type: 'Callsign',
          target_id: callsign_id,
          target_label: callsign.display_callsign,
          before: JSON.stringify(previousPrimary),
          after: JSON.stringify({ primary_user_id: new_primary_user_id, primary_user_name: newPrimary.full_name || '' }),
          meta: JSON.stringify({ reason: reason || '' }),
        });
      } catch (e) { console.error('[callsign-manage] audit log failed:', e?.message || e); }

      return Response.json({ ok: true, status: 'primary_changed' });
    }

    // ── ADMIN: SUSPEND VERIFICATION ──────────────────────────
    if (action === 'suspend_verification') {
      if (!isAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 });
      if (!callsign_id) return Response.json({ error: 'callsign_id required' }, { status: 400 });

      const callsign = await base44.asServiceRole.entities.Callsign.get(callsign_id).catch(() => null);
      if (!callsign) return Response.json({ error: 'Callsign not found' }, { status: 404 });

      await base44.asServiceRole.entities.Callsign.update(callsign_id, {
        suspended: true,
        suspension_reason: reason || 'Suspended by admin',
        suspended_at: now,
        suspended_by_user_id: user.id,
        suspended_by_name: user.full_name || '',
        license_status: 'suspended',
      });

      // Revoke callsign_verified for the primary user
      await setUserCallsignVerified(base44, callsign.primary_user_id, false, {
        license_status: 'Suspended',
        last_check: now,
      });

      // Revoke callsign_verified for all authorized users who have no other verified callsign
      const accessRecords = await base44.asServiceRole.entities.CallsignAccess.filter({
        callsign_id, status: 'approved',
      }).catch(() => []);
      for (const a of accessRecords || []) {
        const hasOther = await hasOtherVerifiedCallsignAccess(base44, a.user_id, callsign_id);
        if (!hasOther) {
          await setUserCallsignVerified(base44, a.user_id, false, {
            license_status: 'Suspended',
            last_check: now,
          });
        }
      }

      await writeCallsignAudit(base44, {
        callsign_id, normalized_callsign: callsign.normalized_callsign,
        actor_user_id: user.id, actor_name: user.full_name || '',
        action: 'admin_override', affected_user_id: callsign.primary_user_id,
        affected_name: callsign.primary_user_name,
        primary_user_id: callsign.primary_user_id,
        reason: `Verification suspended: ${reason || 'admin override'}`,
      });

      try {
        await base44.asServiceRole.entities.AuditLog.create({
          admin_id: user.id, admin_name: user.full_name || '',
          action: 'callsign.verification_suspended', category: 'admin',
          target_type: 'Callsign', target_id: callsign_id, target_label: callsign.display_callsign,
          meta: JSON.stringify({ reason: reason || '' }),
        });
      } catch (e) { console.error('[callsign-manage] audit log failed:', e?.message || e); }

      return Response.json({ ok: true, status: 'suspended' });
    }

    // ── ADMIN: REVOKE VERIFICATION ──────────────────────────
    if (action === 'revoke_verification') {
      if (!isAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 });
      if (!callsign_id) return Response.json({ error: 'callsign_id required' }, { status: 400 });

      const callsign = await base44.asServiceRole.entities.Callsign.get(callsign_id).catch(() => null);
      if (!callsign) return Response.json({ error: 'Callsign not found' }, { status: 404 });

      await base44.asServiceRole.entities.Callsign.update(callsign_id, {
        verification_status: 'pending',
        suspended: false,
        suspension_reason: '',
        suspended_at: '',
        suspended_by_user_id: '',
        suspended_by_name: '',
        license_status: 'pending',
      });

      await setUserCallsignVerified(base44, callsign.primary_user_id, false, {
        license_status: 'Pending',
        last_check: now,
      });

      // Put the primary account under investigation and strip the callsign from it.
      try {
        await base44.asServiceRole.entities.User.update(callsign.primary_user_id, {
          account_status: 'investigation',
          callsign: '',
        });
      } catch (e) { console.error('[callsign-manage] user investigation update failed:', e?.message || e); }

      const accessRecords = await base44.asServiceRole.entities.CallsignAccess.filter({
        callsign_id, status: 'approved',
      }).catch(() => []);
      for (const a of accessRecords || []) {
        const hasOther = await hasOtherVerifiedCallsignAccess(base44, a.user_id, callsign_id);
        if (!hasOther) {
          await setUserCallsignVerified(base44, a.user_id, false, {
            license_status: 'Pending',
            last_check: now,
          });
        }
      }

      await writeCallsignAudit(base44, {
        callsign_id, normalized_callsign: callsign.normalized_callsign,
        actor_user_id: user.id, actor_name: user.full_name || '',
        action: 'admin_override', affected_user_id: callsign.primary_user_id,
        affected_name: callsign.primary_user_name,
        primary_user_id: callsign.primary_user_id,
        reason: `Verification revoked: ${reason || 'admin override'}`,
      });

      try {
        await base44.asServiceRole.entities.AuditLog.create({
          admin_id: user.id, admin_name: user.full_name || '',
          action: 'callsign.verification_revoked', category: 'admin',
          target_type: 'Callsign', target_id: callsign_id, target_label: callsign.display_callsign,
          meta: JSON.stringify({ reason: reason || '' }),
        });
      } catch (e) { console.error('[callsign-manage] audit log failed:', e?.message || e); }

      try {
        await base44.asServiceRole.entities.UserNotification.create({
          user_id: callsign.primary_user_id,
          title: 'Callsign revoked',
          message: `Your callsign ${callsign.display_callsign} has been revoked and your account is under investigation. Contact an administrator if you believe this is an error.`,
          type: 'alert',
          sender_name: user.full_name || 'System',
          link_url: '/callsign-management',
          link_label: 'View status',
          read: false,
        });
      } catch (e) { console.error('[callsign-manage] notify failed:', e?.message || e); }

      return Response.json({ ok: true, status: 'revoked' });
    }

    // ── ADMIN: APPROVE VERIFICATION ──────────────────────────
    if (action === 'approve_verification') {
      if (!isAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 });
      if (!callsign_id) return Response.json({ error: 'callsign_id required' }, { status: 400 });

      const callsign = await base44.asServiceRole.entities.Callsign.get(callsign_id).catch(() => null);
      if (!callsign) return Response.json({ error: 'Callsign not found' }, { status: 404 });

      await base44.asServiceRole.entities.Callsign.update(callsign_id, {
        verification_status: 'verified',
        verified_at: now,
        suspended: false,
        suspension_reason: '',
        suspended_at: '',
        suspended_by_user_id: '',
        suspended_by_name: '',
        license_status: 'active',
        last_check_date: now,
      });

      await setUserCallsignVerified(base44, callsign.primary_user_id, true, {
        license_status: 'Active',
        license_expiry: callsign.expiration_date || '',
        last_check: now,
      });

      // Also grant callsign_verified to all approved access users
      const accessRecords = await base44.asServiceRole.entities.CallsignAccess.filter({
        callsign_id, status: 'approved',
      }).catch(() => []);
      for (const a of accessRecords || []) {
        await setUserCallsignVerified(base44, a.user_id, true, {
          license_status: 'Active',
          license_expiry: callsign.expiration_date || '',
          last_check: now,
        });
      }

      await writeCallsignAudit(base44, {
        callsign_id, normalized_callsign: callsign.normalized_callsign,
        actor_user_id: user.id, actor_name: user.full_name || '',
        action: 'verification_completed', affected_user_id: callsign.primary_user_id,
        affected_name: callsign.primary_user_name,
        primary_user_id: callsign.primary_user_id,
        reason: `Verification approved by admin: ${reason || 'admin override'}`,
      });

      try {
        await base44.asServiceRole.entities.AuditLog.create({
          admin_id: user.id, admin_name: user.full_name || '',
          action: 'callsign.verification_approved', category: 'admin',
          target_type: 'Callsign', target_id: callsign_id, target_label: callsign.display_callsign,
          meta: JSON.stringify({ reason: reason || '' }),
        });
      } catch (e) { console.error('[callsign-manage] audit log failed:', e?.message || e); }

      return Response.json({ ok: true, status: 'approved' });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[callsign-manage] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}