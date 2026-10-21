import { formatDateTime } from "./constants";
import Linkify from '@/components/shared/Linkify';

const actionLabels = {
  created: "Equipment Created",
  edited: "Equipment Edited",
  checked_out: "Checked Out",
  returned: "Returned",
  status_changed: "Status Changed",
  location_changed: "Location Changed",
  repair_started: "Sent to Shop",
  repair_completed: "Repair Completed",
  maintenance: "Maintenance Recorded",
  damage_reported: "Damage Reported",
  lost_reported: "Reported Lost",
  missing_reported: "Reported Missing",
  retired: "Retired",
  disposed: "Disposed",
  reserved: "Reserved",
  reservation_cancelled: "Reservation Cancelled",
  marked_working: "Marked Working",
  marked_not_working: "Marked Not Working",
  photo_added: "Photo Added",
  notes_updated: "Notes Updated"
};

const actionColors = {
  created: "text-green-600",
  checked_out: "text-blue-600",
  returned: "text-indigo-600",
  repair_started: "text-amber-600",
  repair_completed: "text-emerald-600",
  damage_reported: "text-rose-600",
  lost_reported: "text-gray-600",
  retired: "text-stone-600",
  disposed: "text-stone-600",
  marked_not_working: "text-red-600",
  marked_working: "text-emerald-600"
};

export default function EquipmentHistoryList({ history }) {
  if (!history?.length) {
    return <div className="text-sm text-muted-foreground py-4">No history recorded yet.</div>;
  }

  return (
    <div className="space-y-3">
      {history.map((h, idx) => (
        <div key={h.id || idx} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-2.5 h-2.5 rounded-full ${actionColors[h.action] ? "bg-current " + actionColors[h.action] : "bg-muted-foreground"}`} />
            {idx < history.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
          </div>
          <div className="pb-4 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm font-medium ${actionColors[h.action] || ""}`}>
                {actionLabels[h.action] || h.action}
              </span>
              <span className="text-xs text-muted-foreground">{formatDateTime(h.created_date)}</span>
            </div>
            {h.actor_name && <div className="text-xs text-muted-foreground">by {h.actor_name}</div>}
            {(h.previous_status || h.new_status) && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {h.previous_status && <span>{h.previous_status}</span>}
                {h.previous_status && h.new_status && <span> → </span>}
                {h.new_status && <span className="font-medium">{h.new_status}</span>}
              </div>
            )}
            {(h.previous_holder || h.new_holder) && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {h.previous_holder && <span>{h.previous_holder}</span>}
                {h.previous_holder && h.new_holder && <span> → </span>}
                {h.new_holder && <span className="font-medium">{h.new_holder}</span>}
              </div>
            )}
            {h.notes && <div className="text-xs text-muted-foreground mt-1"><Linkify text={h.notes} /></div>}
          </div>
        </div>
      ))}
    </div>
  );
}