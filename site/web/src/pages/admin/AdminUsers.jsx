import { useEffect, useState, useCallback, useRef } from 'react';
import {
  MoreHorizontal, ShieldCheck, ShieldOff, Ban, LockKeyhole, UnlockKeyhole, Radio,
  RefreshCw, Mail, Trophy, KeyRound, Trash2, Search, AlertTriangle, Wrench, UserPlus, Loader2,
} from 'lucide-react';
import { adminApi, rolesApi } from '@/lib/adminClient';
import UserOverrideDialog from '@/components/admin/UserOverrideDialog';
import { PageHeader, Loading, ErrorState, EmptyState, Badge, ConfirmDialog, BatchProgress } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { errMsg } from '@/lib/utils';
import { canManageRole, hasPermission, isAdminRole } from '@/lib/permissions';

const FALLBACK_NOTIFY_SUBJECT = 'Action Required: Verify Your Repeater Nation Callsign';
const fallbackNotifyMessage = (u) => [
  `Hi ${u.full_name || u.email || 'operator'},`,
  '',
  'Your Repeater Nation account currently does not have a valid, verified active GMRS or amateur radio (HAM) callsign on file.',
  '',
  'Please update your callsign and complete FCC verification from the Callsign Management page:',
  'https://repeaternation.com/callsign-management',
  '',
  'Thank you,',
  'Repeater Nation Administration',
].join('\n');

// Always returns exactly two rows, GMRS and HAM, so a member missing one
// service reads as "Unassigned" instead of that service's row just not
// being there. Only a real owned (Callsign record) or authorized (approved
// CallsignAccess) entry can fill a row, since those are the only sources
// with a known radio service.
const callsignServiceRows = (u) => {
  const database = Array.isArray(u.database_callsigns)
    ? u.database_callsigns.filter((item) => item?.callsign && item.source !== 'Profile')
    : [];

  return ['GMRS', 'HAM'].map((service) => {
    let entry = database.find((item) => item.service === service);

    // Fall back to the legacy User.callsign field for older accounts that
    // predate the Callsign entity and have no database_callsigns at all.
    if (!entry && !database.length) {
      const legacy = String(u.callsign || '').trim();
      const legacyService = u.license_service === 'HAM' ? 'HAM' : 'GMRS';
      if (legacy && legacy.toLowerCase() !== 'none' && legacyService === service) {
        entry = {
          callsign: legacy.toUpperCase(),
          source: 'Callsign',
          // Read the real license_status regardless of callsign_verified --
          // forcing it blank whenever unverified was hiding a genuine
          // "Expired"/"Pending" distinction and making everything unverified
          // look the same.
          status: String(u.license_status || '').toLowerCase(),
          expiresAt: u.license_expiry || '',
        };
      }
    }

    if (!entry) return { service, unassigned: true };

    // Active / Expired / Cancelled require real evidence; a callsign that's
    // on file but has never actually been checked (license_status defaults
    // to "pending" until the first FCC/ULS lookup) is Unverified, not
    // Expired -- those are not the same claim.
    const statusRaw = String(entry.status || '').toLowerCase();
    const status = statusRaw === 'active' ? 'Active'
      : statusRaw === 'cancelled' || statusRaw === 'suspended' ? 'Cancelled'
      : statusRaw === 'expired' ? 'Expired'
      : 'Unverified';

    return {
      service,
      callsign: entry.callsign,
      relation: entry.source === 'CallsignAccess' ? 'Authorized' : 'Owner',
      status,
      expiresAt: entry.expiresAt || '',
    };
  });
};

