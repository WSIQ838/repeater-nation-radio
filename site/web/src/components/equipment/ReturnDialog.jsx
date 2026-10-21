import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { EQUIPMENT_CONDITIONS } from "./constants";
import StaffTag from '@/components/shared/StaffTag';

export default function ReturnDialog({ open, onClose, onDone, equipment, activeCheckout }) {
  const [form, setForm] = useState({ return_condition: "Good", damage_found: "", missing_accessories: "", battery_condition: "", return_notes: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setForm({ return_condition: "Good", damage_found: "", missing_accessories: "", battery_condition: "", return_notes: "" });
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const me = await base44.auth.me();
      const now = new Date().toISOString();
      if (activeCheckout?.id) {
        await base44.entities.EquipmentCheckout.update(activeCheckout.id, {
          actual_return_date: now,
          return_condition: form.return_condition,
          damage_found: form.damage_found,
          missing_accessories: form.missing_accessories,
          battery_condition: form.battery_condition,
          return_notes: form.return_notes,
          status: "returned"
        });
      }
      const newStatus = form.damage_found ? "Damaged" : "Available";
      await base44.entities.Equipment.update(equipment.id, {
        status: newStatus,
        current_borrower_id: "",
        current_borrower_name: "",
        current_borrower_callsign: "",
        checkout_date: "",
        expected_return_date: "",
        checkout_purpose: "",
        checkout_location: "",
        checkout_notes: "",
        checkout_condition: "",
        location: "Home",
        location_detail: ""
      });
      await base44.entities.EquipmentHistory.create({
        equipment_id: equipment.id, equipment_name: equipment.name,
        owner_id: me.id, actor_id: me.id, actor_name: me.full_name,
        action: "returned", previous_status: "Checked Out", new_status: newStatus,
        previous_holder: equipment.current_borrower_name || "",
        notes: form.damage_found || form.return_notes || ""
      }).catch(() => {});
      toast({ title: "Equipment returned" });
      onDone?.();
      onClose();
    } catch (err) {
      toast({ title: "Return failed", description: err?.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Return: {equipment?.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {equipment?.current_borrower_name && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              Borrowed by <span className="font-medium text-foreground">{equipment.current_borrower_name}</span> ({equipment.current_borrower_callsign || "—"})<StaffTag callsign={equipment.current_borrower_callsign} className="ml-1.5" />
            </div>
          )}
          <div>
            <Label>Condition Upon Return</Label>
            <select value={form.return_condition} onChange={e => set("return_condition", e.target.value)} className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm">
              {EQUIPMENT_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><Label>Damage Found</Label><Input value={form.damage_found} onChange={e => set("damage_found", e.target.value)} placeholder="Describe any damage, or leave blank" /></div>
          <div><Label>Missing Accessories</Label><Input value={form.missing_accessories} onChange={e => set("missing_accessories", e.target.value)} placeholder="Any missing items?" /></div>
          <div><Label>Battery Condition</Label><Input value={form.battery_condition} onChange={e => set("battery_condition", e.target.value)} placeholder="e.g. Good, Needs replacement" /></div>
          <div><Label>Return Notes</Label><Textarea value={form.return_notes} onChange={e => set("return_notes", e.target.value)} rows={2} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Processing…" : "Return Equipment"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}