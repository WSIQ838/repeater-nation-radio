import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { normalizeCallsign, writeCallsignAudit } from '../../shared/callsign.ts';
import { requireAdmin } from '../../shared/adminGuard.ts';

// ===== APP-SPECIFIC =====
// Admin-only: scans existing User records for duplicate callsigns.
// Does NOT delete or revoke existing users (rule 14). For callsigns with no
// Callsign record, creates one using the earliest verified account as primary.
// For callsigns with multiple users, flags them for admin review.
//
// Input: {} (no parameters)
// Returns: { total_users_scanned, unique_callsigns, duplicates_flagged, callsigns_created, duplicates }
// ===== END APP-SPECIFIC =====

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const { caller, error } = await requireAdmin(base44);
    if (error) return error;

    // Paginate through all users
    let allUsers: any[] = [];
    let skip = 0;
    const pageSize = 500;
    while (true) {
      const batch = await base44.asServiceRole.entities.User.list('-created_date', pageSize, skip).catch(() => []);
      if (!batch || batch.length === 0) break;
      allUsers = allUsers.concat(batch);
      if (batch.length < pageSize) break;
      skip += pageSize;
    }

    const usersWithCallsign = allUsers.filter(u => u.callsign && u.callsign.trim());

    // Group by normalized callsign
    const byCallsign: Record<string, any[]> = {};
    for (const u of usersWithCallsign) {
      const normalized = normalizeCallsign(u.callsign);
      if (!byCallsign[normalized]) byCallsign[normalized] = [];
      byCallsign[normalized].push(u);
    }

    const duplicates: any[] = [];
    let callsignsCreated = 0;

    for (const [normalized, group] of Object.entries(byCallsign)) {
      const existing = await base44.asServiceRole.entities.Callsign.filter(
        { normalized_callsign: normalized }, 'created_date', 50
      ).catch(() => []);

      if (existing && existing.length > 0) {
        // Base44 does not enforce uniqueness on normalized_callsign. Select the
        // same canonical record strategy used by the repair pass: prefer an
        // actively verified record, then a known radio service, then an
        // unsuspended record, then the oldest record. All other rows are
        // retained as flagged history and excluded from normal operations.
        const score = (row: any) => {
          let value = 0;
          if (row.verification_status === 'verified') value += 100;
          if (row.license_status === 'active') value += 100;
          if (row.radio_service === 'GMRS' || row.radio_service === 'HAM') value += 20;
          if (row.suspended !== true) value += 5;
          return value;
        };
        const sortedExisting = [...existing].sort((a, b) => {
          const scoreDelta = score(b) - score(a);
          if (scoreDelta) return scoreDelta;
          return new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime();
        });
        const canonical = sortedExisting[0];
        const primaryId = canonical.primary_user_id;

        await base44.asServiceRole.entities.Callsign.update(canonical.id, {
          duplicate_flagged: false,
        }).catch((e) => console.error('[scan] could not clear canonical duplicate flag:', canonical.id, e?.message || e));
        const primaryUser = allUsers.find(u => u.id === primaryId);

        for (const duplicateRecord of sortedExisting.slice(1)) {
          try {
            if (!duplicateRecord.duplicate_flagged) {
              await base44.asServiceRole.entities.Callsign.update(duplicateRecord.id, {
                duplicate_flagged: true,
              });
            }
          } catch (e) {
            console.error('[scan] could not flag duplicate Callsign record:', duplicateRecord.id, e?.message || e);
          }
        }
        for (const u of group) {
          if (u.id !== primaryId) {
            const access = await base44.asServiceRole.entities.CallsignAccess.filter({
              callsign_id: canonical.id,
              user_id: u.id,
              status: 'approved',
            }).catch(() => []);
            if (!access || access.length === 0) {
              duplicates.push({
                callsign: normalized,
                display_callsign: canonical.display_callsign,
                user_id: u.id,
                user_name: u.full_name || '',
                email: u.email || '',
                created_date: u.created_date,
                callsign_id: canonical.id,
                primary_user_id: primaryId,
                primary_user_name: canonical.primary_user_name || primaryUser?.full_name || '',
                primary_user_email: primaryUser?.email || '',
              });
            }
          }
        }
      } else {
        // No Callsign record — create one. Prefer an already verified/active
        // user when duplicate legacy User rows exist; otherwise use the oldest.
        const sortedUsers = [...group].sort((a, b) => {
          const score = (u: any) =>
            (u.callsign_verified === true ? 100 : 0) +
            (u.license_status === 'Active' ? 100 : 0) +
            ((u.license_service === 'GMRS' || u.license_service === 'HAM') ? 20 : 0);
          const delta = score(b) - score(a);
          if (delta) return delta;
          return new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime();
        });
        const primary = sortedUsers[0];
        const hasDuplicates = group.length > 1;

        try {
          const record = await base44.asServiceRole.entities.Callsign.create({
            normalized_callsign: normalized,
            display_callsign: primary.callsign.trim().toUpperCase(),
            primary_user_id: primary.id,
            primary_user_name: primary.full_name || '',
            verification_status: primary.license_status === 'Active' && primary.callsign_verified === true ? 'verified' : 'pending',
            license_status: primary.license_status === 'Active' ? 'active' : 'pending',
            radio_service: primary.license_service === 'HAM' ? 'HAM' : 'GMRS',
            verified_at: primary.license_status === 'Active' && primary.callsign_verified === true ? new Date().toISOString() : null,
            duplicate_flagged: false,
          });
          callsignsCreated++;

          await writeCallsignAudit(base44, {
            callsign_id: record.id,
            normalized_callsign: normalized,
            actor_user_id: hasDuplicates ? caller.id : primary.id,
            actor_name: hasDuplicates ? (caller.full_name || '') : (primary.full_name || ''),
            action: hasDuplicates ? 'admin_override' : 'claimed',
            affected_user_id: primary.id,
            affected_name: primary.full_name || '',
            primary_user_id: primary.id,
            reason: hasDuplicates
              ? 'Primary assigned to earliest account during duplicate scan'
              : 'Auto-claimed during duplicate scan (single user)',
            metadata: hasDuplicates
              ? { all_users: group.map(u => ({ id: u.id, name: u.full_name, created: u.created_date })) }
              : undefined,
          });

          if (hasDuplicates) {
            for (const u of group) {
              if (u.id !== primary.id) {
                duplicates.push({
                  callsign: normalized,
                  display_callsign: primary.callsign.trim().toUpperCase(),
                  user_id: u.id,
                  user_name: u.full_name || '',
                  email: u.email || '',
                  created_date: u.created_date,
                  callsign_id: record.id,
                  primary_user_id: primary.id,
                  primary_user_name: primary.full_name || '',
                  primary_user_email: primary.email || '',
                });
              }
            }
          }
        } catch (e) {
          console.error('[scan] create failed:', normalized, e?.message || e);
        }
      }
    }

    return Response.json({
      total_users_scanned: usersWithCallsign.length,
      unique_callsigns: Object.keys(byCallsign).length,
      duplicates_flagged: duplicates.length,
      callsigns_created: callsignsCreated,
      duplicates: duplicates.slice(0, 100),
    });
  } catch (error) {
    console.error('[callsign-scan-duplicates] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}