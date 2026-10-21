import { useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';

import { errMsg } from '@/lib/utils';

const PRESETS = [5, 10, 25, 50, 100];

export default function DonateDialog({ open, onOpenChange }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const effectiveAmount = customAmount ? Number(customAmount) : amount;
  const valid = effectiveAmount >= 1 && effectiveAmount <= 100000;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke('donation-create-checkout', {
        amount: effectiveAmount,
        donorName: donorName.trim(),
        donorEmail: donorEmail.trim(),
        message: message.trim(),
      });
      const url = res?.data?.redirectUrl;
      if (!url) {
        toast({ title: res?.data?.error || 'Could not start checkout', variant: 'destructive' });
        return;
      }
      window.location.href = url;
    } catch (e) {
      toast({ title: errMsg(e) || 'Something went wrong', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Heart className="w-5 h-5 text-destructive" /> Donate to Repeater Nation</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          Repeater Nation is free for every GMRS and HAM operator, and we intend to keep it that way. Your donation goes straight toward hosting, tools, and development so the platform stays running and ad-free.
        </p>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <div className="grid grid-cols-5 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setAmount(p); setCustomAmount(''); }}
                  className={`h-10 rounded-lg border text-sm font-semibold transition-colors ${!customAmount && amount === p ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-accent'}`}
                >
                  ${p}
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={1}
              max={100000}
              step={1}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="Custom amount"
              className="mt-1.5"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name (optional)</Label>
              <Input value={donorName} onChange={(e) => setDonorName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label>Email (optional)</Label>
              <Input type="email" value={donorEmail} onChange={(e) => setDonorEmail(e.target.value)} placeholder="For a receipt" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Message (optional)</Label>
            <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Say something nice" maxLength={200} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Heart className="w-4 h-4 mr-1.5" />}
            {busy ? 'Redirecting…' : `Donate $${valid ? effectiveAmount : '—'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
