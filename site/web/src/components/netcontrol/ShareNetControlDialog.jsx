import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Search, UserPlus, Loader2, Check } from 'lucide-react';

import { errMsg } from '@/lib/utils';
// ShareNetControlDialog — lets the primary operator share a live session with
// another Repeater Nation user by inviting them as a co-host with a permission level.
export default function ShareNetControlDialog({ open, onClose, session, onShared }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [permission, setPermission] = useState('checkin');
  const [sharing, setSharing] = useState(false);

  const doSearch = useCallback(async (q) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await base44.functions.invoke('manage-net-hosts', { action: 'search_users', query: q });
      setResults(res.data?.users || []);
    } catch { setResults([]); }
    setSearching(false);
  }, []);

  const handleShare = async () => {
    if (!selected) return;
    setSharing(true);
    try {
      await base44.functions.invoke('manage-net-hosts', {
        action: 'invite',
        session_id: session.id,
        user_id: selected.user_id,
        user_name: selected.display_name || '',
        user_callsign: selected.callsign || '',
        permission_level: permission,
      });
      onShared?.();
      handleClose();
    } catch (e) {
      alert(errMsg(e) || 'Failed to share');
    }
    setSharing(false);
  };

  const handleClose = () => {
    setSelected(null);
    setQuery('');
    setResults([]);
    setPermission('checkin');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Net Control</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Share <strong>{session?.name}</strong> with another Repeater Nation user. They'll receive an invitation to join as a co-host.
          </p>

          {!selected ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by callsign or name…"
                  value={query}
                  onChange={(e) => doSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              {results.length > 0 && (
                <Card className="p-2 divide-y divide-border max-h-60 overflow-y-auto">
                  {results.map((u) => (
                    <button
                      key={u.user_id}
                      onClick={() => { setSelected(u); setQuery(''); setResults([]); }}
                      className="w-full flex items-center gap-3 p-2 hover:bg-accent/50 rounded-lg text-left"
                    >
                      <div className="flex-1">
                        <span className="font-medium text-sm">{u.callsign || u.display_name}</span>
                        {u.callsign && u.display_name && <span className="text-muted-foreground text-sm ml-2">{u.display_name}</span>}
                      </div>
                      <UserPlus className="w-4 h-4 text-primary" />
                    </button>
                  ))}
                </Card>
              )}
            </>
          ) : (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{selected.callsign || selected.display_name}</div>
                  {selected.callsign && selected.display_name && (
                    <div className="text-sm text-muted-foreground">{selected.display_name}</div>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Change</Button>
              </div>
              <div>
                <Label>Permission Level</Label>
                <Select value={permission} onValueChange={setPermission}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Net Control — all functions</SelectItem>
                    <SelectItem value="checkin">Check-In Operator — check in/out, guests, notes</SelectItem>
                    <SelectItem value="view">View Only — observe the live session</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleShare} disabled={!selected || sharing}>
            {sharing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
            Send Invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}