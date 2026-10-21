import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft, Pencil, ArrowUpRight, ArrowDownLeft, CheckCircle, XCircle,
  Wrench, ShieldAlert, Search, Archive, Trash2, MapPin, User, Calendar,
  DollarSign, AlertTriangle, Package, Clock
} from "lucide-react";
import { statusColor, isOverdue, formatDate, formatDateTime, EQUIPMENT_LOCATIONS } from "@/components/equipment/constants";
import EquipmentDialog from "@/components/equipment/EquipmentDialog";
import CheckoutDialog from "@/components/equipment/CheckoutDialog";
import ReturnDialog from "@/components/equipment/ReturnDialog";
import RepairDialog from "@/components/equipment/RepairDialog";
import ReservationDialog from "@/components/equipment/ReservationDialog";
import StatusDialog from "@/components/equipment/StatusDialog";
import EquipmentHistoryList from "@/components/equipment/EquipmentHistoryList";
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

export default function EquipmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [item, setItem] = useState(null);
  const [checkouts, setCheckouts] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [user, setUser] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [statusAction, setStatusAction] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      const eq = await base44.entities.Equipment.get(id).catch(() => null);
      if (!eq) { setLoading(false); return; }
      setItem(eq);
      setIsOwner(u?.id === eq.created_by_id);
      const [co, rp, rv, hs] = await Promise.all([
        base44.entities.EquipmentCheckout.filter({ equipment_id: id }, "-checkout_date", 50).catch(() => []),
        base44.entities.EquipmentRepair.filter({ equipment_id: id }, "-date_sent", 50).catch(() => []),
        base44.entities.EquipmentReservation.filter({ equipment_id: id, status: "active" }, "-start_date", 50).catch(() => []),
        base44.entities.EquipmentHistory.filter({ equipment_id: id }, "-created_date", 200).catch(() => [])
      ]);
      setCheckouts(co || []);
      setRepairs(rp || []);
      setReservations(rv || []);
      setHistory(hs || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const activeCheckout = checkouts.find(c => c.status === "active" || c.status === "overdue");
  const overdue = isOverdue(item);

  const deleteItem = async () => {
    if (!confirm("Delete this equipment item? This cannot be undone.")) return;
    try {
      await base44.entities.Equipment.delete(id);
      toast({ title: "Equipment deleted" });
      navigate("/equipment");
    } catch (err) {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    }
  };

  if (loading) return <div className="p-8 max-w-5xl mx-auto"><div className="h-64 rounded-xl bg-muted animate-pulse" /></div>;
  if (!item) return <div className="p-8 text-center text-muted-foreground">Equipment not found.</div>;

  const actions = isOwner ? [
    { label: "Edit", icon: Pencil, onClick: () => setDialog("edit"), show: true },
    { label: "Check Out", icon: ArrowUpRight, onClick: () => setDialog("checkout"), show: item.status !== "Checked Out" },
    { label: "Return", icon: ArrowDownLeft, onClick: () => setDialog("return"), show: item.status === "Checked Out" },
    { label: "Mark Working", icon: CheckCircle, onClick: () => setStatusAction("working"), show: item.status !== "Working" },
    { label: "Mark Not Working", icon: XCircle, onClick: () => setStatusAction("not_working"), show: item.status !== "Not Working" },
    { label: "Send to Shop", icon: Wrench, onClick: () => setDialog("repair"), show: item.status !== "Under Repair" },
    { label: "Maintenance", icon: Wrench, onClick: () => setStatusAction("maintenance"), show: true },
    { label: "Report Damage", icon: ShieldAlert, onClick: () => setStatusAction("damage"), show: item.status !== "Damaged" },
    { label: "Report Lost", icon: Search, onClick: () => setStatusAction("lost"), show: item.status !== "Lost" },
    { label: "Retire", icon: Archive, onClick: () => setStatusAction("retire"), show: item.status !== "Retired" },
    { label: "Reserve", icon: Calendar, onClick: () => setDialog("reservation"), show: true },
    { label: "Delete", icon: Trash2, onClick: deleteItem, show: true, danger: true },
  ].filter(a => a.show) : [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <Link to="/equipment" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Equipment
      </Link>

      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid place-items-center w-16 h-16 rounded-2xl bg-primary/10 shrink-0">
            <Package className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold">{item.name}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[item.status] || "bg-muted"}`}>{item.status}</span>
              <span className="text-sm text-muted-foreground">{item.type}</span>
              {item.condition && <span className="text-sm text-muted-foreground">· {item.condition}</span>}
              {overdue && <span className="text-xs font-bold text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> OVERDUE</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {isOwner && (
        <div className="flex flex-wrap gap-2">
          {actions.map(a => (
            <Button key={a.label} variant={a.danger ? "destructive" : "outline"} size="sm" onClick={a.onClick}>
              <a.icon className="w-4 h-4 mr-1.5" /> {a.label}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Current holder */}
          {item.status === "Checked Out" && item.current_borrower_name && (
            <Card className={`p-5 ${overdue ? "border-red-400 dark:border-red-800" : "border-blue-300 dark:border-blue-800"}`}>
              <div className="flex items-center gap-2 mb-3">
                <User className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold">Current Holder</h3>
                {overdue && <span className="text-xs font-bold text-red-500 ml-auto">⚠ OVERDUE</span>}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{item.current_borrower_name}</span></div>
                <div><span className="text-muted-foreground">Callsign:</span> <span className="font-medium">{item.current_borrower_callsign || "—"}</span><StaffTag callsign={item.current_borrower_callsign} className="ml-1.5" /></div>
                <div><span className="text-muted-foreground">Checked Out:</span> <span className="font-medium">{formatDateTime(item.checkout_date)}</span></div>
                <div><span className="text-muted-foreground">Expected Return:</span> <span className={`font-medium ${overdue ? "text-red-500" : ""}`}>{formatDateTime(item.expected_return_date)}</span></div>
                {item.checkout_purpose && <div className="col-span-2"><span className="text-muted-foreground">Purpose:</span> {item.checkout_purpose}</div>}
                {item.checkout_location && <div className="col-span-2"><span className="text-muted-foreground">Location:</span> {item.checkout_location}</div>}
              </div>
            </Card>
          )}

          {/* Equipment info */}
          <Card className="p-5">
            <h3 className="font-semibold mb-3">Equipment Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Manufacturer" value={item.manufacturer} />
              <InfoRow label="Model" value={item.model} />
              <InfoRow label="Serial Number" value={item.serial_number} mono />
              <InfoRow label="Asset Number" value={item.asset_number} mono />
              <InfoRow label="Callsign" value={item.callsign} />
              <InfoRow label="Condition" value={item.condition} />
              <InfoRow label="Purchase Date" value={formatDate(item.purchase_date)} />
              <InfoRow label="Purchase Price" value={item.purchase_price ? `$${Number(item.purchase_price).toFixed(2)}` : "—"} icon={DollarSign} />
              <InfoRow label="Warranty Expiry" value={formatDate(item.warranty_expiry)} />
              <InfoRow label="Date Added" value={formatDate(item.created_date)} />
            </div>
            {item.description && <div className="mt-4 pt-4 border-t"><span className="text-xs font-medium text-muted-foreground">Description</span><p className="text-sm mt-1">{item.description}</p></div>}
          </Card>

          {/* Location */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Current Location</h3>
            </div>
            <div className="text-sm">
              <div className="font-medium">{item.location}</div>
              {item.location_detail && <div className="text-muted-foreground mt-0.5">{item.location_detail}</div>}
            </div>
            {isOwner && (
              <div className="mt-3 flex gap-2">
                <select
                  value={item.location}
                  onChange={async (e) => {
                    const prev = item.location;
                    await base44.entities.Equipment.update(id, { location: e.target.value });
                    const me = user;
                    await base44.entities.EquipmentHistory.create({
                      equipment_id: id, equipment_name: item.name, owner_id: me.id,
                      actor_id: me.id, actor_name: me.full_name, action: "location_changed",
                      notes: `${prev} → ${e.target.value}`
                    }).catch(() => {});
                    load();
                  }}
                  className="h-8 px-2 rounded-md border border-input bg-background text-xs"
                >
                  {EQUIPMENT_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
          </Card>

          {/* Photos */}
          {item.photo_urls?.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Photos</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {item.photo_urls.map((url, idx) => (
                  <div key={idx} className="aspect-square rounded-lg overflow-hidden border">
                    <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Checkout History */}
          {checkouts.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Checkout History</h3>
              <div className="space-y-3">
                {checkouts.map(co => (
                  <div key={co.id} className="flex items-start gap-3 text-sm border-b last:border-0 pb-3 last:pb-0">
                    <ArrowUpRight className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">{co.borrower_name} ({co.borrower_callsign || "—"})</div>
                      <div className="text-xs text-muted-foreground">
                        Out: {formatDateTime(co.checkout_date)} · Due: {formatDateTime(co.expected_return_date)}
                        {co.actual_return_date && ` · Returned: ${formatDateTime(co.actual_return_date)}`}
                      </div>
                      {co.purpose && <div className="text-xs text-muted-foreground mt-0.5">Purpose: {co.purpose}</div>}
                      {co.damage_found && <div className="text-xs text-red-500 mt-0.5">Damage: {co.damage_found}</div>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${co.status === "returned" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"}`}>
                      {co.status}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Repair History */}
          {repairs.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Repair History</h3>
              <div className="space-y-3">
                {repairs.map(rp => (
                  <div key={rp.id} className="flex items-start gap-3 text-sm border-b last:border-0 pb-3 last:pb-0">
                    <Wrench className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">{rp.reason || "Repair"}</div>
                      <div className="text-xs text-muted-foreground">
                        Sent: {formatDateTime(rp.date_sent)} · {rp.shop_technician || "No shop listed"}
                      </div>
                      {rp.problem_description && <div className="text-xs text-muted-foreground mt-0.5">Problem: {rp.problem_description}</div>}
                      {rp.work_performed && <div className="text-xs text-muted-foreground mt-0.5">Work: {rp.work_performed}</div>}
                      {(rp.estimated_cost || rp.actual_cost) && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Cost: {rp.actual_cost ? `$${rp.actual_cost}` : `est. $${rp.estimated_cost}`}
                        </div>
                      )}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">{rp.repair_status}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Reservations */}
          {reservations.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Active Reservations</h3>
              <div className="space-y-3">
                {reservations.map(rv => (
                  <div key={rv.id} className="flex items-start gap-3 text-sm border-b last:border-0 pb-3 last:pb-0">
                    <Calendar className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">{formatDateTime(rv.start_date)} → {formatDateTime(rv.end_date)}</div>
                      {rv.purpose && <div className="text-xs text-muted-foreground mt-0.5">{rv.purpose}</div>}
                      {rv.notes && <div className="text-xs text-muted-foreground mt-0.5"><Linkify text={rv.notes} /></div>}
                    </div>
                    {isOwner && (
                      <Button variant="ghost" size="sm" onClick={async () => {
                        await base44.entities.EquipmentReservation.update(rv.id, { status: "cancelled" });
                        load();
                      }}>Cancel</Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Notes */}
          {item.notes && (
            <Card className="p-5">
              <h3 className="font-semibold mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap"><Linkify text={item.notes} /></p>
            </Card>
          )}
        </div>

        {/* Right column: history */}
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Equipment History</h3>
            </div>
            <EquipmentHistoryList history={history} />
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <EquipmentDialog open={dialog === "edit"} onClose={() => setDialog(null)} onSaved={load} editing={item} />
      <CheckoutDialog open={dialog === "checkout"} onClose={() => setDialog(null)} onDone={load} equipment={item} />
      <ReturnDialog open={dialog === "return"} onClose={() => setDialog(null)} onDone={load} equipment={item} activeCheckout={activeCheckout} />
      <RepairDialog open={dialog === "repair"} onClose={() => setDialog(null)} onDone={load} equipment={item} />
      <ReservationDialog open={dialog === "reservation"} onClose={() => setDialog(null)} onDone={load} equipment={item} existingReservations={reservations} />
      <StatusDialog open={!!statusAction} onClose={() => setStatusAction(null)} onDone={load} equipment={item} actionType={statusAction} />
    </div>
  );
}

function InfoRow({ label, value, mono, icon: Icon }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </div>
      <div className={`font-medium ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</div>
    </div>
  );
}