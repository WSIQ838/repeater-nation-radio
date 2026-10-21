import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Users, Building2 } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';

export default function CommonConnections({ userId }) {
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
    <Card className="p-6">
      <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" /> Mutual Connections
      </h2>
      {friends.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {friends.length} Mutual Friend{friends.length > 1 ? 's' : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            {friends.map((f) => (
              <Link
                key={f.id}
                to={`/members/${f.id}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-input hover:border-primary/40 hover:bg-accent/40 transition-colors"
              >
                <span className="grid place-items-center w-6 h-6 rounded-full bg-navy text-white text-[10px] font-bold">
                  {(f.name || '?').slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm font-medium">{f.name || 'Member'}</span><StaffTag userId={f.id} />
              </Link>
            ))}
          </div>
        </div>
      )}
      {clubs.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {clubs.length} Shared Club{clubs.length > 1 ? 's' : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            {clubs.map((c) => (
              <Link
                key={c.id}
                to={`/clubs/${c.id}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-input hover:border-primary/40 hover:bg-accent/40 transition-colors"
              >
                <Building2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{c.name || 'Club'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}