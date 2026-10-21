// Re-checks callsigns still waiting on the FCC. Sign-up lets a brand-new GMRS
// license through as "pending" (it can take days to reach the FCC data), and a
// lookup outage at sign-up does the same -- but nothing ever looked again, so
// those members stayed behind "Callsign Verification Required" until they found
// the Re-verify button themselves. The "Callsign Pending Recheck" workflow calls
// this every day after the FCC daily update. A callsign that now verifies
// unlocks its owner (and anyone with approved access to it), and the owner gets
// a notification and an email saying so.
//
// It also repairs members left locked out although their callsign is already
// verified (an account update that failed after the callsign was marked). No
// admin action leaves that state on purpose: suspending or resetting a callsign
// always marks the Callsign record too.
//
// Callers: the session-less workflow, or an administrator. Signed-in non-admins
// are refused. Only callsigns not checked in the last 20 hours are looked up, at
// most BATCH per call, so calling it more often than the schedule can't run up
// provider lookups.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { ulsLookup, isCallsignFormat } from '../../shared/fcc.ts';
import { writeCallsignAudit } from '../../shared/callsign.ts';
import { setUserCallsignVerified } from '../../shared/verifiedCallsign.ts';
import { sendUserEmail } from '../../shared/notify.ts';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const BLOCKED_STATUSES = new Set(['suspended', 'banned', 'deleted', 'investigation']);
const STALE_HOURS = 20;
const BATCH = 25;
const DEADLINE_MS = 50_000;
const SITE_URL = 'https://repeaternation.com';
const NOTICE_TITLE = 'Your callsign is verified';

function isDue(cs: any, nowMs: number): boolean {
  if (!cs.last_check_date) return true;
  return nowMs - new Date(cs.last_check_date).getTime() >= STALE_HOURS * 3600_000;
}

function isActive(cs: any): boolean {
  return cs.verification_status === 'verified' && !cs.suspended &&
    !['expired', 'cancelled', 'suspended'].includes(String(cs.license_status || '').toLowerCase());
}

// Tells a member once that they're unlocked: an in-app notification and an
// email. Skipped when they've already been told, so a retry or the repair pass
// never sends it twice.
async function tellUser(base44: any, userId: string, callsign: string) {
  const db = base44.asServiceRole;
  const told = await db.entities.UserNotification.filter({ user_id: userId, title: NOTICE_TITLE }, '-created_date', 1).catch(() => []);
  if (told?.length) return;
  try {
    await db.entities.UserNotification.create({
      user_id: userId,
      title: NOTICE_TITLE,
      message: `The FCC now lists ${callsign} as active, so your account is fully unlocked.`,
      type: 'system',
      sender_name: 'System',
      link_url: '/dashboard',
      link_label: 'Go to dashboard',
      read: false,
    });
  } catch (e) {
    console.error('[callsign-pending-recheck] notification failed:', (e as any)?.message || e);
  }
  // Category 'account' has no per-topic preference, so only the member's
  // master email switch can turn this off.
  await sendUserEmail(base44, userId, 'account', `Your callsign ${callsign} is verified`,
    `Good news! The FCC now lists ${callsign} as an active license, so your Repeater Nation account is fully unlocked.\n\n` +
    `Log in to get started: ${SITE_URL}/login\n\n73,\nThe Repeater Nation Team`,
  ).catch((e: any) => console.error('[callsign-pending-recheck] email failed:', e?.message || e));
}

