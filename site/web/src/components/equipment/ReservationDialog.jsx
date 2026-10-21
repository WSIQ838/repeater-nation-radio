import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

export default function ReservationDialog({ open, onClose, onDone, equipment, existingReservations = [] }) {
  const [form, setForm] = useState({ start_date: "", end_date: "", purpose: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setForm({ start_date: "", end_date: "", purpose: "", notes: "" });
    setConflict(false);
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!form.start_date || !form.end_date) { setConflict(false); return; }
    const start = new Date(form.start_date).getTime();
    const end = new Date(form.end_date).getTime();
    const hasConflict = existingReservations.some(r => {
      if (r.status !== "active") return false;
      const rs = new Date(r.start_date).getTime();
      const re = new Date(r.end_date).getTime();
      return start < re && end > rs;
    });
    setConflict(hasConflict);
  }, [form.start_date, form.end_date, existingReservations]);

  const submit = async (e) => {
    e.preventDefault();
    if (conflict) {
      toast({ title: "Conflict detected", description: "This overlaps an existing reservation.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const me = await base44.auth.me();
      await base44.entities.EquipmentReservation.create({
        equipment_id: equipment.id, equipment_name: equipment.name, owner_id: me.id,
        start_date: new Date(form.start_date).toISOString(),
        end_date: new Date(form.end_date).toISOString(),
        purpose: form.purpose, notes: form.notes, status: "active"
      });
      await base44.entities.EquipmentHistory.create({
        equipment_id: equipment.id, equipment_name: equipment.name, owner_id: me.id,
        actor_id: me.id, actor_name: me.full_name, action: "reserved",
        notes: `${form.purpose} (${new Date(form.start_date).toLocaleDateString()} - ${new Date(form.end_date).toLocaleDateString()})`
      }).catch(() => {});
      toast({ title: "Reservation created" });
      onDone?.();
      onClose();
    } catch (err) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Reserve: {equipment?.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date/Time *</Label><Input type="datetime-local" value={form.start_date} onChange={e => set("start_date", e.target.value)} required /></div>
            <div><Label>End Date/Time *</Label><Input type="datetime-local" value={form.end_date} onChange={e => set("end_date", e.target.value)} required /></div>
          </div>
          {conflict && <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-2">⚠ This time overlaps an existing reservation. Please choose a different time.</div>}
          <div><Label>Purpose</Label><Input value={form.purpose} onChange={e => set("purpose", e.target.value)} /></div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || conflict}>{saving ? "Saving…" : "Reserve"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}