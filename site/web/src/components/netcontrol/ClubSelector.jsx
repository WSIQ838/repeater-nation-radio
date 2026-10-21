import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Users, Search, X, Loader2, Globe, Crown, UserCheck } from 'lucide-react';

export default function ClubSelector({ user, value, onChange }) {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [memberClubIds, setMemberClubIds] = useState(new Set());

  const loadClubs = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const [allClubs, myMemberships] = await Promise.all([
        base44.entities.Club.list('-updated_date', 500),
        base44.entities.Membership.filter({ created_by_id: user.id, status: 'Active' }, '-updated_date', 500).catch(() => []),
      ]);
      const mIds = new Set((myMemberships || []).map((m) => m.club_id));
      setMemberClubIds(mIds);
      // Only show clubs the user owns or is an active member of.
      setClubs((allClubs || []).filter((c) => c.created_by_id === user.id || mIds.has(c.id)));
    } catch (e) {
      console.error('Club load error:', e);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadClubs(); }, [loadClubs]);

  const filtered = clubs.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedClub = clubs.find((c) => c.id === value?.club_id);

  return (
    <div className="space-y-2">
      <Label>Associated Club</Label>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading clubs…
        </div>
      ) : clubs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No clubs available. This will be an independent net.
        </div>
      ) : selectedClub ? (
        <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 p-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectedClub.photo_url ? (
              <img src={selectedClub.photo_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="grid place-items-center w-8 h-8 rounded-lg bg-primary/15 text-primary shrink-0">
                <Users className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{selectedClub.name}</div>
              <div className="flex items-center gap-1.5">
                {selectedClub.callsign && (
                  <span className="text-xs text-muted-foreground font-mono">{selectedClub.callsign}</span>
                )}
                {selectedClub.created_by_id === user?.id ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-primary/20 text-primary shrink-0">
                    <Crown className="w-3 h-3" /> Owner
                  </span>
                ) : memberClubIds.has(selectedClub.id) ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-success/20 text-success shrink-0">
                    <UserCheck className="w-3 h-3" /> Member
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onChange({ club_id: '', club_name: '', club_owner_id: '' })}
            title="Remove club association"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clubs by name…"
              className="pl-9"
            />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1 scrollbar-thin">
            <button
              onClick={() => onChange({ club_id: '', club_name: '', club_owner_id: '' })}
              className={`w-full text-left rounded-lg border p-2.5 text-sm transition-colors ${
                !value?.club_id ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium">No Club / Independent Net</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 ml-6">
                This net is not associated with any club.
              </p>
            </button>
            {filtered.map((c) => {
              const isMember = memberClubIds.has(c.id);
              const isOwner = c.created_by_id === user?.id;
              return (
                <button
                  key={c.id}
                  onClick={() =>
                    onChange({ club_id: c.id, club_name: c.name, club_owner_id: c.created_by_id })
                  }
                  className={`w-full text-left rounded-lg border p-2.5 text-sm transition-colors ${
                    value?.club_id === c.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {c.photo_url ? (
                      <img src={c.photo_url} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
                    ) : (
                      <div className="grid place-items-center w-6 h-6 rounded-md bg-primary/15 text-primary shrink-0">
                        <Users className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <span className="font-medium truncate">{c.name}</span>
                    {c.callsign && (
                      <span className="text-xs text-muted-foreground font-mono shrink-0">{c.callsign}</span>
                    )}
                    {isOwner ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-primary/20 text-primary shrink-0">
                        <Crown className="w-3 h-3" /> Owner
                      </span>
                    ) : isMember ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-success/20 text-success shrink-0">
                        <UserCheck className="w-3 h-3" /> Member
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && search && (
              <p className="text-xs text-muted-foreground py-2 text-center">No clubs match "{search}".</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}