// Frontend net host permission helpers — mirrors base44/shared/netHostPermissions.ts.

export const PERMISSION_LABELS = {
  full: 'Full Net Control',
  checkin: 'Check-In Operator',
  view: 'View Only',
};

export const PERMISSION_SHORT = {
  full: 'Full',
  checkin: 'Check-In',
  view: 'View',
};

export const PERMISSION_COLORS = {
  full: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  checkin: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  view: 'bg-muted text-muted-foreground',
};

export function canCheckIn(permission, isPrimary) {
  if (isPrimary) return true;
  return permission === 'full' || permission === 'checkin';
}

export function canManageSession(permission, isPrimary) {
  if (isPrimary) return true;
  return permission === 'full';
}

export function canManageHosts(isPrimary) {
  return isPrimary;
}