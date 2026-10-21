import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  Radio, Crown, Clock, History, Loader2, UserCheck, AlertCircle, Plus, CheckCircle2, Trash2, RefreshCw
} from 'lucide-react';
import PendingRequestItem from '@/components/callsign/PendingRequestItem';
import AuthorizedUserItem from '@/components/callsign/AuthorizedUserItem';
import AuditLogItem from '@/components/callsign/AuditLogItem';
import { safeReturnTo } from '@/lib/authReturnTo';

export default function CallsignManagement() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [fccMsg, setFccMsg] = useState('');
  const [ownedCallsigns, setOwnedCallsigns] = useState([]);
  const [authorizedCallsigns, setAuthorizedCallsigns] = useState([]);
  const [pendingToApprove, setPendingToApprove] = useState([]);
  const [myPendingRequests, setMyPendingRequests] = useState([]);
  const [authorizedUsers, setAuthorizedUsers] = useState([]);
  const [callSignRecords, setCallSignRecords] = useState([]);
  const [accountNames, setAccountNames] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [newCallsign, setNewCallsign] = useState('');
  const [adding, setAdding] = useState(false);
  const [googleSignupCallsign, setGoogleSignupCallsign] = useState('');
  const [googleSignupHandled, setGoogleSignupHandled] = useState(false);

  // Shared by the "Add a GMRS or HAM Callsign" form and the per-card
  // "Re-verify" button. A re-verify (reverifyId set) is for a callsign the
  // user already owns, so it's allowed through even when the fresh lookup
  // comes back not-currently-verified — that's the point of re-verifying: to
  // catch and persist an expired/lapsed license, not just confirm good news.
  const verifyAndClaim = async (rawCallsign, { reverifyId } = {}) => {
    const callsign = rawCallsign.trim().toUpperCase();
    if (!callsign) return;
    const isReverify = !!reverifyId;
    if (isReverify) setActingId(reverifyId); else setAdding(true);
    setFccMsg(isReverify ? `Re-verifying ${callsign}…` : 'Verifying callsign…');
    try {
      const verification = await base44.functions.invoke('verifyCallsign', { callsign });
      const d = verification?.data || verification || {};
      if (d.fccReachable === false) {
        setFccMsg(d.message || 'Verification services are temporarily unavailable.');
        return;
      }
      // Modern FCC-issued GMRS callsigns (W + 3 letters + 3 digits, e.g. WRJR646)
      // can take up to a week to appear in OpenCallbook's mirror, and the FCC's
      // own License View API is dead (see base44/shared/fcc.ts) -- so a
      // brand-new licensee's callsign genuinely isn't found by anything yet.
      // Blocking here would strand them with no path forward. Let a
      // syntactically-real, simply-not-found-yet GMRS callsign through as
      // pending (same relaxation Register.jsx applies at signup); a callsign
      // that was FOUND but isn't active, or doesn't look like a real
      // callsign, still gets blocked.
      const looksLikeNewGmrs = /^W[A-Z]{3}\d{3}$/.test(callsign);
      const pendingNewGmrs = d.found === false && looksLikeNewGmrs;
      if (!d.verified && !isReverify && !pendingNewGmrs) {
        setFccMsg(d.message || 'That callsign could not be verified as an active GMRS or HAM license.');
        return;
      }

      const result = await base44.functions.invoke('callsign-claim-or-request', {
        callsign,
        display_name: user?.full_name || '',
        license_verified: true,
      });
      const r = result?.data || result || {};
      if (r.status === 'primary' || r.status === 'authorized') {
        toast({ title: r.message || (r.status === 'primary' ? 'Callsign added' : 'Callsign already authorized') });
        if (!isReverify) setNewCallsign('');
        setFccMsg('');
        await loadData(user);
        return r;
      } else if (r.status === 'pending') {
        toast({ title: 'Approval requested' });
        if (!isReverify) setNewCallsign('');
        setFccMsg(r.message || 'Access request sent to the primary callsign holder.');
        await loadData(user);
      } else {
        setFccMsg(r.message || 'Could not verify that callsign.');
      }
    } catch (e) {
      setFccMsg(e.message || 'Could not verify or add that callsign.');
    } finally {
      if (isReverify) setActingId(null); else setAdding(false);
    }
  };

  const handleAddCallsign = () => verifyAndClaim(newCallsign);
  const handleReverify = async (cs) => {
    const label = cs.display_callsign || cs.normalized_callsign || 'callsign';
    setActingId(cs.id);
    setFccMsg(`Re-verifying ${label}…`);
    try {
      const isPrimary = cs.primary_user_id === user?.id;
      const res = isPrimary
        ? await base44.functions.invoke('callsign-claim-or-request', {
            callsign: label,
            display_name: user?.full_name || user?.email || '',
            license_verified: true,
          })
        : await base44.functions.invoke('callsign-manage', {
            action: 'reverify',
            callsign_id: cs.callsign_id || cs.id,
          });

      const data = res?.data || res || {};
      if (data.ok || data.status === 'primary' || data.status === 'authorized') {
        setFccMsg('');
        toast({ title: data.message || `${label} re-verified.` });
        await loadData(user);
      } else {
        setFccMsg(data.error || data.message || 'Unable to re-verify this callsign.');
      }
    } catch (e) {
      setFccMsg(e?.response?.data?.error || e.message || 'Unable to re-verify this callsign.');
    } finally {
      setActingId(null);
    }
  };

  const loadData = useCallback(async (u) => {
    if (!u) return;
    const [owned, auth, pending, myPending, authUsers, allCallsigns, logs] = await Promise.all([
      base44.entities.Callsign.filter({ primary_user_id: u.id, duplicate_flagged: { $ne: true } }, '-created_date', 50).catch(() => []),
      base44.entities.CallsignAccess.filter({ user_id: u.id, status: 'approved' }, '-approved_at', 50).catch(() => []),
      base44.entities.CallsignAccessRequest.filter({ primary_user_id: u.id, status: 'pending' }, '-created_date', 50).catch(() => []),
      base44.entities.CallsignAccessRequest.filter({ requester_user_id: u.id, status: 'pending' }, '-created_date', 50).catch(() => []),
      base44.entities.CallsignAccess.filter({ primary_user_id: u.id, status: 'approved' }, '-approved_at', 50).catch(() => []),
      base44.entities.Callsign.filter({ duplicate_flagged: { $ne: true } }, '-created_date', 500).catch(() => []),
      base44.entities.CallsignAuditLog.filter({ primary_user_id: u.id }, '-created_date', 30).catch(() => []),
    ]);
    // Base44 does not enforce uniqueness on normalized_callsign. A previous
    // duplicate scan or concurrent claim can therefore leave multiple Callsign
    // rows for the same primary account. The management page must never render
    // those as separate primary accounts.
    const canonicalOwned = Array.from(
      (owned || []).reduce((map, record) => {
        const key = String(record.normalized_callsign || record.display_callsign || record.id || '').trim().toUpperCase();
        const current = map.get(key);
        if (!current) {
          map.set(key, record);
          return map;
        }
        const currentTime = new Date(current.created_date || 0).getTime();
        const recordTime = new Date(record.created_date || 0).getTime();
        if (recordTime < currentTime) map.set(key, record);
        return map;
      }, new Map()).values()
    );
    setOwnedCallsigns(canonicalOwned);
    setAuthorizedCallsigns(auth || []);

    // Keep one canonical Callsign record per normalized callsign. Access records
    // created before a duplicate scan may point at a secondary duplicate, so the
    // UI must resolve by callsign as well as by record id.
    const canonicalRecords = Array.from(
      (allCallsigns || []).reduce((map, record) => {
        const key = String(record.normalized_callsign || record.display_callsign || '').trim().toUpperCase();
        if (!key) return map;
        const current = map.get(key);
        if (!current) {
          map.set(key, record);
          return map;
        }
        const currentTime = new Date(current.created_date || 0).getTime();
        const recordTime = new Date(record.created_date || 0).getTime();
        if (recordTime < currentTime) map.set(key, record);
        return map;
      }, new Map()).values()
    );
    setCallSignRecords(canonicalRecords);

    // Resolve public profile display names for every callsign account shown on
    // this page. Callsign.primary_user_name is a legacy snapshot and can be a
    // username/callsign rather than the member's actual display name.
    // Load the public profiles once instead of issuing one Profile request per account.
    const publicProfiles = await base44.entities.Profile.list('-updated_date', 500).catch(() => []);
    const namesByUserId = {};
    for (const profile of publicProfiles || []) {
      if (profile?.created_by_id && profile?.display_name && !namesByUserId[profile.created_by_id]) {
        namesByUserId[profile.created_by_id] = profile.display_name;
      }
    }
    setAccountNames(namesByUserId);

    setPendingToApprove(pending || []);
    setMyPendingRequests(myPending || []);
    setAuthorizedUsers(authUsers || []);
    setAuditLogs(logs || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const u = await base44.auth.me().catch(() => null);
      if (!u) { setLoading(false); return; }
      setUser(u);
      await loadData(u);
    })();
  }, [loadData]);

  // Google signup returns here only after the person has entered and
  // pre-verified a callsign on the registration page. Complete the same
  // server-side verification/claim step again after Google authentication so
  // the client-side pre-check can never be used to bypass callsign ownership
  // or license verification.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_signup') !== '1' && params.get('facebook_signup') !== '1' && params.get('apple_signup') !== '1' && params.get('microsoft_signup') !== '1') return;
    const cs = String(params.get('callsign') || '').trim().toUpperCase();
    if (!cs) return;
    setGoogleSignupCallsign(cs);
    setNewCallsign((current) => current || cs);
  }, []);

  useEffect(() => {
    if (!user || !googleSignupCallsign || googleSignupHandled) return;
    setGoogleSignupHandled(true);

    (async () => {
      const result = await verifyAndClaim(googleSignupCallsign);
      if (result?.status === 'primary' || result?.status === 'authorized') {
        window.location.href = safeReturnTo();
      }
    })();
  }, [user, googleSignupCallsign, googleSignupHandled]);

  const handleAction = async (action, request_id, reason) => {
    setActingId(request_id);
    try {
      const res = await base44.functions.invoke('callsign-manage', { action, request_id, reason });
      if (res.data?.ok) {
        toast({ title: `Request ${action === 'approve' ? 'approved' : 'denied'}` });
        await loadData(user);
      } else {
        toast({ title: 'Error', description: res.data?.error || 'Action failed', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: e.message || 'Action failed', variant: 'destructive' });
    } finally {
      setActingId(null);
    }
  };

  const handleRemoveCallsign = async (callsign) => {
    const label = callsign?.display_callsign || callsign?.normalized_callsign || 'this callsign';
    if (!window.confirm(`Remove ${label} from your account? This removes your ownership of the callsign from Repeater Nation. You can verify and add it again later.`)) return;

    setActingId(callsign.id);
    try {
      const res = await base44.functions.invoke('callsign-manage', {
        action: 'remove_owned',
        callsign_id: callsign.id,
      });
      const data = res?.data || res || {};
      if (data.ok) {
        toast({ title: 'Callsign removed', description: `${label} was removed from your account.` });
        await loadData(user);
      } else {
        toast({ title: 'Unable to remove callsign', description: data.error || 'The callsign could not be removed.', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Unable to remove callsign', description: e.message || 'The callsign could not be removed.', variant: 'destructive' });
    } finally {
      setActingId(null);
    }
  };

  const handleRevoke = async (access_id) => {
    setActingId(access_id);
    try {
      const res = await base44.functions.invoke('callsign-manage', { action: 'revoke', access_id });
      if (res.data?.ok) {
        toast({ title: 'Access revoked' });
        await loadData(user);
      } else {
        toast({ title: 'Error', description: res.data?.error || 'Revoke failed', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: e.message || 'Revoke failed', variant: 'destructive' });
    } finally {
      setActingId(null);
    }
  };

  const handleCancel = async (request_id) => {
    setActingId(request_id);
    try {
      const res = await base44.functions.invoke('callsign-manage', { action: 'cancel', request_id });
      if (res.data?.ok) {
        toast({ title: 'Request cancelled' });
        await loadData(user);
      } else {
        toast({ title: 'Error', description: res.data?.error || 'Cancel failed', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: e.message || 'Cancel failed', variant: 'destructive' });
    } finally {
      setActingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasOwned = ownedCallsigns.length > 0;
  const hasAuthorized = authorizedCallsigns.length > 0;
  const hasPending = myPendingRequests.length > 0;
  const isEmpty = !hasOwned && !hasAuthorized && !hasPending;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/10 grid place-items-center shrink-0">
            <Radio className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-heading font-bold">Callsign Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              A callsign may be shared across multiple Repeater Nation accounts when approved by the primary account holder.
            </p>
          </div>
        </div>
      </div>

      {fccMsg && (
        <Card className={fccMsg.toLowerCase().includes('not changed') || fccMsg.toLowerCase().includes('unavailable') ? 'border-orange-300 bg-orange-50/50' : 'border-primary/20'}>
          <CardContent className="p-3 text-sm text-muted-foreground flex items-center justify-between gap-3">
            <span>{fccMsg}</span>
            {/* Landed here from "Continue with Google" and the auto-verify
                attempt didn't succeed -- the lookup providers are only ever
                tried once on that path (googleSignupHandled guards against
                re-running the effect), so give an explicit way to try again
                instead of leaving the user stuck with no visible next step. */}
            {googleSignupCallsign && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={adding}
                onClick={async () => {
                  const result = await verifyAndClaim(googleSignupCallsign);
                  if (result?.status === 'primary' || result?.status === 'authorized') {
                    window.location.href = safeReturnTo();
                  }
                }}
              >
                {adding ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                Retry
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-heading font-semibold text-lg">Add a GMRS or HAM Callsign</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Add another callsign you personally hold. It will be verified before being added to your account.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newCallsign}
              onChange={(e) => setNewCallsign(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCallsign(); } }}
              placeholder="Example: W1ABC or F4LEJ"
              className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/40"
              disabled={adding}
            />
            <Button type="button" onClick={handleAddCallsign} disabled={adding || !newCallsign.trim()}>
              {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {adding ? 'Verifying…' : 'Verify & Add'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            GMRS and amateur-radio callsigns can both be on the same profile.
          </p>
        </CardContent>
      </Card>

      {isEmpty && (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg">No callsign activity yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Your callsign will appear here once it's claimed. If you already have a callsign on your account,
              it may need to be claimed or an admin needs to run a duplicate scan.
            </p>
          </CardContent>
        </Card>
      )}

      {hasOwned && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Primary Callsign Account</h2>
          </div>
          {ownedCallsigns.map((cs) => {
            const csPending = pendingToApprove.filter((r) => r.callsign_id === cs.id);
            const csAuthorized = authorizedUsers.filter((a) => a.callsign_id === cs.id);
            return (
              <Card key={cs.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="min-w-0"><span className="text-2xl font-mono font-bold tracking-wide">{cs.display_callsign}</span><div className="text-sm text-muted-foreground mt-1"><span className="font-medium text-foreground">Primary account:</span> {accountNames[cs.primary_user_id] || cs.primary_user_name || user?.full_name || user?.email || 'Your account'}</div></div>
                      {cs.duplicate_flagged && (
                        <Badge variant="outline" className="text-orange-600 border-orange-300">
                          <AlertCircle className="w-3 h-3 mr-1" /> Duplicate flagged
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-primary text-primary-foreground">
                        <Crown className="w-3 h-3 mr-1" /> Primary
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={actingId === cs.id}
                        onClick={() => handleReverify(cs)}
                        title="Re-check this callsign's license status"
                      >
                        {actingId === cs.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                        Re-verify
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={actingId === cs.id}
                        onClick={() => handleRemoveCallsign(cs)}
                      >
                        {actingId === cs.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                        Remove
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {cs.radio_service || user?.license_service || 'GMRS'} · {cs.license_status === 'pending' && user?.callsign_verified ? 'active' : (cs.license_status || (user?.callsign_verified ? 'active' : user?.license_status || 'pending')).toLowerCase()}
                    {cs.expiration_date ? ` · expires ${new Date(cs.expiration_date).toLocaleDateString()}` : ''}
                    {cs.last_check_date ? ` · last checked ${new Date(cs.last_check_date).toLocaleDateString()}` : ''}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border/80 p-4 bg-primary text-white hover:border-black transition-colors">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-2">
                        <Crown className="w-3.5 h-3.5" /> PRIMARY CALLSIGN ACCOUNT
                      </div>
                      <div className="text-base font-semibold text-white">{accountNames[cs.primary_user_id] || cs.primary_user_name || user?.full_name || user?.email || 'Your account'}</div>
                      <p className="text-xs text-white/90 mt-1">
                        Primary account holder for {cs.display_callsign}.
                      </p>
                      <Link to="/settings" className="inline-flex items-center gap-1 text-xs text-white hover:text-white hover:underline mt-2">
                        View profile
                      </Link>
                    </div>

                    <div className="rounded-lg border border-border/80 p-4 bg-success text-white hover:border-black transition-colors">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-2">
                        <UserCheck className="w-3.5 h-3.5" /> AUTHORIZED CALLSIGNS
                      </div>
                      {csAuthorized.length > 0 ? (
                        <div className="space-y-2">
                          {csAuthorized.map((a) => (
                            <AuthorizedUserItem key={a.id} access={a} onRevoke={handleRevoke} actingId={actingId} colored />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-white/90">
                          No other accounts are authorized to use this callsign.
                        </p>
                      )}
                    </div>
                  </div>

                  {csPending.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                        <Clock className="w-4 h-4 text-primary" />
                        Pending Callsign Access Requests ({csPending.length})
                      </div>
                      <div className="space-y-2">
                        {csPending.map((r) => (
                          <PendingRequestItem key={r.id} request={r} onAction={handleAction} actingId={actingId} />
                        ))}
                      </div>
                    </div>
                  )}
                  {csPending.length === 0 && csAuthorized.length === 0 && (
                    <p className="text-sm text-muted-foreground">No pending requests or additional authorized accounts for this callsign.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {hasAuthorized && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-success" />
            <h2 className="text-lg font-semibold">Authorized Callsigns</h2>
          </div>
          {authorizedCallsigns.map((a) => {
            const accessKey = String(a.normalized_callsign || a.display_callsign || '').trim().toUpperCase();
            const primary = callSignRecords.find((c) => c.id === a.callsign_id)
              || callSignRecords.find((c) => String(c.normalized_callsign || c.display_callsign || '').trim().toUpperCase() === accessKey)
              || callSignRecords.find((c) => c.primary_user_id === a.primary_user_id);
            const primaryId = primary?.primary_user_id || a.primary_user_id || '';
            const primaryName = (primaryId && accountNames[primaryId])
              || primary?.primary_user_name
              || a.primary_user_name
              || (primaryId ? 'Member ' + String(primaryId).slice(0, 8) : 'Account holder');
            const primaryService = primary?.radio_service || (accessKey === String(user?.callsign || '').trim().toUpperCase() ? user?.license_service : null) || 'GMRS';
            const primaryStatus = primary?.license_status || (accessKey === String(user?.callsign || '').trim().toUpperCase() && user?.callsign_verified ? 'active' : user?.license_status) || 'pending';
            return (
              <Card key={a.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <span className="text-xl font-mono font-bold tracking-wide">{a.display_callsign}</span>
                      <p className="text-xs text-white/90 mt-1">
                        {primaryService} · {String(primaryStatus).toLowerCase()}
                      </p>
                    </div>
                    <Badge className="bg-success text-success-foreground">
                      <UserCheck className="w-3 h-3 mr-1" /> Authorized
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border/80 p-4 bg-primary text-white hover:border-black transition-colors">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-2">
                        <Crown className="w-3.5 h-3.5" /> PRIMARY CALLSIGN ACCOUNT
                      </div>
                      {primaryId ? (
                        <Link to={`/members/${primaryId}`} className="block rounded-md p-1 -m-1 hover:bg-primary/10">
                          <div className="font-medium text-sm text-white hover:text-white hover:underline">{primaryName}</div>
                          <div className="text-xs text-white/90 mt-1">This account holds the primary callsign.</div>
                          <div className="text-xs text-white mt-2">View profile</div>
                        </Link>
                      ) : (
                        <div className="text-sm text-white/90">Account holder unavailable</div>
                      )}
                    </div>

                    <div className="rounded-lg border border-border/80 p-4 bg-success text-white hover:border-black transition-colors">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-2">
                        <UserCheck className="w-3.5 h-3.5" /> AUTHORIZED CALLSIGNS
                      </div>
                      <Link to="/settings" className="inline-flex items-center text-base font-semibold text-white hover:text-white hover:underline">
                        {accountNames[user?.id] || user?.full_name || user?.email || 'Your account'}
                      </Link>
                      <p className="text-xs text-white/90 mt-1">
                        Authorized {a.approved_at ? new Date(a.approved_at).toLocaleDateString() : '—'}.
                      </p>
                      <Link to="/settings" className="inline-flex items-center gap-1 text-xs text-white hover:text-white hover:underline mt-2">
                        View profile
                      </Link>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={actingId === a.id}
                      onClick={() => handleReverify(a)}
                      title="Re-check this callsign's license status"
                    >
                      {actingId === a.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                      Re-verify
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {hasPending && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Callsign Access Requests</h2>
          </div>
          {myPendingRequests.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-lg font-mono font-bold tracking-wide">{r.display_callsign}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Requested {new Date(r.created_date).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actingId === r.id}
                    onClick={() => handleCancel(r.id)}
                  >
                    {actingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Cancel Request
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {auditLogs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Access History</h2>
          </div>
          <div className="space-y-2">
            {auditLogs.map((log) => (
              <AuditLogItem key={log.id} log={log} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}