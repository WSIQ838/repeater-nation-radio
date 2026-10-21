import { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { PageHeader, ConfirmDialog, EmptyState, formatDateTime } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import {
  Search, Loader2, Radio, AlertCircle, Crown, UserCircle, Mail, Trash2, UserX, ShieldAlert,
} from 'lucide-react';

function CallsignLookup() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState([]);
  const [confirmTarget, setConfirmTarget] = useState(null); // { kind: 'callsign' | 'access', record }
  const [acting, setActing] = useState(false);

  const search = async () => {
    const normalized = query.trim().toUpperCase().replace(/\s+/g, '');
    if (!normalized) return;
    setLoading(true);
    setSearched(true);
    try {
      const callsigns = await base44.entities.Callsign.filter({ normalized_callsign: normalized, duplicate_flagged: { $ne: true } }, '-created_date', 50);
      const withAccess = await Promise.all((callsigns || []).map(async (cs) => {
        const access = await base44.entities.CallsignAccess.filter(
          { callsign_id: cs.id, status: 'approved' }, '-approved_at', 50
        ).catch(() => []);
        return { callsign: cs, access: access || [] };
      }));
      setResults(withAccess);
    } catch (e) {
      toast({ title: 'Error', description: e.message || 'Lookup failed', variant: 'destructive' });
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const removeCallsign = async (record) => {
    setActing(true);
    try {
      const res = await base44.functions.invoke('callsign-manage', {
        action: 'remove_owned',
        callsign_id: record.id,
        reason: 'Removed by admin from Admin → Callsigns',
      });
      if (res.data?.ok) {
        toast({ title: 'Callsign removed', description: `${record.display_callsign || record.normalized_callsign} was removed from the account.` });
        await search();
      } else {
        toast({ title: 'Error', description: res.data?.error || 'Remove failed', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: e.message || 'Remove failed', variant: 'destructive' });
    } finally {
      setActing(false);
      setConfirmTarget(null);
    }
  };

  const revokeAccess = async (access) => {
    setActing(true);
    try {
      const res = await base44.functions.invoke('callsign-manage', {
        action: 'revoke',
        access_id: access.id,
        reason: 'Revoked by admin from Admin → Callsigns',
      });
      if (res.data?.ok) {
        toast({ title: 'Access revoked', description: `${access.user_name || 'This account'}'s access to ${access.display_callsign} was revoked.` });
        await search();
      } else {
        toast({ title: 'Error', description: res.data?.error || 'Revoke failed', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: e.message || 'Revoke failed', variant: 'destructive' });
    } finally {
      setActing(false);
      setConfirmTarget(null);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-destructive/10 grid place-items-center shrink-0">
          <ShieldAlert className="w-5 h-5 text-destructive" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">Look Up &amp; Remove a Callsign</h3>
          <p className="text-sm text-muted-foreground mt-1">
            For fixing mistakes: a wrongly claimed callsign, a duplicate record, or access that
            needs to come off an account. Removing a callsign deletes the primary account's
            claim on it (and revokes any authorized users' access first); it does not delete
            their logbook or other history.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
          placeholder="Callsign, e.g. WRAB123"
          className="font-mono uppercase"
        />
        <Button onClick={search} disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
          Search
        </Button>
      </div>

      {searched && !loading && results.length === 0 && (
        <EmptyState title="No callsign records found" description="No Callsign record exists for that callsign." />
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map(({ callsign: cs, access }) => (
            <div key={cs.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg">{cs.display_callsign || cs.normalized_callsign}</span>
                    {cs.duplicate_flagged && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                        <AlertCircle className="w-3.5 h-3.5" /> Duplicate flagged
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5" />
                    Primary: {cs.primary_user_name || '—'}
                    {cs.primary_user_id && (
                      <Link to={`/members/${cs.primary_user_id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <UserCircle className="w-3.5 h-3.5" /> View profile
                      </Link>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {cs.radio_service || 'GMRS'} · {cs.license_status || 'pending'} · {cs.verification_status || 'pending'}
                    {' · created ' + formatDateTime(cs.created_date)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
                  onClick={() => setConfirmTarget({ kind: 'callsign', record: cs })}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove callsign
                </Button>
              </div>

              {access.length > 0 && (
                <div className="pl-4 border-l-2 border-border space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Authorized users ({access.length})
                  </div>
                  {access.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        {a.user_id ? (
                          <Link to={`/members/${a.user_id}`} className="text-primary hover:underline truncate">
                            {a.user_name || 'Unknown'}
                          </Link>
                        ) : (
                          <span className="truncate">{a.user_name || 'Unknown'}</span>
                        )}
                        <span className="text-xs text-muted-foreground shrink-0">
                          authorized {formatDateTime(a.approved_at)}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => setConfirmTarget({ kind: 'access', record: a })}
                      >
                        <UserX className="w-3.5 h-3.5 mr-1.5" /> Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}
        title={confirmTarget?.kind === 'callsign' ? 'Remove this callsign?' : 'Revoke this access?'}
        description={
          confirmTarget?.kind === 'callsign'
            ? `This permanently deletes the Callsign record for ${confirmTarget?.record?.display_callsign || confirmTarget?.record?.normalized_callsign}, removes it from the primary account, and revokes any authorized users. This cannot be undone.`
            : `This revokes ${confirmTarget?.record?.user_name || 'this account'}'s authorized access to ${confirmTarget?.record?.display_callsign}. They can request access again later.`
        }
        confirmLabel={confirmTarget?.kind === 'callsign' ? 'Remove callsign' : 'Revoke access'}
        destructive
        loading={acting}
        onConfirm={() => {
          if (!confirmTarget) return;
          if (confirmTarget.kind === 'callsign') removeCallsign(confirmTarget.record);
          else revokeAccess(confirmTarget.record);
        }}
      />
    </Card>
  );
}

export default function AdminCallsigns() {
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const handleScan = async () => {
    setScanLoading(true);
    try {
      const res = await base44.functions.invoke('callsign-scan-duplicates', {});
      setScanResult(res.data);
      toast({ title: 'Scan complete', description: `${res.data?.duplicates_flagged || 0} duplicates flagged` });
    } catch (e) {
      toast({ title: 'Error', description: e.message || 'Scan failed', variant: 'destructive' });
    } finally {
      setScanLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Callsign Management"
        subtitle="Scan accounts for duplicate callsigns and manage callsign records."
      />

      <Card className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
              <Radio className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Duplicate Callsign Scan</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Scans existing accounts for duplicate callsigns. Creates Callsign records for unclaimed callsigns
                and flags duplicates for review.
              </p>
            </div>
          </div>
          <Button onClick={handleScan} disabled={scanLoading}>
            {scanLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Scan for Duplicates
          </Button>

          {scanResult && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted text-sm space-y-1.5">
                <div className="font-medium mb-2">Scan Results</div>
                <div>Users scanned: <span className="font-semibold">{scanResult.total_users_scanned}</span></div>
                <div>Unique callsigns: <span className="font-semibold">{scanResult.unique_callsigns}</span></div>
                <div>Callsign records created: <span className="font-semibold">{scanResult.callsigns_created}</span></div>
                <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 font-medium pt-1">
                  <AlertCircle className="w-4 h-4" />
                  Duplicates flagged: {scanResult.duplicates_flagged}
                </div>
              </div>

              {scanResult.duplicates && scanResult.duplicates.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-destructive/5 border-b">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                      Duplicate Callsigns ({scanResult.duplicates.length}{scanResult.duplicates_flagged > scanResult.duplicates.length ? ` of ${scanResult.duplicates_flagged}` : ''})
                    </h4>
                  </div>
                  <div className="divide-y max-h-[500px] overflow-y-auto scrollbar-thin">
                    {scanResult.duplicates.map((d, i) => (
                      <div key={i} className="p-4 hover:bg-muted/50">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-mono font-bold text-primary text-sm bg-primary/10 px-2 py-0.5 rounded">
                            {d.display_callsign || d.callsign}
                          </span>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3 text-sm">
                          {/* Primary holder */}
                          <div className="rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-950/30">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                              <Crown className="w-3.5 h-3.5" />
                              PRIMARY HOLDER
                            </div>
                            <div className="space-y-1">
                              <div className="font-medium">{d.primary_user_name || '—'}</div>
                              {d.primary_user_email && (
                                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                                  <Mail className="w-3 h-3" /> {d.primary_user_email}
                                </div>
                              )}
                              {d.primary_user_id && (
                                <Link to={`/members/${d.primary_user_id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                                  <UserCircle className="w-3.5 h-3.5" /> View profile
                                </Link>
                              )}
                            </div>
                          </div>
                          {/* Duplicate user */}
                          <div className="rounded-lg border p-3 bg-destructive/5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive mb-2">
                              <AlertCircle className="w-3.5 h-3.5" />
                              DUPLICATE ACCOUNT
                            </div>
                            <div className="space-y-1">
                              <div className="font-medium">{d.user_name || '—'}</div>
                              {d.email && (
                                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                                  <Mail className="w-3 h-3" /> {d.email}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                Registered: {d.created_date ? new Date(d.created_date).toLocaleDateString() : '—'}
                              </div>
                              <Link to={`/members/${d.user_id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                                <UserCircle className="w-3.5 h-3.5" /> View profile
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
      </Card>

      <div className="mt-6">
        <CallsignLookup />
      </div>
    </div>
  );
}