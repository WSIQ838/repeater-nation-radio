import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { REPAIR_STATUSES } from "./constants";

const empty = {
  reason: "", problem_description: "", shop_technician: "",
  repair_status: "Awaiting Inspection", estimated_cost: "", actual_cost: "",
  parts_used: "", work_performed: "", technician_notes: ""
};

export default function RepairDialog({ open, onClose, onDone, equipment, editingRepair }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (editingRepair) {
      setForm({
        reason: editingRepair.reason || "", problem_description: editingRepair.problem_description || "",
        shop_technician: editingRepair.shop_technician || "", repair_status: editingRepair.repair_status || "Awaiting Inspection",
        estimated_cost: editingRepair.estimated_cost || "", actual_cost: editingRepair.actual_cost || "",
        parts_used: editingRepair.parts_used || "", work_performed: editingRepair.work_performed || "",
        technician_notes: editingRepair.technician_notes || ""
      });
    } else {
      setForm(empty);
    }
  }, [editingRepair, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const me = await base44.auth.me();
      const now = new Date().toISOString();
      const payload = {
        ...form,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : undefined,
        actual_cost: form.actual_cost ? Number(form.actual_cost) : undefined
      };
      if (editingRepair?.id) {
        await base44.entities.EquipmentRepair.update(editingRepair.id, payload);
        if (form.repair_status === "Returned to Service" && !editingRepair.return_to_service_date) {
          await base44.entities.EquipmentRepair.update(editingRepair.id, { return_to_service_date: now, date_repair_completed: now });
          await base44.entities.Equipment.update(equipment.id, { status: "Available", location: "Home" });
          await base44.entities.EquipmentHistory.create({
            equipment_id: equipment.id, equipment_name: equipment.name, owner_id: me.id,
            actor_id: me.id, actor_name: me.full_name, action: "repair_completed",
            previous_status: "Under Repair", new_status: "Available", notes: form.work_performed
          }).catch(() => {});
        }
        toast({ title: "Repair updated" });
      } else {
        const repair = await base44.entities.EquipmentRepair.create({
          ...payload, equipment_id: equipment.id, equipment_name: equipment.name,
          owner_id: me.id, date_sent: now, date_repair_started: now
        });
        await base44.entities.Equipment.update(equipment.id, { status: "Under Repair", location: "Shop", location_detail: form.shop_technician || "" });
        await base44.entities.EquipmentHistory.create({
          equipment_id: equipment.id, equipment_name: equipment.name, owner_id: me.id,
          actor_id: me.id, actor_name: me.full_name, action: "repair_started",
          previous_status: equipment.status, new_status: "Under Repair", notes: form.reason
        }).catch(() => {});
        toast({ title: "Sent to shop" });
      }
      onDone?.();
      onClose();
    } catch (err) {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editingRepair ? "Update Repair" : "Send to Shop"}: {equipment?.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Reason</Label><Input value={form.reason} onChange={e => set("reason", e.target.value)} placeholder="Why is it being sent?" /></div>
          <div><Label>Problem Description</Label><Textarea value={form.problem_description} onChange={e => set("problem_description", e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Shop / Technician</Label><Input value={form.shop_technician} onChange={e => set("shop_technician", e.target.value)} /></div>
            <div>
              <Label>Repair Status</Label>
              <select value={form.repair_status} onChange={e => set("repair_status", e.target.value)} className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm">
                {REPAIR_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><Label>Estimated Cost ($)</Label><Input type="number" step="0.01" value={form.estimated_cost} onChange={e => set("estimated_cost", e.target.value)} /></div>
            <div><Label>Actual Cost ($)</Label><Input type="number" step="0.01" value={form.actual_cost} onChange={e => set("actual_cost", e.target.value)} /></div>
          </div>
          <div><Label>Parts Used</Label><Input value={form.parts_used} onChange={e => set("parts_used", e.target.value)} /></div>
          <div><Label>Work Performed</Label><Textarea value={form.work_performed} onChange={e => set("work_performed", e.target.value)} rows={2} /></div>
          <div><Label>Technician Notes</Label><Textarea value={form.technician_notes} onChange={e => set("technician_notes", e.target.value)} rows={2} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}