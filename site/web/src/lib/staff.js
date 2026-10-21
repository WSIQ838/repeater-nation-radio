import { useEffect, useState } from 'react';
import { Crown, ShieldCheck, Scale, PenSquare, LifeBuoy, BadgeCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// How each staff role looks wherever a staff tag is shown.
export const STAFF_ROLE_META = {
  super_admin: { icon: Crown, label: 'Super Admin', tone: 'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  admin: { icon: ShieldCheck, label: 'Admin', tone: 'border-primary/40 bg-primary/15 text-primary' },
  moderator: { icon: Scale, label: 'Moderator', tone: 'border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  support_staff: { icon: LifeBuoy, label: 'Support', tone: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' },
  editor: { icon: PenSquare, label: 'Editor', tone: 'border-purple-500/40 bg-purple-500/15 text-purple-600 dark:text-purple-400' },
};
const CUSTOM_META = { icon: BadgeCheck, tone: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' };
const NOT_STAFF = new Set(['', 'user', 'member']);

export function staffMeta(role, label) {
  const key = String(role || '').trim().toLowerCase();
  if (NOT_STAFF.has(key)) return null;
  const base = STAFF_ROLE_META[key];
  return base ? { ...base, role: key } : { ...CUSTOM_META, role: key, label: label || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) };
}

const normCall = (c) => String(c || '').trim().toUpperCase();
const CACHE_KEY = 'rn.staffRoster.v1';
const CACHE_MS = 10 * 60 * 1000;

function build(list) {
  const byId = new Map();
  const byCallsign = new Map();
  for (const s of list || []) {
    if (!s?.user_id) continue;
    byId.set(String(s.user_id), s);
    // Most senior first, so a callsign shared by several staff accounts shows the top role.
    if (s.callsign && !byCallsign.has(normCall(s.callsign))) byCallsign.set(normCall(s.callsign), s);
  }
  return { byId, byCallsign };
}

let roster = null;
let rosterPromise = null;

// The staff list, fetched once per page load (and remembered for 10 minutes)
// no matter how many names on the page ask for it.
export function loadStaffRoster() {
  if (roster) return Promise.resolve(roster);
  if (!rosterPromise) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.at < CACHE_MS) {
        roster = build(cached.staff);
        return Promise.resolve(roster);
      }
    } catch { /* storage blocked: fetch below */ }
    rosterPromise = base44.functions.invoke('staff-roster', {})
      .then((res) => {
        const staff = Array.isArray(res?.data?.staff) ? res.data.staff : [];
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), staff })); } catch { /* ignore */ }
        roster = build(staff);
        return roster;
      })
      .catch(() => { rosterPromise = null; return build([]); });
  }
  return rosterPromise;
}

export function useStaffRoster() {
  const [value, setValue] = useState(roster);
  useEffect(() => {
    // Always subscribe: the list may finish loading between this component's
    // first render and this effect, and it must still pick it up.
    let alive = true;
    loadStaffRoster().then((r) => { if (alive) setValue(r); });
    return () => { alive = false; };
  }, []);
  return value || roster;
}

// The staff entry for a person, by account id when known (authoritative), else
// by FCC-verified callsign.
export function findStaff(r, { userId, callsign } = {}) {
  if (!r) return null;
  if (userId) return r.byId.get(String(userId)) || null;
  if (callsign) return r.byCallsign.get(normCall(callsign)) || null;
  return null;
}
