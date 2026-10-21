// Shared net host permission helpers — used by backend functions to enforce
// collaborative Net Control access levels.

export type HostPermission = 'full' | 'checkin' | 'view';

// A host can check stations in/out, add guests, and record notes if they have
// 'full' or 'checkin' permission, or are the primary operator.
export function canCheckIn(permission: HostPermission | null, isPrimary: boolean): boolean {
  if (isPrimary) return true;
  return permission === 'full' || permission === 'checkin';
}

// A host can manage session settings (start/end net, edit script, change status)
// if they have 'full' permission or are the primary operator.
export function canManageSession(permission: HostPermission | null, isPrimary: boolean): boolean {
  if (isPrimary) return true;
  return permission === 'full';
}

// Only the primary operator can manage hosts, share, transfer control, and remove access.
export function canManageHosts(isPrimary: boolean): boolean {
  return isPrimary;
}

// Resolve the caller's host info for a session.
// Returns { isPrimary, permission, host } or null if not authorized.
export async function resolveHostAccess(base44: any, sessionId: string, userId: string): Promise<{
  isPrimary: boolean;
  permission: HostPermission | null;
  host: any | null;
} | null> {
  const session = await base44.asServiceRole.entities.NetControlSession.get(sessionId).catch(() => null);
  if (!session) return null;

  const isPrimary = session.primary_user_id === userId || session.created_by_id === userId;
  if (isPrimary) return { isPrimary: true, permission: 'full' as HostPermission, host: null };

  const hosts = await base44.asServiceRole.entities.NetControlHost.filter(
    { session_id: sessionId, user_id: userId, status: 'accepted' },
    '-updated_date', 5
  );
  const host = (hosts || [])[0];
  if (!host) return null;

  return { isPrimary: false, permission: host.permission_level as HostPermission, host };
}