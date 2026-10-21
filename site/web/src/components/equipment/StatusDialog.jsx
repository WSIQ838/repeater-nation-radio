import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const ACTIONS = {
  "not_working": { title: "Mark Not Working", status: "Not Working", action: "marked_not_working", needsReason: true, createRepair: true },
  "working": { title: "Mark Working", status: "Working", action: "marked_working", needsReason: false },
  "damage": { title: "Report Damage", status: "Damaged", action: "damage_reported", needsReason: true },
  "lost": { title: "Report Lost", status: "Lost", action: "lost_reported", needsReason: true },
  "missing": { title: "Report Missing", status: "Missing", action: "missing_reported", needsReason: true },
  "retire": { title: "Retire Equipment", status: "Retired", action: "retired", needsReason: true },
  "dispose": { title: "Dispose Equipment", status: "Disposed", action: "disposed", needsReason: true },
  "maintenance": { title: "Record Maintenance", status: null, action: "maintenance", needsReason: true }
};

export default function StatusDialog({ open, onClose, onDone, equipment, actionType }) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [createRepair, setCreateRepair] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const cfg = ACTIONS[actionType];

  useEffect(() => {
    if (open) { setReason(""); setNotes(""); setCreateRepair(false); }
  }, [open]);

  if (!cfg) return null;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const me = await base44.auth.me();
      const updates = {};
      if (cfg.status) updates.status = cfg.status;
      if (actionType === "not_working") {
        updates.problem_description = reason;
        updates.problem_reported_date = new Date().toISOString();
      }
      if (cfg.status || actionType === "maintenance") {
        await base44.entities.Equipment.update(equipment.id, updates);
      }
      if (createRepair && cfg.createRepair) {
        await base44.entities.EquipmentRepair.create({
          equipment_id: equipment.id, equipment_name: equipment.name, owner_id: me.id,
          date_sent: new Date().toISOString(), reason, problem_description: reason,
          repair_status: "Awaiting Inspection", date_repair_started: new Date().toISOString()
        });
        await base44.entities.Equipment.update(equipment.id, { status: "Under Repair", location: "Shop" });
      }
      await base44.entities.EquipmentHistory.create({
        equipment_id: equipment.id, equipment_name: equipment.name, owner_id: me.id,
        actor_id: me.id, actor_name: me.full_name, action: cfg.action,
        previous_status: equipment.status, new_status: cfg.status || equipment.status,
        notes: reason || notes
      }).catch(() => {});
      toast({ title: cfg.title + " complete" });
      onDone?.();
      onClose();
    } catch (err) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{cfg.title}: {equipment?.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {cfg.needsReason && (
            <div>
              <Label>{actionType === "not_working" ? "Problem Description" : actionType === "retire" || actionType === "dispose" ? "Reason" : "Details"}</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} required />
            </div>
          )}
          <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
          {cfg.createRepair && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createRepair} onChange={e => setCreateRepair(e.target.checked)} className="rounded" />
              Also create a repair record and send to shop
            </label>
          )}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : cfg.title}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}