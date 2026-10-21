import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

function validLinkedCallsign(row: any): boolean {
  return !!row &&
    String(row.display_callsign || row.normalized_callsign || '').trim().length > 0 &&
    String(row.display_callsign || row.normalized_callsign || '').trim().toLowerCase() !== 'none';
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    // This maintenance function is intentionally scoped to the authenticated
    // caller. It never accepts a user_id and therefore cannot be used to edit
    // another member's account.
    const currentCallsign = String(user.callsign || '').trim();
    if (currentCallsign && currentCallsign.toLowerCase() !== 'none') {
      return Response.json({ ok: true, changed: false, callsign: currentCallsign });
    }

    const [ownedRows, accessRows] = await Promise.all([
      base44.asServiceRole.entities.Callsign.filter(
        { primary_user_id: user.id, duplicate_flagged: { $ne: true } }, '-created_date', 100
      ).catch(() => []),
      base44.asServiceRole.entities.CallsignAccess.filter(
        { user_id: user.id, status: 'approved' }, '-approved_at', 100
      ).catch(() => []),
    ]);

    const owned = (ownedRows || [])
      .filter(validLinkedCallsign)
      .sort((a: any, b: any) => {
        const av = a.verification_status === 'verified' && a.license_status === 'active' ? 0 : 1;
        const bv = b.verification_status === 'verified' && b.license_status === 'active' ? 0 : 1;
        if (av !== bv) return av - bv;
        return new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime();
      });

    let chosen = owned[0] || null;
    let source = chosen ? 'Callsign.primary_user_id' : '';

    if (!chosen) {
      for (const access of accessRows || []) {
        let linked = null;
        if (access.callsign_id) {
          linked = await base44.asServiceRole.entities.Callsign.get(access.callsign_id).catch(() => null);
        }
        if (validLinkedCallsign(linked)) {
          chosen = linked;
          source = 'approved CallsignAccess';
          break;
        }
        const inline = String(access.display_callsign || access.normalized_callsign || '').trim();
        if (inline && inline.toLowerCase() !== 'none') {
          chosen = { display_callsign: inline, normalized_callsign: inline };
          source = 'approved CallsignAccess';
          break;
        }
      }
    }

    if (!chosen) {
      return Response.json({ ok: true, changed: false, callsign: '', reason: 'no_callsign_found' });
    }

    const callsign = String(chosen.display_callsign || chosen.normalized_callsign).trim().toUpperCase();
    const update: any = { callsign };

    const chosenIsVerified = chosen.verification_status === 'verified' &&
      !chosen.suspended &&
      !['expired', 'cancelled', 'suspended'].includes(String(chosen.license_status || '').toLowerCase());

    if (chosenIsVerified && user.callsign_verified !== true) {
      update.callsign_verified = true;
      update.license_status = 'Active';
      if (chosen.radio_service === 'GMRS' || chosen.radio_service === 'HAM') update.license_service = chosen.radio_service;
      if (chosen.expiration_date) update.license_expiry = chosen.expiration_date;
      if (chosen.verification_source) update.verification_source = chosen.verification_source;
      if (chosen.verification_method) update.verification_method = chosen.verification_method;
      update.last_callsign_check = new Date().toISOString();
    }

    await base44.asServiceRole.entities.User.update(user.id, update);

    return Response.json({
      ok: true,
      changed: true,
      callsign,
      callsign_verified: update.callsign_verified ?? user.callsign_verified === true,
      source,
    });
  } catch (error: any) {
    console.error('[sync-my-callsign] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Could not synchronize callsign' }, { status: 500 });
  }
}
