import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Cpu, AlertTriangle, MapPin, User } from "lucide-react";
import { statusColor, isOverdue, formatDate } from "./constants";
import StaffTag from '@/components/shared/StaffTag';

export default function EquipmentCard({ item }) {
  const navigate = useNavigate();
  const overdue = isOverdue(item);

  return (
    <Card
      className="p-4 hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden"
      onClick={() => navigate(`/equipment/${item.id}`)}
    >
      {overdue && (
        <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
          OVERDUE
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="grid place-items-center w-12 h-12 rounded-xl bg-primary/10 shrink-0">
          <Cpu className="w-6 h-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{item.name}</div>
          <div className="text-xs text-muted-foreground">{item.type}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusColor[item.status] || "bg-muted text-muted-foreground"}`}>
          {item.status}
        </span>
        {item.condition && (
          <span className="text-[11px] text-muted-foreground">· {item.condition}</span>
        )}
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        {item.manufacturer && <div>{item.manufacturer} {item.model}</div>}
        {item.serial_number && <div className="font-mono">SN: {item.serial_number}</div>}
        {item.location && (
          <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {item.location}{item.location_detail ? ` · ${item.location_detail}` : ""}</div>
        )}
        {item.current_borrower_name && (
          <div className="flex items-center gap-1"><User className="w-3 h-3" /> {item.current_borrower_name} ({item.current_borrower_callsign || "—"})<StaffTag callsign={item.current_borrower_callsign} compact /></div>
        )}
        {item.expected_return_date && item.status === "Checked Out" && (
          <div className={`flex items-center gap-1 ${overdue ? "text-red-500 font-medium" : ""}`}>
            <AlertTriangle className="w-3 h-3" /> Due: {formatDate(item.expected_return_date)}
          </div>
        )}
      </div>
    </Card>
  );
}