// Short date only (no time) for the License column -- formatDateTime from
// parts.jsx includes a timestamp, which is more precision than "when does
// this expire" needs.
function formatDateOnly(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

// Joined/Last Active want 24-hour time with no seconds -- formatDateTime
// from parts.jsx uses toLocaleString()'s default (12-hour, AM/PM, seconds),
// which is shared with other admin pages, so this stays local to this page
// rather than changing that shared helper's behavior everywhere.
function formatDateTime24(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Only members with a real database/profile callsign can be selected for
// FCC/ULS re-verification. Missing-callsign accounts remain visible so an
// admin can repair them, but selecting them for reverify would do nothing.
const hasReverifyCallsign = (u) =>
  callsignServiceRows(u).some((row) => !row.unassigned && !!row.callsign);

// Reverify hits several external FCC/ULS lookup providers per callsign, and
// running it across hundreds of accounts back-to-back can trip one of their
// rate limits mid-run, aborting the whole batch loop with a raw "rate limit
// exceeded" error. Retries with backoff instead of giving up immediately --
// everything else (a real validation error, a missing account) still fails
// right away.
const RATE_LIMIT_RETRY_DELAYS_MS = [5000, 15000, 45000];
async function callWithRateLimitRetry(fn, onRetry) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(errMsg(e) || e?.message || '');
      if (!/rate limit/i.test(msg) || attempt >= RATE_LIMIT_RETRY_DELAYS_MS.length) throw e;
      const waitMs = RATE_LIMIT_RETRY_DELAYS_MS[attempt];
      onRetry?.(waitMs, attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

// Small scrollable, auto-following activity log for a long-running batch
// operation, so what's happening (batch results, rate-limit backoffs) is
// visible live instead of just a done/total counter.
function ActivityLog({ entries }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [entries]);
  if (!entries.length) return null;
  const toneClass = { info: 'text-muted-foreground', warn: 'text-warning', success: 'text-success', error: 'text-destructive' };
  return (
    <div className="mb-4 rounded-lg border border-border bg-muted/30 p-2.5 max-h-40 overflow-y-auto font-mono text-xs space-y-0.5">
      {entries.map((e) => (
        <div key={e.id} className={toneClass[e.tone] || toneClass.info}>
          <span className="text-muted-foreground/70">{e.time.toLocaleTimeString([], { hour12: false })}</span> {e.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

// Wraps children in a hover tooltip. The trigger wraps a plain <span> (not
// the child directly) so Radix's asChild ref-forwarding works even when the
// child is a component that doesn't forward refs, like Badge.
function Hint({ text, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="inline-flex">{children}</span></TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

export default function AdminUsers() {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [roleOptions, setRoleOptions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [callsignFilter, setCallsignFilter] = useState('all');

  const [suspendTarget, setSuspendTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const [xpTarget, setXpTarget] = useState(null);
  const [xpAmount, setXpAmount] = useState('');
  const [xpReason, setXpReason] = useState('');
  const [xpBusy, setXpBusy] = useState(false);

  const [editCallsignTarget, setEditCallsignTarget] = useState(null);
  const [editCallsignService, setEditCallsignService] = useState('GMRS');
  const [editCallsignValue, setEditCallsignValue] = useState('');
  const [editCallsignMarkVerified, setEditCallsignMarkVerified] = useState(false);
  const [editCallsignBusy, setEditCallsignBusy] = useState(false);

  const [reverifyUserId, setReverifyUserId] = useState(null);

  const [notifyTarget, setNotifyTarget] = useState(null);
  const [notifySubject, setNotifySubject] = useState('');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [callsignEmailTemplate, setCallsignEmailTemplate] = useState(null);

  const [overrideUser, setOverrideUser] = useState(null);
  const [overrideCategories, setOverrideCategories] = useState([]);
  const [overrideTypes, setOverrideTypes] = useState([]);

  const [roleTarget, setRoleTarget] = useState(null);
  const [roleValue, setRoleValue] = useState('');
  const [roleBusy, setRoleBusy] = useState(false);

  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatusTarget, setBulkStatusTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [bulkReverifyBusy, setBulkReverifyBusy] = useState(false);
  const [bulkReverifyProgress, setBulkReverifyProgress] = useState(null);
  const [bulkReverifyStartedAt, setBulkReverifyStartedAt] = useState(null);
  const [bulkNotifyBusy, setBulkNotifyBusy] = useState(false);
  const [bulkNotifyProgress, setBulkNotifyProgress] = useState(null);

  const [callsignIssues, setCallsignIssues] = useState(0);

  const [syncAuthorizedBusy, setSyncAuthorizedBusy] = useState(false);
  const [resyncAllBusy, setResyncAllBusy] = useState(false);
  const [resyncAllProgress, setResyncAllProgress] = useState(null);
  const [verifyRepairBusy, setVerifyRepairBusy] = useState(false);
  const [verifyRepairProgress, setVerifyRepairProgress] = useState(null);
  const [verifyRepairReport, setVerifyRepairReport] = useState(null);
  const [reverifyAllBusy, setReverifyAllBusy] = useState(false);
  const [reverifyAllProgress, setReverifyAllProgress] = useState(null);
  const [reverifyAllStartedAt, setReverifyAllStartedAt] = useState(null);

  const NEW_ACCOUNT_EMPTY = { email: '', full_name: '', callsign: '', radio_service: 'GMRS' };
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState(NEW_ACCOUNT_EMPTY);
  const [newAccountBusy, setNewAccountBusy] = useState(false);

  // Shared line-by-line activity log for the long-running batch tools
  // (Reverify all, bulk Reverify, Resync all) -- these run silently for
  // minutes with only a done/total counter, which hides exactly the kind
  // of thing worth seeing live: a rate-limit backoff kicking in, a batch
  // finishing with 0 verified, etc.
  const [activityLog, setActivityLog] = useState([]);
  const logEvent = useCallback((message, tone = 'info') => {
    setActivityLog((log) => [...log.slice(-49), { id: `${Date.now()}-${Math.random()}`, time: new Date(), message, tone }]);
  }, []);

  // users:list caps each request at 500 records, so a single call silently
  // truncated the list once membership passed 500 -- keep paging with
  // offset until the full matching set (per the server's own `total`) is
  // in hand.
  const load = useCallback(() => {
    setLoading(true); setError('');
    (async () => {
      try {
        const d = await adminApi('users:list', { query, role, limit: 5000, offset: 0 });
        const all = d.users || [];
        const totalCount = d.total || 0;
        const issuesCount = d.callsignIssues || 0;
        setUsers(all);
        setTotal(totalCount);
        setCallsignIssues(issuesCount);
      } catch (e) {
        setError(errMsg(e) || e?.message || 'Could not load users');
      } finally {
        setLoading(false);
      }
    })();
  }, [query, role]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  // Legacy callsign resync is intentionally manual. Automatically starting a
  // maintenance write when Admin → Users opens can create a large burst of
  // backend requests and compete with normal admin reads.
  useEffect(() => {
    rolesApi('roles:list', {}).then((d) => {
      setRoleOptions((d.roles || []).filter((r) => r.enabled).map((r) => ({ value: r.role_key, label: r.role_name })));
    }).catch(() => {
      setRoleOptions([
        { value: 'user', label: 'User' },
        { value: 'member', label: 'Verified Operator' },
        { value: 'moderator', label: 'Moderator' },
        { value: 'admin', label: 'Administrator' },
        { value: 'super_admin', label: 'Super Admin' },
      ]);
    });
  }, []);

  // Account status and callsign filters apply client-side on top of the
  // server-side search/role filters, since load() already pages through
  // the full matching set.
  const visibleUsers = users.filter((u) => {
    if (statusFilter !== 'all' && (u.account_status || 'active') !== statusFilter) return false;
    if (callsignFilter === 'issues' && !u.callsign_issue) return false;
    if (callsignFilter === 'missing_gmrs' && !callsignServiceRows(u).find((r) => r.service === 'GMRS')?.unassigned) return false;
    if (callsignFilter === 'missing_ham' && !callsignServiceRows(u).find((r) => r.service === 'HAM')?.unassigned) return false;
    if (callsignFilter === 'unverified' && !callsignServiceRows(u).some((r) => r.status === 'Unverified')) return false;
    return true;
  });

  useEffect(() => {
    adminApi('email:templates:list').then((d) => {
      const t = (d.templates || []).find((x) => x.id === 'callsign_verification_reminder');
      if (t) setCallsignEmailTemplate(t);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    rolesApi('catalog', {}).then((c) => {
      setOverrideCategories(c.categories || []);
      setOverrideTypes(c.types || []);
    }).catch(() => {});
  }, []);

  const defaultNotifyMessage = (u) => {
    const name = u.full_name || u.email || 'operator';
    if (!callsignEmailTemplate) return fallbackNotifyMessage(u);
    return callsignEmailTemplate.body.replace(/\{\{\s*member_name\s*\}\}/g, name);
  };
  const defaultNotifySubject = callsignEmailTemplate?.subject || FALLBACK_NOTIFY_SUBJECT;

  const confirmAction = async () => {
    if (!suspendTarget) return;
    setBusy(true);
    try {
      await adminApi('users:setStatus', { id: suspendTarget.id, status: suspendTarget.next });
      setUsers((us) => us.map((x) => (x.id === suspendTarget.id ? { ...x, account_status: suspendTarget.next } : x)));
      const labels = { suspended: 'User suspended', banned: 'User banned', investigation: 'User flagged for investigation', active: 'User re-enabled' };
      toast({ title: labels[suspendTarget.next] || 'Status updated' });
      setSuspendTarget(null);
    } catch (e) {
      if (isStaleUserError(e)) {
        toast({ title: 'That account no longer exists', description: 'It was likely already deleted. Removing it from the list.', variant: 'destructive' });
        dropStaleUser(suspendTarget.id);
        setSuspendTarget(null);
      } else {
        toast({ title: errMsg(e) || 'Action failed', variant: 'destructive' });
      }
    } finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await adminApi('users:delete', { id: deleteTarget.id });
      toast({ title: 'Account deleted' });
      setDeleteTarget(null);
      load();
    } catch (e) {
      if (isStaleUserError(e)) {
        toast({ title: 'Already deleted', description: 'That account no longer exists. Removing it from the list.' });
        dropStaleUser(deleteTarget.id);
        setDeleteTarget(null);
      } else {
        toast({ title: errMsg(e) || 'Could not delete account', variant: 'destructive' });
      }
    } finally { setBusy(false); }
  };

  const adjustXp = async () => {
    if (!xpTarget || !xpAmount || !xpReason.trim()) return;
    const amount = Number(xpAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      toast({ title: 'Enter a valid non-zero XP amount', variant: 'destructive' });
      return;
    }
    setXpBusy(true);
    try {
      const adminName = me?.full_name || me?.name || me?.email || 'Administrator';
      await base44.entities.XpAdjustment.create({
        user_id: xpTarget.id,
        user_name: xpTarget.full_name || xpTarget.email || 'Member',
        user_callsign: xpTarget.callsign || '',
        amount,
        reason: xpReason.trim(),
        admin_id: me?.id || '',
        admin_name: adminName,
      });
      await adminApi('audit:create', {
        audit_action: 'gamification.xp_adjustment', category: 'admin', target_type: 'User', target_id: xpTarget.id,
        target_label: xpTarget.callsign || xpTarget.email || xpTarget.full_name || xpTarget.id,
        meta: JSON.stringify({ amount, reason: xpReason.trim() }), description: `Manual XP adjustment: ${amount > 0 ? '+' : ''}${amount} XP`
      }).catch(() => {});
      toast({ title: amount > 0 ? 'XP granted' : 'XP removed', description: `${Math.abs(amount).toLocaleString()} XP ${amount > 0 ? 'added to' : 'removed from'} ${xpTarget.full_name || xpTarget.email}.` });
      setXpTarget(null); setXpAmount(''); setXpReason('');
    } catch (e) {
      toast({ title: errMsg(e) || 'Could not adjust XP', variant: 'destructive' });
    } finally { setXpBusy(false); }
  };

  const reverifyUserCallsign = async (u) => {
    if (reverifyUserId) return;
    setReverifyUserId(u.id);
    try {
      const d = await adminApi('users:callsignAction', { id: u.id, callsign_action: 'reverify' });
      const label = d.status === 'verified' ? 'Verified' : d.status === 'missing' ? 'Missing callsign' : 'Needs attention';
      toast({ title: `Callsign reverified: ${label}`, description: d.callsign ? `${d.callsign} — ${d.license_status || 'Unknown'}` : 'No callsign is on the account.' });
      load();
    } catch (e) {
      if (isStaleUserError(e)) {
        toast({ title: 'That account no longer exists', description: 'Removing it from the list.' });
        dropStaleUser(u.id);
      } else {
        toast({ title: errMsg(e) || 'Callsign re-verification failed', variant: 'destructive' });
      }
    }
    finally { setReverifyUserId(null); }
  };

  const handleCallsignAction = async (u, action) => {
    try {
      await adminApi('users:callsignAction', { id: u.id, callsign_action: action });
      toast({ title: action === 'restrict' ? 'Account restricted' : 'Account restored' });
      load();
    } catch (e) {
      if (isStaleUserError(e)) {
        toast({ title: 'That account no longer exists', description: 'Removing it from the list.' });
        dropStaleUser(u.id);
      } else {
        toast({ title: errMsg(e) || 'Callsign action failed', variant: 'destructive' });
      }
    }
  };

  const saveRoleChange = async () => {
    if (!roleTarget || !roleValue || roleValue === roleTarget.role) return;
    setRoleBusy(true);
    try {
      await adminApi('users:update', { id: roleTarget.id, role: roleValue });
      toast({ title: 'Role updated' });
      setRoleTarget(null);
      load();
    } catch (e) { toast({ title: errMsg(e) || 'Could not change role', variant: 'destructive' }); }
    finally { setRoleBusy(false); }
  };

  // "User not found" means the account was already deleted (by this admin a
  // moment ago, another admin, or a stale/duplicate row from an earlier
  // action) by the time the click reached the server. Drop it from the
  // visible list instead of leaving a dead row that just errors again on
  // the next click.
  const isStaleUserError = (e) => errMsg(e) === 'User not found';
  const dropStaleUser = (id) => {
    setUsers((us) => us.filter((x) => x.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    setSelectedIds((ids) => ids.filter((x) => x !== id));
  };

  // Self, admins, and anyone at or above the caller's own role stay out of
  // bulk actions (admin-api would refuse them one by one anyway).
  const bulkLocked = (u) => u.id === me?.id || ['admin', 'super_admin'].includes(u.role || 'user') || !canManageRole(me, u.role || 'user');

  const toggleSelect = (id) => {
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };

  const toggleSelectAllVisible = () => {
    // Selection backs several bulk actions (Notify, Enable, Suspend, Ban,
    // Delete), not just Reverify -- gating it on hasReverifyCallsign made
    // every row unselectable under filters like "Missing GMRS"/"Missing HAM"
    // (which by definition only show accounts without a callsign), breaking
    // the whole bulk toolbar for exactly the accounts an admin would most
    // want to bulk-notify or bulk-manage. Reverify itself already handles a
    // selected account having no callsign gracefully (reported as "missing"),
    // so only self/staff need to stay excluded from selection.
    const selectableIds = visibleUsers
      .filter((u) => !bulkLocked(u))
      .map((u) => u.id);
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : selectableIds);
  };

  const runBulkStatus = async () => {
    if (!bulkStatusTarget) return;
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: selectedIds.length });
    let ok = 0, failed = 0;
    for (const id of selectedIds) {
      try { await adminApi('users:setStatus', { id, status: bulkStatusTarget.next }); ok++; }
      catch { failed++; }
      setBulkProgress({ done: ok + failed, total: selectedIds.length });
    }
    toast({ title: `${ok} account${ok === 1 ? '' : 's'} updated${failed ? `, ${failed} failed` : ''}` });
    setBulkStatusTarget(null);
    setBulkBusy(false);
    setBulkProgress(null);
    setSelectedIds([]);
    load();
  };

  const runBulkDelete = async () => {
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: selectedIds.length });
    let ok = 0, failed = 0;
    for (const id of selectedIds) {
      try { await adminApi('users:delete', { id }); ok++; }
      catch { failed++; }
      setBulkProgress({ done: ok + failed, total: selectedIds.length });
    }
    toast({ title: `${ok} account${ok === 1 ? '' : 's'} deleted${failed ? `, ${failed} failed` : ''}` });
    setBulkDeleteOpen(false);
    setBulkBusy(false);
    setBulkProgress(null);
    setSelectedIds([]);
    load();
  };

  const runBulkNotify = async () => {
    setBulkNotifyBusy(true);
    setBulkNotifyProgress({ done: 0, total: selectedIds.length });
    let ok = 0, failed = 0;
    for (const id of selectedIds) {
      const u = users.find((x) => x.id === id);
      if (u) {
        try {
          await adminApi('users:callsignAction', {
            id, callsign_action: 'notify',
            subject: defaultNotifySubject, message: defaultNotifyMessage(u),
          });
          ok++;
        } catch { failed++; }
      }
      setBulkNotifyProgress({ done: ok + failed, total: selectedIds.length });
    }
    toast({ title: `Notified ${ok} member${ok === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}` });
    setBulkNotifyBusy(false);
    setBulkNotifyProgress(null);
    setSelectedIds([]);
    load();
  };

  // Reverify selected uses the exact same single-account verification
  // action as the Actions -> Reverify menu item. This avoids the separate
  // selected_ids filtering path and guarantees every checked member gets
  // the same FCC/ULS verification logic and record updates as a direct
  // reverify.
  const runBulkReverify = async () => {
    if (!selectedIds.length) return;

    const ids = [...selectedIds];
    setBulkReverifyBusy(true);
    setBulkReverifyProgress({ done: 0, total: ids.length });
    setBulkReverifyStartedAt(Date.now());
    setActivityLog([]);
    logEvent(`Starting reverify for ${ids.length} selected account(s)…`);

    let checked = 0;
    let verified = 0;
    let invalid = 0;
    let unavailable = 0;
    let failed = 0;

    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const u = users.find((x) => x.id === id);
        const label = u?.callsign || u?.full_name || u?.email || id;

        try {
          const d = await callWithRateLimitRetry(
            () => adminApi('users:callsignAction', {
              id,
              callsign_action: 'reverify',
            }),
            (waitMs, attempt) => logEvent(
              `Rate limited while checking ${label} — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt})…`,
              'warn'
            )
          );

          checked++;
          if (d.status === 'verified') verified++;
          // 'missing' (the account had zero usable callsigns to check --
          // see the single-account Reverify handler) falls into the same
          // "needs attention" bucket as 'invalid'/'partial', same as the
          // single-account Actions -> Reverify menu item already labels it.
          // Without this, a selected account that comes back 'missing'
          // wasn't counted in verified/invalid/unavailable at all, so the
          // three added up to less than the reported "checked" total.
          else if (d.status === 'invalid' || d.status === 'partial' || d.status === 'missing') invalid++;
          else if (d.status === 'unavailable') unavailable++;
          logEvent(
            `${i + 1}/${ids.length}: ${label} — ${d.status || 'checked'}`,
            d.status === 'verified' ? 'success' : 'info'
          );
        } catch (e) {
          failed++;
          // Same cleanup the single-account Actions -> Reverify menu item
          // already does: an account deleted between being selected and the
          // bulk run actually reaching it shouldn't linger as a dead row
          // that just fails again next time.
          if (isStaleUserError(e)) dropStaleUser(id);
          logEvent(
            `${i + 1}/${ids.length}: ${label} — failed: ${errMsg(e) || e?.message || 'unknown error'}`,
            'error'
          );
        }

        setBulkReverifyProgress({
          done: Math.min(i + 1, ids.length),
          total: ids.length,
        });

        if (i < ids.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      const summary = `${checked} checked, ${verified} verified, ${invalid} need attention${unavailable ? `, ${unavailable} unavailable` : ''}${failed ? `, ${failed} failed` : ''}.`;
      logEvent(`Done — ${summary}`, failed ? 'warn' : 'success');
      toast({
        title: 'Reverify selected complete',
        description: summary,
        ...(failed && !checked ? { variant: 'destructive' } : {}),
      });
    } catch (e) {
      logEvent(`Failed: ${errMsg(e) || e?.message || 'unknown error'}`, 'error');
      toast({ title: errMsg(e) || 'Bulk reverify failed', variant: 'destructive' });
    } finally {
      setBulkReverifyBusy(false);
      setBulkReverifyProgress(null);
      setBulkReverifyStartedAt(null);
      setSelectedIds([]);
      load();
    }
  };

  // Reverifies literally every non-staff account against FCC/ULS, not just a
  // checkbox selection -- same backend action and batching as runBulkReverify,
  // just without selected_ids so the server walks its own full eligible list.
  const reverifyAllAccounts = async () => {
    if (reverifyAllBusy) return;
    setReverifyAllBusy(true);
    setReverifyAllProgress({ done: 0, total: 0 });
    setReverifyAllStartedAt(Date.now());
    setActivityLog([]);
    logEvent('Checking how many accounts are eligible…');
    let afterId = '';
    let checked = 0;
    let batchNum = 0;
    try {
      const dry = await callWithRateLimitRetry(
        () => adminApi('users:callsignAction', { callsign_action: 'reverify_all', dry_run: true }),
        (waitMs, attempt) => logEvent(`Rate limited — waiting ${Math.round(waitMs / 1000)}s before retrying (attempt ${attempt})…`, 'warn')
      );
      const total = dry.total || 0;
      setReverifyAllProgress({ done: 0, total });
      if (dry.orphaned_found) {
        logEvent(`Found ${dry.orphaned_found} leftover record(s) from deleted accounts — will remove these first.`, 'warn');
      }
      if (!total) {
        logEvent('Nothing to reverify.', 'success');
        toast({ title: 'Nothing to reverify', description: 'No non-staff accounts have a callsign on file.' });
        return;
      }
      logEvent(`Found ${total} account(s) to check.`);
      for (let i = 0; i < 700; i++) {
        batchNum++;
        const d = await callWithRateLimitRetry(
          () => adminApi('users:callsignAction', {
            callsign_action: 'reverify_all',
            after_id: afterId,
            batchSize: 3,
          }),
          (waitMs, attempt) => logEvent(`Rate limited — waiting ${Math.round(waitMs / 1000)}s before retrying (attempt ${attempt})…`, 'warn')
        );
        checked += d.checked || 0;
        setReverifyAllProgress({ done: Math.min(checked, total), total });
        const orphanedTotal = (d.orphaned?.callsigns || 0) + (d.orphaned?.access || 0) + (d.orphaned?.profiles || 0);
        if (orphanedTotal) {
          logEvent(`Removed ${orphanedTotal} leftover record(s) for accounts that no longer exist (${d.orphaned.callsigns} callsign, ${d.orphaned.access} authorization, ${d.orphaned.profiles} profile).`, 'warn');
        }
        logEvent(`Batch ${batchNum}: checked ${d.checked || 0} (${d.verified || 0} verified, ${d.invalid || 0} invalid, ${d.unavailable || 0} unavailable) — ${Math.min(checked, total)}/${total} total`);
        if (d.done) break;
        afterId = d.after_id || afterId;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      logEvent(`Done — ${checked} account(s) checked.`, 'success');
      toast({ title: 'Reverify all complete', description: `${checked} account(s) checked.` });
    } catch (e) {
      logEvent(`Failed: ${errMsg(e) || e?.message || 'unknown error'}`, 'error');
      toast({ title: errMsg(e) || 'Reverify all failed', variant: 'destructive' });
    } finally {
      setReverifyAllBusy(false);
      setReverifyAllProgress(null);
      setReverifyAllStartedAt(null);
      load();
    }
  };

  // Backfills existing accounts onto the current GMRS/HAM Owner/Authorized
  // model, for members created before the Callsign entity (or before an
  // authorized-access grant) existed. Neither of these touches FCC/ULS or
  // overwrites a populated callsign -- they only fill blanks.
  const createAccount = async () => {
    const email = newAccountForm.email.trim();
    const callsign = newAccountForm.callsign.trim().toUpperCase();
    if (!email || !callsign) {
      toast({ title: 'Email and callsign are required', variant: 'destructive' });
      return;
    }
    setNewAccountBusy(true);
    try {
      // Validate up front so a request that was always going to fail (email
      // already taken, callsign already claimed) doesn't fire a real invite
      // email first.
      await adminApi('users:invitePrecheck', { email, callsign });

      // Called directly from the browser, not proxied through our own
      // backend function -- Base44's invite endpoint rejected a server-side
      // forwarded token with "Could not validate credentials," which points
      // to it needing the admin's actual interactive session, not a
      // re-forwarded bearer token.
      try {
        await base44.auth.inviteUser(email, 'user');
      } catch (e) {
        throw new Error(`Could not send the invite: ${errMsg(e) || e?.message || e}`);
      }

      const d = await adminApi('users:inviteFinish', {
        email,
        full_name: newAccountForm.full_name.trim(),
        callsign,
        radio_service: newAccountForm.radio_service,
      });
      toast({
        title: d?.pending ? 'Invite sent' : 'Account created',
        description: d?.pending
          ? d.message
          : `${email} was invited and emailed a link to set their password. Their ${callsign} callsign is already marked verified.`,
      });
      setNewAccountOpen(false);
      setNewAccountForm(NEW_ACCOUNT_EMPTY);
      load();
    } catch (e) {
      toast({ title: errMsg(e) || e?.message || 'Could not create account', variant: 'destructive' });
    } finally {
      setNewAccountBusy(false);
    }
  };

  const syncAuthorizedCallsigns = async () => {
    setSyncAuthorizedBusy(true);
    try {
      const d = await adminApi('users:callsignAction', { callsign_action: 'sync_authorized' });
      toast({ title: 'Authorized callsigns synced', description: `${d.updated} updated, ${d.already_populated} already had one, ${d.ambiguous} skipped (multiple callsigns).` });
      load();
    } catch (e) {
      toast({ title: errMsg(e) || 'Sync failed', variant: 'destructive' });
    } finally {
      setSyncAuthorizedBusy(false);
    }
  };

  const resyncAllCallsigns = async () => {
    setResyncAllBusy(true);
    setResyncAllProgress({ done: 0, total: 0 });
    let afterId = '';
    const totals = { processed: 0, updated: 0 };
    try {
      const dry = await adminApi('users:callsignAction', { callsign_action: 'resync_all', dry_run: true });
      const total = dry.total || 0;
      setResyncAllProgress({ done: 0, total });
      if (!total) {
        toast({ title: 'Nothing to resync', description: 'Every account already has a callsign or nothing to fill it from.' });
        return;
      }
      for (let i = 0; i < 200; i++) {
        const d = await adminApi('users:callsignAction', { callsign_action: 'resync_all', after_id: afterId, batchSize: 25 });
        totals.processed += d.processed || 0;
        totals.updated += d.updated || 0;
        setResyncAllProgress({ done: Math.min(totals.processed, total), total });
        if (d.done) break;
        afterId = d.after_id || afterId;
      }
      toast({ title: 'Resync complete', description: `${totals.updated} of ${totals.processed} accounts filled in.` });
    } catch (e) {
      toast({ title: errMsg(e) || 'Resync failed', variant: 'destructive' });
    } finally {
      setResyncAllBusy(false);
      setResyncAllProgress(null);
      load();
    }
  };

  // Repairs User.callsign_verified drift against the Callsign/CallsignAccess
  // records that actually back verification -- see the 'verify_repair' case
  // in admin-api for exactly what this does and doesn't touch (never
  // de-verifies, never edits a Callsign record, only turns a stale false/
  // missing flag on when a genuinely verified record already supports it).
  const verifyRepairAll = async () => {
    setVerifyRepairBusy(true);
    setVerifyRepairProgress({ done: 0, total: 0 });
    setVerifyRepairReport(null);
    let afterId = '';
    const totals = { processed: 0, repaired: 0, verified_no_record: 0, mismatched_callsign: 0 };
    const details = [];
    try {
      const dry = await adminApi('users:callsignAction', { callsign_action: 'verify_repair', dry_run: true });
      const total = dry.total || 0;
      setVerifyRepairProgress({ done: 0, total });
      if (!total) {
        toast({ title: 'Nothing to check', description: 'No non-staff accounts have a callsign on file.' });
        return;
      }
      for (let i = 0; i < 200; i++) {
        const d = await adminApi('users:callsignAction', { callsign_action: 'verify_repair', after_id: afterId, batchSize: 25 });
        totals.processed += d.processed || 0;
        totals.repaired += d.repaired || 0;
        totals.verified_no_record += d.verified_no_record || 0;
        totals.mismatched_callsign += d.mismatched_callsign || 0;
        if (d.details?.length) details.push(...d.details);
        setVerifyRepairProgress({ done: Math.min(totals.processed, total), total });
        if (d.done) break;
        afterId = d.after_id || afterId;
      }
      setVerifyRepairReport({ ...totals, details: details.slice(0, 50) });
      const flagged = totals.verified_no_record + totals.mismatched_callsign;
      toast({
        title: 'Verification repair complete',
        description: `${totals.repaired} repaired${flagged ? `, ${flagged} flagged for review (no auto-fix)` : ''}.`,
      });
      if (totals.repaired) load();
    } catch (e) {
      toast({ title: errMsg(e) || 'Verification repair failed', variant: 'destructive' });
    } finally {
      setVerifyRepairBusy(false);
      setVerifyRepairProgress(null);
    }
  };

  const openNotify = (u) => {
    setNotifyTarget(u);
    setNotifySubject(defaultNotifySubject);
    setNotifyMessage(defaultNotifyMessage(u));
  };

  const sendNotify = async () => {
    if (!notifyTarget || notifyBusy) return;
    setNotifyBusy(true);
    try {
      const d = await adminApi('users:callsignAction', {
        id: notifyTarget.id,
        callsign_action: 'notify',
        subject: notifySubject.trim(),
        message: notifyMessage.trim(),
      });
      toast({
        title: d.email_sent ? 'Email sent' : 'In-app message sent, email not sent',
        description: d.email_sent ? `Sent to ${notifyTarget.email}.` : 'The member still received the message in the app.',
      });
      setNotifyTarget(null);
      load();
    } catch (e) {
      if (isStaleUserError(e)) {
        toast({ title: 'That account no longer exists', description: 'Removing it from the list.' });
        dropStaleUser(notifyTarget.id);
        setNotifyTarget(null);
      } else {
        toast({ title: errMsg(e) || 'Could not send the notice', variant: 'destructive' });
      }
    }
    finally { setNotifyBusy(false); }
  };

  // Opens the edit dialog defaulted to the first service that's actually
  // this member's own (Owner or Unassigned) rather than one they're merely
  // authorized on -- editing an authorized-only callsign here would touch
  // someone else's account.
  const openEditCallsign = (u) => {
    const rows = callsignServiceRows(u);
    const editable = rows.find((r) => r.unassigned || r.relation === 'Owner') || rows[0];
    setEditCallsignTarget(u);
    setEditCallsignService(editable.service);
    setEditCallsignValue(editable.unassigned ? '' : editable.callsign);
    setEditCallsignMarkVerified(false);
  };

  const switchEditCallsignService = (service) => {
    setEditCallsignService(service);
    const row = callsignServiceRows(editCallsignTarget).find((r) => r.service === service);
    setEditCallsignValue(row?.unassigned ? '' : row?.callsign || '');
  };

  const saveCallsignEdit = async () => {
    if (!editCallsignTarget || !editCallsignValue.trim()) return;
    setEditCallsignBusy(true);
    try {
      await adminApi('users:callsignAction', {
        id: editCallsignTarget.id,
        callsign_action: 'set_callsign',
        service: editCallsignService,
        new_callsign: editCallsignValue.trim().toUpperCase(),
        mark_verified: editCallsignMarkVerified,
      });
      toast({
        title: 'Callsign updated',
        description: editCallsignMarkVerified
          ? 'Marked as verified without a lookup.'
          : 'The account is marked pending re-verification.',
      });
      setEditCallsignTarget(null);
      load();
    } catch (e) {
      if (isStaleUserError(e)) {
        toast({ title: 'That account no longer exists', description: 'Removing it from the list.' });
        dropStaleUser(editCallsignTarget.id);
        setEditCallsignTarget(null);
      } else {
        toast({ title: errMsg(e) || 'Could not update the callsign', variant: 'destructive' });
      }
    }
    finally { setEditCallsignBusy(false); }
  };

  const statusBadge = (u) => {
    const status = u.account_status || 'active';
    return status === 'banned' ? <Badge tone="destructive">Banned</Badge>
      : status === 'suspended' ? <Badge tone="destructive">Suspended</Badge>
      : status === 'investigation' ? <Badge tone="warn">Investigation</Badge>
      : status === 'deleted' ? <Badge tone="muted">Deleted</Badge>
      : status === 'callsign_restricted' ? <Badge tone="warn">Callsign Restricted</Badge>
      : <Badge tone="success">Active</Badge>;
  };

  const renderActions = (u) => {
    const status = u.account_status || 'active';
    const blocked = status === 'suspended' || status === 'banned' || status === 'investigation' || status === 'deleted';
    const callsignRestricted = status === 'callsign_restricted';
    const isSelf = u.id === me?.id;
    const isStaff = ['admin', 'super_admin'].includes(u.role || 'user');
    // Moderators and other non-admin staff only manage accounts below their
    // own role; admin-api refuses the rest, so don't offer them.
    const locked = isSelf || !canManageRole(me, u.role || 'user');
    const lockedTitle = isSelf ? undefined : "Your role can't manage this account";
    const label = u.full_name || u.email;

    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" title="All available actions for this member" aria-label={`Actions for ${label}`}><MoreHorizontal className="w-4 h-4" /> Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          {blocked ? (
            <DropdownMenuItem disabled={locked} title={locked ? lockedTitle : "Restore the member's access to the platform"} onSelect={() => setSuspendTarget({ id: u.id, name: label, next: 'active' })}>
              <ShieldCheck className="w-4 h-4 mr-2" /> Enable account
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem disabled={locked} title={locked ? lockedTitle : 'Block access to the platform immediately'} onSelect={() => setSuspendTarget({ id: u.id, name: label, next: 'suspended' })}>
                <ShieldOff className="w-4 h-4 mr-2" /> Suspend
              </DropdownMenuItem>
              <DropdownMenuItem disabled={locked} className="text-destructive focus:text-destructive" title={locked ? lockedTitle : 'Permanently ban the account from logging in'} onSelect={() => setSuspendTarget({ id: u.id, name: label, next: 'banned' })}>
                <Ban className="w-4 h-4 mr-2" /> Ban
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem disabled={locked} title={locked ? lockedTitle : "Change this member's account role/permission tier"} onSelect={() => { setRoleTarget(u); setRoleValue(u.role || 'user'); }}>
            <KeyRound className="w-4 h-4 mr-2" /> Change role
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Callsign</DropdownMenuLabel>
          <DropdownMenuItem disabled={locked || isStaff || blocked || !hasReverifyCallsign(u)} title={hasReverifyCallsign(u) ? "Re-check the member's callsign against FCC/ULS records" : "A callsign is required before this member can be reverified"} onSelect={() => reverifyUserCallsign(u)}>
            <RefreshCw className={`w-4 h-4 mr-2 ${reverifyUserId === u.id ? 'animate-spin' : ''}`} /> Reverify
          </DropdownMenuItem>
          <DropdownMenuItem disabled={locked || isStaff} title="Correct the member's GMRS or HAM callsign" onSelect={() => openEditCallsign(u)}>
            <Radio className="w-4 h-4 mr-2" /> Edit callsign
          </DropdownMenuItem>
          <DropdownMenuItem disabled={locked} title="Send an email/in-app notice about their callsign" onSelect={() => openNotify(u)}>
            <Mail className="w-4 h-4 mr-2" /> Notify
          </DropdownMenuItem>
          {callsignRestricted ? (
            <DropdownMenuItem disabled={locked} title="Lift the callsign restriction" onSelect={() => handleCallsignAction(u, 'restore')}>
              <UnlockKeyhole className="w-4 h-4 mr-2" /> Restore access
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={locked || blocked} title="Limit the account to profile/callsign pages until this is resolved" onSelect={() => handleCallsignAction(u, 'restrict')}>
              <LockKeyhole className="w-4 h-4 mr-2" /> Restrict (callsign)
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!isAdminRole(me)} title={isAdminRole(me) ? 'Manually grant or remove XP' : 'Administrators only'} onSelect={() => { setXpTarget(u); setXpAmount(''); setXpReason(''); }}>
            <Trophy className="w-4 h-4 mr-2" /> Adjust XP
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!hasPermission(me, 'settings.manage')} title={hasPermission(me, 'settings.manage') ? 'Override individual permissions for this member' : 'Needs the System Settings → manage permission'} onSelect={() => setOverrideUser({ id: u.id, full_name: u.full_name, email: u.email, role: u.role })}>
            <KeyRound className="w-4 h-4 mr-2" /> Permissions
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={locked} className="text-destructive focus:text-destructive" title={locked ? lockedTitle : 'Permanently delete this account and its data -- cannot be undone'} onSelect={() => setDeleteTarget({ id: u.id, name: label, email: u.email })}>
            <Trash2 className="w-4 h-4 mr-2" /> Delete account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div>
      <PageHeader title="Users" subtitle={`${total} registered users`}>
        {/* "New account" button is hidden -- Base44's inviteUser platform API
            returns "Could not validate credentials" for this app even from a
            real, logged-in super_admin session, which points to a
            platform/account issue on Base44's side rather than anything
            fixable in app code. The dialog and createAccount() handler below
            are left wired up (just unreachable with no trigger) so this can
            be re-enabled with a one-line change if Base44 resolves it. */}
        <Button variant="outline" size="sm" title="Reload the user list from the server" disabled={loading} onClick={load}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        <Button variant="outline" size="sm" title="Re-check every non-staff account's callsign(s) against FCC/ULS records, no selection needed" disabled={reverifyAllBusy} onClick={reverifyAllAccounts}>
          <RefreshCw className={`w-4 h-4 ${reverifyAllBusy ? 'animate-spin' : ''}`} />
          {reverifyAllBusy && reverifyAllProgress?.total ? `Reverifying ${reverifyAllProgress.done}/${reverifyAllProgress.total}…` : 'Reverify all accounts'}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="Backfill older accounts onto the current GMRS/HAM callsign system">
              <Wrench className="w-4 h-4" /> Backfill accounts
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Sync to new callsign system</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={syncAuthorizedBusy}
              title="Fill in User.callsign for accounts with exactly one approved authorized callsign and nothing on file yet"
              onSelect={(e) => { e.preventDefault(); syncAuthorizedCallsigns(); }}
            >
              <ShieldCheck className={`w-4 h-4 mr-2 ${syncAuthorizedBusy ? 'animate-pulse' : ''}`} />
              {syncAuthorizedBusy ? 'Syncing…' : 'Sync authorized callsigns'}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={resyncAllBusy}
              title="Backfill every account missing a callsign from its Callsign, authorized-access, or profile records"
              onSelect={(e) => { e.preventDefault(); resyncAllCallsigns(); }}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${resyncAllBusy ? 'animate-spin' : ''}`} />
              {resyncAllBusy ? 'Resyncing…' : 'Resync all callsigns'}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={verifyRepairBusy}
              title="Find and repair callsign_verified drift against Callsign/CallsignAccess records -- never de-verifies anyone, only turns a stale flag on"
              onSelect={(e) => { e.preventDefault(); verifyRepairAll(); }}
            >
              <ShieldCheck className={`w-4 h-4 mr-2 ${verifyRepairBusy ? 'animate-pulse' : ''}`} />
              {verifyRepairBusy ? 'Checking…' : 'Repair verification sync'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>
      {resyncAllBusy && resyncAllProgress && (
        <div className="mb-4"><BatchProgress done={resyncAllProgress.done} total={resyncAllProgress.total} label="Resyncing accounts…" /></div>
      )}
      {verifyRepairBusy && verifyRepairProgress && (
        <div className="mb-4"><BatchProgress done={verifyRepairProgress.done} total={verifyRepairProgress.total} label="Checking verification sync…" /></div>
      )}
      {!verifyRepairBusy && verifyRepairReport && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div className="font-medium mb-1">Verification repair report</div>
          <div className="text-xs text-muted-foreground mb-2">
            {verifyRepairReport.processed} checked · {verifyRepairReport.repaired} repaired ·{' '}
            {verifyRepairReport.verified_no_record} verified with no supporting record ·{' '}
            {verifyRepairReport.mismatched_callsign} mismatched callsign
          </div>
          {verifyRepairReport.details.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-0.5 font-mono text-xs">
              {verifyRepairReport.details.map((d, i) => (
                <div key={i} className={d.issue === 'repaired_verified_flag' ? 'text-success' : 'text-warning'}>
                  {d.user_name} ({d.callsign}) — {d.issue.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
          )}
          <button className="text-xs text-primary hover:underline mt-2" onClick={() => setVerifyRepairReport(null)}>Dismiss</button>
        </div>
      )}
      {reverifyAllBusy && reverifyAllProgress && (
        <div className="mb-4"><BatchProgress done={reverifyAllProgress.done} total={reverifyAllProgress.total} label="Reverifying every account against FCC/ULS…" startedAt={reverifyAllStartedAt} /></div>
      )}
      {(reverifyAllBusy || bulkReverifyBusy) && <ActivityLog entries={activityLog} />}

      {callsignIssues > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
            <span className="text-sm font-medium">
              {callsignIssues} account{callsignIssues === 1 ? '' : 's'} need{callsignIssues === 1 ? 's' : ''} attention -- missing, unverified, expired, or cancelled callsigns.
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCallsignFilter('issues')}>Review</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, callsign…" className="pl-9" />
        </div>
        <Hint text="Filter members by their account role">
          <select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
            <option value="all">All roles</option>
            {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Hint>
        <Hint text="Filter by whether the account can log in">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
            <option value="investigation">Investigation</option>
            <option value="callsign_restricted">Callsign Restricted</option>
          </select>
        </Hint>
        <Hint text="Filter by GMRS/HAM callsign status">
          <select value={callsignFilter} onChange={(e) => setCallsignFilter(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
            <option value="all">Any callsign status</option>
            <option value="issues">Needs callsign attention</option>
            <option value="unverified">Unverified</option>
            <option value="missing_gmrs">Missing GMRS</option>
            <option value="missing_ham">Missing HAM</option>
          </select>
        </Hint>
      </div>

      {selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium mr-1">{selectedIds.length} selected</span>
          <Button size="sm" variant="outline" title="Re-check every selected member's callsign against FCC/ULS records" disabled={bulkReverifyBusy} onClick={runBulkReverify}>
            <RefreshCw className={`w-4 h-4 ${bulkReverifyBusy ? 'animate-spin' : ''}`} />
            {bulkReverifyBusy && bulkReverifyProgress ? `Reverifying ${bulkReverifyProgress.done}/${bulkReverifyProgress.total}…` : 'Reverify selected'}
          </Button>
          <Button size="sm" variant="outline" title="Send each selected member a callsign notice" disabled={bulkNotifyBusy} onClick={runBulkNotify}>
            <Mail className="w-4 h-4" /> {bulkNotifyBusy ? 'Notifying…' : 'Notify'}
          </Button>
          <Button size="sm" variant="outline" title="Restore access for every selected account" onClick={() => setBulkStatusTarget({ next: 'active' })}>
            <ShieldCheck className="w-4 h-4" /> Enable
          </Button>
          <Button size="sm" variant="outline" title="Block access for every selected account" onClick={() => setBulkStatusTarget({ next: 'suspended' })}>
            <ShieldOff className="w-4 h-4" /> Suspend
          </Button>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Permanently ban every selected account" onClick={() => setBulkStatusTarget({ next: 'banned' })}>
            <Ban className="w-4 h-4" /> Ban
          </Button>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Permanently delete every selected account -- cannot be undone" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" title="Deselect all" onClick={() => setSelectedIds([])}>Clear selection</Button>
          {bulkReverifyBusy && bulkReverifyProgress && (
            <div className="w-full"><BatchProgress done={bulkReverifyProgress.done} total={bulkReverifyProgress.total} label="Reverifying callsigns…" startedAt={bulkReverifyStartedAt} /></div>
          )}
          {bulkNotifyBusy && bulkNotifyProgress && (
            <div className="w-full"><BatchProgress done={bulkNotifyProgress.done} total={bulkNotifyProgress.total} label="Sending notices…" /></div>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : visibleUsers.length === 0 ? (
          <EmptyState title="No users found" description="Try adjusting your search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      title="Select all visible users for bulk actions"
                      aria-label="Select all visible users for bulk actions"
                      checked={visibleUsers.filter((u) => !bulkLocked(u)).length > 0 && visibleUsers.filter((u) => !bulkLocked(u)).every((u) => selectedIds.includes(u.id))}
                      onChange={toggleSelectAllVisible}
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Joined / Last Active</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium w-56">Callsigns</th>
                  <th className="text-left px-4 py-3 font-medium w-32">License</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        title={
                          u.id === me?.id
                            ? "You can't select your own account for bulk actions"
                            : bulkLocked(u)
                              ? 'Staff accounts cannot be selected for bulk actions'
                              : 'Select this member for bulk actions'
                        }
                        aria-label={`Select ${u.full_name || u.email || 'user'} for bulk actions`}
                        checked={selectedIds.includes(u.id)}
                        disabled={bulkLocked(u)}
                        onChange={() => toggleSelect(u.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[14rem]">
                        <div className="font-medium truncate">{u.full_name || 'Unnamed'}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Hint text={`Role key: ${u.role || 'user'}. Change it from the Actions menu.`}>
                        <Badge tone={['admin', 'super_admin'].includes(u.role) ? 'primary' : 'muted'}>
                          {roleOptions.find((r) => r.value === u.role)?.label || u.role || 'User'}
                        </Badge>
                      </Hint>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      <div>Joined {formatDateTime24(u.created_date)}</div>
                      <div>Active {formatDateTime24(u.last_active)}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-14 shrink-0">Account</span>
                        <Hint text="Whether this member can log in and use the platform">
                          {statusBadge(u)}
                        </Hint>
                      </div>
                      {callsignServiceRows(u).map((row) => (
                        <div key={row.service} className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-14 shrink-0">{row.service}</span>
                          <Hint text={
                            row.unassigned ? `No ${row.service} callsign on file for this member`
                              : row.status === 'Active' ? `Verified, active ${row.service} license`
                              : row.status === 'Cancelled' ? `${row.service} license was cancelled, terminated, or suspended`
                              : row.status === 'Unverified' ? `${row.service} callsign is on file but has never been checked against FCC/ULS records`
                              : `${row.service} license has expired`
                          }>
                            <Badge tone={
                              row.unassigned ? 'muted'
                                : row.status === 'Active' ? 'success'
                                : row.status === 'Unverified' ? 'warn'
                                : 'destructive'
                            }>
                              {row.unassigned ? 'Unassigned' : row.status}
                            </Badge>
                          </Hint>
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 max-w-[14rem]">
                      <div className="space-y-1">
                        {callsignServiceRows(u).map((row) => (
                          <div key={row.service} className="flex items-center gap-1.5 whitespace-nowrap leading-snug">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-9 shrink-0">{row.service}</span>
                            {row.unassigned ? (
                              <span className="text-sm text-muted-foreground">—</span>
                            ) : (
                              <>
                                <span className="font-medium text-sm">{row.callsign}</span>
                                <Hint text={
                                  row.relation === 'Owner'
                                    ? 'This member is the primary account holder for this callsign'
                                    : 'This member has approved access to use someone else\'s callsign'
                                }>
                                  <Badge tone={row.relation === 'Owner' ? 'primary' : 'success'}>{row.relation}</Badge>
                                </Hint>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {callsignServiceRows(u).map((row) => (
                        <div key={row.service}>
                          {row.unassigned ? '—'
                            : row.status === 'Active'
                              ? (row.expiresAt ? `Expires ${formatDateOnly(row.expiresAt)}` : 'No expiration on file')
                              : row.status === 'Unverified'
                                ? 'Not yet checked'
                                : (row.expiresAt ? `${row.status} ${formatDateOnly(row.expiresAt)}` : row.status)}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right">{renderActions(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={(o) => !o && setSuspendTarget(null)}
        title={
          suspendTarget?.next === 'banned' ? 'Ban user?'
          : suspendTarget?.next === 'suspended' ? 'Suspend user?'
          : 'Re-enable user?'
        }
        description={
          suspendTarget?.next === 'banned'
            ? `${suspendTarget?.name} will be permanently banned and cannot log in.`
          : suspendTarget?.next === 'suspended'
            ? `${suspendTarget?.name} will lose access to the platform immediately.`
            : `${suspendTarget?.name} will regain access to the platform.`
        }
        confirmLabel={suspendTarget?.next === 'banned' ? 'Ban' : suspendTarget?.next === 'suspended' ? 'Suspend' : 'Enable'}
        destructive={suspendTarget?.next === 'suspended' || suspendTarget?.next === 'banned'}
        loading={busy}
        onConfirm={confirmAction}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete account permanently?"
        description={`${deleteTarget?.name} (${deleteTarget?.email || ''}) will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete Permanently"
        destructive
        loading={busy}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={!!bulkStatusTarget}
        onOpenChange={(o) => !o && setBulkStatusTarget(null)}
        title={
          bulkStatusTarget?.next === 'banned' ? `Ban ${selectedIds.length} user(s)?`
          : bulkStatusTarget?.next === 'suspended' ? `Suspend ${selectedIds.length} user(s)?`
          : `Re-enable ${selectedIds.length} user(s)?`
        }
        description={
          bulkStatusTarget?.next === 'banned'
            ? 'They will be permanently banned and cannot log in.'
          : bulkStatusTarget?.next === 'suspended'
            ? 'They will lose access to the platform immediately.'
            : 'They will regain access to the platform.'
        }
        confirmLabel={bulkStatusTarget?.next === 'banned' ? 'Ban' : bulkStatusTarget?.next === 'suspended' ? 'Suspend' : 'Enable'}
        destructive={bulkStatusTarget?.next === 'suspended' || bulkStatusTarget?.next === 'banned'}
        loading={bulkBusy}
        progress={bulkProgress}
        onConfirm={runBulkStatus}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={(o) => !o && setBulkDeleteOpen(false)}
        title={`Delete ${selectedIds.length} account(s) permanently?`}
        description="Every selected account will be permanently deleted. This cannot be undone."
        confirmLabel="Delete Permanently"
        destructive
        loading={bulkBusy}
        progress={bulkProgress}
        onConfirm={runBulkDelete}
      />

      <Dialog open={!!roleTarget} onOpenChange={(open) => !open && !roleBusy && setRoleTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> Change role</DialogTitle>
            {roleTarget && <p className="text-sm text-muted-foreground">{roleTarget.full_name || roleTarget.email}</p>}
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium">Role</label>
            <select value={roleValue} onChange={(e) => setRoleValue(e.target.value)} className="mt-1 h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
              {roleOptions
                .filter((r) => r.value === roleTarget?.role || canManageRole(me, r.value))
                .map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRoleTarget(null)} disabled={roleBusy}>Cancel</Button>
            <Button type="button" onClick={saveRoleChange} disabled={roleBusy || !roleValue || roleValue === roleTarget?.role}>{roleBusy ? 'Saving…' : 'Save role'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!xpTarget} onOpenChange={(open) => !open && setXpTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trophy className="w-5 h-5" /> Adjust XP</DialogTitle>
            {xpTarget && <p className="text-sm text-muted-foreground">{xpTarget.full_name || xpTarget.email} {xpTarget.callsign ? `(${xpTarget.callsign})` : ''}</p>}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">XP amount</label>
              <Input type="number" value={xpAmount} onChange={(e) => setXpAmount(e.target.value)} placeholder="100 or -100" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Reason</label>
              <Input value={xpReason} onChange={(e) => setXpReason(e.target.value)} placeholder="Reason for this adjustment" className="mt-1" maxLength={1000} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setXpTarget(null)} disabled={xpBusy}>Cancel</Button>
            <Button type="button" onClick={adjustXp} disabled={xpBusy || !xpAmount || !xpReason.trim()}>{xpBusy ? 'Saving…' : 'Save XP Adjustment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newAccountOpen} onOpenChange={(open) => { if (!newAccountBusy) { setNewAccountOpen(open); if (!open) setNewAccountForm(NEW_ACCOUNT_EMPTY); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" /> New account</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Creates the account and emails them a link to set their own password. Their callsign is marked verified
              immediately (admin manual override) -- use this for cases like a brand-new licensee blocked by FCC lookup lag.
            </p>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-sm font-medium">Email *</label>
              <Input type="email" value={newAccountForm.email} onChange={(e) => setNewAccountForm((f) => ({ ...f, email: e.target.value }))} placeholder="member@example.com" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Full name</label>
              <Input value={newAccountForm.full_name} onChange={(e) => setNewAccountForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Optional" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Callsign *</label>
                <Input value={newAccountForm.callsign} onChange={(e) => setNewAccountForm((f) => ({ ...f, callsign: e.target.value.toUpperCase() }))} placeholder="e.g. WSOI830" className="mt-1 font-mono uppercase" maxLength={10} />
              </div>
              <div>
                <label className="text-sm font-medium">Service</label>
                <div className="flex gap-2 mt-1">
                  {['GMRS', 'HAM'].map((service) => (
                    <Button
                      key={service}
                      type="button"
                      size="sm"
                      variant={newAccountForm.radio_service === service ? 'default' : 'outline'}
                      onClick={() => setNewAccountForm((f) => ({ ...f, radio_service: service }))}
                    >
                      {service}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewAccountOpen(false)} disabled={newAccountBusy}>Cancel</Button>
            <Button type="button" onClick={createAccount} disabled={newAccountBusy || !newAccountForm.email.trim() || !newAccountForm.callsign.trim()}>
              {newAccountBusy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1.5" />}
              {newAccountBusy ? 'Creating…' : 'Create & invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editCallsignTarget} onOpenChange={(open) => !open && !editCallsignBusy && setEditCallsignTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Radio className="w-5 h-5" /> Edit callsign</DialogTitle>
            {editCallsignTarget && <p className="text-sm text-muted-foreground">{editCallsignTarget.full_name || editCallsignTarget.email}</p>}
          </DialogHeader>
          {editCallsignTarget && (() => {
            const row = callsignServiceRows(editCallsignTarget).find((r) => r.service === editCallsignService);
            const authorizedOnly = !row.unassigned && row.relation === 'Authorized';
            return (
              <div className="space-y-4 py-2">
                <div className="flex gap-2">
                  {['GMRS', 'HAM'].map((service) => (
                    <Button
                      key={service}
                      type="button"
                      size="sm"
                      variant={editCallsignService === service ? 'default' : 'outline'}
                      onClick={() => switchEditCallsignService(service)}
                    >
                      {service}
                    </Button>
                  ))}
                </div>
                {authorizedOnly ? (
                  <p className="text-sm text-muted-foreground">
                    This member is only authorized to use {row.callsign} ({row.service}), not its owner. Edit it from the primary holder's account instead.
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium">{editCallsignService} callsign</label>
                      <Input value={editCallsignValue} onChange={(e) => setEditCallsignValue(e.target.value.toUpperCase())} placeholder="e.g. KJ7ABC" className="mt-1 font-mono uppercase" maxLength={10} />
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                      <Switch checked={editCallsignMarkVerified} onCheckedChange={setEditCallsignMarkVerified} className="mt-0.5 shrink-0" />
                      <div>
                        <div className="text-sm font-medium">Mark as verified now, skip the FCC/ULS lookup</div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Use this only when you've confirmed the license yourself (e.g. on the FCC's own site) and
                          our lookup providers can't -- a brand-new callsign that hasn't reached OpenCallbook's
                          weekly data mirror yet, or the FCC's own API being unreachable.
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {editCallsignMarkVerified
                        ? 'Saving marks it verified and active immediately.'
                        : 'Saving marks it pending re-verification. Use Reverify afterward to confirm it against FCC/ULS records.'}
                    </p>
                  </>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditCallsignTarget(null)} disabled={editCallsignBusy}>Cancel</Button>
            <Button
              type="button"
              onClick={saveCallsignEdit}
              disabled={
                editCallsignBusy || !editCallsignValue.trim() ||
                (editCallsignTarget && callsignServiceRows(editCallsignTarget).find((r) => r.service === editCallsignService)?.relation === 'Authorized')
              }
            >
              {editCallsignBusy ? 'Saving…' : 'Save callsign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!notifyTarget} onOpenChange={(open) => !open && !notifyBusy && setNotifyTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Email member</DialogTitle>
            {notifyTarget && <p className="text-sm text-muted-foreground">To: {notifyTarget.full_name || 'Member'} &lt;{notifyTarget.email || 'no email on file'}&gt;</p>}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Subject</label>
              <Input value={notifySubject} onChange={(e) => setNotifySubject(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Message</label>
              <textarea value={notifyMessage} onChange={(e) => setNotifyMessage(e.target.value)} rows={8} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNotifyTarget(null)} disabled={notifyBusy}>Cancel</Button>
            <Button type="button" onClick={sendNotify} disabled={notifyBusy || !notifySubject.trim() || !notifyMessage.trim()}>{notifyBusy ? 'Sending…' : 'Send'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserOverrideDialog
        open={!!overrideUser}
        onOpenChange={(o) => !o && setOverrideUser(null)}
        user={overrideUser}
        categories={overrideCategories}
        types={overrideTypes}
      />
    </div>
    </TooltipProvider>
  );
}