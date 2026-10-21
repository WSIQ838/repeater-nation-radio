import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { PERMISSION_LABELS, PERMISSION_COLORS, canManageHosts } from '@/lib/netHostPermissions';
import { Label } from '@/components/ui/label';
import { Crown, Users, Trash2, ArrowRightLeft, Loader2, Mail, Check } from 'lucide-react';

import { errMsg } from '@/lib/utils';
import StaffTag from '@/components/shared/StaffTag';
// HostManagementPanel — shows all hosts (primary + co-hosts), lets the primary
// change permissions, remove hosts, and transfer primary control. Also shows
// pending invitations.
export default function HostManagementPanel({ open, onClose, session, user, onChanged }) {
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPrimary, setIsPrimary] = useState(false);
  const [myPermission, setMyPermission] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferring, setTransferring] = useState(false);

  const loadHosts = useCallback(async () => {
    if (!session?.id) return;
    try {
      const res = await base44.functions.invoke('manage-net-hosts', { action: 'list', session_id: session.id });
      setHosts(res.data?.hosts || []);
      setIsPrimary(res.data?.isPrimary || false);
      setMyPermission(res.data?.myPermission || null);
    } catch (e) { console.error('Host load error:', e); }
    setLoading(false);
  }, [session?.id]);

  useEffect(() => { if (open) loadHosts(); }, [open, loadHosts]);

  const canManage = canManageHosts(isPrimary);
  const acceptedHosts = hosts.filter((h) => h.status === 'accepted');
  const invitedHosts = hosts.filter((h) => h.status === 'invited');
  const primaryHost = acceptedHosts.find((h) => h.is_primary) || hosts.find((h) => h.is_primary);

  const handleRemove = async (hostId) => {
    if (!confirm('Remove this co-host? They will lose access to this net.')) return;
    try {
      await base44.functions.invoke('manage-net-hosts', { action: 'remove', host_id: hostId });
      loadHosts();
      onChanged?.();
    } catch (e) { alert(errMsg(e) || 'Failed to remove'); }
  };

  const handlePermissionChange = async (hostId, level) => {
    try {
      await base44.functions.invoke('manage-net-hosts', { action: 'update_permission', host_id: hostId, permission_level: level });
      loadHosts();
    } catch (e) { alert(errMsg(e) || 'Failed to update'); }
  };

  const handleTransfer = async () => {
    if (!transferTarget) return;
    if (!confirm(`Transfer primary Net Control to ${transferTarget.user_callsign || transferTarget.user_name}? You will become a Full co-host.`)) return;
    setTransferring(true);
    try {
      await base44.functions.invoke('manage-net-hosts', {
        action: 'transfer',
        session_id: session.id,
        new_primary_user_id: transferTarget.user_id,
      });
      setTransferTarget(null);
      loadHosts();
      onChanged?.();
    } catch (e) { alert(errMsg(e) || 'Failed to transfer'); }
    setTransferring(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="w-5 h-5" />Net Control Hosts</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />Loading hosts…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Primary */}
            {primaryHost && (
              <Card className="p-3 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700">
                <div className="flex items-center gap-3">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-1.5">{primaryHost.user_callsign || primaryHost.user_name || 'Primary'}<StaffTag userId={primaryHost.user_id} /></div>
                    <div className="text-xs text-muted-foreground">Primary Net Control</div>
                  </div>
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">Primary</Badge>
                </div>
              </Card>
            )}

            {/* Co-hosts */}
            {acceptedHosts.filter((h) => !h.is_primary).length > 0 && (
              <div>
                <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Co-Hosts</Label>
                <div className="space-y-2">
                  {acceptedHosts.filter((h) => !h.is_primary).map((h) => (
                    <Card key={h.id} className="p-3 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-[120px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{h.user_callsign || h.user_name || 'Unknown'}</span><StaffTag userId={h.user_id} />
                          {h.user_callsign && h.user_name && <span className="text-muted-foreground text-xs">{h.user_name}</span>}
                        </div>
                      </div>
                      {canManage ? (
                        <>
                          <Select
                            value={h.permission_level}
                            onValueChange={(v) => handlePermissionChange(h.id, v)}
                            disabled={h.is_primary}
                          >
                            <SelectTrigger className="w-[130px] sm:w-[150px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">Full Net Control</SelectItem>
                              <SelectItem value="checkin">Check-In Operator</SelectItem>
                              <SelectItem value="view">View Only</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" onClick={() => handleRemove(h.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      ) : (
                        <Badge className={PERMISSION_COLORS[h.permission_level] || ''}>
                          {PERMISSION_LABELS[h.permission_level] || h.permission_level}
                        </Badge>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Pending invitations */}
            {invitedHosts.length > 0 && (
              <div>
                <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block flex items-center gap-1">
                  <Mail className="w-3 h-3" />Pending Invitations
                </Label>
                <div className="space-y-2">
                  {invitedHosts.map((h) => (
                    <Card key={h.id} className="p-3 flex items-center gap-3 opacity-70">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{h.user_callsign || h.user_name || 'Unknown'}</span><StaffTag userId={h.user_id} />
                          <Badge variant="outline" className="text-xs">Invited</Badge>
                          <Badge className={`text-xs ${PERMISSION_COLORS[h.permission_level] || ''}`}>
                            {PERMISSION_LABELS[h.permission_level]}
                          </Badge>
                        </div>
                      </div>
                      {canManage && (
                        <Button size="icon" variant="ghost" onClick={() => handleRemove(h.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Transfer control */}
            {canManage && acceptedHosts.filter((h) => !h.is_primary).length > 0 && (
              <div className="border-t pt-3">
                <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block flex items-center gap-1">
                  <ArrowRightLeft className="w-3 h-3" />Transfer Primary Control
                </Label>
                {!transferTarget ? (
                  <div className="space-y-1">
                    {acceptedHosts.filter((h) => !h.is_primary).map((h) => (
                      <button
                        key={h.id}
                        onClick={() => setTransferTarget(h)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 text-left text-sm"
                      >
                        <span className="flex-1 inline-flex items-center gap-1.5">{h.user_callsign || h.user_name}<StaffTag userId={h.user_id} /></span>
                        <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <Card className="p-3 space-y-2 border-amber-300">
                    <div className="text-sm">
                      Transfer primary control to <strong>{transferTarget.user_callsign || transferTarget.user_name}</strong>?
                      You will become a Full co-host.
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setTransferTarget(null)}>Cancel</Button>
                      <Button size="sm" onClick={handleTransfer} disabled={transferring}>
                        {transferring ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                        Confirm Transfer
                      </Button>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {acceptedHosts.length === 0 && invitedHosts.length === 0 && !primaryHost && (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No hosts found.
              </Card>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}