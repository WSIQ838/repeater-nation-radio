export const EQUIPMENT_TYPES = [
  "GMRS Radio", "Mobile Radio", "Base Station", "Repeater Equipment",
  "Antenna", "Power Supply", "Battery", "Microphone", "Speaker",
  "Programming Cable", "Portable Repeater", "Emergency Equipment", "Other"
];

export const EQUIPMENT_STATUSES = [
  "Available", "Checked Out", "In Use", "Reserved", "In Shop", "Under Repair",
  "Working", "Not Working", "Damaged", "Lost", "Missing", "Retired", "Disposed"
];

export const EQUIPMENT_CONDITIONS = ["New", "Excellent", "Good", "Fair", "Poor", "Broken"];

export const EQUIPMENT_LOCATIONS = [
  "Home", "Vehicle", "Field", "Storage", "Repeater Site", "Shop", "With Another Operator", "Other"
];

export const REPAIR_STATUSES = [
  "Awaiting Inspection", "Diagnosing", "Waiting for Parts", "Being Repaired",
  "Testing", "Repair Complete", "Returned to Service", "Unable to Repair"
];

export const statusColor = {
  "Available": "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  "Checked Out": "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  "In Use": "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
  "Reserved": "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  "In Shop": "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  "Under Repair": "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  "Working": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  "Not Working": "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  "Damaged": "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
  "Lost": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  "Missing": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  "Retired": "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400",
  "Disposed": "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400"
};

export const typeIcon = {
  "GMRS Radio": "Radio",
  "Mobile Radio": "Radio",
  "Base Station": "Radio",
  "Repeater Equipment": "Radio",
  "Antenna": "Radio",
  "Power Supply": "Battery",
  "Battery": "Battery",
  "Microphone": "Mic",
  "Speaker": "Volume2",
  "Programming Cable": "Cable",
  "Portable Repeater": "Radio",
  "Emergency Equipment": "AlertTriangle",
  "Other": "Package"
};

export function isOverdue(item) {
  if (!item?.expected_return_date) return false;
  return new Date(item.expected_return_date) < new Date() && item.status === "Checked Out";
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}