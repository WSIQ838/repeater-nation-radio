// Formats a last_active ISO timestamp into an online/idle/offline status.
// Returns { status, online, idle, text }.
//   "Online"  = active within the last 15 minutes.
//   "Idle"    = no activity for more than 15 minutes (but recently active).
//   "Offline" = no activity for over 60 minutes.
// `online` is true only for the Online state; `idle` is true only for Idle.
export const IDLE_THRESHOLD_MIN = 15;
export const OFFLINE_THRESHOLD_MIN = 60;

export function formatOnlineStatus(lastActive) {
  if (!lastActive) return { status: 'offline', online: false, idle: false, text: 'Offline' };
  const then = new Date(lastActive).getTime();
  if (isNaN(then)) return { status: 'offline', online: false, idle: false, text: 'Offline' };
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < IDLE_THRESHOLD_MIN) return { status: 'online', online: true, idle: false, text: 'Online' };
  if (diffMin < OFFLINE_THRESHOLD_MIN) return { status: 'idle', online: false, idle: true, text: 'Idle' };

  if (diffMin < 60 * 24) {
    const diffHr = Math.floor(diffMin / 60);
    return { status: 'offline', online: false, idle: false, text: `Last online ${diffHr} hour${diffHr === 1 ? '' : 's'} ago` };
  }

  const diffDay = Math.floor(diffMin / (60 * 24));
  if (diffDay === 1) return { status: 'offline', online: false, idle: false, text: 'Last online yesterday' };
  if (diffDay < 7) return { status: 'offline', online: false, idle: false, text: `Last online ${diffDay} days ago` };

  return {
    status: 'offline',
    online: false,
    idle: false,
    text: `Last online ${new Date(lastActive).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
  };
}