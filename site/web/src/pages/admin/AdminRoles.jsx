import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Copy, Trash2, Power, Save, X, KeyRound, Lock, ScrollText } from 'lucide-react';
import { PageHeader, Loading, ErrorState, Badge, ConfirmDialog, formatDateTime } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { rolesApi } from '@/lib/adminClient';
import PermissionMatrix from '@/components/admin/PermissionMatrix';
import RoleDialog from '@/components/admin/RoleDialog';

import { errMsg } from '@/lib/utils';
export default function AdminRoles() {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState({ categories: [], types: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [originalPermissions, setOriginalPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchRoles, setSearchRoles] = useState('');
  const [searchPerms, setSearchPerms] = useState('');
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [roleDialogMode, setRoleDialogMode] = useState('create');
  const [editRole, setEditRole] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [showAudit, setShowAudit] = useState(false);

  const isSuperAdmin = me?.role === 'super_admin';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [catRes, rolesRes] = await Promise.all([rolesApi('catalog', {}), rolesApi('roles:list', {})]);
      setCatalog({ categories: catRes.categories || [], types: catRes.types || [] });
      const r = rolesRes.roles || [];
      setRoles(r);
      if (r.length && !selectedId) setSelectedId(r[0].id);
      const sel = r.find((x) => x.id === (selectedId || r[0]?.id));
      if (sel) {
        let p = {};
        try { p = JSON.parse(sel.permissions || '{}'); } catch {}
        setPermissions(p);
        setOriginalPermissions(p);
      }
    } catch (e) { setError(errMsg(e) || e?.message || 'Could not load roles'); }
    setLoading(false);
  }, [selectedId]);

  useEffect(() => { load(); }, []);

  const selectRole = (role) => {
    setSelectedId(role.id);
    let p = {};
    try { p = JSON.parse(role.permissions || '{}'); } catch {}
    setPermissions(p);
    setOriginalPermissions(p);
  };

  const dirty = JSON.stringify(permissions) !== JSON.stringify(originalPermissions);
  const selectedRole = roles.find((r) => r.id === selectedId);
  const isProtected = selectedRole?.is_protected;
  const canEdit = !isProtected || isSuperAdmin;

  const onPermChange = (key, val) => {
    setPermissions((prev) => ({ ...prev, [key]: val }));
  };

  const save = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await rolesApi('roles:savePermissions', { id: selectedRole.id, permissions });
      setOriginalPermissions({ ...permissions });
      toast({ title: 'Permissions saved', description: `${selectedRole.role_name} permissions updated for all assigned users.` });
    } catch (e) { toast({ title: errMsg(e) || 'Save failed', variant: 'destructive' }); }
    setSaving(false);
  };

  const cancel = () => { setPermissions({ ...originalPermissions }); };

  const toggleEnabled = async (role) => {
    try {
      await rolesApi('roles:setEnabled', { id: role.id, enabled: !role.enabled });
      setRoles((prev) => prev.map((r) => r.id === role.id ? { ...r, enabled: !role.enabled } : r));
      toast({ title: role.enabled ? 'Role disabled' : 'Role enabled' });
    } catch (e) { toast({ title: errMsg(e) || 'Action failed', variant: 'destructive' }); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await rolesApi('roles:delete', { id: deleteTarget.id });
      setRoles((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      if (selectedId === deleteTarget.id) setSelectedId(null);
      toast({ title: 'Role deleted' });
      setDeleteTarget(null);
    } catch (e) { toast({ title: errMsg(e) || 'Delete failed', variant: 'destructive' }); }
    setSaving(false);
  };

  const loadAudit = async () => {
    setShowAudit(true);
    try { const res = await rolesApi('audit:list', {}); setAuditEntries(res.audit || []); }
    catch (e) { console.error('audit load failed', e); }
  };

  const filteredRoles = roles.filter((r) => !searchRoles || r.role_name.toLowerCase().includes(searchRoles.toLowerCase()));

  return (
    <div>
      <PageHeader title="Roles & Permissions" subtitle="Manage role-based access control across the platform">
        <Button variant="outline" size="sm" onClick={loadAudit}><ScrollText className="w-4 h-4" /> Audit Log</Button>
        <Button size="sm" onClick={() => { setRoleDialogMode('create'); setEditRole(null); setShowRoleDialog(true); }}>
          <Plus className="w-4 h-4" /> New Role
        </Button>
      </PageHeader>

      {error ? <ErrorState message={error} onRetry={load} /> : loading ? <Loading /> : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Role List */}
          <Card className="p-5">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={searchRoles} onChange={(e) => setSearchRoles(e.target.value)} placeholder="Search roles…" className="pl-9 h-9" />
            </div>
            <div className="space-y-1 max-h-[600px] overflow-y-auto scrollbar-thin">
              {filteredRoles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => selectRole(r)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${r.id === selectedId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{r.role_name}</span>
                    {r.is_protected && <Lock className="w-3 h-3 shrink-0" />}
                    {!r.enabled && <Badge tone="muted">Disabled</Badge>}
                  </div>
                  <div className={`text-xs mt-0.5 ${r.id === selectedId ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {r.user_count} user{r.user_count !== 1 ? 's' : ''}
                    {r.is_system && ' · System'}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Permission Matrix */}
          <Card className="p-5">
            {selectedRole ? (
              <>
                <div className="flex flex-wrap items-start gap-3 mb-4 pb-4 border-b border-border">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-5 h-5 text-primary" />
                      <h2 className="text-lg font-heading font-bold">{selectedRole.role_name}</h2>
                      {selectedRole.is_protected && <Badge tone="warn"><Lock className="w-3 h-3 mr-1" /> Protected</Badge>}
                      {selectedRole.is_system && <Badge tone="primary">System</Badge>}
                      {!selectedRole.enabled && <Badge tone="muted">Disabled</Badge>}
                    </div>
                    {selectedRole.description && <p className="text-sm text-muted-foreground mt-1">{selectedRole.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setRoleDialogMode('edit'); setEditRole(selectedRole); setShowRoleDialog(true); }} disabled={!canEdit}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setRoleDialogMode('duplicate'); setEditRole(selectedRole); setShowRoleDialog(true); }}>
                      <Copy className="w-4 h-4" /> Duplicate
                    </Button>
                    {!selectedRole.is_system && (
                      <Button variant="outline" size="sm" onClick={() => toggleEnabled(selectedRole)} disabled={!canEdit}>
                        <Power className="w-4 h-4" /> {selectedRole.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    )}
                    {!selectedRole.is_system && (
                      <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(selectedRole)} disabled={!canEdit}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {isProtected && !isSuperAdmin && (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4 text-sm text-amber-600 dark:text-amber-400">
                    <Lock className="w-4 h-4 shrink-0" /> This is a protected role. Only Super Admins can modify its permissions.
                  </div>
                )}

                <div className="flex items-center gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={searchPerms} onChange={(e) => setSearchPerms(e.target.value)} placeholder="Search permissions…" className="pl-9 h-9" />
                  </div>
                  {dirty && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={cancel}><X className="w-4 h-4" /> Cancel</Button>
                      <Button size="sm" onClick={save} disabled={saving || !canEdit}>
                        <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
                      </Button>
                    </div>
                  )}
                </div>

                <PermissionMatrix
                  categories={catalog.categories}
                  types={catalog.types}
                  permissions={permissions}
                  onChange={onPermChange}
                  searchQuery={searchPerms}
                  readOnly={!canEdit}
                />
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-50" />
                Select a role to manage its permissions
              </div>
            )}
          </Card>
        </div>
      )}

      <RoleDialog open={showRoleDialog} onOpenChange={setShowRoleDialog} mode={roleDialogMode} role={editRole} onSaved={load} rolesApi={rolesApi} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete role?"
        description={`"${deleteTarget?.role_name}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete Role"
        destructive
        loading={saving}
        onConfirm={confirmDelete}
      />

      {/* Audit Log Dialog */}
      <Dialog open={showAudit} onOpenChange={setShowAudit}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>Permission Audit Log</DialogTitle>
          </DialogHeader>
          {auditEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No permission changes recorded.</p>
          ) : (
            <div className="space-y-2">
              {auditEntries.map((a) => (
                <div key={a.id} className="border border-border rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone="primary">{a.action}</Badge>
                    <span className="font-medium">{a.target_label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {a.admin_name} · {formatDateTime(a.created_date)}
                  </div>
                  {a.after && <div className="text-xs text-muted-foreground mt-1">{a.after}</div>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}