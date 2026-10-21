import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { AlertTriangle, Download, Trash2, Loader2, Mail } from 'lucide-react';

import { errMsg } from '@/lib/utils';
export default function DangerZone({ user }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await base44.functions.invoke('manage-account', { mode: 'export' });
      toast({
        title: 'Data export sent',
        description: `Your data has been emailed to ${res?.data?.email || user?.email}.`,
      });
    } catch (e) {
      toast({ title: 'Export failed', description: errMsg(e) || e?.message || 'Please try again.', variant: 'destructive' });
    }
    setExporting(false);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await base44.functions.invoke('manage-account', { mode: 'delete' });
      toast({ title: 'Account deleted', description: 'Your data has been emailed to you and your account has been deactivated.' });
      setDeleteOpen(false);
      setTimeout(() => { base44.auth.logout('/login'); }, 2000);
    } catch (e) {
      toast({ title: 'Deletion failed', description: errMsg(e) || e?.message || 'Please try again.', variant: 'destructive' });
    }
    setDeleting(false);
  };

  return (
    <>
      <Card className="p-6 border-destructive/30">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <h3 className="font-heading font-semibold text-lg">Danger Zone</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Export your data or permanently delete your account. These actions cannot be undone.</p>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border bg-muted/30">
            <div className="min-0">
              <div className="text-sm font-medium flex items-center gap-2"><Mail className="w-4 h-4" /> Export my data</div>
              <div className="text-xs text-muted-foreground mt-0.5">Emails a complete copy of all your data (contacts, logs, posts, clubs, messages, and more) to your registered email address.</div>
            </div>
            <Button variant="outline" onClick={exportData} disabled={exporting}>
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {exporting ? 'Sending…' : 'Export'}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <div className="min-0">
              <div className="text-sm font-medium flex items-center gap-2"><Trash2 className="w-4 h-4 text-destructive" /> Delete my account</div>
              <div className="text-xs text-muted-foreground mt-0.5">Permanently deletes all your data and deactivates your account. Your data is emailed to you first. Clubs you own will also be deleted.</div>
            </div>
            <Button variant="destructive" onClick={() => { setConfirmText(''); setDeleteOpen(true); }}>
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) setConfirmText(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> Delete account?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will permanently delete all your data — contacts, equipment, forum posts, clubs you own, messages, badges, trips, and more. Your data will be emailed to <strong>{user?.email}</strong> before deletion. Your login account will be deactivated.
            </p>
            <p className="text-sm text-muted-foreground">This action <strong>cannot be undone</strong>.</p>
            <div>
              <p className="text-sm font-medium mb-1.5">Type <code className="px-1.5 py-0.5 rounded bg-muted font-mono">DELETE</code> to confirm:</p>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" className="font-mono" autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={deleteAccount} disabled={deleting || confirmText !== 'DELETE'}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deleting ? 'Deleting…' : 'Delete my account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}