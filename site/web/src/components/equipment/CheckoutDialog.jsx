import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { EQUIPMENT_CONDITIONS } from "./constants";

export default function CheckoutDialog({ open, onClose, onDone, equipment }) {
  const [form, setForm] = useState({ borrower_name: "", borrower_callsign: "", expected_return_date: "", purpose: "", location: "", notes: "", checkout_condition: "Good" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setForm({ borrower_name: "", borrower_callsign: "", expected_return_date: "", purpose: "", location: "", notes: "", checkout_condition: "Good" });
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.borrower_name) return;
    setSaving(true);
    try {
      const me = await base44.auth.me();
      const now = new Date().toISOString();
      const checkout = await base44.entities.EquipmentCheckout.create({
        equipment_id: equipment.id,
        equipment_name: equipment.name,
        owner_id: me.id,
        borrower_id: "",
        borrower_name: form.borrower_name,
        borrower_callsign: form.borrower_callsign,
        checkout_date: now,
        expected_return_date: form.expected_return_date ? new Date(form.expected_return_date).toISOString() : "",
        purpose: form.purpose,
        location: form.location,
        notes: form.notes,
        checkout_condition: form.checkout_condition,
        status: "active"
      });
      await base44.entities.Equipment.update(equipment.id, {
        status: "Checked Out",
        current_borrower_id: "",
        current_borrower_name: form.borrower_name,
        current_borrower_callsign: form.borrower_callsign,
        checkout_date: now,
        expected_return_date: form.expected_return_date ? new Date(form.expected_return_date).toISOString() : "",
        checkout_purpose: form.purpose,
        checkout_location: form.location,
        checkout_notes: form.notes,
        checkout_condition: form.checkout_condition,
        location: "With Another Operator",
        location_detail: form.borrower_name
      });
      await base44.entities.EquipmentHistory.create({
        equipment_id: equipment.id, equipment_name: equipment.name,
        owner_id: me.id, actor_id: me.id, actor_name: me.full_name,
        action: "checked_out", previous_status: "Available", new_status: "Checked Out",
        new_holder: `${form.borrower_name} (${form.borrower_callsign || "—"})`,
        notes: form.purpose
      }).catch(() => {});
      toast({ title: "Equipment checked out" });
      onDone?.();
      onClose();
    } catch (err) {
      toast({ title: "Checkout failed", description: err?.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Check Out: {equipment?.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Borrower Name *</Label><Input value={form.borrower_name} onChange={e => set("borrower_name", e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Borrower Callsign</Label><Input value={form.borrower_callsign} onChange={e => set("borrower_callsign", e.target.value)} /></div>
            <div><Label>Expected Return Date</Label><Input type="datetime-local" value={form.expected_return_date} onChange={e => set("expected_return_date", e.target.value)} /></div>
          </div>
          <div><Label>Purpose</Label><Input value={form.purpose} onChange={e => set("purpose", e.target.value)} placeholder="e.g. Emergency Communications" /></div>
          <div><Label>Location</Label><Input value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Field event, Vehicle" /></div>
          <div>
            <Label>Condition at Checkout</Label>
            <select value={form.checkout_condition} onChange={e => set("checkout_condition", e.target.value)} className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm">
              {EQUIPMENT_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Checking out…" : "Check Out"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}