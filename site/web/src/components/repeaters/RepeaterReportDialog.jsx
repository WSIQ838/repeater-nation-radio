import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Flag } from 'lucide-react';

const REPORT_REASONS = [
  { value: 'Inactive / Offline', label: 'Inactive / Offline', description: 'Repeater is listed as online but is actually offline or not working.' },
  { value: 'Decommissioned / Removed', label: 'Decommissioned / Removed', description: 'Repeater has been removed or decommissioned and no longer exists.' },
  { value: 'Incorrect Information', label: 'Incorrect Information', description: 'Frequency, tone, location, or other details are wrong.' },
  { value: 'Duplicate Entry', label: 'Duplicate Entry', description: 'This is a duplicate of another repeater entry.' },
  { value: 'Spam / Inappropriate', label: 'Spam / Inappropriate', description: 'Spam, offensive, or inappropriate content.' },
  { value: 'Other', label: 'Other', description: 'Other issue not listed above.' },
];

export default function RepeaterReportDialog({ repeater, open, onOpenChange, onReported }) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setReason(''); setDetails(''); };

  const handleClose = (v) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = async () => {
    if (!repeater || !reason) return;
    setBusy(true);
    try {
      const user = await base44.auth.me();
      await base44.entities.AdminReport.create({
        title: `Repeater Report: ${repeater.name}`,
        reason: `${reason}${details ? ` — ${details}` : ''}`,
        category: 'Repeater',
        target_type: 'Repeater',
        target_id: repeater.id,
        target_label: repeater.name,
        status: 'Open',
        priority: 'Medium',
        created_by_name: user?.full_name || user?.email || '',
      });
      toast({ title: 'Report submitted', description: 'An admin will review this repeater.' });
      reset();
      handleClose(false);
      onReported?.();
    } catch (e) {
      toast({ title: e?.message || 'Failed to submit report', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-destructive" />
            Report Repeater
          </DialogTitle>
        </DialogHeader>
        {repeater && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border p-3 bg-muted/50">
              <div className="font-medium text-sm">{repeater.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{repeater.callsign} · {repeater.frequency} MHz</div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-ring"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Select a reason…</option>
                {REPORT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {reason && (
                <p className="text-xs text-muted-foreground">
                  {REPORT_REASONS.find((r) => r.value === reason)?.description}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Additional details (optional)</Label>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                placeholder="Provide any additional context for the admins…"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={!reason || busy}>
            {busy ? 'Submitting…' : 'Submit Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}