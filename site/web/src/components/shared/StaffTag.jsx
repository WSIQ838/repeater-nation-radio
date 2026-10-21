import { useStaffRoster, findStaff, staffMeta } from '@/lib/staff';

// A small "Admin" / "Moderator" / ... tag shown next to a staff member's name.
// Pass the person's account id (userId) when you have it, otherwise their
// callsign; pass `role` when the role is already known. Renders nothing for
// everyone who isn't staff. `compact` shows just the icon (tight spots).
export default function StaffTag({ userId, callsign, role, label, compact = false, className = '' }) {
  const roster = useStaffRoster();
  const entry = role ? { role, label } : findStaff(roster, { userId, callsign });
  const meta = entry ? staffMeta(entry.role, entry.label) : null;
  if (!meta) return null;
  const Icon = meta.icon;
  const name = `${meta.label} (Repeater Nation staff)`;
  if (compact) {
    return (
      <span title={name} aria-label={name} className={`inline-flex items-center justify-center align-middle shrink-0 rounded-full border w-4 h-4 ${meta.tone} ${className}`}>
        <Icon className="w-2.5 h-2.5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span title={name} className={`inline-flex items-center gap-0.5 align-middle shrink-0 whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold leading-4 ${meta.tone} ${className}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
