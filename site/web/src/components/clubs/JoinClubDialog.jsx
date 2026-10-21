import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

export default function JoinClubDialog({ open, onClose, club, user, onJoined }) {
  const [loading, setLoading] = useState(false);
  const fee = Number(club?.membership_fee || 0);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  // Admins always join free, even for a normally-paid club -- join-club's
  // backend enforces this too, this just matches the UI to what will happen.
  const isFree = fee === 0 || isAdmin;

  const submit = async () => {
    if (!user?.callsign) {
      toast({ title: 'Callsign required', description: 'Add your GMRS callsign in your profile before joining.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      // Check existing membership
      const existing = await base44.entities.Membership.filter({ club_id: club.id, member_callsign: user.callsign });
      if (existing && existing.length > 0) {
        toast({ title: 'Already a member', description: `You've already joined ${club.name}.` });
        onJoined?.();
        onClose();
        return;
      }
      if (isFree) {
        // Free club: join via backend function (creates membership + increments count as service role).
        await base44.functions.invoke('join-club', { clubId: club.id });
        onJoined?.();
        onClose();
        toast({ title: 'Joined!', description: `Welcome to ${club.name}.` });
      } else {
        if (!club.stripe_account_id || !club.stripe_charges_enabled) {
          toast({ title: 'Payments not ready', description: 'This club has not finished setting up payments yet. Please ask the club organizer.', variant: 'destructive' });
          return;
        }
        const res = await base44.functions.invoke('stripe-create-checkout', { clubId: club.id });
        const redirectUrl = res?.data?.redirectUrl;
        if (!redirectUrl) {
          toast({ title: 'Checkout error', description: res?.data?.error || 'Could not start payment. Please try again.', variant: 'destructive' });
          return;
        }
        toast({ title: 'Redirecting to checkout…', description: 'Complete payment to join the club.' });
        window.location.href = redirectUrl;
      }
    } catch (err) {
      toast({ title: 'Could not join', description: err.message || 'Something went wrong.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!club) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join {club.name}</DialogTitle>
          <DialogDescription>{club.description || 'Confirm your membership below.'}</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Membership fee</span>
            <span className="text-lg font-semibold">
              {fee === 0 ? 'Free' : isAdmin ? <>Free <span className="text-xs font-normal text-muted-foreground">(waived for admins)</span></> : `$${fee.toFixed(2)}`}
            </span>
          </div>
          {!isFree && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CreditCard className="w-3.5 h-3.5" /> Billed {String(club.fee_period || 'One-time').toLowerCase()}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm pt-1">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span>Joining as <span className="font-mono font-medium">{user?.callsign || '—'}</span></span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Joining...</> : isFree ? 'Join for free' : `Pay $${fee.toFixed(2)} & join`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}