// Marks one member verified. Returns 'unlocked', 'already' (nothing to do),
// 'skipped' (no such member, or a blocked account) or 'failed'.
async function unlockMember(base44: any, userId: string, licenseData: any): Promise<string> {
  const user = await base44.asServiceRole.entities.User.get(userId).catch(() => null);
  if (!user) return 'skipped';
  if (user.callsign_verified === true) return 'already';
  if (BLOCKED_STATUSES.has(String(user.account_status || ''))) return 'skipped';
  const saved = await setUserCallsignVerified(base44, userId, true, licenseData);
  return saved ? 'unlocked' : 'failed';
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    const isAdmin = !!caller && (ADMIN_ROLES.has(caller.role) || ADMIN_ROLES.has(caller._app_role));
    if (caller && !isAdmin) return Response.json({ error: 'Administrator authorization required' }, { status: 403 });

    const db = base44.asServiceRole;
    const started = Date.now();
    const now = new Date().toISOString();

    const pending = ((await db.entities.Callsign.filter(
      { verification_status: 'pending', duplicate_flagged: { $ne: true } }, 'last_check_date', 500,
    ).catch(() => [])) || [])
      .filter((cs: any) => cs.primary_user_id && !cs.suspended && isCallsignFormat(cs.normalized_callsign));
    const due = pending.filter((cs: any) => isDue(cs, started));

    let checked = 0, verified = 0, unlocked = 0, stillPending = 0, outage = 0, failed = 0;
    for (const cs of due.slice(0, BATCH)) {
      if (Date.now() - started > DEADLINE_MS) break;
      checked++;
      let result: any;
      try {
        result = await ulsLookup(base44, cs.normalized_callsign);
      } catch (e) {
        console.error('[callsign-pending-recheck] lookup failed:', cs.normalized_callsign, (e as any)?.message || e);
        outage++;
        continue;
      }
      // A provider outage says nothing about the license; try again next run.
      if (!result || result.fccReachable === false) { outage++; continue; }

      if (result.verified !== true) {
        await db.entities.Callsign.update(cs.id, { last_check_date: now }).catch(() => {});
        stillPending++;
        continue;
      }

      const display = String(cs.display_callsign || cs.normalized_callsign).toUpperCase();
      const license = {
        license_status: 'Active',
        license_service: result.radioService || undefined,
        license_expiry: result.expiration || '',
        last_check: now,
        license_country: result.country || undefined,
        verification_source: result.verificationSource || undefined,
        verification_method: result.verificationMethod || undefined,
      };

      // Unlock the owner first, with this as their primary callsign. If that
      // doesn't save, the callsign stays pending so the next run tries again,
      // instead of being marked verified with its owner still locked out.
      const owner = await unlockMember(base44, cs.primary_user_id, { ...license, callsign: display });
      if (owner === 'failed') { failed++; continue; }
      if (owner === 'unlocked') { unlocked++; await tellUser(base44, cs.primary_user_id, display); }

      await db.entities.Callsign.update(cs.id, {
        verification_status: 'verified',
        license_status: 'active',
        verified_at: now,
        last_check_date: now,
        ...(result.expiration ? { expiration_date: result.expiration } : {}),
        ...(result.licensee ? { licensee_name: result.licensee } : {}),
        ...(result.frn ? { frn: result.frn } : {}),
        ...(result.country ? { license_country: result.country } : {}),
        ...(result.radioService ? { radio_service: result.radioService } : {}),
        ...(result.verificationSource ? { verification_source: result.verificationSource } : {}),
        ...(result.verificationMethod ? { verification_method: result.verificationMethod } : {}),
      });
      verified++;

      await writeCallsignAudit(base44, {
        callsign_id: cs.id,
        normalized_callsign: cs.normalized_callsign,
        actor_user_id: caller?.id || '',
        actor_name: caller ? (caller.full_name || caller.email || 'admin') : 'Daily FCC re-check',
        action: 'verification_completed',
        affected_user_id: cs.primary_user_id,
        affected_name: cs.primary_user_name || '',
        primary_user_id: cs.primary_user_id,
        reason: 'Automatic re-check: the FCC now lists this license as active.',
      });

      // Members sharing this callsign ride on the same license. A failure here is
      // picked up by the repair pass on a later run.
      const access = await db.entities.CallsignAccess.filter({ callsign_id: cs.id, status: 'approved' }).catch(() => []);
      for (const a of access || []) {
        if (!a.user_id || a.user_id === cs.primary_user_id) continue;
        const shared = await unlockMember(base44, a.user_id, license);
        if (shared === 'unlocked') { unlocked++; await tellUser(base44, a.user_id, display); }
        else if (shared === 'failed') failed++;
      }
    }

    // Repair: locked-out members whose callsign (owned or shared) is already verified.
    // The User list is read whole and filtered here, the way admin-api reads it:
    // a $ne filter on the built-in User entity came back empty on the live app.
    const logged = (what: string) => (e: any) => {
      console.error(`[callsign-pending-recheck] ${what} failed:`, e?.message || e);
      return [];
    };
    let repaired = 0;
    const locked = ((await db.entities.User.list('-created_date', 5000).catch(logged('user list'))) || [])
      .filter((u: any) => u.callsign_verified !== true && !BLOCKED_STATUSES.has(String(u.account_status || '')));
    const lockedIds = locked.map((u: any) => u.id);
    if (lockedIds.length && Date.now() - started < DEADLINE_MS) {
      const [owned, access] = await Promise.all([
        db.entities.Callsign.filter({ primary_user_id: { $in: lockedIds }, verification_status: 'verified' }, 'created_date', 500).catch(logged('owned callsigns')),
        db.entities.CallsignAccess.filter({ user_id: { $in: lockedIds }, status: 'approved' }, 'created_date', 500).catch(logged('shared callsigns')),
      ]);
      const activeOwned = (owned || []).filter((cs: any) => cs.duplicate_flagged !== true && isActive(cs));
      for (const u of locked) {
        if (repaired >= BATCH || Date.now() - started > DEADLINE_MS) break;
        const mine = activeOwned.filter((cs: any) => cs.primary_user_id === u.id);
        const onFile = String(u.callsign || '').replace(/\s+/g, '').toUpperCase();
        let cs = mine.find((c: any) => c.normalized_callsign === onFile) || mine[0];
        const isOwner = !!cs;
        if (!cs) {
          for (const a of (access || []).filter((x: any) => x.user_id === u.id && x.callsign_id)) {
            const linked = await db.entities.Callsign.get(a.callsign_id).catch(() => null);
            if (linked && isActive(linked)) { cs = linked; break; }
          }
        }
        if (!cs) continue;
        const display = String(cs.display_callsign || cs.normalized_callsign).toUpperCase();
        const outcome = await unlockMember(base44, u.id, {
          ...(isOwner ? { callsign: display } : {}),
          license_status: 'Active',
          license_service: cs.radio_service === 'GMRS' || cs.radio_service === 'HAM' ? cs.radio_service : undefined,
          license_expiry: cs.expiration_date || '',
          last_check: now,
          license_country: cs.license_country || undefined,
          verification_source: cs.verification_source || undefined,
          verification_method: cs.verification_method || undefined,
        });
        if (outcome === 'unlocked') { repaired++; await tellUser(base44, u.id, display); }
        else if (outcome === 'failed') failed++;
      }
    }

    return Response.json({
      ok: true,
      pending: pending.length,
      due: due.length,
      checked,
      verified,
      unlocked,
      repaired,
      still_pending: stillPending,
      outage,
      failed,
      remaining: Math.max(0, due.length - checked),
    });
  } catch (error: any) {
    console.error('[callsign-pending-recheck] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Pending callsign re-check failed' }, { status: 500 });
  }
}
