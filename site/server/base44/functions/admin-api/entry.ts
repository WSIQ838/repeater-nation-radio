// Secure admin gateway. Every action verifies the caller is an administrator
// (server-side) and records sensitive changes in the AuditLog. Regular users
// receive 403 regardless of any frontend state.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin, writeAudit, getIp, checkCallerPermission, listAll, getByIdWithFallback } from '../../shared/adminGuard.ts';
import { ulsLookup } from '../../shared/fcc.ts';
import { setUserCallsignVerified } from '../../shared/verifiedCallsign.ts';
import { writeCallsignAudit } from '../../shared/callsign.ts';
import { buildMetricMap, metricForUser } from '../../shared/badges.ts';
import { cascadeDeleteUser } from '../../shared/userCascadeDelete.ts';
import { updateUserPermissions, canManageRole } from '../../shared/permissions.ts';
import { recalculateStreak } from '../../shared/netGamification.ts';
import { sendUserEmail } from '../../shared/notify.ts';
import { listAllRepeaters, evaluateBadges, ACTION_PERMISSIONS, WEBHOOK_SETTING_FIELDS } from '../../shared/adminHelpers.ts';
import { validateWebhookUrl } from '../../shared/discordWebhook.ts';
import { DISCORD_TEMPLATES, DEFAULT_USERNAMES, SAMPLE_VARS, renderTemplate } from '../../shared/discordTemplates.ts';
import { EMAIL_TEMPLATES, SAMPLE_VARS as EMAIL_SAMPLE_VARS, getEmailTemplateSettings, renderEmailTemplate, sendBrandedEmail } from '../../shared/emailTemplates.ts';
import { secrets } from 'base44:runtime';
import { stripeFetch } from '../../shared/stripe.ts';

const VERIFICATIONS = ['Verified', 'Pending', 'Needs Review', 'Rejected']; const REPORT_STATUSES = ['Open', 'Investigating', 'Resolved', 'Dismissed'];
const _aCache = new Map<string, { d: any; e: number }>(); const _cGet = (k: string) => { const v = _aCache.get(k); if (!v) return; if (v.e < Date.now()) { _aCache.delete(k); return; } return v.d; }; const _cSet = (k: string, d: any, t: number) => { _aCache.set(k, { d, e: Date.now() + t }); };

