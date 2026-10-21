// Callsign normalization and audit helpers shared across callsign backend functions.
// All callsign comparisons MUST use normalizeCallsign() so that W6ABC, w6abc, and W6AbC
// are treated as the same callsign.

export function normalizeCallsign(callsign: string): string {
  return String(callsign || '').trim().toUpperCase().replace(/\s+/g, '');
}

export async function writeCallsignAudit(base44: any, entry: any): Promise<void> {
  try {
    await base44.asServiceRole.entities.CallsignAuditLog.create({
      callsign_id: entry.callsign_id || '',
      normalized_callsign: entry.normalized_callsign || '',
      actor_user_id: entry.actor_user_id || '',
      actor_name: entry.actor_name || '',
      action: entry.action || '',
      affected_user_id: entry.affected_user_id || '',
      affected_name: entry.affected_name || '',
      primary_user_id: entry.primary_user_id || '',
      reason: entry.reason || '',
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : '',
    });
  } catch (e) {
    console.error('[callsign-audit] write failed:', e?.message || e);
  }
}