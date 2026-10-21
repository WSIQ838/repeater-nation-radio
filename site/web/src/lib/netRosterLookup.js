import { base44 } from '@/api/base44Client';

// Shared by every "add a station" form in Net Control (live dashboard quick
// actions, saved custom rosters, the roster picker) so typing a callsign
// auto-fills name/location from the member's profile the same way everywhere.
export async function lookupProfileByCallsign(callsign) {
  const cs = (callsign || '').trim().toUpperCase();
  if (!cs) return null;
  try {
    const profiles = await base44.entities.Profile.filter({ callsign: cs }, '-updated_date', 5).catch(() => []);
    const match = (profiles || []).find((p) => (p.callsign || '').toUpperCase() === cs);
    if (!match) return null;
    return {
      name: match.display_name || '',
      location: match.location || [match.city, match.state].filter(Boolean).join(', ').trim(),
    };
  } catch {
    return null;
  }
}