// listAllRepeaters and evaluateBadges are imported from ../../shared/adminHelpers.ts

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const { caller, error } = await requireAdmin(base44);
    if (error) return error;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const ip = getIp(req);
    const admin = {
      id: caller.id,
      name: caller.full_name || caller.email || 'admin'
    };

    // Enforce per-action permission for sensitive write operations.
    const requiredPerm = ACTION_PERMISSIONS[action];
    if (requiredPerm) {
      const permError = await checkCallerPermission(base44, caller, requiredPerm);
      if (permError) return permError;
    }

    // users.manage lets a moderator change roles, suspend and delete, but only
    // for accounts below their own role (canManageRole); without this a
    // moderator could promote anyone to admin or ban an administrator.
    const seniorityError = (target: any): Response | null => {
      if (!target) return Response.json({ error: 'User not found' }, { status: 404 });
      if (!canManageRole(caller, target.role || 'user')) {
        return Response.json({ error: 'Your role cannot manage this account' }, { status: 403 });
      }
      return null;
    };

    switch (action) {

      // ============ DASHBOARD STATS ============
      case 'stats': {
        const cached = _cGet('admin:stats');
        if (cached) return Response.json(cached);
        const now = Date.now(), dayMs = 86400000;
        // User.count is unavailable on the built-in User entity, so load one
        // page for user metrics. Repeater and AdminReport use count() — no
        // records transferred, just numbers — slashing data vs loading 500
        // records per collection just to count them.
        const users = await base44.asServiceRole.entities.User.list('-created_date', 5000);
        const [repeaters, reports, audit, settingsRows] = await Promise.all([
          base44.asServiceRole.entities.Repeater.list('-created_date', 500), base44.asServiceRole.entities.AdminReport.list('-created_date', 500),
          base44.asServiceRole.entities.AuditLog.list('-created_date', 10), base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1),
        ]);
        const u = users || [], rep = repeaters || [], rpt = reports || [];
        const w30 = (x: any) => x.last_active && (now - new Date(x.last_active).getTime()) < 30 * 60 * 1000;
        const stf = (x: any) => ['admin', 'super_admin', 'moderator'].includes(x.role || 'user');
        const act = (x: any) => (x.account_status || 'active') === 'active';
        const response = { stats: {
            totalUsers: u.length, activeUsers: u.filter(w30).length,
            activeStaff: u.filter((x) => stf(x) && act(x) && w30(x)).length, activeMembers: u.filter((x) => !stf(x) && act(x) && w30(x)).length,
            newUsers: u.filter((x) => x.created_date && (now - new Date(x.created_date).getTime()) < 7 * dayMs).length,
            totalRepeaters: rep.length, pendingRepeaters: rep.filter((x) => (x.verification || 'Pending') === 'Pending').length,
            needsReview: rep.filter((x) => x.verification === 'Needs Review').length, openReports: rpt.filter((x) => (x.status || 'Open') === 'Open').length,
            maintenanceMode: !!(settingsRows && settingsRows[0]?.maintenance_mode),
          }, recentAudit: (audit || []).map((a) => ({ id: a.id, admin_name: a.admin_name, action: a.action, target_label: a.target_label, category: a.category, created_date: a.created_date })) };
        _cSet('admin:stats', response, 30000);
        return Response.json(response);
      }

      // ============ ADMIN PRESENCE ============
      // Lightweight endpoint for the admin header. Unlike the full stats action,
      // this only reads User records, so opening the admin shell does not also
      // scan repeaters, reports, audit logs, or settings.
      // Treat a missing account_status as active for legacy accounts, matching
      // the Admin Users page's own default behavior.
      case 'presence': {
        const cached = _cGet('admin:presence');
        if (cached) return Response.json(cached);
        const users = await base44.asServiceRole.entities.User.filter({}, '-last_active', 500);
        const now = Date.now();
        const staffRoles = new Set(['admin', 'super_admin', 'moderator', 'staff']);
        const active = (users || []).filter((x) => {
          const st = String(x.account_status || 'active').trim().toLowerCase();
          const ms = x.last_active ? new Date(x.last_active).getTime() : NaN;
          return st === 'active' && Number.isFinite(ms) && (now - ms) >= 0 && (now - ms) < 30 * 60 * 1000;
        });
        const response = {
          activeStaff: active.filter((x) => staffRoles.has(String(x.role || 'user').trim().toLowerCase())).length,
          activeMembers: active.filter((x) => !staffRoles.has(String(x.role || 'user').trim().toLowerCase())).length,
        };
        _cSet('admin:presence', response, 30000);
        return Response.json(response);
      }

      // ============ USERS ============
      // Lets an admin create a member account directly -- for cases like a
      // brand-new GMRS licensee whose callsign isn't in the FCC lookup mirror
      // yet and can't get through self-service registration at all. Uses
      // Base44's own invite flow (creates the account and emails the invitee
      // a link to set their own password) rather than generating a password
      // ourselves, since we have no way to hand someone a password through
      // any channel more secure than the invite email itself. The account is
      // pre-verified with an admin-manual override, mirroring set_callsign's
      // mark_verified path, so the member lands fully set up on first login.
      //
      // inviteUser itself is called from the ADMIN'S OWN BROWSER (see
      // AdminUsers.jsx), not from here -- calling it from this server
      // function re-forwards only a bearer token, and Base44's invite
      // endpoint rejected that with "Could not validate credentials" even
      // for a real super_admin, which points to it requiring the caller's
      // actual interactive session rather than a proxied token. This action
      // only validates up front (so the client doesn't fire a real invite
      // email for a request that was always going to fail) and, separately
      // below, finishes setting up the account after the client's own
      // inviteUser call has succeeded.
      case 'users:invitePrecheck': {
        const email = String(body.email || '').trim().toLowerCase();
        const newCallsign = String(body.callsign || '').trim().toUpperCase().replace(/\s+/g, '');

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return Response.json({ error: 'A valid email address is required.' }, { status: 400 });
        }
        if (!newCallsign) {
          return Response.json({ error: 'A callsign is required.' }, { status: 400 });
        }
        if (newCallsign.length > 10) {
          return Response.json({ error: 'Callsign is too long' }, { status: 400 });
        }

        const existingUser = await base44.asServiceRole.entities.User.filter({ email }, '-created_date', 1).catch(() => []);
        if (existingUser && existingUser.length) {
          return Response.json({ error: 'An account with this email already exists.' }, { status: 409 });
        }

        const existingClaim = await base44.asServiceRole.entities.Callsign.filter(
          { normalized_callsign: newCallsign }, 'created_date', 1
        ).catch(() => []);
        if (existingClaim && existingClaim.length) {
          return Response.json({
            error: `${newCallsign} is already claimed by another account. Grant this member authorized access to it from Admin → Callsigns instead.`,
          }, { status: 409 });
        }

        return Response.json({ ok: true });
      }

      // Called after the client's own base44.auth.inviteUser(...) succeeds.
      case 'users:inviteFinish': {
        const email = String(body.email || '').trim().toLowerCase();
        const fullName = String(body.full_name || '').trim();
        const newCallsign = String(body.callsign || '').trim().toUpperCase().replace(/\s+/g, '');
        const service = String(body.radio_service || '').toUpperCase() === 'HAM' ? 'HAM' : 'GMRS';

        if (!email || !newCallsign) {
          return Response.json({ error: 'email and callsign are required' }, { status: 400 });
        }

        // inviteUser doesn't hand back the new account's id in any documented
        // shape -- look it up by email instead, retrying briefly in case
        // creation lands a beat after the invite call returns.
        let newUser: any = null;
        for (let attempt = 0; attempt < 5 && !newUser; attempt++) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));
          const rows = await base44.asServiceRole.entities.User.filter({ email }, '-created_date', 1).catch(() => []);
          newUser = rows?.[0] || null;
        }
        if (!newUser) {
          return Response.json({
            ok: true, pending: true,
            message: 'Invite sent, but the new account has not appeared yet -- it may still be provisioning. Check Users again in a moment to finish setting up the callsign.',
          }, { status: 202 });
        }

        const nowIso = new Date().toISOString();

        const record = await base44.asServiceRole.entities.Callsign.create({
          normalized_callsign: newCallsign,
          display_callsign: newCallsign,
          primary_user_id: newUser.id,
          primary_user_name: fullName || newUser.full_name || '',
          radio_service: service,
          verification_status: 'verified',
          license_status: 'active',
          verified_at: nowIso,
          last_check_date: nowIso,
          verification_source: 'Admin manual override',
          verification_method: 'admin_manual',
        });

        await base44.asServiceRole.entities.User.update(newUser.id, {
          ...(fullName ? { full_name: fullName } : {}),
          callsign: newCallsign,
          license_service: service,
          callsign_verified: true,
          license_status: 'Active',
        });

        await writeCallsignAudit(base44, {
          callsign_id: record.id, normalized_callsign: newCallsign,
          actor_user_id: admin.id, actor_name: admin.name,
          action: 'admin_override', affected_user_id: newUser.id, affected_name: email,
          primary_user_id: newUser.id,
          reason: `Account created directly by admin with callsign marked verified: ${newCallsign}`,
        });

        await writeAudit(base44, {
          admin_id: admin.id, admin_name: admin.name,
          action: 'users_invite', category: 'users',
          target_type: 'User', target_id: newUser.id, target_label: `${email} (${newCallsign})`,
          after: { email, full_name: fullName, callsign: newCallsign, radio_service: service },
          ip,
        });

        return Response.json({ ok: true, user_id: newUser.id, email, callsign: newCallsign, service });
      }

      case 'users:list': {
        const q = String(body.query || '').toLowerCase().trim();
        const role = String(body.role || 'all');
        const includeDeleted = body.includeDeleted === true;
        const offset = Number(body.offset || 0);
        const limit = Math.min(Number(body.limit || 50), 5000);

        // Keep this endpoint bounded to a small number of backend reads.
        // The previous implementation paged every related collection on every
        // Admin → Users request, which amplified requests and could trip the
        // Base44 rate limiter before the page finished loading.
        // These collections are intentionally read one at a time. The prior
        // Promise.all fired four large service-role requests simultaneously and
        // could still hit Base44's request-rate limiter on a cold admin page.
        const _raw = _cGet('admin:users:raw') || await (async () => { const r = [await base44.asServiceRole.entities.User.list('-created_date', 5000), await base44.asServiceRole.entities.CallsignAccess.list('-created_date', 5000), await base44.asServiceRole.entities.Callsign.list('-created_date', 5000), await base44.asServiceRole.entities.Profile.list('-created_date', 5000)]; _cSet('admin:users:raw', r, 30000); return r; })();
        const [allUsers, approvedAccess, callsignRecords, profileRecords] = _raw;

        let users = allUsers || [];

        // Approved CallsignAccess grants are authoritative for members who are
        // authorized to use a callsign even when the legacy User.callsign field
        // has not been backfilled yet. Load the related Callsign records so the
        // admin table can show the correct radio service (GMRS/HAM).
        const callsignById = new Map((callsignRecords || []).map((cs) => [String(cs.id), cs]));
        const authorizedByUser = new Map();
        const databaseCallsignsByUser = new Map();

        const addDatabaseCallsign = (userId, value, service, source = 'database', status = '', expiresAt = '') => {
          const key = String(userId || '').trim();
          const callsign = String(value || '').trim().toUpperCase();
          if (!key || !callsign || callsign.toLowerCase() === 'none') return;
          const serviceText = String(service || '').toUpperCase();
          const normalizedService = serviceText === 'HAM' ? 'HAM' : serviceText === 'GMRS' ? 'GMRS' : '';
          const existing = databaseCallsignsByUser.get(key) || [];
          // Dedupe by callsign alone (not source or service): the same callsign
          // is commonly present in more than one source (e.g. a user's own
          // Callsign record AND their Profile.callsign field, the latter with
          // no known radio service), and the admin UI just wants one row per
          // real-world callsign. If a later source knows the service/status/
          // expiration and an earlier one didn't, fill it in rather than
          // adding a second row.
          const match = existing.find((item) => item.callsign === callsign);
          if (match) {
            if (!match.service && normalizedService) match.service = normalizedService;
            if (!match.status && status) match.status = status;
            if (!match.expiresAt && expiresAt) match.expiresAt = expiresAt;
          } else {
            existing.push({ callsign, service: normalizedService, source, status, expiresAt });
          }
          databaseCallsignsByUser.set(key, existing);
        };

        const addAdminCallsign = (userId, value, service, source = 'authorized') => {
          const key = String(userId || '').trim();
          const callsign = String(value || '').trim().toUpperCase();
          if (!key || !callsign || callsign.toLowerCase() === 'none') return;

          const normalizedService = String(service || '').toUpperCase() === 'HAM' ? 'HAM' : 'GMRS';
          const existing = authorizedByUser.get(key) || { callsigns: [] };
          if (!existing.callsigns.some((item) => item.callsign === callsign && item.service === normalizedService)) {
            existing.callsigns.push({ callsign, service: normalizedService, source });
          }
          authorizedByUser.set(key, existing);
        };

        // A member's own Callsign record is authoritative even when the legacy
        // User.callsign field is blank. Include owned/primary callsigns first so
        // Admin → Users can always see the callsign already stored in the
        // Callsign entity.
        for (const cs of callsignRecords || []) {
          const value = cs.display_callsign || cs.normalized_callsign;
          const status = cs.suspended ? 'suspended' : String(cs.license_status || '').toLowerCase();
          addDatabaseCallsign(cs.primary_user_id, value, cs.radio_service, 'Callsign', status, cs.expiration_date || '');
          addAdminCallsign(
            cs.primary_user_id,
            value,
            cs.radio_service,
            'primary'
          );
        }

        // Approved CallsignAccess records are the authoritative source for
        // shared/authorized callsigns. Resolve callsign_id through the canonical
        // Callsign record because older access rows may not contain the text.
        for (const access of approvedAccess || []) {
          if (String(access.status || '').toLowerCase() !== 'approved' || !access.user_id) continue;
          const cs = callsignById.get(String(access.callsign_id));
          const value = access.display_callsign || access.normalized_callsign || cs?.display_callsign || cs?.normalized_callsign;
          const service = cs?.radio_service || access.radio_service;
          const status = cs ? (cs.suspended ? 'suspended' : String(cs.license_status || '').toLowerCase()) : '';
          addDatabaseCallsign(access.user_id, value, service, 'CallsignAccess', status, cs?.expiration_date || '');
          addAdminCallsign(access.user_id, value, service, 'authorized');
        }

        // Profile is a user-owned legacy source. It can be used to discover and
        // repair a missing User.callsign, but it is not treated as an authorized grant.
        for (const profile of profileRecords || []) {
          if (!profile.created_by_id) continue;
          addDatabaseCallsign(profile.created_by_id, profile.callsign, '', 'Profile');
        }

        users = (users || []).filter((x) => {
          // Agent/service accounts are internal automation identities, not community members.
          // Keep them out of the Admin → Users member list regardless of the selected role filter.
          if (String(x.role || 'user').toLowerCase() === 'agent') {
            return false;
          }

          if (
            !includeDeleted &&
            (x.account_status || 'active') === 'deleted'
          ) {
            return false;
          }

          if (role !== 'all' && (x.role || 'user') !== role) {
            return false;
          }

          if (
            q &&
            !`${x.full_name || ''} ${x.email || ''} ${x.callsign || ''} ${(authorizedByUser.get(String(x.id))?.callsigns || []).map((c) => c.callsign).join(' ')}`
              .toLowerCase()
              .includes(q)
          ) {
            return false;
          }

          return true;
        });

        const total = users.length;

        const page = users
          .slice(offset, offset + limit)
          .map((x) => {
            const authorized = authorizedByUser.get(String(x.id))?.callsigns || [];
            const hasAuthorizedCallsign = authorized.length > 0;
            const callsignIssue =
              !['admin', 'super_admin'].includes(x.role || 'user') &&
              !hasAuthorizedCallsign &&
              (
                x.callsign_verified !== true ||
                x.license_status !== 'Active' ||
                !String(x.callsign || '').trim()
              );

            return {
              id: x.id,
              full_name: x.full_name || '',
              email: x.email || '',
              role: x.role || 'user',
              callsign: x.callsign || '',
              callsign_verified: x.callsign_verified === true,
              license_status: x.license_status || 'Pending',
              license_service: x.license_service || (x.callsign_verified === true ? 'GMRS' : ''),
              authorized: hasAuthorizedCallsign,
              authorized_callsign: authorized[0]?.callsign || '',
              authorized_service: authorized[0]?.service || '',
              authorized_callsigns: authorized,
              database_callsigns: databaseCallsignsByUser.get(String(x.id)) || [],
              license_expiry: x.license_expiry || null,
              last_callsign_check: x.last_callsign_check || null,
              callsign_issue: callsignIssue,
              account_status: x.account_status || 'active',
              created_date: x.created_date,
              last_active: x.last_active,
            };
          });

        const callsignIssues = users.filter((x) => {
          if (['admin', 'super_admin'].includes(x.role || 'user')) return false;
          const hasAuthorizedCallsign = (authorizedByUser.get(String(x.id))?.callsigns || []).length > 0;
          return !hasAuthorizedCallsign && (
            x.callsign_verified !== true ||
            x.license_status !== 'Active' ||
            !String(x.callsign || '').trim()
          );
        }).length;

        const missingCallsigns = users.filter((x) => {
          if (x.id === admin.id) return false;
          if (['admin', 'super_admin', 'agent'].includes(String(x.role || 'user').toLowerCase())) return false;
          const st = x.account_status || 'active';
          if (['suspended', 'banned', 'investigation', 'deleted', 'callsign_restricted'].includes(st)) return false;
          const userCallsign = String(x.callsign || '').trim();
          const hasUserCallsign = userCallsign && userCallsign.toLowerCase() !== 'none';
          const hasDatabaseCallsign = (databaseCallsignsByUser.get(String(x.id)) || []).length > 0;
          return !hasUserCallsign && !hasDatabaseCallsign;
        }).length;

        return Response.json({ users: page, total, callsignIssues, missingCallsigns });
      }

      case 'users:update': {
        const id = String(body.id || '');
        const role = String(body.role || '');

        if (!id || !role) {
          return Response.json(
            { error: 'id and role required' },
            { status: 400 }
          );
        }

        if (!['reverify_all', 'sync_authorized'].includes(action) && id === admin.id) {
          return Response.json(
            { error: 'You cannot change your own role' },
            { status: 400 }
          );
        }

        const before = await getByIdWithFallback(base44.asServiceRole.entities.User, id);

        if (
          before?.role === 'super_admin' &&
          caller.role !== 'super_admin'
        ) {
          return Response.json(
            { error: 'Only Super Admins can modify Super Admin accounts' },
            { status: 403 }
          );
        }

        if (
          role === 'super_admin' &&
          caller.role !== 'super_admin'
        ) {
          return Response.json(
            { error: 'Only Super Admins can assign the Super Admin role' },
            { status: 403 }
          );
        }

        const updateSeniority = seniorityError(before);
        if (updateSeniority) return updateSeniority;
        if (!canManageRole(caller, role)) {
          return Response.json(
            { error: 'Your role cannot assign that role' },
            { status: 403 }
          );
        }

        await base44.asServiceRole.entities.User.update(id, { role });
        await updateUserPermissions(base44, id, role);

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'user.role_change',
          category: 'user',
          target_type: 'User',
          target_id: id,
          target_label: before?.email || before?.full_name || id,
          before: before ? { role: before.role } : null,
          after: { role },
          ip,
        });

        _aCache.delete('admin:users:raw'); _aCache.delete('admin:presence'); return Response.json({ ok: true });
      }

      case 'users:setStatus': {
        const id = String(body.id || '');
        const status = String(body.status || '');

        if (
          !id ||
          ![
            'active',
            'suspended',
            'banned',
            'investigation',
            'deleted'
          ].includes(status)
        ) {
          return Response.json(
            { error: 'invalid status' },
            { status: 400 }
          );
        }

        if (id === admin.id) {
          return Response.json(
            { error: 'You cannot change your own account status' },
            { status: 400 }
          );
        }

        const before = await getByIdWithFallback(base44.asServiceRole.entities.User, id);
        const statusSeniority = seniorityError(before);
        if (statusSeniority) return statusSeniority;

        await base44.asServiceRole.entities.User.update(id, {
          account_status: status
        });

        const actionKey =
          status === 'suspended'
            ? 'user.suspend'
            : status === 'banned'
              ? 'user.ban'
              : status === 'investigation'
                ? 'user.investigate'
                : 'user.enable';

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: actionKey,
          category: 'security',
          target_type: 'User',
          target_id: id,
          target_label: before?.email || before?.full_name || id,
          before: before
            ? { account_status: before.account_status }
            : null,
          after: { account_status: status },
          ip,
        });

        _aCache.delete('admin:users:raw'); _aCache.delete('admin:presence'); return Response.json({ ok: true });
      }

      // Client-initiated audit entries (e.g. manual XP adjustments made through
      // entity writes). Restricted to an allow-list so the trail cannot be forged;
      // identity and IP always come from the verified caller, never the request.
      case 'audit:create': {
        const CLIENT_AUDIT_ACTIONS = ['gamification.xp_adjustment'];
        const auditAction = String(body.audit_action || '');
        if (!CLIENT_AUDIT_ACTIONS.includes(auditAction)) {
          return Response.json({ error: 'Audit action not allowed' }, { status: 400 });
        }
        await writeAudit(base44, {
          admin_id: admin.id, admin_name: admin.name,
          action: auditAction, category: 'admin',
          target_type: String(body.target_type || '').slice(0, 60),
          target_id: String(body.target_id || '').slice(0, 100),
          target_label: String(body.target_label || '').slice(0, 200),
          meta: body.meta ? String(body.meta).slice(0, 2000) : undefined,
          description: body.description ? String(body.description).slice(0, 1000) : undefined,
          ip,
        });
        return Response.json({ ok: true });
      }

      // Admin-wide oversight of the public v1 API's keys (issuance itself
      // is self-service, in api-key-manage -- this is the "see/revoke
      // anyone's key" side, gated by apikeys.view/apikeys.manage above).
      case 'apikeys:list': {
        const rows = await listAll(base44.asServiceRole.entities.ApiKey, '-created_date', 500);
        const keys = (rows || []).map(({ key_hash, ...rest }: any) => rest);
        return Response.json({ ok: true, keys });
      }

      case 'apikeys:usage': {
        const id = String(body.id || '');
        const rows = await listAll(base44.asServiceRole.entities.ApiKeyUsage, '-created_date', 5000);
        const keyRows = (rows || []).filter((r: any) => r.scope === 'key' && (!id || r.api_key_id === id));
        const totalsByKey: Record<string, number> = {};
        for (const r of keyRows) totalsByKey[r.api_key_id] = (totalsByKey[r.api_key_id] || 0) + (r.request_count || 0);
        return Response.json({ ok: true, totalsByKey, windowCount: keyRows.length });
      }

      case 'apikeys:revoke': {
        const id = String(body.id || '');
        if (!id) return Response.json({ error: 'id required' }, { status: 400 });
        const row = await base44.asServiceRole.entities.ApiKey.get(id).catch(() => null);
        if (!row) return Response.json({ error: 'API key not found' }, { status: 404 });
        const updated = await base44.asServiceRole.entities.ApiKey.update(id, {
          status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: admin.id,
          revoked_reason: String(body.reason || '').slice(0, 500),
        });
        await writeAudit(base44, {
          admin_id: admin.id, admin_name: admin.name,
          action: 'apikey.revoke', category: 'api', target_type: 'ApiKey', target_id: id,
          target_label: row.label, ip, description: `Admin revoked API key for user ${row.owner_user_id}`,
        });
        const { key_hash, ...publicRow } = updated;
        return Response.json({ ok: true, key: publicRow });
      }

      case 'apikeys:setTier': {
        const id = String(body.id || '');
        const tier = String(body.tier || '');
        if (!id || !['standard', 'elevated'].includes(tier)) {
          return Response.json({ error: 'id and a valid tier (standard/elevated) are required' }, { status: 400 });
        }
        const row = await base44.asServiceRole.entities.ApiKey.get(id).catch(() => null);
        if (!row) return Response.json({ error: 'API key not found' }, { status: 404 });
        const updated = await base44.asServiceRole.entities.ApiKey.update(id, { rate_limit_tier: tier });
        await writeAudit(base44, {
          admin_id: admin.id, admin_name: admin.name,
          action: 'apikey.setTier', category: 'api', target_type: 'ApiKey', target_id: id,
          target_label: row.label, ip, meta: { tier }, description: `Changed API key rate-limit tier to ${tier}`,
        });
        const { key_hash, ...publicRow } = updated;
        return Response.json({ ok: true, key: publicRow });
      }

      // Notify only members who genuinely have no callsign anywhere in their account data.
      // This deliberately checks both legacy User.callsign and canonical/approved callsign
      // records so members who merely need the legacy field backfilled are not warned.
      case 'users:notifyMissing': {
        const dryRun = body.dry_run === true;
        const offset = Math.max(0, Number(body.offset) || 0);
        const batchSize = Math.min(25, Math.max(1, Number(body.batchSize) || 10));

        const [everyone, accessRows, callsignRows] = await Promise.all([
          listAll(base44.asServiceRole.entities.User),
          listAll(base44.asServiceRole.entities.CallsignAccess),
          listAll(base44.asServiceRole.entities.Callsign),
        ]);

        const hasCallsign = new Set<string>();

        for (const cs of callsignRows || []) {
          const value = String(cs.display_callsign || cs.normalized_callsign || '').trim();
          if (value && String(cs.primary_user_id || '').trim()) {
            hasCallsign.add(String(cs.primary_user_id));
          }
        }

        for (const access of accessRows || []) {
          if (String(access.status || '').toLowerCase() !== 'approved') continue;
          if (!String(access.user_id || '').trim()) continue;
          const value = String(access.display_callsign || access.normalized_callsign || '').trim();
          if (value || access.callsign_id) {
            hasCallsign.add(String(access.user_id));
          }
        }

        const eligible = (everyone || [])
          .filter((u: any) => {
            if (u.id === admin.id) return false;
            if (['admin', 'super_admin', 'agent'].includes(String(u.role || 'user').toLowerCase())) return false;
            const st = u.account_status || 'active';
            if (['suspended', 'banned', 'investigation', 'deleted', 'callsign_restricted'].includes(st)) return false;

            const userCallsign = String(u.callsign || '').trim();
            const hasUserCallsign = userCallsign && userCallsign.toLowerCase() !== 'none';
            return !hasUserCallsign && !hasCallsign.has(String(u.id));
          })
          .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));

        if (dryRun) return Response.json({ ok: true, total: eligible.length });

        const slice = eligible.slice(offset, offset + batchSize);
        const stats = {
          total: eligible.length,
          processed: slice.length,
          in_app_sent: 0,
          emails_sent: 0,
          emails_skipped: 0,
          failed: 0,
          skipped_reasons: {} as Record<string, number>,
        };

        for (let i = 0; i < slice.length; i += 5) {
          await Promise.all(slice.slice(i, i + 5).map(async (target: any) => {
            const displayName = target.full_name || target.email || 'operator';
            const deadline = new Date(Date.now() + 7 * 86400000);
            const deadlineText = deadline.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            });

            const notifySubject = 'Action required: add your callsign to Repeater Nation';
            const messageBody = [
              `Hi ${displayName},`,
              '',
              'Our records show that your Repeater Nation account is missing a GMRS or amateur radio (HAM) callsign.',
              '',
              `Please check your account and re-enter your callsign, or use the Re-verify option to verify it, within 7 days (by ${deadlineText}).`,
              '',
              'If you are having issues, please reach out in the Repeater Nation Discord or email support@repeaternation.com.',
              'When contacting support by email, please include your email address, callsign, and Repeater Nation username.',
              '',
              'If the callsign is not corrected or reverified within 7 days, your account will be suspended.',
              '',
              'Thank you,',
              'Repeater Nation Administration',
            ].join('\n');

            try {
              await base44.asServiceRole.entities.Message.create({
                conversation_id: [admin.id, target.id].sort().join('__'),
                sender_id: admin.id,
                sender_name: admin.name,
                recipient_id: target.id,
                recipient_name: displayName,
                body: messageBody,
                read: false,
                status: 'sent',
              });
              stats.in_app_sent++;
            } catch (e) {
              stats.failed++;
              console.error('[notifyMissing] message failed for', target.id, e?.message || e);
              return;
            }

            const email = await sendUserEmail(
              base44,
              target.id,
              'announcements',
              notifySubject,
              messageBody
            );
            if (email?.sent === true) {
              stats.emails_sent++;
            } else {
              stats.emails_skipped++;
              const reason = String(email?.reason || 'unknown');
              stats.skipped_reasons[reason] = (stats.skipped_reasons[reason] || 0) + 1;
            }

            const sentAt = new Date().toISOString();
            const deadlineIso = deadline.toISOString();
            try {
              await base44.asServiceRole.entities.User.update(target.id, {
                callsign_notice_sent_at: sentAt,
                callsign_notice_deadline: deadlineIso,
              });
            } catch (e) {
              console.error('[notifyMissing] notice metadata update failed for', target.id, e?.message || e);
            }
          }));
        }

        const nextOffset = offset + slice.length;
        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'user.callsign_missing_notice_bulk',
          category: 'security',
          target_type: 'User',
          target_id: '',
          target_label: `Missing callsign notice: members ${slice.length ? offset + 1 : offset}-${nextOffset} of ${eligible.length}`,
          meta: { ...stats, offset, deadline_days: 7 },
          ip,
        });

        return Response.json({
          ok: true,
          ...stats,
          offset,
          next_offset: nextOffset,
          done: nextOffset >= eligible.length,
        });
      }

      // Bulk version of the callsign notice: sends an in-app message and an email to
      // every member who currently has a callsign problem. The client calls this in a
      // loop with `offset`, so each request only handles a small batch and stays inside
      // the function time limit. `{name}` in the subject/message becomes each member's
      // name. Staff, blocked and already-restricted accounts are skipped, matching the
      // per-user Notify button. Pass dry_run: true to just get the recipient count.
      case 'users:notifyAll': {
        const subjectTpl = String(body.subject || '').trim().slice(0, 200);
        const messageTpl = String(body.message || '').trim().slice(0, 5000);
        const dryRun = body.dry_run === true;
        if (!dryRun && (!subjectTpl || !messageTpl)) {
          return Response.json({ error: 'A subject and a message are required' }, { status: 400 });
        }
        const offset = Math.max(0, Number(body.offset) || 0);
        const batchSize = Math.min(25, Math.max(1, Number(body.batchSize) || 10));

        const everyone = await listAll(base44.asServiceRole.entities.User);
        const eligible = everyone
          .filter((u: any) => {
            if (u.id === admin.id) return false;
            if (['admin', 'super_admin'].includes(u.role || 'user')) return false;
            const st = u.account_status || 'active';
            if (['suspended', 'banned', 'investigation', 'deleted', 'callsign_restricted'].includes(st)) return false;
            return u.callsign_verified !== true || u.license_status !== 'Active' || !String(u.callsign || '').trim();
          })
          // Stable order so offsets line up from one batch to the next.
          .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));

        if (dryRun) return Response.json({ ok: true, total: eligible.length });

        const slice = eligible.slice(offset, offset + batchSize);
        const stats = {
          total: eligible.length,
          processed: slice.length,
          in_app_sent: 0,
          emails_sent: 0,
          emails_skipped: 0,
          failed: 0,
          skipped_reasons: {} as Record<string, number>,
        };

        for (let i = 0; i < slice.length; i += 5) {
          await Promise.all(slice.slice(i, i + 5).map(async (t: any) => {
            const displayName = t.full_name || t.email || 'GMRS operator';
            const fill = (s: string) => s.split('{name}').join(displayName);
            const text = fill(messageTpl);
            const subject = fill(subjectTpl);
            try {
              await base44.asServiceRole.entities.Message.create({
                conversation_id: [admin.id, t.id].sort().join('__'),
                sender_id: admin.id,
                sender_name: admin.name,
                recipient_id: t.id,
                recipient_name: displayName,
                body: text,
                read: false,
                status: 'sent',
              });
              stats.in_app_sent++;
            } catch (e) {
              stats.failed++;
              console.error('[notifyAll] message failed for', t.id, e?.message || e);
              return;
            }
            const email = await sendUserEmail(base44, t.id, 'announcements', subject, text);
            if (email?.sent === true) {
              stats.emails_sent++;
            } else {
              stats.emails_skipped++;
              const reason = String(email?.reason || 'unknown');
              stats.skipped_reasons[reason] = (stats.skipped_reasons[reason] || 0) + 1;
            }
          }));
        }

        const nextOffset = offset + slice.length;
        await writeAudit(base44, {
          admin_id: admin.id, admin_name: admin.name,
          action: 'user.callsign_notice_bulk', category: 'security',
          target_type: 'User', target_id: '',
          target_label: `Bulk callsign notice: members ${slice.length ? offset + 1 : offset}-${nextOffset} of ${eligible.length}`,
          meta: { ...stats, offset },
          ip,
        });

        return Response.json({
          ok: true, ...stats, offset,
          next_offset: nextOffset,
          done: nextOffset >= eligible.length,
        });
      }

      case 'users:callsignAction': {
        const id = String(body.id || '');
        // NOTE: the client sends the sub-action as `callsign_action`. `body.action` is
        // the gateway routing key ('users:callsignAction') and must never be reused.
        const action = String(body.callsign_action || '');

        if (!['restrict', 'restore', 'notify', 'reverify', 'reverify_all', 'set_callsign', 'sync_authorized', 'resync_all', 'resync_selected', 'verify_repair'].includes(action) || (action !== 'reverify_all' && action !== 'sync_authorized' && action !== 'resync_all' && action !== 'verify_repair' && !id)) {
          return Response.json({ error: 'id and valid callsign action required' }, { status: 400 });
        }

        if (!['reverify_all', 'resync_selected', 'verify_repair'].includes(action) && id === admin.id) {
          return Response.json({ error: 'You cannot change or notify your own account through this action' }, { status: 400 });
        }

        // Restricting or rewriting another staff member's callsign is the same
        // seniority question as changing their role.
        const callerIsAdmin = ['admin', 'super_admin'].includes(caller.role) || ['admin', 'super_admin'].includes(caller._app_role);
        if (id && !callerIsAdmin && ['restrict', 'restore', 'notify', 'reverify', 'set_callsign'].includes(action)) {
          const callsignSeniority = seniorityError(await getByIdWithFallback(base44.asServiceRole.entities.User, id));
          if (callsignSeniority) return callsignSeniority;
        }

        if (action === 'reverify_all') {
          // Runs in small batches driven by the client (see users:notifyAll for the
          // same pattern), because checking every eligible user's callsign against
          // the FCC/ULS providers in one request can take far longer than a single
          // function invocation is allowed to run — that was silently truncating full
          // "Re-verify all" runs partway through with no result. `after_id` is a
          // stable cursor (not a numeric offset) so a user's status changing mid-run
          // — expected here, since re-verifying is exactly what flips callsign_verified
          // — can never shift another user out of the page we're about to fetch.
          const filterMode = String(body.filter || 'all'); // 'all' | 'unverified_none'
          const afterId = String(body.after_id || '');
          const batchSize = Math.min(15, Math.max(1, Number(body.batchSize) || 10));
          const selectedIds = new Set(
            Array.isArray(body.selected_ids)
              ? body.selected_ids.map((value) => String(value || '').trim()).filter(Boolean)
              : []
          );
          const selectedMode = selectedIds.size > 0;

          const users = await listAll(base44.asServiceRole.entities.User);
          const staffCount = (users || []).filter((u) => ['admin', 'super_admin'].includes(u.role || 'user')).length;

          // A member's callsign can live in the legacy User.callsign field, an
          // owned Callsign record, an approved CallsignAccess grant, or (for
          // pre-Callsign-entity accounts) only their Profile. The old version of
          // this action only ever looked at User.callsign, which meant any
          // member whose GMRS/HAM data lived solely in a Callsign record --
          // the common case since the multi-callsign rebuild -- was silently
          // skipped by both "Reverify all" and bulk "Reverify" on selected
          // rows, staying stuck Unverified no matter how many times it ran.
          // Gather every source up front, same as the single-user `reverify`
          // action, so eligibility and the actual check cover the same ground.
          const [allCallsigns, allAccess, allProfiles] = await Promise.all([
            listAll(base44.asServiceRole.entities.Callsign).catch(() => []),
            listAll(base44.asServiceRole.entities.CallsignAccess).catch(() => []),
            listAll(base44.asServiceRole.entities.Profile).catch(() => []),
          ]);
          const callsignById = new Map((allCallsigns || []).map((cs: any) => [String(cs.id), cs]));
          const ownedByUser = new Map<string, any[]>();
          for (const cs of allCallsigns || []) {
            const key = String(cs.primary_user_id || '');
            if (!key) continue;
            if (!ownedByUser.has(key)) ownedByUser.set(key, []);
            ownedByUser.get(key)!.push(cs);
          }
          const accessByUser = new Map<string, any[]>();
          for (const a of allAccess || []) {
            if (String(a.status || '').toLowerCase() !== 'approved' || !a.user_id) continue;
            const key = String(a.user_id);
            if (!accessByUser.has(key)) accessByUser.set(key, []);
            accessByUser.get(key)!.push(a);
          }
          const profileByUser = new Map<string, any>();
          for (const p of allProfiles || []) {
            if (p.created_by_id) profileByUser.set(String(p.created_by_id), p);
          }

          // A Callsign/CallsignAccess/Profile record whose owning user id no
          // longer matches any real account is a leftover from a deleted
          // member (cascadeDeleteUser removes the User record but historically
          // missed some related records; see runs before that fix). Nothing
          // in a reverify can ever use these -- there's no user to attach a
          // result to -- so surface them on dry_run and actually clean them up
          // once at the start of a real run, rather than leaving them to
          // linger indefinitely.
          const existingUserIds = new Set((users || []).map((u) => String(u.id)));
          const orphanCallsigns = (allCallsigns || []).filter((cs: any) => cs.primary_user_id && !existingUserIds.has(String(cs.primary_user_id)));
          const orphanAccess = (allAccess || []).filter((a: any) => a.user_id && !existingUserIds.has(String(a.user_id)));
          const orphanProfiles = (allProfiles || []).filter((p: any) => p.created_by_id && !existingUserIds.has(String(p.created_by_id)));

          const orphaned = { callsigns: 0, access: 0, profiles: 0 };
          if (!afterId && body.dry_run !== true) {
            for (const cs of orphanCallsigns) {
              await base44.asServiceRole.entities.Callsign.delete(cs.id)
                .then(() => { orphaned.callsigns++; })
                .catch((e) => console.error('[reverify_all] failed to delete orphaned Callsign', cs.id, e?.message || e));
            }
            for (const a of orphanAccess) {
              await base44.asServiceRole.entities.CallsignAccess.delete(a.id)
                .then(() => { orphaned.access++; })
                .catch((e) => console.error('[reverify_all] failed to delete orphaned CallsignAccess', a.id, e?.message || e));
            }
            for (const p of orphanProfiles) {
              await base44.asServiceRole.entities.Profile.delete(p.id)
                .then(() => { orphaned.profiles++; })
                .catch((e) => console.error('[reverify_all] failed to delete orphaned Profile', p.id, e?.message || e));
            }

            if (orphaned.callsigns || orphaned.access || orphaned.profiles) {
              await writeAudit(base44, {
                admin_id: admin.id, admin_name: admin.name,
                action: 'callsigns.orphan_cleanup', category: 'security',
                target_type: 'System', target_id: 'callsigns',
                target_label: `Removed orphaned records for deleted accounts: ${orphaned.callsigns} Callsign, ${orphaned.access} CallsignAccess, ${orphaned.profiles} Profile`,
                meta: orphaned,
                ip,
              });
            }
          }

          const candidatesForUser = (u: any) => {
            const candidates: { callsign: string; source: string; callsignId?: string }[] = [];
            const seen = new Set<string>();
            const add = (value: any, source: string, callsignId?: string) => {
              const callsign = String(value || '').trim().toUpperCase();
              if (!callsign || callsign.toLowerCase() === 'none' || seen.has(callsign)) return;
              seen.add(callsign);
              candidates.push({ callsign, source, callsignId });
            };
            add(u.callsign, 'user');
            for (const cs of ownedByUser.get(String(u.id)) || []) add(cs.display_callsign || cs.normalized_callsign, 'primary', cs.id);
            for (const access of accessByUser.get(String(u.id)) || []) {
              const linked = access.callsign_id ? callsignById.get(String(access.callsign_id)) : null;
              add(access.display_callsign || access.normalized_callsign || linked?.display_callsign || linked?.normalized_callsign, 'approved_access', linked?.id);
            }
            const profile = profileByUser.get(String(u.id));
            if (profile) add(profile.callsign, 'profile');
            return candidates;
          };

          const eligible = (users || [])
            .filter((u) => !['admin', 'super_admin'].includes(u.role || 'user'))
            .map((u) => ({ user: u, candidates: candidatesForUser(u) }))
            .filter(({ user: u, candidates }) =>
              candidates.length > 0 &&
              (!selectedMode || selectedIds.has(String(u.id))) &&
              (selectedMode || filterMode !== 'unverified_none' || (u.callsign_verified !== true && u.license_status === 'None'))
            )
            .sort((a, b) => String(a.user.id).localeCompare(String(b.user.id)));

          if (body.dry_run === true) {
            return Response.json({
              ok: true,
              total: eligible.length,
              skipped: staffCount,
              orphaned_found: orphanCallsigns.length + orphanAccess.length + orphanProfiles.length,
            });
          }

          const startIdx = afterId ? eligible.findIndex(({ user: u }) => String(u.id) > afterId) : 0;
          const remaining = startIdx === -1 ? [] : eligible.slice(startIdx);
          const slice = remaining.slice(0, batchSize);

          const stats = {
            checked: 0,
            verified: 0,
            invalid: 0,
            unavailable: 0,
            skipped: staffCount,
          };

          // Sequential, not Promise.all: checking several members at once each
          // doing up to a half-dozen sequential FCC/ULS provider requests could
          // burst 20-30 outbound requests within a single batch call, which was
          // enough to trip a provider's rate limit mid-run. One member at a
          // time, with a short pause between both candidates and members, keeps
          // the outbound request rate low and steady instead.
          for (const { user: targetUser, candidates } of slice) {
            try {
              const results: any[] = [];
              for (const candidate of candidates) {
                try {
                  // Use the full multi-provider chain (OpenCallbook, official FCC
                  // License View, callook/HamDB/HamQTH), not just the single
                  // official-FCC lookup -- the self-service and scheduled
                  // reverify paths already use it, and using only one provider
                  // here meant an admin-triggered reverify could miss a callsign
                  // those other paths would have found and show it stuck
                  // Unverified even though it's genuinely on file.
                  const result = await ulsLookup(base44, candidate.callsign);
                  if (!result || result.fccReachable === false) {
                    results.push({ ...candidate, status: 'unavailable', result: null });
                    continue;
                  }

                  // Same reasoning as the single-user reverify action: a lookup
                  // that still can't find a callsign an admin already manually
                  // verified (set_callsign's mark_verified) doesn't mean it's
                  // newly invalid, it means the provider gap that required the
                  // override hasn't closed yet. Don't silently undo it here either.
                  const existingRecord = candidate.callsignId ? callsignById.get(String(candidate.callsignId)) : null;
                  if (!result.found && existingRecord?.verification_method === 'admin_manual') {
                    results.push({
                      ...candidate,
                      status: 'verified',
                      licenseStatus: 'Active',
                      result: {
                        verified: true, found: true,
                        radioService: existingRecord.radio_service || undefined,
                        expiration: existingRecord.expiration_date || undefined,
                        country: existingRecord.license_country || undefined,
                        verificationSource: 'Admin manual override',
                        verificationMethod: 'admin_manual',
                      },
                    });
                    continue;
                  }

                  // A "not found" result is not enough to revoke an existing
                  // verified member. Mirrors can lag, providers can disagree, and
                  // the local FCC database may not have been initialized yet.
                  // Actual inactive states (expired/cancelled/suspended) arrive as
                  // found records with an explicit status and are still handled below.
                  if (!result.found && targetUser.callsign_verified === true) {
                    results.push({ ...candidate, status: 'unavailable', result });
                    continue;
                  }

                  let licenseStatus = 'Pending';
                  if (!result.found) licenseStatus = 'None';
                  else if (result.verified) licenseStatus = 'Active';
                  else {
                    const raw = String(result.status || '').toLowerCase();
                    licenseStatus = raw.includes('cancel') || raw.includes('terminat') ? 'Cancelled'
                      : raw.includes('expired') ? 'Expired'
                      : raw.includes('suspend') ? 'Suspended' : 'Pending';
                  }

                  // Update the exact Callsign record this candidate came from
                  // (its own id) rather than guessing from a text match, which
                  // could land on the wrong record or silently update none.
                  if (candidate.callsignId) {
                    await base44.asServiceRole.entities.Callsign.update(candidate.callsignId, {
                      verification_status: result.verified ? 'verified' : 'pending',
                      verified_at: result.verified ? new Date().toISOString() : null,
                      license_status: licenseStatus === 'None' ? 'inactive' : licenseStatus.toLowerCase(),
                      radio_service: result.radioService || undefined,
                      expiration_date: result.expiration || null,
                      licensee_name: result.licensee || '',
                      frn: result.frn || '',
                      license_country: result.country || '',
                      verification_source: result.verificationSource || 'FCC/OpenCallbook',
                      verification_method: result.verificationMethod || 'official_fcc',
                      last_check_date: new Date().toISOString(),
                      suspended: false,
                    }).catch((e) => console.error('[reverify_all] callsign record update failed:', candidate.callsign, e?.message || e));
                  }

                  results.push({ ...candidate, status: result.verified ? 'verified' : 'invalid', licenseStatus, result });
                } catch (e) {
                  results.push({ ...candidate, status: 'unavailable', result: null });
                }
                if (candidates.length > 1) await new Promise((resolve) => setTimeout(resolve, 250));
              }

              stats.checked++;
              if (results.some((r) => r.status === 'verified')) stats.verified++;
              else if (results.some((r) => r.status === 'invalid')) stats.invalid++;
              else stats.unavailable++;

              // Keep the legacy User summary tied to whichever candidate is the
              // member's own on-file callsign (or the first one, if none is set).
              const primaryCallsign = String(targetUser.callsign || '').trim().toUpperCase();
              const primaryResult = results.find((r) => r.callsign === primaryCallsign) || results[0];
              if (primaryResult?.result) {
                const result = primaryResult.result;
                // Never turn an already-verified account off from a "not found"
                // mirror/provider response. Only an explicit active/inactive FCC
                // result should change the verification flag.
                const preserveVerified = result.found === false && targetUser.callsign_verified === true;
                const userUpdate: Record<string, any> = {
                  callsign: primaryResult.callsign,
                  callsign_verified: preserveVerified ? true : result.verified === true,
                  license_status: preserveVerified ? (targetUser.license_status || 'Active') : (primaryResult.licenseStatus || 'Pending'),
                  last_callsign_check: new Date().toISOString(),
                };
                if (result.expiration) userUpdate.license_expiry = result.expiration;
                if (result.radioService) userUpdate.license_service = result.radioService;
                if (result.country) userUpdate.license_country = result.country;
                if (result.verificationSource) userUpdate.verification_source = result.verificationSource;
                if (result.verificationMethod) userUpdate.verification_method = result.verificationMethod;

                try {
                  await base44.asServiceRole.entities.User.update(targetUser.id, userUpdate);
                } catch (updErr) {
                  if (!userUpdate.license_service) throw updErr;
                  delete userUpdate.license_service;
                  await base44.asServiceRole.entities.User.update(targetUser.id, userUpdate);
                }

                await writeAudit(base44, {
                  admin_id: admin.id, admin_name: admin.name,
                  action: 'user.callsign_reverify', category: 'security',
                  target_type: 'User', target_id: targetUser.id,
                  target_label: targetUser.email || targetUser.full_name || targetUser.id,
                  before: {
                    callsign: targetUser.callsign || '',
                    callsign_verified: targetUser.callsign_verified === true,
                    license_status: targetUser.license_status || 'Pending'
                  },
                  after: userUpdate,
                  ip,
                });
              }
            } catch (e) {
              stats.unavailable++;
              console.error('[reverify_all] failed for user', targetUser.id, e?.message || e);
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          }

          const nextAfterId = slice.length ? String(slice[slice.length - 1].user.id) : afterId;
          const done = slice.length < batchSize;

          await writeAudit(base44, {
            admin_id: admin.id, admin_name: admin.name,
            action: 'user.callsign_reverify_bulk', category: 'security',
            target_type: 'User', target_id: '',
            target_label: `Bulk callsign re-verification (${filterMode}): ${stats.checked} checked this batch`,
            meta: { ...stats, after_id: afterId, filter: filterMode },
            ip,
          });

          return Response.json({ ok: true, ...stats, total: eligible.length, after_id: nextAfterId, done, selected: selectedMode, orphaned });
        }

        if (action === 'resync_selected') {
          // Fill ONLY a selected member's missing User.callsign.
          // Resolve CallsignAccess.callsign_id through the canonical Callsign
          // record when the access row itself does not carry the callsign text.
          // Existing User.callsign values are never overwritten and no FCC/ULS
          // verification is performed by this repair action.
          if (id === admin.id) {
            return Response.json({ error: 'You cannot resync your own callsign through this action' }, { status: 400 });
          }

          // Use the same User listing path as the rest of admin-api. Some Base44
          // deployments do not expose a reliable entity .get() for User, which made
          // valid selected members come back as "missing_user" even though they exist.
          const allUsers = await listAll(base44.asServiceRole.entities.User);
          const target = (allUsers || []).find((u) => String(u.id) === String(id));
          if (!target) return Response.json({ ok: true, status: 'missing_user' });

          const current = String(target.callsign || '').trim();
          if (current && current.toLowerCase() !== 'none') {
            return Response.json({ ok: true, status: 'already_populated', callsign: current });
          }

          // The linked Callsign may not be this user's primary record. Load all
          // canonical callsigns so CallsignAccess.callsign_id can always be resolved.
          const [accessRows, callsignRows] = await Promise.all([
            base44.asServiceRole.entities.CallsignAccess.filter(
              { user_id: id }, '-approved_at', 100
            ).catch(() => []),
            listAll(base44.asServiceRole.entities.Callsign),
          ]);

          const canonicalById = new Map(
            (callsignRows || []).map((cs) => [String(cs.id), cs])
          );

          const getAccessCallsign = (access) => {
            const linked = canonicalById.get(String(access.callsign_id || ''));
            return String(
              access.display_callsign ||
              access.normalized_callsign ||
              linked?.display_callsign ||
              linked?.normalized_callsign ||
              ''
            ).trim();
          };

          const primaryCallsign = (callsignRows || []).find((cs) => {
            if (String(cs.primary_user_id || '') !== String(id)) return false;
            const value = String(cs.display_callsign || cs.normalized_callsign || '').trim();
            return !!value && value.toLowerCase() !== 'none';
          });

          const authorizedCallsign = (accessRows || [])
            .filter((access) => String(access.status || '').toLowerCase() === 'approved')
            .find((access) => {
              const value = getAccessCallsign(access);
              return !!value && value.toLowerCase() !== 'none';
            });

          const callsign = String(
            primaryCallsign?.display_callsign ||
            primaryCallsign?.normalized_callsign ||
            (authorizedCallsign ? getAccessCallsign(authorizedCallsign) : '') ||
            ''
          ).trim().toUpperCase();

          if (!callsign) {
            return Response.json({ ok: true, status: 'no_callsign_found' });
          }

          await base44.asServiceRole.entities.User.update(id, { callsign });

          await writeAudit(base44, {
            admin_id: admin.id,
            admin_name: admin.name,
            action: 'user.callsign_resync',
            category: 'security',
            target_type: 'User',
            target_id: id,
            target_label: target.email || target.full_name || id,
            before: { callsign: target.callsign || '' },
            after: { callsign },
            meta: {
              source: primaryCallsign ? 'Callsign.primary_user_id' : 'approved CallsignAccess',
              scope: 'selected',
            },
            ip,
          });

          return Response.json({
            ok: true,
            status: 'updated',
            callsign,
            source: primaryCallsign ? 'canonical' : 'authorized',
          });
        }

        if (action === 'resync_all') {
          // Repair ONLY missing User.callsign values. This action does not contact
          // FCC/ULS and never overwrites a populated callsign. Use a stable ID cursor
          // instead of a numeric offset because successful repairs remove users from
          // the eligible set and numeric offsets would skip later records.
          const allUsers = await listAll(base44.asServiceRole.entities.User);
          const eligibleUsers = (allUsers || [])
            .filter((u) => {
              if (['admin', 'super_admin', 'agent'].includes(String(u.role || 'user').toLowerCase())) return false;
              const current = String(u.callsign || '').trim();
              return !current || current.toLowerCase() === 'none';
            })
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));

          const total = eligibleUsers.length;
          if (body.dry_run === true) return Response.json({ ok: true, total, eligible: total });

          const afterId = String(body.after_id || '');
          const batchSize = Math.min(25, Math.max(1, Number(body.batchSize) || 10));
          const startIdx = afterId ? eligibleUsers.findIndex((u) => String(u.id) > afterId) : 0;
          const remaining = startIdx === -1 ? [] : eligibleUsers.slice(startIdx);
          const slice = remaining.slice(0, batchSize);

          const stats = {
            processed: 0, updated: 0, already_populated: 0, missing_user: 0,
            no_callsign_found: 0, from_canonical: 0, from_authorized: 0, from_profile: 0,
          };

          for (const target of slice) {
            stats.processed++;

            const [accessRows, ownedRows, profileRows] = await Promise.all([
              base44.asServiceRole.entities.CallsignAccess.filter(
                { user_id: target.id, status: 'approved' }, '-approved_at', 100
              ).catch(() => []),
              base44.asServiceRole.entities.Callsign.filter(
                { primary_user_id: target.id, duplicate_flagged: { $ne: true } }, '-created_date', 100
              ).catch(() => []),
              base44.asServiceRole.entities.Profile.filter(
                { created_by_id: target.id }, '-updated_date', 100
              ).catch(() => []),
            ]);

            let callsign = '';
            let source = '';

            const primary = (ownedRows || []).find((cs) => {
              const value = String(cs.display_callsign || cs.normalized_callsign || '').trim();
              return value && value.toLowerCase() !== 'none';
            });

            if (primary) {
              callsign = String(primary.display_callsign || primary.normalized_callsign).trim().toUpperCase();
              source = 'Callsign.primary_user_id';
            } else {
              for (const access of accessRows || []) {
                let value = String(access.display_callsign || access.normalized_callsign || '').trim();
                if (!value && access.callsign_id) {
                  const linked = await base44.asServiceRole.entities.Callsign.get(access.callsign_id).catch(() => null);
                  value = String(linked?.display_callsign || linked?.normalized_callsign || '').trim();
                }
                if (value && value.toLowerCase() !== 'none') {
                  callsign = value.toUpperCase();
                  source = 'approved CallsignAccess';
                  break;
                }
              }
            }

            if (!callsign) {
              const profile = (profileRows || []).find((row) => {
                const value = String(row.callsign || '').trim();
                return value && value.toLowerCase() !== 'none';
              });
              if (profile) {
                callsign = String(profile.callsign).trim().toUpperCase();
                source = 'Profile';
              }
            }

            const latest = await base44.asServiceRole.entities.User.get(target.id).catch(() => null);
            const current = String(latest?.callsign || target.callsign || '').trim();
            if (current && current.toLowerCase() !== 'none') {
              stats.already_populated++;
              continue;
            }

            if (!callsign) {
              stats.no_callsign_found++;
              continue;
            }

            await base44.asServiceRole.entities.User.update(target.id, { callsign });
            stats.updated++;
            if (source === 'Callsign.primary_user_id') stats.from_canonical++;
            else if (source === 'Profile') stats.from_profile++;
            else stats.from_authorized++;

            await writeAudit(base44, {
              admin_id: admin.id, admin_name: admin.name,
              action: 'user.callsign_resync', category: 'security',
              target_type: 'User', target_id: target.id,
              target_label: target.email || target.full_name || target.id,
              before: { callsign: current }, after: { callsign },
              meta: { source, scope: 'all_missing' }, ip,
            });
          }

          const lastId = slice.length ? String(slice[slice.length - 1].id) : afterId;
          const done = slice.length < batchSize;

          await writeAudit(base44, {
            admin_id: admin.id, admin_name: admin.name,
            action: 'user.callsign_resync_bulk', category: 'security',
            target_type: 'User', target_id: '',
            target_label: `Missing callsign resync: ${stats.updated} updated (after ${afterId || 'start'})`,
            meta: { ...stats, after_id: afterId, batch_size: batchSize, total }, ip,
          });

          return Response.json({
            ok: true, ...stats, total, after_id: lastId, done,
          });
        }
        if (action === 'sync_authorized') {
          // Backfill the legacy User.callsign field for members who have an approved
          // CallsignAccess record but no callsign on their User profile. Never overwrite
          // an existing callsign. If a member has multiple distinct approved callsigns,
          // skip them rather than guessing which one should become the legacy value.
          const accessRows = await listAll(base44.asServiceRole.entities.CallsignAccess);
          const approved = (accessRows || [])
            .filter((a) => String(a.status || '').toLowerCase() === 'approved' && String(a.user_id || '').trim())
            .sort((a, b) => new Date(b.approved_at || 0).getTime() - new Date(a.approved_at || 0).getTime());

          const byUser = new Map();
          for (const access of approved) {
            const userId = String(access.user_id);
            const display = String(access.display_callsign || access.normalized_callsign || '').trim().toUpperCase();
            if (!display) continue;
            if (!byUser.has(userId)) byUser.set(userId, []);
            const existing = byUser.get(userId);
            if (!existing.some((x) => x.callsign === display)) {
              existing.push({ callsign: display, access });
            }
          }

          const stats = {
            scanned_authorizations: approved.length,
            authorized_users: byUser.size,
            eligible: 0,
            updated: 0,
            already_populated: 0,
            ambiguous: 0,
            missing_user: 0,
            details: [],
          };

          for (const [userId, entries] of byUser.entries()) {
            const target = await base44.asServiceRole.entities.User.get(userId).catch(() => null);
            if (!target) {
              stats.missing_user++;
              continue;
            }

            const current = String(target.callsign || '').trim();
            if (current) {
              stats.already_populated++;
              continue;
            }

            if (entries.length !== 1) {
              stats.ambiguous++;
              stats.details.push({
                user_id: userId,
                user_name: target.full_name || target.email || userId,
                callsigns: entries.map((x) => x.callsign),
                action: 'skipped_multiple_authorized_callsigns',
              });
              continue;
            }

            const callsign = entries[0].callsign;
            stats.eligible++;

            await base44.asServiceRole.entities.User.update(userId, {
              callsign,
            });

            stats.updated++;
            stats.details.push({
              user_id: userId,
              user_name: target.full_name || target.email || userId,
              callsign,
              action: 'callsign_populated_from_authorized_access',
            });

            await writeAudit(base44, {
              admin_id: admin.id,
              admin_name: admin.name,
              action: 'user.callsign_sync_authorized',
              category: 'security',
              target_type: 'User',
              target_id: userId,
              target_label: target.email || target.full_name || userId,
              before: { callsign: '' },
              after: { callsign },
              meta: { source: 'approved CallsignAccess' },
              ip,
            });
          }

          await writeAudit(base44, {
            admin_id: admin.id,
            admin_name: admin.name,
            action: 'user.callsign_sync_authorized_bulk',
            category: 'security',
            target_type: 'User',
            target_id: '',
            target_label: `Authorized callsign backfill: ${stats.updated} updated, ${stats.already_populated} already populated`,
            meta: stats,
            ip,
          });

          return Response.json({ ok: true, ...stats });
        }

        if (action === 'verify_repair') {
          // Finds and repairs drift between User.callsign_verified and the
          // Callsign/CallsignAccess records that are the actual source of
          // truth for verification -- e.g. a re-verify updated the Callsign
          // record's verification_status but an older code path or a race
          // left the User row's callsign_verified flag stale. Only ever
          // flips callsign_verified FROM false/missing TO true when a
          // genuinely verified, non-suspended, non-expired record already
          // supports it -- this tool never de-verifies anyone (that is
          // reverify's job, which has its own admin_manual override
          // protection) and never creates, edits, or overwrites a Callsign
          // record. Two other classes of drift (a verified flag with no
          // supporting record at all, and a callsign mismatch between User
          // and Callsign) are reported only, never auto-repaired, since
          // correcting those requires a human judgment call this tool
          // shouldn't make unattended.
          const allUsers = await listAll(base44.asServiceRole.entities.User);
          const eligibleUsers = (allUsers || [])
            .filter((u) => !['admin', 'super_admin', 'agent'].includes(String(u.role || 'user').toLowerCase()))
            .filter((u) => String(u.callsign || '').trim() && String(u.callsign || '').trim().toLowerCase() !== 'none')
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));

          const total = eligibleUsers.length;
          if (body.dry_run === true) return Response.json({ ok: true, total, eligible: total });

          const afterId = String(body.after_id || '');
          const batchSize = Math.min(25, Math.max(1, Number(body.batchSize) || 10));
          const startIdx = afterId ? eligibleUsers.findIndex((u) => String(u.id) > afterId) : 0;
          const remaining = startIdx === -1 ? [] : eligibleUsers.slice(startIdx);
          const slice = remaining.slice(0, batchSize);

          const stats = {
            processed: 0, already_ok: 0, repaired: 0,
            verified_no_record: 0, mismatched_callsign: 0,
          };
          const details: any[] = [];

          const isRecordValid = (cs: any) =>
            !!cs && cs.verification_status === 'verified' && !cs.suspended &&
            !['expired', 'cancelled', 'suspended'].includes(String(cs.license_status || '').toLowerCase());

          for (const target of slice) {
            stats.processed++;
            const normalizedUserCallsign = String(target.callsign || '').trim().toUpperCase();

            const [ownedRows, accessRows] = await Promise.all([
              base44.asServiceRole.entities.Callsign.filter({ primary_user_id: target.id, duplicate_flagged: { $ne: true } }, '-created_date', 20).catch(() => []),
              base44.asServiceRole.entities.CallsignAccess.filter({ user_id: target.id, status: 'approved' }, '-approved_at', 20).catch(() => []),
            ]);

            // The user's actual primary Callsign record, if any -- independent
            // of whether it matches User.callsign (a mismatch is exactly what
            // the check below needs to detect, so this must not pre-filter on it).
            const anyPrimary = (ownedRows || [])[0] || null;
            const primary = (ownedRows || []).find((cs: any) =>
              String(cs.display_callsign || cs.normalized_callsign || '').trim().toUpperCase() === normalizedUserCallsign);

            let authorizedValid: any = null;
            for (const access of accessRows || []) {
              const linked = access.callsign_id
                ? await base44.asServiceRole.entities.Callsign.get(access.callsign_id).catch(() => null)
                : null;
              if (isRecordValid(linked)) { authorizedValid = linked; break; }
            }

            const supportingRecord = isRecordValid(primary) ? primary : authorizedValid;
            const shouldBeVerified = !!supportingRecord;
            const isVerified = target.callsign_verified === true;

            if (isVerified && !shouldBeVerified) {
              // Has the flag but no record currently backs it up -- report only.
              const hasAnyRecord = !!anyPrimary || (accessRows || []).length > 0;
              if (!hasAnyRecord) {
                stats.verified_no_record++;
                details.push({ user_id: target.id, user_name: target.email || target.full_name || target.id, callsign: normalizedUserCallsign, issue: 'verified_no_record' });
              } else {
                stats.already_ok++; // Has a record, just not currently in a "valid" state (e.g. pending re-verify) -- reverify handles this, not this tool.
              }
              continue;
            }

            if (!isVerified && shouldBeVerified) {
              await setUserCallsignVerified(base44, target.id, true, {
                license_status: 'Active',
                license_service: supportingRecord.radio_service || undefined,
                license_expiry: supportingRecord.expiration_date || '',
                license_country: supportingRecord.license_country || undefined,
                verification_source: supportingRecord.verification_source || undefined,
                verification_method: supportingRecord.verification_method || undefined,
                last_check: new Date().toISOString(),
              });
              stats.repaired++;
              details.push({ user_id: target.id, user_name: target.email || target.full_name || target.id, callsign: normalizedUserCallsign, issue: 'repaired_verified_flag' });
              await writeAudit(base44, {
                admin_id: admin.id, admin_name: admin.name,
                action: 'user.callsign_verify_repair', category: 'security',
                target_type: 'User', target_id: target.id,
                target_label: target.email || target.full_name || target.id,
                before: { callsign_verified: false }, after: { callsign_verified: true },
                meta: { source: isRecordValid(primary) ? 'primary Callsign record' : 'approved CallsignAccess', callsign: normalizedUserCallsign }, ip,
              });
              continue;
            }

            if (anyPrimary && !primary) {
              // Has one or more primary Callsign records, but none of them
              // match the callsign currently displayed on the User row.
              stats.mismatched_callsign++;
              details.push({ user_id: target.id, user_name: target.email || target.full_name || target.id, callsign: normalizedUserCallsign, issue: 'mismatched_callsign', callsign_record: anyPrimary.display_callsign || anyPrimary.normalized_callsign });
              continue;
            }

            stats.already_ok++;
          }

          const lastId = slice.length ? String(slice[slice.length - 1].id) : afterId;
          const done = slice.length < batchSize;

          await writeAudit(base44, {
            admin_id: admin.id, admin_name: admin.name,
            action: 'user.callsign_verify_repair_bulk', category: 'security',
            target_type: 'User', target_id: '',
            target_label: `Verification repair scan: ${stats.repaired} repaired (after ${afterId || 'start'})`,
            meta: { ...stats, after_id: afterId, batch_size: batchSize, total }, ip,
          });

          return Response.json({ ok: true, ...stats, details: details.slice(0, 50), total, after_id: lastId, done });
        }

        // Base44's direct User.get can occasionally return no record for a valid
        // member that is visible through the paged admin user listing. Re-read the
        // User collection as a fallback before treating the account as deleted.
        let target = await base44.asServiceRole.entities.User.get(id).catch(() => null);
        if (!target) {
          const listedUsers = await listAll(base44.asServiceRole.entities.User).catch(() => []);
          target = (listedUsers || []).find((u) => String(u.id) === id) || null;
        }
        if (!target) return Response.json({ error: 'User not found' }, { status: 404 });

        if (['admin', 'super_admin'].includes(target.role || 'user')) {
          return Response.json({ error: 'Staff accounts are excluded from callsign enforcement' }, { status: 400 });
        }

        if (action === 'set_callsign') {
          const newCallsign = String(body.new_callsign || '').trim().toUpperCase().replace(/\s+/g, '');
          const service = String(body.service || '').toUpperCase() === 'HAM' ? 'HAM' : 'GMRS';
          if (!newCallsign) {
            return Response.json({ error: 'A callsign is required' }, { status: 400 });
          }
          if (newCallsign.length > 10) {
            return Response.json({ error: 'Callsign is too long' }, { status: 400 });
          }

          // Lets an admin mark a callsign verified without a lookup -- for when
          // the FCC/OpenCallbook lookup providers can't confirm a license the
          // admin has independently confirmed is valid (e.g. a brand-new
          // callsign that hasn't propagated to OpenCallbook's weekly mirror
          // yet, or the FCC's own official API being unreachable).
          const markVerified = body.mark_verified === true;
          const nowIso = new Date().toISOString();

          // The Users table shows one row per radio service, sourced from the
          // member's own Callsign record when they have one -- editing here has
          // to correct THAT record, not just the legacy User.callsign field,
          // or the table would keep showing the old (wrong) value after saving.
          const owned = await base44.asServiceRole.entities.Callsign.filter(
            { primary_user_id: id, duplicate_flagged: { $ne: true } }, '-created_date', 50
          ).catch(() => []);

          // Older accounts can have a canonical Callsign record whose
          // radio_service was never populated. Prefer the requested service,
          // but also repair an otherwise-untyped primary record instead of
          // falling through to the legacy User-only path.
          const record = (owned || []).find((cs: any) =>
            String(cs.radio_service || '').toUpperCase() === service
          ) || (owned || []).find((cs: any) => !String(cs.radio_service || '').trim());

          if (record) {
            const before = record.display_callsign || record.normalized_callsign || '';
            await base44.asServiceRole.entities.Callsign.update(record.id, markVerified ? {
              display_callsign: newCallsign,
              normalized_callsign: newCallsign,
              radio_service: service,
              verification_status: 'verified',
              license_status: 'active',
              verified_at: nowIso,
              verification_source: 'Admin manual override',
              verification_method: 'admin_manual',
            } : {
              display_callsign: newCallsign,
              normalized_callsign: newCallsign,
              radio_service: service,
              verification_status: 'pending',
              license_status: 'pending',
              verified_at: null,
            });

            // Keep the authenticated account's denormalized callsign fields
            // synchronized with the canonical Callsign record even when the
            // admin is only changing the callsign and leaving verification pending.
            await base44.asServiceRole.entities.User.update(id, {
              callsign: newCallsign,
              license_service: service,
              ...(markVerified ? { callsign_verified: true, license_status: 'Active' } : {}),
            });

            if (markVerified) {
              await setUserCallsignVerified(base44, id, true, {
                license_status: 'Active', license_service: service, last_check: nowIso,
              });
              await writeCallsignAudit(base44, {
                callsign_id: record.id, normalized_callsign: newCallsign,
                actor_user_id: admin.id, actor_name: admin.name,
                action: 'admin_override', affected_user_id: id, affected_name: target.email || target.full_name || id,
                primary_user_id: id,
                reason: `Manually marked verified by admin (lookup providers could not confirm): ${newCallsign}`,
              });
            }

            await writeAudit(base44, {
              admin_id: admin.id, admin_name: admin.name,
              action: 'user.callsign_edit', category: 'security',
              target_type: 'Callsign', target_id: record.id,
              target_label: target.email || target.full_name || id,
              before: { callsign: before, service },
              after: { callsign: newCallsign, service, mark_verified: markVerified },
              ip,
            });

            return Response.json({
              ok: true, callsign: newCallsign, service, source: 'owned',
              callsign_verified: markVerified, license_status: markVerified ? 'Active' : 'Pending',
            });
          }

          // No canonical Callsign record for this service -- check whether this
          // member is only authorized on someone else's callsign for it. That
          // callsign belongs to a different account and can't be edited here.
          const authorizedHere = await base44.asServiceRole.entities.CallsignAccess.filter(
            { user_id: id, status: 'approved' }, '-approved_at', 50
          ).catch(() => []);
          for (const access of authorizedHere || []) {
            const linked = await base44.asServiceRole.entities.Callsign.get(access.callsign_id).catch(() => null);
            if (linked && String(linked.radio_service || 'GMRS').toUpperCase() === service) {
              return Response.json({
                error: `This member is only authorized to use this ${service} callsign, not its owner -- edit it from the primary holder's account instead.`,
              }, { status: 400 });
            }
          }

          // Legacy account with no Callsign entity records at all yet. Marking
          // it verified here needs a real Callsign record too, not just the
          // User fields, so it shows up correctly everywhere else (Callsign
          // Management, the public profile, getMemberInfo, etc).
          if (markVerified) {
            const normalized = newCallsign;
            const existingClaim = await base44.asServiceRole.entities.Callsign.filter(
              { normalized_callsign: normalized, duplicate_flagged: { $ne: true } }, 'created_date', 1
            ).catch(() => []);
            if (existingClaim && existingClaim.length && existingClaim[0].primary_user_id !== id) {
              return Response.json({
                error: `${normalized} is already claimed by another account. Grant this member authorized access to it from Admin → Callsigns instead.`,
              }, { status: 409 });
            }

            const record = await base44.asServiceRole.entities.Callsign.create({
              normalized_callsign: normalized,
              display_callsign: newCallsign,
              primary_user_id: id,
              primary_user_name: target.full_name || '',
              radio_service: service,
              verification_status: 'verified',
              license_status: 'active',
              verified_at: nowIso,
              last_check_date: nowIso,
              verification_source: 'Admin manual override',
              verification_method: 'admin_manual',
            });

            await base44.asServiceRole.entities.User.update(id, {
              callsign: newCallsign,
              license_service: service,
              callsign_verified: true,
              license_status: 'Active',
            });

            await writeCallsignAudit(base44, {
              callsign_id: record.id, normalized_callsign: normalized,
              actor_user_id: admin.id, actor_name: admin.name,
              action: 'admin_override', affected_user_id: id, affected_name: target.email || target.full_name || id,
              primary_user_id: id,
              reason: `Manually marked verified by admin (lookup providers could not confirm): ${newCallsign}`,
            });

            await writeAudit(base44, {
              admin_id: admin.id, admin_name: admin.name,
              action: 'user.callsign_edit', category: 'security',
              target_type: 'User', target_id: id,
              target_label: target.email || target.full_name || id,
              before: { callsign: target.callsign || '', service },
              after: { callsign: newCallsign, service, mark_verified: true },
              ip,
            });

            return Response.json({ ok: true, callsign: newCallsign, service, source: 'legacy', callsign_verified: true, license_status: 'Active' });
          }

          // Legacy account with no Callsign entity records at all yet -- same
          // behavior this action always had, scoped to the requested service.
          const update = {
            callsign: newCallsign,
            license_service: service,
            callsign_verified: false,
            license_status: 'Pending',
          };
          await base44.asServiceRole.entities.User.update(id, update);

          await writeAudit(base44, {
            admin_id: admin.id, admin_name: admin.name,
            action: 'user.callsign_edit', category: 'security',
            target_type: 'User', target_id: id,
            target_label: target.email || target.full_name || id,
            before: { callsign: target.callsign || '', service }, after: { callsign: newCallsign, service },
            ip,
          });

          return Response.json({ ok: true, callsign: newCallsign, service, source: 'legacy', callsign_verified: false, license_status: 'Pending' });
        }

        if (action === 'reverify') {
          // A member can have multiple approved callsigns (for example one GMRS
          // callsign and one HAM callsign). Re-verification must check every
          // callsign attached to the member instead of assuming User.callsign is
          // the only source of truth.
          const [accessRows, callsignRows, profileRows] = await Promise.all([
            base44.asServiceRole.entities.CallsignAccess.filter(
              { user_id: id, status: 'approved' }, 'approved_at', 100
            ).catch(() => []),
            base44.asServiceRole.entities.Callsign.filter(
              { primary_user_id: id, duplicate_flagged: { $ne: true } }, 'created_date', 100
            ).catch(() => []),
            base44.asServiceRole.entities.Profile.filter(
              { created_by_id: id }, 'updated_date', 100
            ).catch(() => []),
          ]);

          const candidates = [];
          const seen = new Set();
          const addCallsign = (value, source = 'authorized') => {
            const callsign = String(value || '').trim().toUpperCase();
            if (!callsign || callsign.toLowerCase() === 'none' || seen.has(callsign)) return;
            seen.add(callsign);
            candidates.push({ callsign, source });
          };

          // Preserve the legacy User.callsign as a candidate, but also include
          // every approved/primary callsign so GMRS + HAM members are handled.
          addCallsign(target.callsign, 'user');
          for (const cs of callsignRows || []) {
            addCallsign(cs.display_callsign || cs.normalized_callsign, 'primary');
          }
          for (const access of accessRows || []) {
            let value = String(access.display_callsign || access.normalized_callsign || '').trim();
            if (!value && access.callsign_id) {
              const linked = await base44.asServiceRole.entities.Callsign.get(access.callsign_id).catch(() => null);
              value = String(linked?.display_callsign || linked?.normalized_callsign || '').trim();
            }
            addCallsign(value, 'approved_access');
          }
          for (const profile of profileRows || []) {
            addCallsign(profile.callsign, 'profile');
          }

          if (!candidates.length) {
            await base44.asServiceRole.entities.User.update(id, {
              callsign_verified: false,
              license_status: 'None',
              last_callsign_check: new Date().toISOString(),
            });
            await writeAudit(base44, {
              admin_id: admin.id, admin_name: admin.name,
              action: 'user.callsign_reverify', category: 'security',
              target_type: 'User', target_id: id,
              target_label: target.email || target.full_name || id,
              after: { callsigns: [], callsign_verified: false, license_status: 'None' },
              ip,
            });
            return Response.json({
              ok: true,
              status: 'missing',
              callsign: '',
              callsigns: [],
              verified_count: 0,
              invalid_count: 0,
              unavailable_count: 0,
              callsign_verified: false,
              license_status: 'None'
            });
          }

          const results = [];
          let primaryUserCallsign = String(target.callsign || '').trim().toUpperCase();
          if (!primaryUserCallsign) {
            primaryUserCallsign = candidates[0].callsign;
          }

          for (const candidate of candidates) {
            try {
              // Same reasoning as reverify_all above: use the full
              // multi-provider chain, not just the official FCC API alone.
              const result = await ulsLookup(base44, candidate.callsign);
              if (!result || result.fccReachable === false) {
                results.push({ ...candidate, status: 'unavailable', result: null });
                continue;
              }

              const matchingRecords = await base44.asServiceRole.entities.Callsign.filter(
                { normalized_callsign: candidate.callsign, duplicate_flagged: { $ne: true } }, 'created_date', 100
              ).catch(() => []);

              // An admin can mark a callsign verified without a lookup when the
              // FCC/OpenCallbook providers can't confirm a license that's genuinely
              // valid (see set_callsign's mark_verified). A lookup that still can't
              // find the callsign afterward doesn't mean it's newly invalid -- it
              // means the provider gap that required the override in the first
              // place hasn't closed yet. Don't let that silently undo the admin's
              // attestation; only a lookup that actually FINDS the callsign (active
              // or with a real negative status like expired/cancelled) should ever
              // move it off the manual override.
              const adminOverrideRecord = (matchingRecords || []).find((r) => r.verification_method === 'admin_manual');
              if (!result.found && adminOverrideRecord) {
                results.push({
                  ...candidate,
                  status: 'verified',
                  licenseStatus: 'Active',
                  result: {
                    verified: true, found: true,
                    radioService: adminOverrideRecord.radio_service || undefined,
                    expiration: adminOverrideRecord.expiration_date || undefined,
                    country: adminOverrideRecord.license_country || undefined,
                    verificationSource: 'Admin manual override',
                    verificationMethod: 'admin_manual',
                  },
                });
                continue;
              }

              // Provider outage is not evidence of an invalid license. Keep
              // the existing verified state untouched when the lookup could not
              // actually reach a provider.
              if (result.fccReachable === false) {
                results.push({ ...candidate, status: 'unavailable', licenseStatus: target.license_status || 'Active', result });
                continue;
              }

              let licenseStatus = 'Pending';
              if (!result.found) licenseStatus = 'None';
              else if (result.verified) licenseStatus = 'Active';
              else {
                const raw = String(result.status || '').toLowerCase();
                licenseStatus = raw.includes('cancel') || raw.includes('terminat') ? 'Cancelled'
                  : raw.includes('expired') ? 'Expired'
                  : raw.includes('suspend') ? 'Suspended' : 'Pending';
              }

              const update: Record<string, any> = {
                verification_status: result.verified ? 'verified' : 'pending',
                verified_at: result.verified ? new Date().toISOString() : null,
                // Callsign.license_status's enum has no "none" value (only
                // active/expired/cancelled/suspended/pending/inactive) --
                // writing the raw lowercased "none" here silently fails this
                // ENTIRE Callsign.update() call (verification_status,
                // last_check_date, everything), which is exactly why a
                // reverify on a callsign no provider currently finds looked
                // like it did nothing. reverify_all already maps this
                // correctly; this single-account path just hadn't been kept
                // in sync with that fix.
                license_status: licenseStatus === 'None' ? 'inactive' : licenseStatus.toLowerCase(),
                radio_service: result.radioService || undefined,
                expiration_date: result.expiration || null,
                licensee_name: result.licensee || '',
                frn: result.frn || '',
                license_country: result.country || '',
                verification_source: result.verificationSource || 'FCC/OpenCallbook',
                verification_method: result.verificationMethod || 'official_fcc',
                last_check_date: new Date().toISOString(),
                suspended: false,
              };

              for (const record of matchingRecords || []) {
                await base44.asServiceRole.entities.Callsign.update(record.id, update).catch((e) =>
                  console.error('[reverify] callsign record update failed:', candidate.callsign, e?.message || e)
                );
              }

              results.push({
                ...candidate,
                status: result.verified ? 'verified' : 'invalid',
                licenseStatus,
                result,
              });
            } catch (e) {
              console.error('[reverify] failed for', candidate.callsign, e?.message || e);
              results.push({ ...candidate, status: 'unavailable', result: null });
            }
          }

          const verified = results.filter((x) => x.status === 'verified');
          const invalid = results.filter((x) => x.status === 'invalid');
          const unavailable = results.filter((x) => x.status === 'unavailable');

          // User has one legacy verification summary, so keep that summary tied
          // to its existing/primary callsign while all associated Callsign records
          // retain their own verification state.
          const primaryResult =
            results.find((x) => x.callsign === primaryUserCallsign) ||
            results[0];

          if (primaryResult?.result) {
            const result = primaryResult.result;
            const preserveVerified = result.fccReachable === false || (result.found === false && target.callsign_verified === true);
            let licenseStatus = primaryResult.licenseStatus || 'Pending';
            if (preserveVerified) licenseStatus = target.license_status || 'Active';
            const userUpdate: Record<string, any> = {
              callsign: primaryResult.callsign,
              callsign_verified: preserveVerified ? true : result.verified === true,
              license_status: licenseStatus,
              last_callsign_check: new Date().toISOString(),
            };
            if (result.expiration) {
              const expiry = new Date(result.expiration);
              if (!Number.isNaN(expiry.getTime())) userUpdate.license_expiry = expiry.toISOString();
            }
            if (result.radioService) userUpdate.license_service = result.radioService;
            if (result.country) userUpdate.license_country = result.country;
            if (result.verificationSource) userUpdate.verification_source = result.verificationSource;
            if (result.verificationMethod) userUpdate.verification_method = result.verificationMethod;

            try {
              await base44.asServiceRole.entities.User.update(id, userUpdate);
            } catch (updErr) {
              if (!userUpdate.license_service) throw updErr;
              delete userUpdate.license_service;
              await base44.asServiceRole.entities.User.update(id, userUpdate);
            }
          }

          await writeAudit(base44, {
            admin_id: admin.id, admin_name: admin.name,
            action: 'user.callsign_reverify', category: 'security',
            target_type: 'User', target_id: id,
            target_label: target.email || target.full_name || id,
            before: {
              callsign: target.callsign || '',
              callsign_verified: target.callsign_verified === true,
              license_status: target.license_status || 'Pending',
            },
            after: {
              callsigns: candidates.map((x) => x.callsign),
              verified: verified.map((x) => x.callsign),
              invalid: invalid.map((x) => x.callsign),
              unavailable: unavailable.map((x) => x.callsign),
            },
            ip,
          });

          const overallStatus =
            unavailable.length === results.length ? 'unavailable' :
            invalid.length > 0 ? 'invalid' :
            verified.length === results.length ? 'verified' : 'partial';

          return Response.json({
            ok: true,
            status: overallStatus,
            callsign: primaryResult?.callsign || '',
            callsigns: results.map((x) => ({
              callsign: x.callsign,
              status: x.status,
              license_status: x.licenseStatus || null,
              service: x.result?.radioService || null,
            })),
            verified_count: verified.length,
            invalid_count: invalid.length,
            unavailable_count: unavailable.length,
            callsign_verified: primaryResult?.status === 'verified',
            license_status: primaryResult?.licenseStatus || 'Pending',
            license_service: primaryResult?.result?.radioService || null,
            expiration: primaryResult?.result?.expiration || null,
          });
        }

        const callsignIssue =
          target.callsign_verified !== true ||
          target.license_status !== 'Active' ||
          !String(target.callsign || '').trim();

        if (action !== 'restore' && !callsignIssue) {
          return Response.json({ error: 'This account currently has a valid verified callsign' }, { status: 400 });
        }

        if (action === 'restrict') {
          await base44.asServiceRole.entities.User.update(id, { account_status: 'callsign_restricted' });
          await writeAudit(base44, {
            admin_id: admin.id, admin_name: admin.name,
            action: 'user.callsign_restrict', category: 'security',
            target_type: 'User', target_id: id,
            target_label: target.email || target.full_name || id,
            before: { account_status: target.account_status },
            after: { account_status: 'callsign_restricted' },
            meta: JSON.stringify({
              callsign: target.callsign || '',
              callsign_verified: target.callsign_verified === true,
              license_status: target.license_status || 'Pending'
            }),
            ip,
          });
          return Response.json({ ok: true, account_status: 'callsign_restricted' });
        }

        if (action === 'restore') {
          await base44.asServiceRole.entities.User.update(id, { account_status: 'active' });
          await writeAudit(base44, {
            admin_id: admin.id, admin_name: admin.name,
            action: 'user.callsign_restore', category: 'security',
            target_type: 'User', target_id: id,
            target_label: target.email || target.full_name || id,
            before: { account_status: target.account_status },
            after: { account_status: 'active' },
            ip,
          });
          return Response.json({ ok: true, account_status: 'active' });
        }

        const name = target.full_name || target.email || 'GMRS operator';
        const defaultMessageBody = [
          `Hi ${name},`,
          '',
          'Your Repeater Nation account currently does not have a valid, verified active GMRS or amateur radio (HAM) callsign on file.',
          '',
          'Please update your callsign and complete FCC verification from the Callsign Management page:',
          'https://repeaternation.com/callsign-management',
          '',
          'Until your GMRS callsign is verified, your account may be limited to profile and callsign-management features.',
          '',
          'If you believe your callsign is already valid, please re-check the information you entered or contact the Repeater Nation administration team.',
          '',
          'Thank you,',
          'Repeater Nation Administration'
        ].join('\n');

        // The admin can edit the email in the Notify dialog; otherwise use the standard notice.
        const customMessage = String(body.message || '').trim().slice(0, 5000);
        const customSubject = String(body.subject || '').trim().slice(0, 200);
        const messageBody = customMessage || defaultMessageBody;
        const emailSubject = customSubject || 'Action Required: Verify Your Repeater Nation Callsign';

        const conversationId = [admin.id, id].sort().join('__');
        const message = await base44.asServiceRole.entities.Message.create({
          conversation_id: conversationId,
          sender_id: admin.id,
          sender_name: admin.name,
          recipient_id: id,
          recipient_name: name,
          body: messageBody,
          read: false,
          status: 'sent',        });

        const email = await sendUserEmail(
          base44, id, 'announcements',
          emailSubject,
          messageBody
        );

        await writeAudit(base44, {
          admin_id: admin.id, admin_name: admin.name,
          action: 'user.callsign_notice', category: 'security',
          target_type: 'User', target_id: id,
          target_label: target.email || target.full_name || id,
          meta: JSON.stringify({
            message_id: message?.id || null,
            email_sent: email?.sent === true,
            email_reason: email?.reason || null,
            callsign: target.callsign || '',
            callsign_verified: target.callsign_verified === true,
            license_status: target.license_status || 'Pending'
          }),
          ip,
        });

        return Response.json({
          ok: true,
          message_id: message?.id || null,
          email_sent: email?.sent === true,
          email_reason: email?.reason || null
        });
      }

      case 'users:delete': {
        const id = String(body.id || '');

        if (!id) {
          return Response.json(
            { error: 'id required' },
            { status: 400 }
          );
        }

        if (id === admin.id) {
          return Response.json(
            { error: 'You cannot delete your own account' },
            { status: 400 }
          );
        }

        const before = await getByIdWithFallback(base44.asServiceRole.entities.User, id);
        const deleteSeniority = seniorityError(before);
        if (deleteSeniority) return deleteSeniority;

        await cascadeDeleteUser(base44.asServiceRole, id);

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'user.delete',
          category: 'security',
          target_type: 'User',
          target_id: id,
          target_label: before.email || before.full_name || id,
          before: {
            account_status: before.account_status,
            email: before.email,
            callsign: before.callsign
          },
          after: {
            account_status: 'deleted'
          },
          ip,
        });

        _aCache.delete('admin:users:raw'); _aCache.delete('admin:presence'); return Response.json({ ok: true, deleted: true });
      }

      // ============ REPEATERS ============
      case 'repeaters:list': {
        const q = String(body.query || '').toLowerCase().trim();
        const verification = String(body.verification || 'all');
        const status = String(body.status || 'all');
        const hidden =
          body.hidden === undefined ? 'all' : body.hidden;
        const service = String(body.service || 'GMRS').toUpperCase();

        // IMPORTANT:
        // Do NOT use .list(..., 500) directly here.
        // Base44 limits individual requests to 500 records.
        // listAllRepeaters() retrieves every repeater in 500-record batches.
        let repeaters = _cGet('admin:repeaters:all'); if (!repeaters) { repeaters = await listAllRepeaters(base44); _cSet('admin:repeaters:all', repeaters, 30000); }

        repeaters = (repeaters || []).filter((r) => (r?.radio_service || 'GMRS').toUpperCase() === service)
          .map((r) => ({ ...r, radio_service: r?.radio_service || 'GMRS' }));

        repeaters = (repeaters || [])
          .filter((r) => {
            if (
              verification !== 'all' &&
              (r.verification || 'Pending') !== verification
            ) {
              return false;
            }

            if (
              status !== 'all' &&
              (r.status || 'Online') !== status
            ) {
              return false;
            }

            if (
              hidden !== 'all' &&
              !!r.hidden !== !!hidden
            ) {
              return false;
            }

            if (
              q &&
              !`${r.name || ''} ${r.callsign || ''} ${r.owner || ''}`
                .toLowerCase()
                .includes(q)
            ) {
              return false;
            }

            return true;
          })
          .map((r) => ({
            id: r.id,
            name: r.name,
            callsign: r.callsign,
            frequency: r.frequency,
            status: r.status,
            verification: r.verification || 'Pending',
            hidden: !!r.hidden,
            lat: r.lat,
            lng: r.lng,
            owner: r.owner,
            linked_system: r.linked_system,
            access: r.access,
            mode: r.mode,
            offset: r.offset,
            tone: r.tone,
            input_tone: r.input_tone,
            elevation: r.elevation,
            coverage_radius: r.coverage_radius,
            notes: r.notes,
            created_date: r.created_date,
            radio_service: r.radio_service || 'GMRS',
          }));

        return Response.json({
          repeaters,
          total: repeaters.length
        });
      }

      case 'repeaters:update': {
        const id = String(body.id || '');
        const fields = body.fields || {};

        if (!id) {
          return Response.json(
            { error: 'id required' },
            { status: 400 }
          );
        }

        const before = await base44.asServiceRole.entities.Repeater
          .get(id)
          .catch(() => null);

        const safe: any = {};

        for (const k of [
          'name',
          'callsign',
          'frequency',
          'offset',
          'tone',
          'input_tone',
          'mode',
          'access',
          'status',
          'verification',
          'hidden',
          'lat',
          'lng',
          'elevation',
          'notes',
          'owner',
          'linked_system',
          'coverage_radius',
          'radio_service'
        ]) {
          if (k in fields) {
            safe[k] = fields[k];
          }
        }

        await base44.asServiceRole.entities.Repeater.update(
          id,
          safe
        );

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'repeater.update',
          category: 'repeater',
          target_type: 'Repeater',
          target_id: id,
          target_label:
            before?.name || before?.callsign || id,
          before: before
            ? {
                name: before.name,
                callsign: before.callsign,
                lat: before.lat,
                lng: before.lng,
                verification: before.verification
              }
            : null,
          after: safe,
          ip,
        });

        _aCache.delete('admin:repeaters:all'); _aCache.delete('admin:stats'); return Response.json({ ok: true });
      }

      case 'repeaters:setVerification': {
        const id = String(body.id || '');
        const verification = String(
          body.verification || ''
        );

        if (
          !id ||
          !VERIFICATIONS.includes(verification)
        ) {
          return Response.json(
            { error: 'invalid verification' },
            { status: 400 }
          );
        }

        const before = await base44.asServiceRole.entities.Repeater
          .get(id)
          .catch(() => null);

        await base44.asServiceRole.entities.Repeater.update(
          id,
          { verification }
        );

        const act =
          verification === 'Verified'
            ? 'repeater.approve'
            : verification === 'Rejected'
              ? 'repeater.reject'
              : 'repeater.set_verification';

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: act,
          category: 'repeater',
          target_type: 'Repeater',
          target_id: id,
          target_label:
            before?.name || before?.callsign || id,
          before: before
            ? { verification: before.verification }
            : null,
          after: { verification },
          ip,
        });

        _aCache.delete('admin:repeaters:all'); _aCache.delete('admin:stats'); return Response.json({ ok: true });
      }

      case 'repeaters:verifyAll': {
        // Scoped to ONE radio service and to repeaters that are still Pending. It never
        // touches the other service, and never re-verifies Rejected / Needs Review records
        // (those were set by an admin on purpose). Records with no radio_service are GMRS.
        const service = String(body.service || '').toUpperCase();
        if (service !== 'GMRS' && service !== 'HAM') {
          return Response.json({ error: 'service (GMRS or HAM) is required' }, { status: 400 });
        }

        const repeaters = await listAllRepeaters(base44);
        const rep = (repeaters || []).filter((r) =>
          String(r.radio_service || 'GMRS').toUpperCase() === service &&
          (r.verification || 'Pending') === 'Pending'
        );

        // Update by explicit id (not a collection-wide query), a few at a time.
        let updated = 0;
        let failed = 0;
        for (let i = 0; i < rep.length; i += 10) {
          await Promise.all(rep.slice(i, i + 10).map(async (r) => {
            try {
              await base44.asServiceRole.entities.Repeater.update(r.id, { verification: 'Verified' });
              updated++;
            } catch (e) {
              failed++;
              console.error('[repeaters:verifyAll] failed for', r.id, e?.message || e);
            }
          }));
        }

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'repeater.verify_all',
          category: 'repeater',
          target_type: 'Repeater',
          target_label: `bulk (${service})`,
          after: {
            verification: 'Verified',
            service,
            count: updated,
            failed
          },
          ip,
        });

        return Response.json({
          ok: true,
          service,
          updated,
          failed
        });
      }

      case 'repeaters:bulk': {
        const ids: string[] = Array.isArray(body.ids)
          ? body.ids.map(String).filter(Boolean)
          : [];

        const op = String(body.op || '');

        if (!ids.length) {
          return Response.json(
            { error: 'ids required' },
            { status: 400 }
          );
        }

        if (
          !['verify', 'hide', 'unhide', 'delete'].includes(op)
        ) {
          return Response.json(
            { error: 'invalid op' },
            { status: 400 }
          );
        }

        let updated = 0;

        if (op === 'verify') {
          const res =
            await base44.asServiceRole.entities.Repeater.updateMany(
              { _id: { $in: ids } },
              { $set: { verification: 'Verified' } }
            );

          updated = res?.modifiedCount ?? ids.length;

        } else if (op === 'hide') {
          const res =
            await base44.asServiceRole.entities.Repeater.updateMany(
              { _id: { $in: ids } },
              { $set: { hidden: true } }
            );

          updated = res?.modifiedCount ?? ids.length;

        } else if (op === 'unhide') {
          const res =
            await base44.asServiceRole.entities.Repeater.updateMany(
              { _id: { $in: ids } },
              { $set: { hidden: false } }
            );

          updated = res?.modifiedCount ?? ids.length;

        } else {
          const res =
            await base44.asServiceRole.entities.Repeater.deleteMany(
              { _id: { $in: ids } }
            );

          updated = res?.deletedCount ?? ids.length;
        }

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: `repeater.bulk_${op}`,
          category: 'repeater',
          target_type: 'Repeater',
          target_label: `bulk:${ids.length}`,
          after: {
            op,
            count: updated
          },
          ip,
        });

        return Response.json({
          ok: true,
          updated        });
      }

      case 'repeaters:delete': {
        const id = String(body.id || '');

        if (!id) {
          return Response.json(
            { error: 'id required' },
            { status: 400 }
          );
        }

        const before =
          await base44.asServiceRole.entities.Repeater
            .get(id)
            .catch(() => null);

        await base44.asServiceRole.entities.Repeater.delete(id);

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'repeater.delete',
          category: 'repeater',
          target_type: 'Repeater',
          target_id: id,
          target_label:
            before?.name || before?.callsign || id,
          before: before
            ? {
                name: before.name,
                callsign: before.callsign
              }
            : null,
          ip,
        });

        _aCache.delete('admin:repeaters:all'); _aCache.delete('admin:stats'); return Response.json({ ok: true });
      }

      // ============ REPORTS ============
      case 'reports:list': {
        const status = String(body.status || 'all');
        const category = String(body.category || 'all');
        const q = String(body.query || '')
          .toLowerCase()
          .trim();

        let reports = _cGet('admin:reports:all'); if (!reports) { reports = await base44.asServiceRole.entities.AdminReport.list('-created_date', 500); _cSet('admin:reports:all', reports, 30000); }

        reports = (reports || []).filter((r) => {
          if (
            status !== 'all' &&
            (r.status || 'Open') !== status
          ) {
            return false;
          }

          if (
            category !== 'all' &&
            (r.category || 'Other') !== category
          ) {
            return false;
          }

          if (
            q &&
            !`${r.title || ''} ${r.reason || ''} ${r.target_label || ''}`
              .toLowerCase()
              .includes(q)
          ) {
            return false;
          }

          return true;
        });

        return Response.json({ reports });
      }

      case 'reports:create': {
        const r =
          await base44.asServiceRole.entities.AdminReport.create({
            title: String(body.title || ''),
            reason: String(body.reason || ''),
            category: body.category || 'Other',
            target_type: body.target_type || '',
            target_id: body.target_id || '',
            target_label: body.target_label || '',
            status: 'Open',
            priority: body.priority || 'Medium',
            created_by_name: admin.name,
          });

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'report.create',
          category: 'report',
          target_type: 'AdminReport',
          target_id: r.id,
          target_label: body.title || '',
          ip,
        });

        return Response.json({ report: r });
      }

      case 'reports:update': {
        const id = String(body.id || '');

        if (!id) {
          return Response.json(
            { error: 'id required' },
            { status: 400 }
          );
        }

        const before =
          await base44.asServiceRole.entities.AdminReport
            .get(id)
            .catch(() => null);

        const fields: any = {};

        for (const k of [
          'status',
          'assigned_to',
          'assigned_name',
          'resolution',
          'priority'
        ]) {
          if (k in body) {
            fields[k] = body[k];
          }
        }

        if (
          fields.status &&
          !REPORT_STATUSES.includes(fields.status)
        ) {
          return Response.json(
            { error: 'invalid status' },
            { status: 400 }
          );
        }

        await base44.asServiceRole.entities.AdminReport.update(
          id,
          fields
        );

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'report.update',
          category: 'report',
          target_type: 'AdminReport',
          target_id: id,
          target_label: before?.title || id,
          before: before
            ? {
                status: before.status,
                assigned_to: before.assigned_to
              }
            : null,
          after: fields,
          ip,
        });

        _aCache.delete('admin:reports:all'); _aCache.delete('admin:stats'); return Response.json({ ok: true });
      }

      case 'reports:delete': {
        const id = String(body.id || '');
        if (!id) return Response.json({ error: 'id required' }, { status: 400 });

        const before =
          await base44.asServiceRole.entities.AdminReport
            .get(id)
            .catch(() => null);

        await base44.asServiceRole.entities.AdminReport.delete(id);

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'report.delete',
          category: 'report',
          target_type: 'AdminReport',
          target_id: id,
          target_label: before?.title || id,
          ip,
        });

        _aCache.delete('admin:reports:all'); _aCache.delete('admin:stats'); return Response.json({ ok: true });
      }

      case 'reports:deleteRepeater': {
        const reportId = String(body.report_id || '');
        const repeaterId = String(body.repeater_id || '');

        if (!reportId || !repeaterId) {
          return Response.json(
            { error: 'report_id and repeater_id are required' },
            { status: 400 }
          );
        }

        const report =
          await base44.asServiceRole.entities.AdminReport
            .get(reportId)
            .catch(() => null);

        if (!report) {
          return Response.json(
            { error: 'Report not found' },
            { status: 404 }
          );
        }

        if (report.category !== 'Repeater' || String(report.target_id || '') !== repeaterId) {
          return Response.json(
            { error: 'Report does not target this repeater' },
            { status: 400 }
          );
        }

        const repeater =
          await base44.asServiceRole.entities.Repeater
            .get(repeaterId)
            .catch(() => null);

        if (!repeater) {
          return Response.json(
            { error: 'Repeater not found' },
            { status: 404 }
          );
        }

        await base44.asServiceRole.entities.Repeater.delete(repeaterId);
        await base44.asServiceRole.entities.AdminReport.delete(reportId);

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'repeater.delete_from_report',
          category: 'repeater',
          target_type: 'Repeater',
          target_id: repeaterId,
          target_label: repeater.name || repeater.callsign || repeaterId,
          before: {
            name: repeater.name,
            callsign: repeater.callsign,
            frequency: repeater.frequency,
          },
          report_id: reportId,
          report_title: report.title || reportId,
          ip,
        });

        return Response.json({ ok: true });
      }

      // ============ NOTIFICATIONS ============
      case 'notifications:list': {
        const notifications =
          await base44.asServiceRole.entities.AdminNotification.list(
            '-created_date',
            200
          );

        return Response.json({
          notifications: notifications || []
        });
      }

      case 'notifications:create': {
        const image_url = body.image_url
          ? String(body.image_url)
          : '';

        const link_url = body.link_url
          ? String(body.link_url)
          : '';

        const link_label = body.link_label
          ? String(body.link_label)
          : '';

        const n =
          await base44.asServiceRole.entities.AdminNotification.create({
            title: String(body.title || ''),
            body: String(body.body || ''),
            type: body.type || 'Announcement',
            audience: body.audience || 'All',
            active:
              body.active !== undefined
                ? !!body.active
                : true,
            expires_at: body.expires_at || '',
            image_url: image_url || undefined,
            link_url: link_url || undefined,
            link_label: link_label || undefined,
            created_by_name: admin.name,
          });

        // Broadcast to all users as a UserNotification so it appears
        // in their dashboard/notifications.
        // Only broadcast active notifications; admins-only audience
        // restricts recipients to admins.
        const shouldBroadcast = n.active !== false;

        let broadcast = 0;

        if (shouldBroadcast) {
          const notifType =
            (n.type || 'Announcement').toLowerCase() === 'alert'
              ? 'alert'
              : (n.type || 'Announcement').toLowerCase() ===
                  'maintenance'
                ? 'system'
                : (n.type || 'Announcement').toLowerCase() ===
                    'system'
                  ? 'system'
                  : 'announcement';

          let skip = 0;

          while (skip < 5000) {
            let batch: any[] = [];

            try {
              batch =
                await base44.asServiceRole.entities.User.list(
                  '-created_date',
                  500,
                  skip
                );
            } catch (e) {
              console.error(
                '[admin-api] user list batch failed:',
                e?.message || e
              );
            }

            if (!batch || !batch.length) break;

            const recipients = batch.filter((u: any) => {
              if (
                u.account_status === 'suspended' ||
                u.account_status === 'investigation'
              ) {
                return false;
              }

              if (
                n.audience === 'Admins' &&
                (u.role || 'user') !== 'admin'
              ) {
                return false;
              }

              return true;
            });

            if (recipients.length) {
              const records = recipients.map((u: any) => ({
                user_id: u.id,
                title: n.title,
                message: n.body,
                type: notifType,
                sender_name: admin.name,
                image_url:
                  image_url || undefined,
                link_url:
                  link_url || undefined,
                link_label:
                  link_label || undefined,
                read: false,
              }));

              try {
                await base44.entities.UserNotification.bulkCreate(
                  records
                );

                broadcast += records.length;
              } catch (e) {
                console.error(
                  '[admin-api] broadcast batch failed:',
                  e?.message || e
                );
              }
            }
            if (batch.length < 500) break;

            skip += 500;
          }
        }

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'notification.create',
          category: 'system',
          target_type: 'AdminNotification',
          target_id: n.id,
          target_label: body.title || '',
          after: { broadcast },
          ip,
        });

        return Response.json({
          notification: n,
          broadcast
        });
      }

      case 'notifications:update': {
        const id = String(body.id || '');

        if (!id) {
          return Response.json(
            { error: 'id required' },
            { status: 400 }
          );
        }

        const fields: any = {};

        for (const k of [
          'title',
          'body',
          'type',
          'audience',
          'active',
          'expires_at'
        ]) {
          if (k in body) {
            fields[k] = body[k];
          }
        }

        await base44.asServiceRole.entities.AdminNotification.update(
          id,
          fields
        );

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'notification.update',
          category: 'system',
          target_type: 'AdminNotification',
          target_id: id,
          target_label: body.title || id,
          after: fields,
          ip,
        });

        return Response.json({ ok: true });
      }

      case 'notifications:delete': {
        const id = String(body.id || '');
        if (!id) return Response.json({ error: 'id required' }, { status: 400 });

        await base44.asServiceRole.entities.AdminNotification.delete(
          id
        );

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'notification.delete',
          category: 'system',
          target_type: 'AdminNotification',
          target_id: id,
          ip,
        });

        return Response.json({ ok: true });
      }

      case 'notifications:sendEmail': {
        const id = String(body.id || '');

        let n: any;

        if (id) {
          n =
            await base44.asServiceRole.entities.AdminNotification
              .get(id)
              .catch(() => null);
        } else {
          n = {
            title: String(body.title || ''),
            body: String(body.body || ''),
            audience: body.audience || 'All'
          };
        }

        if (!n) {
          return Response.json(
            { error: 'notification not found' },
            { status: 404 }
          );
        }

        const audience = n.audience || 'All';

        // Sends real emails one at a time (no bulk-send API), so -- unlike
        // notifications:create's broadcast, which just bulk-creates
        // UserNotification rows and can afford to page through up to 5000
        // users in one request -- this needs to stay small per request or a
        // large recipient list risks the whole call timing out mid-send with
        // nothing sent past whatever the timeout caught. Client drives this
        // in batches (see users:notifyAll for the same pattern), using a
        // stable id cursor so a batch's own results never shift what the
        // next one covers.
        const afterId = String(body.after_id || '');
        const batchSize = Math.min(50, Math.max(1, Number(body.batchSize) || 25));

        const users = await listAll(base44.asServiceRole.entities.User);

        const recipients = (users || [])
          .filter((u) => {
            if (u.account_status === 'suspended' || u.account_status === 'investigation') return false;
            if (audience === 'Admins' && (u.role || 'user') !== 'admin') return false;
            if (u.email_notifications === false) return false;
            if (u.email_announcements === false) return false;
            return !!u.email;
          })
          .sort((a, b) => String(a.id).localeCompare(String(b.id)));

        if (body.dry_run === true) {
          return Response.json({ ok: true, recipients: recipients.length });
        }

        const startIdx = afterId ? recipients.findIndex((u) => String(u.id) > afterId) : 0;
        const slice = startIdx === -1 ? [] : recipients.slice(startIdx, startIdx + batchSize);

        let sent = 0;
        for (const u of slice) {
          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: u.email,
              subject: n.title,
              body: n.body
            });
            sent++;
          } catch (e) {
            console.error('[admin-api] email send failed:', u.email, e?.message || e);
          }
        }

        const nextAfterId = slice.length ? String(slice[slice.length - 1].id) : afterId;
        const done = slice.length < batchSize;

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'notification.email_broadcast',
          category: 'system',
          target_type: 'AdminNotification',
          target_id: id || 'inline',
          target_label: `${n.title} — batch of ${slice.length}`,
          after: { recipients: recipients.length, sent, after_id: afterId },
          ip,
        });

        return Response.json({
          ok: true,
          recipients: recipients.length,
          sent,
          after_id: nextAfterId,
          done,
        });
      }

      // ============ SETTINGS ============
      case 'settings:get': {
        let settings =
          (
            await base44.asServiceRole.entities.AdminSetting.list(
              '-updated_date',
              1
            )
          )[0];

        if (!settings) {
          settings =
            await base44.asServiceRole.entities.AdminSetting.create({
              maintenance_mode: false,
              registration_open: true,
              allow_new_repeaters: true,
              fcc_auto_verify: false,
              radio_enabled: true,
              map_default_zoom: 4,
              announcement: '',
              changelog_webhook_url: '',
              bug_report_webhook_url: '',
              updated_by_name: admin.name,
              tool_frequency_calc: true,
              tool_tone_calc: true,
              tool_channel_planner: true,
              tool_antenna_calc: true,
              tool_coax_calc: true,
              tool_power_calc: true,
              tool_distance_calc: true,
              tool_weather: true,
              tool_sunrise_sunset: true,
              gamification_enabled: true,
              social_discord_url: 'https://discord.gg/SjNy9jR9ej',
            });
        }

        return Response.json({ settings });
      }

      case 'settings:update': {
        let settings =
          (
            await base44.asServiceRole.entities.AdminSetting.list(
              '-updated_date',
              1
            )
          )[0];

        if (!settings) {
          settings =
            await base44.asServiceRole.entities.AdminSetting.create({
              maintenance_mode: false,
              registration_open: true,
              allow_new_repeaters: true,
              fcc_auto_verify: false,
              radio_enabled: true,
              map_default_zoom: 4,
              announcement: '',
              changelog_webhook_url: '',
              bug_report_webhook_url: '',
              updated_by_name: admin.name,
              tool_frequency_calc: true,
              tool_tone_calc: true,
              tool_channel_planner: true,
              tool_antenna_calc: true,
              tool_coax_calc: true,
              tool_power_calc: true,
              tool_distance_calc: true,
              tool_weather: true,
              tool_sunrise_sunset: true,
              gamification_enabled: true,
              social_discord_url: 'https://discord.gg/SjNy9jR9ej',
            });
        }

        const fields: any = {};

        for (const k of [
          'maintenance_mode',
          'registration_open',
          'allow_new_repeaters',
          'fcc_auto_verify',
          'radio_enabled',
          'map_default_zoom',
          'announcement',
          'changelog_webhook_url',
          'bug_report_webhook_url',
          'webhook_access_requests',
          'webhook_friend_requests',
          'webhook_messages',
          'webhook_forum_replies',
          'webhook_net_host_invites',
          'webhook_repeater_submissions',
          'webhook_club_joins',
          'webhook_pota_submissions',
          'webhook_badge_awards',
          'webhook_payments',
          'webhook_events',
          'discord_events_enabled',
          'discord_event_kinds',
          'discord_message_templates',
          'discord_bot_usernames',
          'nav_order',
          'platform_fee_percent',
          'tool_frequency_calc',
          'tool_tone_calc',
          'tool_channel_planner',
          'tool_antenna_calc',
          'tool_coax_calc',
          'tool_power_calc',
          'tool_distance_calc',
          'tool_weather',
          'tool_sunrise_sunset',
          'tool_morse_code',
          'tool_sdr',
          'gamification_enabled',
          'show_bug_report_link',
          'social_discord_url',
          'social_twitter_url',
          'social_facebook_url',
          'social_instagram_url',
          'social_youtube_url',
          'social_tiktok_url',
          'donation_url',
          'donation_stripe_enabled',
          'signup_announcement_enabled',
          'signup_announcement_title',
          'signup_announcement_body'
        ]) {
          if (k in body) {
            fields[k] = body[k];
          }
        }

        fields.updated_by_name = admin.name;
        if ('discord_events_enabled' in fields) fields.discord_events_enabled = fields.discord_events_enabled !== false;
        if ('discord_event_kinds' in fields) {
          const kinds = ['club', 'net_control', 'pota_activation', 'sota_activation', 'other'];
          fields.discord_event_kinds = Array.isArray(fields.discord_event_kinds) ? [...new Set(fields.discord_event_kinds.filter((k: any) => kinds.includes(k)))] : kinds;
        }

        // Validate webhook URLs before storing to prevent SSRF.
        for (const wk of WEBHOOK_SETTING_FIELDS) {
          if (wk in fields && fields[wk] && !validateWebhookUrl(String(fields[wk]))) {
            return Response.json({ error: `Invalid or unsafe webhook URL for ${wk}` }, { status: 400 });
          }
        }

        const before = { ...settings };

        await base44.asServiceRole.entities.AdminSetting.update(
          settings.id,
          fields
        );

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'settings.update',
          category: 'settings',
          target_type: 'AdminSetting',
          target_id: settings.id,
          before,
          after: fields,
          ip,
        });

        _aCache.delete('admin:stats'); return Response.json({ ok: true });
      }

      case 'discord:test': {
        const templateId = String(body.template_id || '');
        const tmpl = DISCORD_TEMPLATES.find((t) => t.id === templateId);
        if (!tmpl) return Response.json({ error: 'Unknown template' }, { status: 400 });

        const webhookUrl = String(body.webhook_url || '');
        if (!webhookUrl) {
          return Response.json({ error: 'Add a webhook URL for this channel before sending a test.' }, { status: 400 });
        }
        if (!validateWebhookUrl(webhookUrl)) {
          return Response.json({ error: 'Invalid or unsafe webhook URL.' }, { status: 400 });
        }

        const vars = SAMPLE_VARS[templateId] || {};
        const title = renderTemplate(String(body.title || '').trim() || tmpl.defaultTitle, vars);
        const description = renderTemplate(String(body.description || '').trim() || tmpl.defaultDescription, vars);
        const colorHex = String(body.color || '').trim() || tmpl.defaultColor;
        const colorNum = parseInt(colorHex.replace('#', ''), 16);
        const color = Number.isFinite(colorNum) ? colorNum : parseInt(tmpl.defaultColor.replace('#', ''), 16);
        const username = String(body.username || '').trim() || DEFAULT_USERNAMES[tmpl.channelType] || 'WaveSync GMRS';

        const payload = {
          username,
          embeds: [{
            title: `🧪 [TEST] ${title}`,
            description,
            color,
            timestamp: new Date().toISOString(),
            footer: { text: 'WaveSync GMRS · Test message — not a real event' },
          }],
        };

        const discordRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!discordRes.ok) {
          const text = await discordRes.text().catch(() => '');
          console.error('[admin-api] discord:test failed', discordRes.status, text);
          return Response.json({ error: `Discord rejected the test message (HTTP ${discordRes.status}).` }, { status: 502 });
        }

        return Response.json({ ok: true });
      }

      // ============ AUDIT ============
      case 'audit:list': {
        const category = String(
          body.category || 'all'
        );

        const limit = Math.min(
          Number(body.limit || 100),
          500
        );

        let audit =
          await base44.asServiceRole.entities.AuditLog.list(
            '-created_date',
            limit
          );

        audit = (audit || [])
          .filter(
            (a) =>
              category === 'all' ||
              a.category === category
          )
          .map((a) => ({
            id: a.id,
            admin_name: a.admin_name,
            action: a.action,
            category: a.category,
            target_type: a.target_type,
            target_id: a.target_id,
            target_label: a.target_label,
            before: a.before,
            after: a.after,
            ip: a.ip,
            created_date: a.created_date,
          }));

        return Response.json({ audit });
      }

      // ============ FCC ============
      case 'fcc:reverifyAll': {
        // Process callsigns in small, bounded batches. A single request cannot
        // safely verify hundreds of FCC records before the serverless timeout.
        const offset = Math.max(0, Number(body.offset || 0));
        const batchSize = Math.min(Math.max(Number(body.batchSize || 20), 1), 20);

        const allUsers = [];
        let userSkip = 0;
        const userBatchSize = 500;

        while (true) {
          const batch = await base44.asServiceRole.entities.User.list(
            '-created_date',
            userBatchSize,
            userSkip
          );
          if (!batch || batch.length === 0) break;
          allUsers.push(...batch);
          if (batch.length < userBatchSize) break;
          userSkip += userBatchSize;
        }

        const updateUserWithRetry = async (userId: string, update: any) => {
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              await base44.asServiceRole.entities.User.update(userId, update);
              return true;
            } catch (_) {
              if (attempt < 3) {
                await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
              }
            }
          }
          return false;
        };

        const eligible = allUsers.filter((u) =>
          !['admin', 'super_admin'].includes(u.role || 'user')
        );

        // Batch by eligible members, not by unique callsigns. This guarantees
        // the admin button walks through every member even when many accounts
        // have different callsigns or no callsign at all.
        const workUsers = eligible.slice(offset, offset + batchSize);
        const callsignUsers = new Map<string, any[]>();
        let missing = 0;

        for (const u of workUsers) {
          const callsign = String(u.callsign || '').trim().toUpperCase();
          if (!callsign) {
            missing++;
            continue;
          }
          if (!callsignUsers.has(callsign)) callsignUsers.set(callsign, []);
          callsignUsers.get(callsign).push(u);
        }

        let missingFailed = 0;
        for (const u of workUsers) {
          if (String(u.callsign || '').trim()) continue;
          const ok = await updateUserWithRetry(u.id, {
            callsign_verified: false,
            license_status: 'None',
            last_callsign_check: new Date().toISOString(),
          });
          if (!ok) missingFailed++;
        }

        const uniqueCallsigns = [...callsignUsers.keys()];
        const concurrency = 5;

        let checked = 0;
        let verified = 0;
        let invalid = 0;
        let unreachable = 0;
        let failed = missingFailed;

        for (let i = 0; i < uniqueCallsigns.length; i += concurrency) {
          const chunk = uniqueCallsigns.slice(i, i + concurrency);
          const results = await Promise.all(
            chunk.map(async (callsign) => {
              try {
                return { callsign, result: await ulsLookup(base44, callsign) };
              } catch (error) {
                return { callsign, result: null };
              }
            })
          );

          for (const { callsign, result } of results) {
            checked++;
            const usersForCallsign = callsignUsers.get(callsign) || [];

            if (!result || result.fccReachable === false) {
              unreachable++;
              continue;
            }

            let licenseStatus = 'Pending';
            if (!result.found) {
              licenseStatus = 'None';
            } else if (result.verified) {
              licenseStatus = 'Active';
            } else {
              const raw = String(result.status || '').toLowerCase();
              licenseStatus = raw.includes('cancel') || raw.includes('terminat')
                ? 'Cancelled'
                : raw.includes('expired')
                  ? 'Expired'
                  : raw.includes('suspend')
                    ? 'Suspended'
                    : 'Pending';
            }

            const update: any = {
              callsign,
              callsign_verified: result.verified === true,
              license_status: licenseStatus,
              last_callsign_check: new Date().toISOString(),
              // GMRS or HAM, from the FCC record (only when known).
              ...(result.radioService ? { license_service: result.radioService } : {}),
            };

            if (result.expiration) {
              const expiry = new Date(result.expiration);
              if (!Number.isNaN(expiry.getTime())) {
                update.license_expiry = expiry.toISOString();
              }
            }

            for (const u of usersForCallsign) {
              if (await updateUserWithRetry(u.id, update)) {
                if (result.verified) verified++;
                else invalid++;
              } else {
                failed++;
              }
            }
          }
        }

        const nextOffset = offset + workUsers.length;
        const done = nextOffset >= eligible.length;

        if (done) {
          await writeAudit(base44, {
            admin_id: admin.id,
            admin_name: admin.name,
            action: 'callsigns.reverify_all',
            category: 'security',
            target_type: 'System',
            target_id: 'callsigns',
            target_label: 'All member callsigns',
            meta: JSON.stringify({
              total_users: eligible.length,
              unique_callsigns: uniqueCallsigns.length
            }),
            ip,
          });
        }

        return Response.json({
          ok: true,
          done,
          total_users: eligible.length,
          unique_callsigns: uniqueCallsigns.length,
          offset,
          next_offset: nextOffset,
          batch_size: workUsers.length,
          checked,
          verified,
          invalid,
          missing,
          unreachable,
          failed
        });
      }

      case 'fcc:search': {
        const callsign = String(
          body.callsign || ''
        )
          .trim()
          .toUpperCase();

        if (!callsign) {
          return Response.json(
            { error: 'callsign required' },
            { status: 400 }
          );
        }

        const result = await ulsLookup(base44, callsign);

        return Response.json({ result });
      }

      case 'fcc:syncStatus': {
        // Retrieve every repeater instead of only the first 500.
        const repeaters = await listAllRepeaters(base44);
        const rep = repeaters || [];

        return Response.json({
          status: {
            pending: rep.filter(
              (x) =>
                (x.verification || 'Pending') === 'Pending'
            ).length,
            verified: rep.filter(
              (x) => x.verification === 'Verified'
            ).length,
            needsReview: rep.filter(
              (x) =>
                x.verification === 'Needs Review'
            ).length,
            total: rep.length,
            message:
              'FCC verification is performed per-callsign via the public ULS API. No bulk sync job is configured.',
          },
        });
      }

      // ============ BADGES (admin-managed achievement badges) ============
      case 'badges:list': {
        const badges =
          await base44.asServiceRole.entities.Badge.list(
            'display_order',
            500
          );

        return Response.json({
          badges: badges || []
        });
      }

      case 'badges:create': {
        const b =
          await base44.asServiceRole.entities.Badge.create({
            name: String(body.name || ''),
            description: String(body.description || ''),
            icon: String(body.icon || ''),
            icon_type: body.icon_type || 'emoji',
            image_url: body.image_url || '',
            category: body.category || 'Achievement',
            rarity: body.rarity || 'Common',
            color: body.color || '#f59e0b',
            display_order: Number(
              body.display_order || 0
            ),
            enabled:
              body.enabled !== undefined
                ? !!body.enabled
                : true,
            is_secret: !!body.is_secret,
            requirement_type:
              body.requirement_type ||
              'manual_only',
            requirement_amount: Number(
              body.requirement_amount || 1
            ),
            requirement_period:
              body.requirement_period ||
              'all_time',
            requirement_label: String(
              body.requirement_label || ''
            ),
            award_method:
              body.award_method || 'manual',
          });

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'badge.create',
          category: 'admin',
          target_type: 'Badge',
          target_id: b.id,
          target_label: body.name || '',
          after: { ...body },
          ip,
        });

        return Response.json({ badge: b });
      }

      case 'badges:update': {
        const id = String(body.id || '');

        if (!id) {
          return Response.json(
            { error: 'id required' },
            { status: 400 }
          );
        }

        const before =
          await base44.asServiceRole.entities.Badge
            .get(id)
            .catch(() => null);

        const fields: any = {};

        for (const k of [
          'name',
          'description',
          'icon',
          'icon_type',
          'image_url',
          'category',
          'rarity',
          'color',
          'display_order',
          'enabled',
          'is_secret',
          'requirement_type',
          'requirement_amount',
          'requirement_period',
          'requirement_label',
          'award_method'
        ]) {
          if (k in body) {
            fields[k] = body[k];
          }
        }

        await base44.asServiceRole.entities.Badge.update(
          id,
          fields
        );

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'badge.update',
          category: 'admin',
          target_type: 'Badge',
          target_id: id,
          target_label:
            before?.name || id,
          before: before
            ? {
                name: before.name,
                rarity: before.rarity,
                requirement_type:
                  before.requirement_type,
                requirement_amount:
                  before.requirement_amount,
                enabled: before.enabled,
                is_secret: before.is_secret,
                award_method:
                  before.award_method
              }
            : null,
          after: fields,
          ip,
        });

        return Response.json({ ok: true });
      }

      case 'badges:delete': {
        const id = String(body.id || '');

        if (!id) {
          return Response.json(
            { error: 'id required' },
            { status: 400 }
          );
        }

        const before =
          await base44.asServiceRole.entities.Badge
            .get(id)
            .catch(() => null);

        await base44.asServiceRole.entities.Badge.delete(id);

        try {
          await base44.asServiceRole.entities.UserBadge.deleteMany({
            badge_id: id
          });
        } catch (e) {
          console.error(
            '[badges:delete] cleanup awards failed',
            e
          );
        }

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'badge.delete',
          category: 'admin',
          target_type: 'Badge',
          target_id: id,
          target_label:
            before?.name || id,
          ip,
        });

        return Response.json({ ok: true });
      }

      case 'badges:award': {
        const userId = String(
          body.user_id || ''
        );

        const badgeId = String(
          body.badge_id || ''
        );

        if (!userId || !badgeId) {
          return Response.json(
            {
              error:
                'user_id and badge_id required'
            },
            { status: 400 }
          );
        }
        const existing =
          await base44.asServiceRole.entities.UserBadge.filter(
            {
              user_id: userId,
              badge_id: badgeId
            },
            '-created_date',
            1
          );

        if (existing && existing.length) {
          return Response.json(
            {
              error:
                'User already has this badge'
            },
            { status: 400 }
          );
        }

        const user =
          await base44.asServiceRole.entities.User
            .get(userId)
            .catch(() => null);

        const badge =
          await base44.asServiceRole.entities.Badge
            .get(badgeId)
            .catch(() => null);

        const ub =
          await base44.asServiceRole.entities.UserBadge.create({
            user_id: userId,
            user_name:
              user?.full_name ||
              user?.email ||
              '',
            badge_id: badgeId,
            badge_name:
              badge?.name || '',
            awarded_at:
              new Date().toISOString(),
            award_method: 'manual',
            awarded_by_id: admin.id,
            awarded_by_name: admin.name,
          });

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'badge.award',
          category: 'admin',
          target_type: 'UserBadge',
          target_id: ub.id,
          target_label: `${
            user?.full_name ||
            user?.email ||
            userId
          } ← ${
            badge?.name ||
            badgeId
          }`,
          after: {
            user_id: userId,
            badge_id: badgeId,
            badge_name: badge?.name
          },
          ip,
        });

        return Response.json({
          award: ub
        });
      }

      case 'badges:revoke': {
        const userId = String(
          body.user_id || ''
        );

        const badgeId = String(
          body.badge_id || ''
        );

        if (!userId || !badgeId) {
          return Response.json(
            {
              error:
                'user_id and badge_id required'
            },
            { status: 400 }
          );
        }

        const awards =
          await base44.asServiceRole.entities.UserBadge.filter(
            {
              user_id: userId,
              badge_id: badgeId
            },
            '-created_date',
            100
          );

        const badge =
          await base44.asServiceRole.entities.Badge
            .get(badgeId)
            .catch(() => null);

        const user =
          await base44.asServiceRole.entities.User
            .get(userId)
            .catch(() => null);

        const count = awards?.length || 0;

        if (count) {
          await base44.asServiceRole.entities.UserBadge.deleteMany({
            user_id: userId,
            badge_id: badgeId
          });
        }

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'badge.revoke',
          category: 'admin',
          target_type: 'UserBadge',
          target_id: badgeId,
          target_label: `${
            user?.full_name ||
            user?.email ||
            userId
          } ← ${
            badge?.name ||
            badgeId
          }`,
          before: { count },
          ip,
        });

        return Response.json({
          ok: true
        });
      }

      case 'badges:stats': {
        const id = String(
          body.badge_id || ''
        );

        if (!id) {
          return Response.json(
            { error: 'badge_id required' },
            { status: 400 }
          );
        }

        const badge =
          await base44.asServiceRole.entities.Badge
            .get(id)
            .catch(() => null);

        const awards =
          await base44.asServiceRole.entities.UserBadge.filter(
            { badge_id: id },
            '-created_date',
            5000
          );

        const list = awards || [];

        const sorted = [...list].sort(
          (a, b) =>
            new Date(
              b.awarded_at ||
                b.created_date
            ).getTime() -
            new Date(
              a.awarded_at ||
                a.created_date
            ).getTime()
        );

        const recent =
          sorted[0] || null;

        const earnedUserIds =
          new Set(
            list.map(
              (a: any) => a.user_id
            )
          );

        let progressing = 0;

        try {
          const users =
            await base44.asServiceRole.entities.User.list(
              '-created_date',
              5000
            );

          const amount =
            badge?.requirement_amount || 1;

          const metricMap =
            await buildMetricMap(
              base44,
              badge?.requirement_type,
              badge?.requirement_period
            );

          for (const u of users || []) {
            if (earnedUserIds.has(u.id)) {
              continue;
            }

            const val = metricMap
              ? metricMap.get(u.id) || 0
              : metricForUser(
                  u,
                  badge?.requirement_type
                );

            if (
              val >= 1 &&
              val < amount
            ) {
              progressing++;
            }
          }
        } catch (e) {
          console.error(
            '[badges:stats] progressing failed',
            e?.message || e
          );
        }

        return Response.json({
          stats: {
            earned: list.length,
            progressing,
            recent_user: recent
              ? {
                  id: recent.user_id,
                  name: recent.user_name,
                  date:
                    recent.awarded_at ||
                    recent.created_date
                }
              : null,
            created_date:
              badge?.created_date,
            updated_date:
              badge?.updated_date,
          },
        });
      }

      case 'badges:audit': {
        const id = String(
          body.badge_id || ''
        );

        let audit =
          await base44.asServiceRole.entities.AuditLog.list(
            '-created_date',
            500
          );

        audit = (audit || [])
          .filter((a: any) => {
            if (
              !a.action ||
              !a.action.startsWith('badge.')
            ) {
              return false;
            }

            if (!id) {
              return true;
            }

            if (a.target_id === id) {
              return true;
            }

            try {
              const after = a.after
                ? JSON.parse(a.after)
                : null;

              if (
                after &&
                after.badge_id === id
              ) {
                return true;
              }
            } catch {}

            return false;
          })
          .map((a: any) => ({
            id: a.id,
            admin_name: a.admin_name,
            action: a.action,
            target_label:
              a.target_label,
            before: a.before,
            after: a.after,
            created_date:
              a.created_date,
          }));

        return Response.json({
          audit
        });
      }

      case 'badges:evaluate': {
        return evaluateBadges(base44, admin, ip);
      }

      // ============ SEO ============
      case 'seo:get': {
        let settings =
          (
            await base44.asServiceRole.entities.SeoSetting.list(
              '-updated_date',
              1
            )
          )[0];

        if (!settings) {
          settings =
            await base44.asServiceRole.entities.SeoSetting.create({
              site_title:
                'Repeater Nation — GMRS Repeater Directory, Clubs, Nets & Community',
              site_description:
                'Repeater Nation is a community-driven platform for GMRS repeaters, clubs, nets, events, callsign lookup, trip planning, and operator tools.',
              default_keywords:
                'GMRS, GMRS repeaters, GMRS repeater directory, GMRS frequencies, GMRS clubs, GMRS nets, GMRS operators, GMRS radio',
              social_image_url: '',
              twitter_card_type:
                'summary_large_image',
              google_verification: '',
              bing_verification: '',
              default_robots:
                'index, follow',
              index_repeaters: true,
              index_clubs: true,
              index_nets: true,
              index_events: true,
              index_forum: true,
              index_profiles: false,
              enable_structured_data: true,
              enable_breadcrumbs: true,
              enable_sitemap: true,
              updated_by_name:
                admin.name,
            });
        }

        return Response.json({
          settings
        });
      }

      case 'seo:update': {
        let settings =
          (
            await base44.asServiceRole.entities.SeoSetting.list(
              '-updated_date',
              1
            )
          )[0];

        if (!settings) {
          settings =
            await base44.asServiceRole.entities.SeoSetting.create({
              site_title:
                'Repeater Nation',
              updated_by_name:
                admin.name
            });
        }

        const fields: any = {};

        for (const k of [
          'site_title',
          'site_description',
          'default_keywords',
          'social_image_url',
          'twitter_card_type',
          'google_verification',
          'bing_verification',
          'default_robots',          'index_repeaters',
          'index_clubs',
          'index_nets',
          'index_events',
          'index_forum',
          'index_profiles',
          'enable_structured_data',
          'enable_breadcrumbs',
          'enable_sitemap'
        ]) {
          if (k in body) {
            fields[k] = body[k];
          }
        }

        fields.updated_by_name =
          admin.name;

        const before = {
          ...settings
        };

        await base44.asServiceRole.entities.SeoSetting.update(
          settings.id,
          fields
        );

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'seo.update',
          category: 'settings',
          target_type: 'SeoSetting',
          target_id: settings.id,
          before,
          after: fields,
          ip,
        });

        return Response.json({
          ok: true
        });
      }

      case 'seo:audit': {
        // Repeaters can exceed the Base44 500-record request limit,
        // so retrieve them using the same batch helper.
        const [repeaters, clubs, events, forums] =
          await Promise.all([
            listAllRepeaters(base44),
            base44.asServiceRole.entities.Club.list(
              '-updated_date',
              1000
            ),
            base44.asServiceRole.entities.Event.list(
              '-updated_date',
              1000
            ),
            base44.asServiceRole.entities.ForumPost.list(
              '-updated_date',
              1000
            ),
          ]);

        const issues: any[] = [];

        for (const r of repeaters || []) {
          if (r.hidden) continue;

          const label =
            r.name ||
            r.callsign ||
            r.id;

          if (!r.lat || !r.lng) {
            issues.push({
              type: 'repeater',
              severity: 'high',
              entity: label,
              id: r.id,
              issue:
                'Missing coordinates — cannot generate location-based content.'
            });
          }

          if (!r.frequency) {
            issues.push({
              type: 'repeater',
              severity: 'high',
              entity: label,
              id: r.id,
              issue:
                'Missing frequency.'
            });
          }

          if (!r.callsign) {
            issues.push({
              type: 'repeater',
              severity: 'medium',
              entity: label,
              id: r.id,
              issue:
                'Missing callsign.'
            });
          }

          if (
            !r.notes &&
            !r.coverage_radius
          ) {
            issues.push({
              type: 'repeater',
              severity: 'low',
              entity: label,
              id: r.id,
              issue:
                'Missing coverage/notes — limited content for AI systems.'
            });
          }
        }

        const csMap: Record<
          string,
          number
        > = {};

        for (const r of repeaters || []) {
          if (
            r.hidden ||
            !r.callsign
          ) {
            continue;
          }

          const cs = String(
            r.callsign
          )
            .toUpperCase()
            .trim();

          csMap[cs] =
            (csMap[cs] || 0) + 1;
        }

        for (const [
          cs,
          count
        ] of Object.entries(csMap)) {
          if (count > 1) {
            issues.push({
              type: 'duplicate',
              severity: 'high',
              entity: cs,
              id: '',
              issue:
                `Duplicate repeater callsign — ${count} entries may create duplicate content.`
            });
          }
        }

        for (const c of clubs || []) {
          if (!c.description) {
            issues.push({
              type: 'club',
              severity: 'medium',
              entity:
                c.name || c.id,
              id: c.id,
              issue:
                'Missing description — poor meta description candidate.'
            });
          }

          if (!c.lat || !c.lng) {
            issues.push({
              type: 'club',
              severity: 'low',
              entity:
                c.name || c.id,
              id: c.id,
              issue:
                'Missing location — cannot generate local SEO content.'
            });
          }
        }

        for (const e of events || []) {
          if (!e.location && !e.lat) {
            issues.push({
              type: 'event',
              severity: 'medium',
              entity:
                e.title || e.id,
              id: e.id,
              issue:
                'Missing location — event cannot generate local SEO content.'
            });
          }
        }

        for (const f of forums || []) {
          if (
            !f.body ||
            f.body.length < 50
          ) {
            issues.push({
              type: 'forum',
              severity: 'low',
              entity:
                f.title || f.id,
              id: f.id,
              issue:
                'Short body — thin content for indexing.'
            });
          }
        }

        const counts = {
          total: issues.length,
          high: issues.filter(
            (i) =>
              i.severity === 'high'
          ).length,
          medium: issues.filter(
            (i) =>
              i.severity === 'medium'
          ).length,
          low: issues.filter(
            (i) =>
              i.severity === 'low'
          ).length,
          repeaters:
            (repeaters || []).filter(
              (r) => !r.hidden
            ).length,
          clubs:
            (clubs || []).length,
          events:
            (events || []).length,
          forums:
            (forums || []).length,
        };

        return Response.json({
          issues,
          counts
        });
      }

      // ============ GAMIFICATION (net streak admin controls) ============
      case 'gamification:viewStreaks': {
        const userId = String(
          body.user_id || ''
        );

        if (!userId) {
          return Response.json(
            {
              error:
                'user_id required'
            },
            { status: 400 }
          );
        }

        const streaks =
          await base44.asServiceRole.entities.NetStreak.filter(
            { user_id: userId },
            '-updated_date',
            200
          );

        return Response.json({
          streaks: streaks || []
        });
      }

      case 'gamification:correctStreak': {
        const streakId = String(
          body.streak_id || ''
        );

        const currentStreak = Number(
          body.current_streak
        );

        const longestStreak = Number(
          body.longest_streak
        );

        if (!streakId) {
          return Response.json(
            {
              error:
                'streak_id required'
            },
            { status: 400 }
          );
        }

        if (
          isNaN(currentStreak) ||
          isNaN(longestStreak)
        ) {
          return Response.json(
            {
              error:
                'current_streak and longest_streak must be numbers'
            },
            { status: 400 }
          );
        }

        const before =
          await base44.asServiceRole.entities.NetStreak
            .get(streakId)
            .catch(() => null);

        if (!before) {
          return Response.json(
            {
              error:
                'streak not found'
            },
            { status: 404 }
          );
        }

        // This is an explicit admin correction tool, so the admin's input is
        // trusted and written as-is -- including lowering longest_streak,
        // which is the most likely reason to use it at all (undoing a bad
        // automatic inflation). A clamp here used to silently discard any
        // attempt to lower it while still reporting the requested value in
        // the audit log below, misrepresenting what was actually stored.
        await base44.asServiceRole.entities.NetStreak.update(
          streakId,
          {
            current_streak: currentStreak,
            longest_streak: longestStreak,
          }
        );

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action:
            'gamification.correctStreak',
          category: 'admin',
          target_type:
            'NetStreak',
          target_id: streakId,
          target_label: `${
            before.user_name ||
            before.user_callsign ||
            before.user_id
          } — ${
            before.club_name ||
            before.club_id
          }`,
          before: {
            current_streak:
              before.current_streak,
            longest_streak:
              before.longest_streak
          },
          after: {
            current_streak:
              currentStreak,
            longest_streak:
              longestStreak
          },
          ip,
        });

        return Response.json({
          ok: true
        });
      }

      case 'gamification:recalculate': {
        const userId = String(
          body.user_id || ''
        );

        const clubId = String(
          body.club_id || ''
        );

        if (!userId || !clubId) {
          return Response.json(
            {
              error:
                'user_id and club_id required'
            },
            { status: 400 }
          );
        }

        await recalculateStreak(          base44,
          userId,
          clubId
        );

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action:
            'gamification.recalculate',
          category: 'admin',
          target_type:
            'NetStreak',
          target_label:
            `${userId} — ${clubId}`,
          ip,
        });

        return Response.json({
          ok: true
        });
      }

      // ============ EMAIL ============
      case 'email:templates:list': {
        const settings = await getEmailTemplateSettings(base44);
        let overrides: Record<string, any> = {};
        try {
          overrides = settings?.email_message_templates ? JSON.parse(settings.email_message_templates) : {};
        } catch {
          overrides = {};
        }

        const templates = EMAIL_TEMPLATES.map((t) => {
          const o = overrides[t.id] || {};
          return {
            id: t.id,
            label: t.label,
            description: t.description,
            vars: t.vars,
            subject: o.subject || t.defaultSubject,
            body: o.body || t.defaultBody,
            default_subject: t.defaultSubject,
            default_body: t.defaultBody,
            customized: !!(o.subject || o.body),
          };
        });

        return Response.json({ templates });
      }

      case 'email:templates:update': {
        const id = String(body.id || '');
        const tmpl = EMAIL_TEMPLATES.find((t) => t.id === id);
        if (!tmpl) {
          return Response.json({ error: 'Unknown template' }, { status: 400 });
        }

        let settingsRows = await base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1);
        let settings = settingsRows && settingsRows[0];
        if (!settings) {
          settings = await base44.asServiceRole.entities.AdminSetting.create({ updated_by_name: admin.name });
        }

        let overrides: Record<string, any> = {};
        try {
          overrides = settings.email_message_templates ? JSON.parse(settings.email_message_templates) : {};
        } catch {
          overrides = {};
        }

        const subject = String(body.subject ?? tmpl.defaultSubject);
        const bodyText = String(body.body ?? tmpl.defaultBody);

        if (subject === tmpl.defaultSubject && bodyText === tmpl.defaultBody) {
          delete overrides[id];
        } else {
          overrides[id] = { subject, body: bodyText };
        }

        await base44.asServiceRole.entities.AdminSetting.update(settings.id, {
          email_message_templates: JSON.stringify(overrides),
          updated_by_name: admin.name,
        });

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'email.template_update',
          category: 'settings',
          target_type: 'EmailTemplate',
          target_id: id,
          target_label: tmpl.label,
          after: { subject, body: bodyText },
          ip,
        });

        return Response.json({ ok: true });
      }

      case 'email:templates:test': {
        const id = String(body.id || '');
        const tmpl = EMAIL_TEMPLATES.find((t) => t.id === id);
        if (!tmpl) {
          return Response.json({ error: 'Unknown template' }, { status: 400 });
        }
        if (!caller.email) {
          return Response.json({ error: 'Your admin account has no email on file' }, { status: 400 });
        }

        const settings = await getEmailTemplateSettings(base44);
        const rendered = renderEmailTemplate(settings, id, EMAIL_SAMPLE_VARS[id] || {});
        if (!rendered) {
          return Response.json({ error: 'Could not render template' }, { status: 400 });
        }

        const testSubject = `[Test] ${rendered.subject}`;
        const testResult = await sendBrandedEmail(base44.asServiceRole, { to: caller.email, subject: testSubject, body: rendered.body });
        if (!testResult.sent) {
          return Response.json({ error: 'Could not send test email' }, { status: 500 });
        }

        return Response.json({ ok: true, to: caller.email, html: testResult.html, htmlError: (testResult as any).htmlError });
      }

      case 'email:send': {
        const subject = String(body.subject || '').trim();
        const message = String(body.body || '').trim();
        if (!subject || !message) {
          return Response.json({ error: 'Subject and body are required' }, { status: 400 });
        }

        const audience = String(body.audience || 'custom');
        let recipients: string[] = [];

        if (audience === 'all' || audience === 'admins') {
          const users = await base44.asServiceRole.entities.User.list('-created_date', 5000);
          recipients = (users || [])
            .filter((u: any) => {
              if (u.account_status === 'suspended' || u.account_status === 'investigation') return false;
              if (audience === 'admins' && !['admin', 'super_admin'].includes(u.role || 'user')) return false;
              if (u.email_notifications === false) return false;
              if (u.email_announcements === false) return false;
              return !!u.email;
            })
            .map((u: any) => u.email);
        } else {
          recipients = String(body.recipient_emails || '')
            .split(/[,\s\n]+/)
            .map((s: string) => s.trim())
            .filter(Boolean);
        }

        recipients = Array.from(new Set(recipients.filter(Boolean)));

        if (!recipients.length) {
          return Response.json({ error: 'No recipients matched' }, { status: 400 });
        }
        if (recipients.length > 1000) {
          return Response.json({ error: 'Too many recipients (max 1000 per send)' }, { status: 400 });
        }

        let sent = 0;
        let htmlSent = 0;
        let htmlError: string | undefined;
        const failed: string[] = [];

        for (const to of recipients) {
          const result = await sendBrandedEmail(base44.asServiceRole, { to, subject, body: message });
          if (result.sent) {
            sent++;
            if (result.html) htmlSent++;
            else if (!htmlError) htmlError = (result as any).htmlError;
          } else {
            failed.push(to);
            console.error('[admin-api] email:send failed:', to, result.error?.message || result.error);
          }
        }

        await writeAudit(base44, {
          admin_id: admin.id,
          admin_name: admin.name,
          action: 'email.send',
          category: 'system',
          target_type: 'Email',
          target_label: subject,
          after: { audience, recipients: recipients.length, sent },
          ip,
        });

        return Response.json({ ok: true, recipients: recipients.length, sent, htmlSent, failed: failed.length, htmlError });
      }

      // ============ DONATIONS ============
      case 'donations:status': {
        const key = secrets.get('STRIPE_SECRET_KEY');
        if (!key) {
          return Response.json({ connected: false });
        }

        try {
          const acct = await stripeFetch('/v1/account', {});
          return Response.json({
            connected: true,
            chargesEnabled: !!acct.charges_enabled,
            businessName: acct.business_profile?.name || acct.settings?.dashboard?.display_name || '',
          });
        } catch (e) {
          return Response.json({ connected: false, error: e?.message || 'Stripe check failed' });
        }
      }

      case 'donations:list': {
        const donations = await base44.asServiceRole.entities.Base44Purchase.filter(
          { productId: 'donation' },
          '-created_date',
          200
        );

        return Response.json({ donations: donations || [] });
      }

      default:
        return Response.json(
          {
            error:
              'Unknown action'
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(
      '[admin-api] error:',
      error?.message || error
    );

    return Response.json(
      {
        error:
          error?.message ||
          'unexpected error'
      },
      { status: 500 }
    );
  }
}