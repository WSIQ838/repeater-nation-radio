import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, CheckCircle2, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

export default function StripeConnectButton({ club, onChanged }) {
  const [loading, setLoading] = useState(false);
  const hasAccount = !!club?.stripe_account_id;
  const enabled = !!club?.stripe_charges_enabled;
  const connected = hasAccount && enabled;
  const pending = hasAccount && !enabled;

  const startOnboard = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('stripe-connect-onboard', { clubId: club.id });
      const url = res?.data?.url;
      if (!url) {
        toast({ title: 'Could not start', description: res?.data?.error || 'Please try again.', variant: 'destructive' });
        return;
      }
      window.location.href = url;
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'Something went wrong.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (connected) {
    return (
      <div className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
        <CheckCircle2 className="w-4 h-4" /> Payments active
      </div>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={startOnboard} disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : pending ? <AlertTriangle className="w-4 h-4 mr-1.5" /> : <CreditCard className="w-4 h-4 mr-1.5" />}
      {pending ? 'Finish Stripe setup' : 'Connect Stripe to receive payments'}
    </Button>
  );
}