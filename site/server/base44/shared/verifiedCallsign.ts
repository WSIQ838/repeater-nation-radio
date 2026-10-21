// Shared verified-callsign authorization guard used by all protected backend functions.
// Every protected action must pass through requireVerifiedCallsign before touching data.
//
// The rule: VIEW = Allowed. INTERACT / MODIFY / PARTICIPATE = Verified Active Callsign Required.
// Admins bypass the callsign check (they manage verification).
//
// This guard is the server-side enforcement layer. RLS rules on protected entities provide
// a second layer of defense for direct entity operations (create/update/delete via SDK).

export async function requireVerifiedCallsign(base44: any): Promise<{ user: any; error: Response | null }> {
  let user: any = null;
  try {
    user = await base44.auth.me();
  } catch (err) {
    console.error('[verifiedCallsign] auth failed:', err?.message || err);
    return { user: null, error: Response.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  if (!user) {
    return { user: null, error: Response.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  if (user.account_status === 'suspended') {
    return { user: null, error: Response.json({ error: 'Account suspended' }, { status: 403 }) };
  }
  if (user.account_status === 'investigation') {
    return { user: null, error: Response.json({ error: 'Account under investigation' }, { status: 403 }) };
  }
  if (user.account_status === 'deleted') {
    return { user: null, error: Response.json({ error: 'Account deleted' }, { status: 403 }) };
  }
  // Admins bypass the callsign verification requirement — they manage the system.
  if (user.role === 'admin' || user.role === 'super_admin') {
    return { user, error: null };
  }
  // Check for verified, active callsign.
  if (!user.callsign_verified) {
    return {
      user,
      error: Response.json({
        error: 'Verified callsign required',
        code: 'CALLSIGN_VERIFICATION_REQUIRED',
        message: 'You must verify an active GMRS or amateur radio (HAM) callsign before using this feature.'
      }, { status: 403 })
    };
  }
  return { user, error: null };
}

// Updates the user's callsign_verified flag and license metadata. Called after
// successful license/callbook verification, admin override, or status re-check.
// Resolves to whether the flag was saved.
export async function setUserCallsignVerified(
  base44: any,
  userId: string,
  verified: boolean,
  licenseData?: any
): Promise<boolean> {
  const update: any = { callsign_verified: verified };
  if (licenseData) {
    // Only passed when this callsign becomes the account's primary.
    if (licenseData.callsign) update.callsign = licenseData.callsign;
    if (licenseData.license_status) update.license_status = licenseData.license_status;
    // 'GMRS' | 'HAM'. Only written when known, so an update that lacks it never blanks it out.
    if (licenseData.license_service === 'GMRS' || licenseData.license_service === 'HAM') {
      update.license_service = licenseData.license_service;
    }
    // Only set date-time fields when we have a real value — empty strings fail
    // validation and silently abort the entire update (including callsign_verified).
    if (licenseData.license_expiry) update.license_expiry = licenseData.license_expiry;
    if (licenseData.last_check) update.last_callsign_check = licenseData.last_check;
    if (licenseData.license_country) update.license_country = licenseData.license_country;
    if (licenseData.verification_source) update.verification_source = licenseData.verification_source;
    if (licenseData.verification_method) update.verification_method = licenseData.verification_method;
  }
  try {
    await base44.asServiceRole.entities.User.update(userId, update);
    return true;
  } catch (e) {
    console.error('[verifiedCallsign] update user failed:', e?.message || e);
  }

  // The verification bit is the critical field. If an optional metadata field
  // is rejected because an older User schema is still deployed, retry with the
  // smallest safe payload so a successful verification cannot leave the member
  // trapped behind ProtectedRoute.
  const minimalUpdate: any = { callsign_verified: verified };
  if (licenseData?.callsign) minimalUpdate.callsign = licenseData.callsign;
  if (licenseData?.license_status) minimalUpdate.license_status = licenseData.license_status;
  if (licenseData?.last_check) minimalUpdate.last_callsign_check = licenseData.last_check;

  try {
    await base44.asServiceRole.entities.User.update(userId, minimalUpdate);
    return true;
  } catch (e2) {
    console.error('[verifiedCallsign] minimal verification update failed:', e2?.message || e2);
  }
  return false;
}

// Checks whether a user has any approved CallsignAccess for a verified, active callsign.
// Used after revoking access to determine if the user should lose callsign_verified.
export async function hasOtherVerifiedCallsignAccess(
  base44: any,
  userId: string,
  excludeCallsignId?: string
): Promise<boolean> {
  try {
    const accessRecords = await base44.asServiceRole.entities.CallsignAccess.filter({
      user_id: userId,
      status: 'approved',
    }).catch(() => []);

    for (const access of accessRecords || []) {
      if (excludeCallsignId && access.callsign_id === excludeCallsignId) continue;
      const callsign = await base44.asServiceRole.entities.Callsign.get(access.callsign_id).catch(() => null);
      if (callsign && callsign.verification_status === 'verified' && !callsign.suspended &&
          callsign.license_status !== 'expired' && callsign.license_status !== 'suspended' &&
          callsign.license_status !== 'cancelled') {
        return true;
      }
    }
  } catch (e) {
    console.error('[verifiedCallsign] hasOtherVerifiedCallsignAccess failed:', e?.message || e);
  }
  return false;
}

// True when the user owns, or has approved access to, a verified active callsign
// other than excludeCallsignId. Used so one lapsed callsign doesn't unverify an
// account that still has another active one.
export async function hasOtherVerifiedCallsign(
  base44: any,
  userId: string,
  excludeCallsignId?: string
): Promise<boolean> {
  try {
    const owned = await base44.asServiceRole.entities.Callsign.filter({
      primary_user_id: userId,
      duplicate_flagged: { $ne: true },
    }).catch(() => []);
    for (const cs of owned || []) {
      if (excludeCallsignId && cs.id === excludeCallsignId) continue;
      if (cs.verification_status === 'verified' && !cs.suspended &&
          cs.license_status !== 'expired' && cs.license_status !== 'suspended' &&
          cs.license_status !== 'cancelled') {
        return true;
      }
    }
  } catch (e) {
    console.error('[verifiedCallsign] hasOtherVerifiedCallsign failed:', e?.message || e);
  }
  return hasOtherVerifiedCallsignAccess(base44, userId, excludeCallsignId);
}
