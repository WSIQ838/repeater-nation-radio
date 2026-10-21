import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Search, UserPlus, Trash2, Loader2 } from 'lucide-react';

// CoHostPicker — used in CreateNetDialog to collect co-host selections before
// the session exists. Returns selected co-hosts via onChange.
export default function CoHostPicker({ coHosts, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const doSearch = useCallback(async (q) => {
    setQuery(q);
    if (q.trim().length < 1) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await base44.functions.invoke('manage-net-hosts', { action: 'search_users', query: q });
      setResults(res.data?.users || []);
    } catch { setResults([]); }
    setSearching(false);
  }, []);

  const addCoHost = (user) => {
    if (coHosts.some((h) => h.user_id === user.user_id)) return;
    onChange([...coHosts, {
      user_id: user.user_id,
      user_name: user.display_name || '',
      user_callsign: user.callsign || '',
      permission_level: 'checkin',
    }]);
    setQuery('');
    setResults([]);
  };

  const removeCoHost = (userId) => {
    onChange(coHosts.filter((h) => h.user_id !== userId));
  };

  const setPermission = (userId, level) => {
    onChange(coHosts.map((h) => h.user_id === userId ? { ...h, permission_level: level } : h));
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="flex items-center gap-2"><UserPlus className="w-4 h-4" />Net Control Hosts</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Club Admins and Officers are added automatically when a club is selected. You can remove them or add other Repeater Nation members as co-hosts. You remain the Primary Net Control unless you transfer it.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by callsign or name…"
          value={query}
          onChange={(e) => doSearch(e.target.value)}
          className="pl-9"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Search results */}
      {results.length > 0 && (
        <Card className="p-2 divide-y divide-border">
          {results.map((u) => (
            <button
              key={u.user_id}
              onClick={() => addCoHost(u)}
              className="w-full flex items-center gap-3 p-2 hover:bg-accent/50 rounded-lg text-left"
            >
              <div className="flex-1">
                <span className="font-medium text-sm">{u.callsign || u.display_name || 'Unknown'}</span>
                {u.callsign && u.display_name && <span className="text-muted-foreground text-sm ml-2">{u.display_name}</span>}
              </div>
              <UserPlus className="w-4 h-4 text-primary" />
            </button>
          ))}
        </Card>
      )}
      {!searching && query.trim().length >= 1 && results.length === 0 && (
        <Card className="p-4 text-center text-sm text-muted-foreground">
          No members found for "{query}". Try searching by callsign or name.
        </Card>
      )}

      {/* Selected co-hosts */}
      {coHosts.length > 0 ? (
        <div className="space-y-2">
          {coHosts.map((h) => (
            <Card key={h.user_id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{h.user_callsign || h.user_name || 'Unknown'}</span>
                  {h.user_callsign && h.user_name && <span className="text-muted-foreground text-xs">{h.user_name}</span>}
                  {h.club_role && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{h.club_role}</span>}
                </div>
              </div>
              <Select value={h.permission_level} onValueChange={(v) => setPermission(h.user_id, v)}>
                <SelectTrigger className="w-[130px] sm:w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Net Control</SelectItem>
                  <SelectItem value="checkin">Check-In Operator</SelectItem>
                  <SelectItem value="view">View Only</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" onClick={() => removeCoHost(h.user_id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-4 text-center text-sm text-muted-foreground">
          No co-hosts added. You'll be the sole Net Control operator.
        </Card>
      )}
    </div>
  );
}