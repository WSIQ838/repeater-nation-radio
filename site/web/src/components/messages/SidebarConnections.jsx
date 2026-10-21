import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Users, Building2 } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';

// Compact mutual-connections footer for the messaging sidebar.
// Shows mutual friends (click → open that conversation) and shared clubs (link → club page).
export default function SidebarConnections({ userId, onPickFriend }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!userId) { setData(null); return; }
    setData(null);
    base44.functions.invoke('get-common-connections', { user_id: userId })
      .then((r) => setData(r?.data || { commonFriends: [], commonClubs: [] }))
      .catch(() => setData({ commonFriends: [], commonClubs: [] }));
  }, [userId]);

  if (!data) return null;
  const friends = data.commonFriends || [];
  const clubs = data.commonClubs || [];
  if (friends.length === 0 && clubs.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border p-3 space-y-2 bg-muted/30">
      {friends.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            <Users className="w-3 h-3" /> {friends.length} Mutual
          </div>
          <div className="flex flex-wrap gap-1.5">
            {friends.slice(0, 6).map((f) => (
              <button
                key={f.id}
                onClick={() => onPickFriend?.(f.id)}
                title={`Open chat with ${f.name}`}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border border-border hover:border-primary/40 hover:bg-accent/40 transition-colors"
              >
                <span className="grid place-items-center w-5 h-5 rounded-full bg-navy text-white text-[9px] font-bold">
                  {(f.name || '?').slice(0, 2).toUpperCase()}
                </span>
                <span className="text-xs font-medium truncate max-w-[90px]">{f.name || 'Member'}</span><StaffTag userId={f.id} compact />
              </button>
            ))}
          </div>
        </div>
      )}
      {clubs.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            <Building2 className="w-3 h-3" /> {clubs.length} Shared Club{clubs.length > 1 ? 's' : ''}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {clubs.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                to={`/clubs/${c.id}`}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border border-border hover:border-primary/40 hover:bg-accent/40 transition-colors"
              >
                <Building2 className="w-3 h-3 text-primary" />
                <span className="text-xs font-medium truncate max-w-[100px]">{c.name || 'Club'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}