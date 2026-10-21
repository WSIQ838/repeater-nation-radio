import { Cpu, CheckCircle, ArrowUpRight, AlertTriangle, Wrench, XCircle, ShieldAlert, Search, Archive } from "lucide-react";

export default function EquipmentStats({ items }) {
  const stats = [
    { label: "Total", value: items.length, icon: Cpu, color: "text-primary", bg: "bg-primary/10", tip: "Total number of equipment items in your inventory." },
    { label: "Available", value: items.filter(i => i.status === "Available").length, icon: CheckCircle, color: "text-green-600", bg: "bg-green-100 dark:bg-green-950", tip: "Equipment that is available and not currently checked out or in use." },
    { label: "Checked Out", value: items.filter(i => i.status === "Checked Out").length, icon: ArrowUpRight, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950", tip: "Equipment currently checked out to a borrower." },
    { label: "Overdue", value: items.filter(i => i.expected_return_date && new Date(i.expected_return_date) < new Date() && i.status === "Checked Out").length, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-100 dark:bg-red-950", tip: "Checked-out equipment whose expected return date has passed." },
    { label: "In Shop", value: items.filter(i => i.status === "In Shop").length, icon: Wrench, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950", tip: "Equipment currently at the shop or service location." },
    { label: "Under Repair", value: items.filter(i => i.status === "Under Repair").length, icon: Wrench, color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-950", tip: "Equipment currently undergoing repair or maintenance." },
    { label: "Working", value: items.filter(i => i.status === "Working").length, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950", tip: "Equipment marked as operational and working normally." },
    { label: "Not Working", value: items.filter(i => i.status === "Not Working").length, icon: XCircle, color: "text-red-600", bg: "bg-red-100 dark:bg-red-950", tip: "Equipment marked as not operational." },
    { label: "Damaged", value: items.filter(i => i.status === "Damaged").length, icon: ShieldAlert, color: "text-rose-600", bg: "bg-rose-100 dark:bg-rose-950", tip: "Equipment reported as damaged but not necessarily lost or missing." },
    { label: "Lost/Missing", value: items.filter(i => i.status === "Lost" || i.status === "Missing").length, icon: Search, color: "text-gray-600", bg: "bg-gray-100 dark:bg-gray-800", tip: "Equipment marked as lost or currently missing." },
    { label: "Retired", value: items.filter(i => i.status === "Retired").length, icon: Archive, color: "text-stone-600", bg: "bg-stone-100 dark:bg-stone-800", tip: "Equipment no longer in active service but retained in the inventory." },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border bg-card p-3 flex flex-col items-center text-center gap-1 cursor-help" title={s.tip}>
          <div className={`grid place-items-center w-9 h-9 rounded-lg ${s.bg}`}>
            <s.icon className={`w-5 h-5 ${s.color}`} />
          </div>
          <div className="text-xl font-bold leading-none">{s.value}</div>
          <div className="text-[10px] text-muted-foreground leading-tight">{s.label}</div>
        </div>
      ))}
    </div>
  );
}