import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

import { errMsg } from '@/lib/utils';
export default function RoleDialog({ open, onOpenChange, mode, role, onSaved, rolesApi }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (mode === 'edit' && role) {
      setName(role.role_name || '');
      setDescription(role.description || '');
    } else if (mode === 'duplicate' && role) {
      setName('');
      setDescription(role.description || '');
    } else {
      setName('');
      setDescription('');
    }
  }, [open, mode, role]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Role name is required.'); return; }
    setSaving(true);
    try {
      if (mode === 'edit' && role) {
        await rolesApi('roles:update', { id: role.id, role_name: name.trim(), description: description.trim() });
      } else if (mode === 'duplicate' && role) {
        await rolesApi('roles:duplicate', { id: role.id, new_name: name.trim() });
      } else {
        await rolesApi('roles:create', { role_name: name.trim(), description: description.trim() });
      }
      onSaved?.();
      onOpenChange?.(false);
    } catch (err) {
      setError(errMsg(err) || err?.message || 'Could not save role.');
    }
    setSaving(false);
  };

  const title = mode === 'edit' ? 'Edit Role' : mode === 'duplicate' ? 'Duplicate Role' : 'Create New Role';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? 'Update the role name and description.' : mode === 'duplicate' ? `Create a new role based on "${role?.role_name || ''}".` : 'Create a custom role with its own permission set.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role-name">Role Name</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Event Coordinator" autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-desc">Description</Label>
            <Textarea id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What can this role do?" />
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange?.(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Create Role'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}