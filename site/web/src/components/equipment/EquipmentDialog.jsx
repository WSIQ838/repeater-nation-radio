import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import FormSelect from "@/components/forms/FormSelect";
import { EQUIPMENT_TYPES, EQUIPMENT_CONDITIONS, EQUIPMENT_LOCATIONS } from "./constants";
import EquipmentImageUploader from "./EquipmentImageUploader";
import TagSelector from "@/components/forms/TagSelector";
import CategorySelector from "@/components/forms/CategorySelector";
import TooltipHint from "@/components/ui/TooltipHint";

const empty = {
  name: "", type: "GMRS Radio", manufacturer: "", model: "", serial_number: "",
  asset_number: "", callsign: "", purchase_date: "", purchase_price: "",
  description: "", condition: "Good", status: "Available", location: "Home",
  location_detail: "", notes: "", warranty_expiry: "", photo_urls: [],
  tag_ids: [], category_id: ""
};

export default function EquipmentDialog({ open, onClose, onSaved, editing }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (editing) {
      setForm({ ...empty, ...editing });
    } else {
      setForm(empty);
    }
  }, [editing, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    try {
      const payload = { ...form, purchase_price: form.purchase_price ? Number(form.purchase_price) : undefined };
      let saved;
      if (editing?.id) {
        saved = await base44.entities.Equipment.update(editing.id, payload);
        toast({ title: "Equipment updated" });
      } else {
        saved = await base44.entities.Equipment.create(payload);
        const me = await base44.auth.me();
        await base44.entities.EquipmentHistory.create({
          equipment_id: saved.id, equipment_name: saved.name,
          owner_id: me.id, actor_id: me.id, actor_name: me.full_name,
          action: "created", new_status: saved.status
        }).catch(() => {});
        toast({ title: "Equipment added" });
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast({ title: "Save failed", description: err?.message || "Please try again.", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit Equipment" : "Add Equipment"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="flex items-center gap-1">Equipment Name * <TooltipHint>The name you will use to identify this item in your equipment list and when selecting a radio for a contact log.</TooltipHint></Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} required />
            </div>
            <div>
              <Label className="flex items-center gap-1">Type <TooltipHint>Choose the equipment category so the item can be filtered and recognized by other tools.</TooltipHint></Label>
              <FormSelect value={form.type} onChange={e => set("type", e.target.value)}>
                {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </FormSelect>
            </div>
            <div>
              <Label className="flex items-center gap-1">Condition <TooltipHint>Record the current physical or operational condition of the equipment.</TooltipHint></Label>
              <FormSelect value={form.condition} onChange={e => set("condition", e.target.value)}>
                {EQUIPMENT_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </FormSelect>
            </div>
            <div><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={e => set("manufacturer", e.target.value)} /></div>
            <div><Label>Model</Label><Input value={form.model} onChange={e => set("model", e.target.value)} /></div>
            <div><Label className="flex items-center gap-1">Serial Number <TooltipHint>Store the manufacturer serial number for identification, service, or inventory purposes.</TooltipHint></Label><Input value={form.serial_number} onChange={e => set("serial_number", e.target.value)} /></div>
            <div><Label>Asset / Inventory Number</Label><Input value={form.asset_number} onChange={e => set("asset_number", e.target.value)} /></div>
            <div><Label className="flex items-center gap-1">Callsign Assigned <TooltipHint>Optionally associate the equipment with the callsign it is normally used under.</TooltipHint></Label><Input value={form.callsign} onChange={e => set("callsign", e.target.value)} placeholder="e.g. WQYX123" /></div>
            <div><Label>Purchase Date</Label><Input type="date" value={form.purchase_date} onChange={e => set("purchase_date", e.target.value)} /></div>
            <div><Label>Purchase Price ($)</Label><Input type="number" step="0.01" value={form.purchase_price} onChange={e => set("purchase_price", e.target.value)} /></div>
            <div><Label>Warranty Expiry</Label><Input type="date" value={form.warranty_expiry} onChange={e => set("warranty_expiry", e.target.value)} /></div>
            <div>
              <Label>Default Location</Label>
              <FormSelect value={form.location} onChange={e => set("location", e.target.value)}>
                {EQUIPMENT_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </FormSelect>
            </div>
            <div><Label>Location Detail</Label><Input value={form.location_detail} onChange={e => set("location_detail", e.target.value)} placeholder="e.g. Garage shelf, Go-bag" /></div>
          </div>

          <div>
            <Label className="flex items-center gap-1">Description <TooltipHint>Add a quick description of the equipment, its purpose, or what makes this item different from similar gear.</TooltipHint></Label>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="flex items-center gap-1">Notes <TooltipHint>Use notes for maintenance details, configuration reminders, accessories, or other information you want to remember.</TooltipHint></Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} />
          </div>

          <div>
            <Label>Photos</Label>
            <EquipmentImageUploader photos={form.photo_urls || []} onChange={urls => set("photo_urls", urls)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <CategorySelector value={form.category_id} onChange={id => set("category_id", id)} />
            </div>
            <div>
              <Label>Tags</Label>
              <TagSelector value={form.tag_ids || []} onChange={ids => set("tag_ids", ids)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}