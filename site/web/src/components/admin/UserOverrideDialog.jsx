import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/admin/parts';
import { Search, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { rolesApi } from '@/lib/adminClient';

const TYPE_LABELS = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', manage: 'Manage', approve: 'Approve' };

export default function UserOverrideDialog({ open, onOpenChange, user, categories, types }) {
  const [overrides, setOverrides] = useState([]);
  const [rolePerms, setRolePerms] = useState({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    setSearch('');
    (async () => {
      try {
        const [ovRes, rolesRes] = await Promise.all([
          rolesApi('overrides:list', { user_id: user.id }),
          rolesApi('roles:list', {}),
        ]);
        const ovMap = {};
        for (const o of (ovRes.overrides || [])) ovMap[o.permission_key] = o;
        setOverrides(ovMap);
        const role = (rolesRes.roles || []).find((r) => r.role_key === (user.role || 'user'));
        let rp = {};
        try { rp = JSON.parse(role?.permissions || '{}'); } catch {}
        setRolePerms(rp);
      } catch (e) { console.error('override dialog load failed', e); }
      setLoading(false);
    })();
  }, [open, user]);

  const toggleCategory = (key) => {
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const setOverride = async (key, allowed) => {
    setBusy(true);
    try {
      await rolesApi('overrides:set', { user_id: user.id, permission_key: key, allowed });
      setOverrides((prev) => ({ ...prev, [key]: { permission_key: key, allowed } }));
    } catch (e) { console.error('set override failed', e); }
    setBusy(false);
  };

  const clearOverride = async (key) => {
    const ov = overrides[key];
    if (!ov?.id) return;
    setBusy(true);
    try {
      await rolesApi('overrides:clear', { id: ov.id });
      setOverrides((prev) => { const n = { ...prev }; delete n[key]; return n; });
    } catch (e) { console.error('clear override failed', e); }
    setBusy(false);
  };

  const q = search.toLowerCase().trim();
  const matchesSearch = (cat) => !q || cat.label.toLowerCase().includes(q) || cat.description.toLowerCase().includes(q);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>Permission Overrides — {user?.full_name || user?.email || ''}</DialogTitle>
          <DialogDescription>
            Role: <span className="font-medium text-foreground">{user?.role || 'user'}</span> — Override individual permissions without changing the role.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading permissions…</p>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search permissions…" className="pl-9" />
            </div>
            <div className="space-y-2">
              {categories.filter(matchesSearch).map((cat) => {
                const isExp = expanded.has(cat.key);
                return (
                  <div key={cat.key} className="border border-border rounded-lg overflow-hidden">
                    <button type="button" onClick={() => toggleCategory(cat.key)} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 text-left">
                      {isExp ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      <span className="font-medium text-sm">{cat.label}</span>
                    </button>
                    {isExp && (
                      <div className="px-3 pb-3 space-y-1.5">
                        {types.map((t) => {
                          const key = `${cat.key}.${t}`;
                          const hasOverride = key in overrides;
                          const roleVal = rolePerms[key] === true;
                          const effectiveVal = hasOverride ? overrides[key].allowed : roleVal;
                          return (
                            <div key={key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border">
                              <span className="text-sm font-medium w-20">{TYPE_LABELS[t]}</span>
                              <div className="flex items-center gap-2 ml-auto">
                                {hasOverride ? (
                                  <>
                                    <Badge tone={effectiveVal ? 'success' : 'destructive'}>{effectiveVal ? 'Override: ON' : 'Override: OFF'}</Badge>
                                    <button
                                      type="button"
                                      onClick={() => clearOverride(key)}
                                      disabled={busy}
                                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                    >
                                      <RotateCcw className="w-3 h-3" /> Revert
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <Badge tone={roleVal ? 'primary' : 'muted'}>Role: {roleVal ? 'ON' : 'OFF'}</Badge>
                                    <button type="button" onClick={() => setOverride(key, true)} disabled={busy} className="text-xs px-2 py-1 rounded border border-border hover:bg-success/10 text-success">Grant</button>
                                    <button type="button" onClick={() => setOverride(key, false)} disabled={busy} className="text-xs px-2 py-1 rounded border border-border hover:bg-destructive/10 text-destructive">Deny</button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}