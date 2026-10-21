import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { normalizeCallsign, writeCallsignAudit } from '../../shared/callsign.ts';
import { setUserCallsignVerified, hasOtherVerifiedCallsignAccess, hasOtherVerifiedCallsign } from '../../shared/verifiedCallsign.ts';
import { postDiscordNotification } from '../../shared/discordWebhook.ts';
import { ulsLookup, isCallsignFormat } from '../../shared/fcc.ts';
import { sendUserEmail } from '../../shared/notify.ts';
import { getEmailTemplateSettings, renderEmailTemplate } from '../../shared/emailTemplates.ts';

// ===== APP-SPECIFIC =====
// Called after a user verifies their callsign (typically during registration).
// If the normalized callsign does not exist, the user becomes the Primary Callsign Account.
// If it already exists, a pending CallsignAccessRequest is created and the primary
// account holder is notified. The requester cannot use the callsign as authorized
// until the request is approved.
//
// Input: { callsign, display_name, license_verified, message }
// Returns: { status: "primary" | "authorized" | "pending", message, callsign_id, request_id? }
// ===== END APP-SPECIFIC =====

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const rawCallsign = String(body.callsign || '').trim();
    const normalized = normalizeCallsign(rawCallsign);

    if (!normalized) {
      return Response.json({ error: 'Callsign required' }, { status: 400 });
    }
    if (!isCallsignFormat(rawCallsign)) {
      return Response.json({
        status: 'invalid',
        message: 'Enter one callsign, letters and numbers only (for example WRQF238 or KD9UNT). Add each callsign separately.',
      }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const displayName = body.display_name || user.full_name || '';

    // Perform server-side license verification — never trust the client-supplied
    // license_verified flag. The shared lookup may use FCC or international HAM providers.
    let fccResult: any = null;
    try {
      fccResult = await ulsLookup(base44, rawCallsign.toUpperCase());
    } catch (e) {
      console.error('[callsign-claim] FCC lookup failed:', e?.message || e);
    }
    const isVerified = !!(fccResult && fccResult.verified === true);

    // Check all existing records for this normalized callsign.
    // Base44 does not enforce a unique constraint on normalized_callsign, so
    // we must explicitly prevent the same account from creating another primary
    // record for an already-claimed callsign.
    let existing = await base44.asServiceRole.entities.Callsign.filter(
      { normalized_callsign: normalized, duplicate_flagged: { $ne: true } }, 'created_date', 50
    ).catch(() => []);

    if (!existing || existing.length === 0) {
      // No existing record — try to claim as primary.
      // The try/catch handles race conditions: if two users register simultaneously,
      // only one create succeeds (normalized_callsign uniqueness is enforced at the
      // application level by checking first; the DB itself doesn't enforce uniqueness
      // on Base44, so we re-check after a failure).
      try {
        const now = new Date().toISOString();
        const recordData: any = {
          normalized_callsign: normalized,
          display_callsign: rawCallsign.toUpperCase(),
          primary_user_id: user.id,
          primary_user_name: displayName,
          verification_status: isVerified ? 'verified' : 'pending',
          license_status: isVerified ? 'active' : 'pending',
          expiration_date: fccResult?.expiration || body.license_expiry || '',
          licensee_name: fccResult?.licensee || body.licensee_name || '',
          frn: fccResult?.frn || body.frn || '',
          last_check_date: now,
          license_country: fccResult?.country || '',
          verification_source: fccResult?.verificationSource || 'FCC/OpenCallbook',
          verification_method: fccResult?.verificationMethod || 'official_fcc',
        };
        if (isVerified) recordData.verified_at = now;
        // GMRS or HAM, from the FCC record. Optional: registration must never fail because of it.
        if (fccResult?.radioService) recordData.radio_service = fccResult.radioService;
        let record: any;
        try {
          record = await base44.asServiceRole.entities.Callsign.create(recordData);
        } catch (createErr) {
          if (!recordData.radio_service) throw createErr;
          delete recordData.radio_service;
          record = await base44.asServiceRole.entities.Callsign.create(recordData);
        }

        // Keep the legacy User.callsign fields as the primary/first callsign only.
        // Additional verified GMRS/HAM callsigns live in Callsign records and are
        // displayed by My Callsign/Profile without overwriting the user's primary.
        // Registration writes User.callsign via updateMe before calling this
        // function, so a bare presence check here always looks like "already
        // has a different primary" on a brand-new account and skips setting
        // callsign_verified — permanently stuck behind ProtectedRoute's
        // verification gate. Only treat it as a different, already-owned
        // primary when it doesn't match the callsign being claimed right now.
        // A different callsign that never verified (still pending, or text that
        // was never a single callsign) doesn't count: keeping it would leave the
        // account locked out even though this claim verified, so this callsign
        // replaces it as the primary.
        const alreadyHasPrimary = user.callsign_verified === true &&
          String(user.callsign || '').trim().length > 0 &&
          normalizeCallsign(user.callsign) !== normalized;
        if (!alreadyHasPrimary) {
          await setUserCallsignVerified(base44, user.id, isVerified, {
            callsign: rawCallsign.toUpperCase(),
            license_status: isVerified ? 'Active' : 'Pending',
            license_service: fccResult?.radioService || undefined,
            license_expiry: fccResult?.expiration || body.license_expiry || '',
            last_check: now,
            license_country: fccResult?.country || undefined,
            verification_source: fccResult?.verificationSource || 'FCC/OpenCallbook',
            verification_method: fccResult?.verificationMethod || 'official_fcc',
          });
        }

        await writeCallsignAudit(base44, {
          callsign_id: record.id,
          normalized_callsign: normalized,
          actor_user_id: user.id,
          actor_name: displayName,
          action: 'claimed',
          affected_user_id: user.id,
          affected_name: displayName,
          primary_user_id: user.id,
          reason: 'Primary callsign account claimed during registration',
        });

        return Response.json({
          status: 'primary',
          message: 'You are now the Primary Callsign Account holder.',
          callsign_id: record.id,
        });
      } catch (e) {
        // Race condition — another user may have claimed it. Re-check all
        // records and use the canonical (oldest) record.
        console.error('[callsign-claim] create failed, re-checking:', e?.message || e);
        existing = await base44.asServiceRole.entities.Callsign.filter(
          { normalized_callsign: normalized, duplicate_flagged: { $ne: true } }, 'created_date', 50
        ).catch(() => []);
        if (!existing || existing.length === 0) {
          return Response.json({ error: 'Failed to claim callsign. Please try again.' }, { status: 500 });
        }
      }
    }

    // Always use the oldest record as the canonical callsign record. This keeps
    // an accidental duplicate from becoming the active primary record.
    const callsignRecord = [...existing].sort(
      (a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime()
    )[0];

    // User is already the primary — this call is a re-verify. If the
    // lookup services are unavailable, do not change a previously verified
    // account to pending. A provider outage is not evidence that a license
    // became invalid.
    if (callsignRecord.primary_user_id === user.id) {
      if (!fccResult || fccResult.fccReachable === false) {
        return Response.json({
          status: 'primary',
          verified: true,
          message: 'Verification services are temporarily unavailable. Your current callsign verification was left unchanged; please try again later.',
          callsign_id: callsignRecord.id,
          unchanged: true,
        });
      }
      const now = new Date().toISOString();
      const refreshed: any = {
        verification_status: isVerified ? 'verified' : 'pending',
        last_check_date: now,
      };
      if (fccResult) {
        refreshed.license_status = isVerified
          ? 'active'
          : fccResult.status && /cancel|terminat/i.test(fccResult.status) ? 'cancelled'
          : fccResult.status && /expired/i.test(fccResult.status) ? 'expired'
          : callsignRecord.license_status;
        if (fccResult.expiration) refreshed.expiration_date = fccResult.expiration;
        if (fccResult.licensee) refreshed.licensee_name = fccResult.licensee;
        if (fccResult.frn) refreshed.frn = fccResult.frn;
        if (fccResult.country) refreshed.license_country = fccResult.country;
        if (fccResult.radioService) refreshed.radio_service = fccResult.radioService;
        if (fccResult.verificationSource) refreshed.verification_source = fccResult.verificationSource;
        if (fccResult.verificationMethod) refreshed.verification_method = fccResult.verificationMethod;
      }
      await base44.asServiceRole.entities.Callsign.update(callsignRecord.id, refreshed).catch((e: any) =>
        console.error('[callsign-claim] re-verify update failed:', e?.message || e)
      );

      const shouldBeVerified = refreshed.verification_status === 'verified' &&
        !callsignRecord.suspended &&
        refreshed.license_status !== 'expired' &&
        refreshed.license_status !== 'cancelled' &&
        refreshed.license_status !== 'suspended';
      // A lapsed extra callsign doesn't lock out an account that still has
      // another active one.
      const keptByOther = !shouldBeVerified && user.callsign_verified === true &&
        await hasOtherVerifiedCallsign(base44, user.id, callsignRecord.id);
      if (!keptByOther) {
        await setUserCallsignVerified(base44, user.id, shouldBeVerified, {
          // An account that wasn't verified yet takes this as its primary callsign.
          ...(shouldBeVerified && user.callsign_verified !== true
            ? { callsign: callsignRecord.display_callsign || rawCallsign.toUpperCase() } : {}),
          license_status: shouldBeVerified ? 'Active' : 'Pending',
          license_service: refreshed.radio_service || callsignRecord.radio_service || undefined,
          license_expiry: refreshed.expiration_date || callsignRecord.expiration_date || '',
          last_check: now,
        });
      }

      // A re-verify only touched the primary holder's own callsign_verified
      // flag — anyone sharing this callsign as an authorized (non-primary)
      // user stayed stuck at whatever status they had before, even though
      // they ride on the same underlying license. Sync them too, same as
      // the admin suspend/revoke/approve actions already do.
      const authorizedAccess = await base44.asServiceRole.entities.CallsignAccess.filter({
        callsign_id: callsignRecord.id, status: 'approved',
      }).catch(() => []);
      for (const a of authorizedAccess || []) {
        if (shouldBeVerified) {
          await setUserCallsignVerified(base44, a.user_id, true, {
            license_status: 'Active',
            license_service: refreshed.radio_service || callsignRecord.radio_service || undefined,
            license_expiry: refreshed.expiration_date || callsignRecord.expiration_date || '',
            last_check: now,
          });
        } else {
          const hasOther = await hasOtherVerifiedCallsignAccess(base44, a.user_id, callsignRecord.id);
          if (!hasOther) {
            await setUserCallsignVerified(base44, a.user_id, false, {
              license_status: 'Pending',
              last_check: now,
            });
          }
        }
      }

      await writeCallsignAudit(base44, {
        callsign_id: callsignRecord.id,
        normalized_callsign: normalized,
        actor_user_id: user.id,
        actor_name: displayName,
        action: 'verification_completed',
        affected_user_id: user.id,
        affected_name: displayName,
        primary_user_id: user.id,
        reason: shouldBeVerified ? 'Re-verified: active' : 'Re-verified: not currently active',
      });

      return Response.json({
        status: 'primary',
        message: shouldBeVerified ? 'Re-verified — license is active.' : 'Re-verified — license is not currently active.',
        callsign_id: callsignRecord.id,
      });
    }

    // Check if user already has approved access
    const existingAccess = await base44.asServiceRole.entities.CallsignAccess.filter({
      callsign_id: callsignRecord.id,
      user_id: user.id,
      status: 'approved',
    }).catch(() => []);

    if (existingAccess && existingAccess.length > 0) {
      return Response.json({
        status: 'authorized',
        message: 'You are an authorized user for this callsign.',
        callsign_id: callsignRecord.id,
      });
    }

    // Check if there's already a pending request from this user
    const existingRequest = await base44.asServiceRole.entities.CallsignAccessRequest.filter({
      callsign_id: callsignRecord.id,
      requester_user_id: user.id,
      status: 'pending',
    }).catch(() => []);

    if (existingRequest && existingRequest.length > 0) {
      return Response.json({
        status: 'pending',
        message: 'Your access request is pending approval.',
        callsign_id: callsignRecord.id,
        request_id: existingRequest[0].id,
      });
    }

    // Create a pending access request
    const requestRecord = await base44.asServiceRole.entities.CallsignAccessRequest.create({
      callsign_id: callsignRecord.id,
      normalized_callsign: normalized,
      display_callsign: callsignRecord.display_callsign,
      requester_user_id: user.id,
      requester_name: displayName,
      primary_user_id: callsignRecord.primary_user_id,
      status: 'pending',
      message: body.message || '',
    });

    await writeCallsignAudit(base44, {
      callsign_id: callsignRecord.id,
      normalized_callsign: normalized,
      actor_user_id: user.id,
      actor_name: displayName,
      action: 'access_requested',
      affected_user_id: callsignRecord.primary_user_id,
      affected_name: callsignRecord.primary_user_name,
      primary_user_id: callsignRecord.primary_user_id,
      reason: 'Access requested during registration',
    });

    // Notify the primary account holder
    try {
      await base44.asServiceRole.entities.UserNotification.create({
        user_id: callsignRecord.primary_user_id,
        title: 'Callsign access request',
        message: `${displayName || 'A member'} requested access to use callsign ${callsignRecord.display_callsign}.`,
        type: 'access_request',
        sender_name: displayName || 'Member',
        link_url: '/callsign-management',
        link_label: 'Review request',
        description: `callsign_request:${requestRecord.id}`,
        read: false,
      });
    } catch (e) {
      console.error('[callsign-claim] primary notify failed:', e?.message || e);
    }

    // Email the primary account holder too -- the in-app notification alone is
    // easy to miss if they don't check the site, and this request blocks the
    // requester from being treated as authorized until it's approved.
    try {
      const settings = await getEmailTemplateSettings(base44);
      const rendered = renderEmailTemplate(settings, 'callsign_access_request', {
        requester_display: displayName || 'A member',
        callsign: callsignRecord.display_callsign,
      });
      if (rendered) {
        await sendUserEmail(base44, callsignRecord.primary_user_id, 'access_requests', rendered.subject, rendered.body);
      }
    } catch (e) {
      console.error('[callsign-claim] primary email notify failed:', e?.message || e);
    }

    // Notify the requester
    try {
      await base44.asServiceRole.entities.UserNotification.create({
        user_id: user.id,
        title: 'Callsign access request sent',
        message: `This callsign is already registered. An approval request has been sent to the current callsign account holder for ${callsignRecord.display_callsign}.`,
        type: 'system',
        sender_name: 'System',
        link_url: '/callsign-management',
        link_label: 'View status',
        read: false,
      });
    } catch (e) {
      console.error('[callsign-claim] requester notify failed:', e?.message || e);
    }

    await postDiscordNotification(base44, 'access_request', 'access_request_callsign', {
      requester_name: displayName || 'A member',
      callsign: callsignRecord.display_callsign,
      primary_holder_name: callsignRecord.primary_user_name || '—',
    }, {
      fields: [
        { name: 'Callsign', value: callsignRecord.display_callsign || '—', inline: true },
        { name: 'Requester', value: displayName || '—', inline: true },
        { name: 'Primary Holder', value: callsignRecord.primary_user_name || '—', inline: true },
      ],
    });

    return Response.json({
      status: 'pending',
      message: 'This callsign is already registered. An approval request has been sent to the current callsign account holder.',
      callsign_id: callsignRecord.id,
      request_id: requestRecord.id,
    });
  } catch (error) {
    console.error('[callsign-claim-or-request] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}