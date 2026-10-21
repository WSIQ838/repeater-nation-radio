import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { signalTier, SIGNAL_REPORT_OPTIONS } from '@/lib/signalReport';
import { SUMMIT_RE, cleanRef } from '@/lib/sota';

export default function SotaContactDialog({ open, onClose, activation, onLogged }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ callsign: '', contact_name: '', signal_report: '', notes: '', sota_ref: '' });
  const [saving, setSaving] = useState(false);
  const [locLookup, setLocLookup] = useState(false);
  const [contactLoc, setContactLoc] = useState(null);

  useEffect(() => {
    if (open) {
      setForm({ callsign: '', contact_name: '', signal_report: '', notes: '', sota_ref: '' });
      setContactLoc(null);
    }
  }, [open]);

  // Auto-populate contact name + location from callsign (FCC ULS lookup + geocode)
  useEffect(() => {
    const cs = form.callsign.trim().toUpperCase();
    if (cs.length < 3) { setContactLoc(null); setLocLookup(false); return; }
    setLocLookup(true);
    const timer = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke('lookup-callsign-location', { callsign: cs });
        const data = res?.data || res;
        if (data?.found && (data.lat || data.licensee)) {
          setContactLoc(data);
          setForm((f) => ({
            ...f,
            contact_name: f.contact_name || data.licensee || '',
          }));
        } else {
          setContactLoc(null);
        }
      } catch { setContactLoc(null); }
      setLocLookup(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [form.callsign]);

  const save = async (e) => {
    e.preventDefault();
    if (!form.callsign.trim()) return;
    const theirRef = cleanRef(form.sota_ref);
    if (theirRef && !SUMMIT_RE.test(theirRef)) { toast({ title: 'Summit references look like W7W/KG-001', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('sota-log-contact', {
        activation_id: activation.id,
        callsign: form.callsign.trim().toUpperCase(),
        contact_name: form.contact_name.trim(),
        signal_report: form.signal_report.trim(),
        notes: form.notes.trim(),
        sota_ref: theirRef,
        lat: contactLoc?.lat || null,
        lng: contactLoc?.lng || null,
        city: contactLoc?.city || '',
        state: contactLoc?.state || '',
        county: contactLoc?.county || '',
        zip: contactLoc?.zip || '',
      });
      if ((res?.data || res)?.error) throw new Error((res?.data || res).error);
      toast({ title: 'Contact logged', description: `${form.callsign.trim().toUpperCase()} from ${activation.summit_ref}${theirRef ? ` · S2S ${theirRef}` : ''}` });
      onLogged?.();
      onClose();
    } catch (err) {
      toast({ title: 'Could not log contact', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Contact — {activation.summit_ref}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label>Callsign *</Label>
            <div className="relative">
              <Input
                title="Enter the contact callsign. A lookup will try to fill the operator name and map location."
                value={form.callsign}
                onChange={(e) => setForm({ ...form, callsign: e.target.value })}
                placeholder="K7ABC"
                required
                autoFocus
              />
              {locLookup && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            {contactLoc && (
              <p className="text-xs text-success mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {[contactLoc.city, contactLoc.state].filter(Boolean).join(', ') || 'Location found'} — will be pinned on the map.
              </p>
            )}
          </div>
          <div>
            <Label>Contact name</Label>
            <Input
              title="Enter or edit the contact operator name."
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              placeholder="Operator name (optional)"
            />
          </div>
          <div>
            <Label>Their summit (summit-to-summit)</Label>
            <Input
              title="If the other station was also on a summit, enter its reference."
              value={form.sota_ref}
              onChange={(e) => setForm({ ...form, sota_ref: e.target.value.toUpperCase() })}
              placeholder="Optional, e.g. W7W/KG-002"
              className="font-mono"
            />
          </div>
          <div>
            <Label>Signal report</Label>
            <div className="flex items-center gap-2 mt-1">
              <select
                title="Select the received signal report for this contact."
                value={form.signal_report}
                onChange={(e) => setForm({ ...form, signal_report: e.target.value })}
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm font-mono"
              >
                <option value="">Select signal report…</option>
                {SIGNAL_REPORT_OPTIONS.map((report) => <option key={report} value={report}>{signalTier(report).dot} {report}</option>)}
              </select>
              {form.signal_report && (
                <span className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-bold font-mono ${signalTier(form.signal_report).badge}`}>
                  {form.signal_report}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">5-1 weak · 5-5 fair · 5-9 excellent</p>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              title="Add notes about this contact."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Notes about this contact"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" title="Close without logging this contact." onClick={onClose}>Cancel</Button>
            <Button type="submit" title="Save this contact to the SOTA activation log." disabled={saving || !form.callsign.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Log contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}