import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { lookupProfileByCallsign } from '@/lib/netRosterLookup';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Plus, Trash2, ArrowUp, ArrowDown, RefreshCw, Loader2, Users, Save, Check,
} from 'lucide-react';

export default function RosterDialog({ open, onClose, editingRoster, user, onSaved }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rosterType, setRosterType] = useState('custom');
  const [clubId, setClubId] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [members, setMembers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newMember, setNewMember] = useState({ callsign: '', name: '', location: '', station_type: '', notes: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [memberLookup, setMemberLookup] = useState(false);
  const [memberAutoFilled, setMemberAutoFilled] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingRoster) {
      setName(editingRoster.name || '');
      setDescription(editingRoster.description || '');
      setRosterType(editingRoster.roster_type || 'custom');
      setClubId(editingRoster.club_id || '');
      setSyncEnabled(editingRoster.sync_enabled || false);
      setMembers(editingRoster.members ? JSON.parse(editingRoster.members) : []);
    } else {
      setName(''); setDescription(''); setRosterType('custom'); setClubId('');
      setSyncEnabled(false); setMembers([]);
    }
  }, [open, editingRoster]);

  const loadClubs = useCallback(async () => {
    if (!user) return;
    try {
      const [allClubs, myMemberships] = await Promise.all([
        base44.entities.Club.list('-updated_date', 200),
        base44.entities.Membership.filter({ created_by_id: user.id, status: 'Active' }, '-updated_date', 200),
      ]);
      const memberClubIds = new Set((myMemberships || []).map((m) => m.club_id));
      setClubs((allClubs || []).filter((c) => c.created_by_id === user.id || memberClubIds.has(c.id)));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [user]);

  useEffect(() => { if (open) loadClubs(); }, [open, loadClubs]);

  // Live-fill name/location from the member's profile as the callsign is typed.
  useEffect(() => {
    if (!showAdd) return;
    const cs = newMember.callsign.trim().toUpperCase();
    if (cs.length < 3) { setMemberLookup(false); setMemberAutoFilled(false); return; }
    setMemberLookup(true);
    const timer = setTimeout(async () => {
      const profile = await lookupProfileByCallsign(cs);
      if (profile) {
        setNewMember((m) => ({ ...m, name: m.name || profile.name, location: m.location || profile.location }));
        setMemberAutoFilled(true);
      } else {
        setMemberAutoFilled(false);
      }
      setMemberLookup(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [newMember.callsign, showAdd]);

  const syncFromClub = async (cId) => {
    if (!cId) return;
    setSyncing(true);
    try {
      const clubMembers = await base44.entities.Membership.filter({ club_id: cId, status: 'Active' }, '-updated_date', 200);
      const mapped = (clubMembers || []).map((m) => ({
        id: `club-${m.id}`, callsign: m.member_callsign || '', name: m.member_name || '',
        club_role: m.role || 'Member', membership_status: m.status || 'Active', source: 'club',
      }));
      const custom = members.filter((m) => m.source === 'custom');
      setMembers([...mapped, ...custom]);
    } catch (e) { console.error(e); }
    setSyncing(false);
  };

  const addMember = () => {
    if (!newMember.callsign.trim()) return;
    setMembers([...members, { ...newMember, id: `custom-${Date.now()}`, callsign: newMember.callsign.trim().toUpperCase(), source: 'custom' }]);
    setNewMember({ callsign: '', name: '', location: '', station_type: '', notes: '' });
    setMemberAutoFilled(false);
    setShowAdd(false);
  };

  const removeMember = (id) => setMembers(members.filter((m) => m.id !== id));
  const moveMember = (i, dir) => {
    const arr = [...members]; const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; setMembers(arr);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const club = clubs.find((c) => c.id === clubId);
      const payload = {
        name: name.trim(),
        description: description || '',
        roster_type: rosterType,
        club_id: rosterType === 'club_sync' ? clubId : '',
        club_name: rosterType === 'club_sync' ? club?.name || '' : '',
        sync_enabled: rosterType === 'club_sync' ? syncEnabled : false,
        last_sync_at: rosterType === 'club_sync' && clubId ? new Date().toISOString() : null,
        members: JSON.stringify(members),
        member_count: members.length,
      };
      if (editingRoster) {
        await base44.entities.NetControlRoster.update(editingRoster.id, payload);
      } else {
        await base44.entities.NetControlRoster.create(payload);
      }
      onSaved();
    } catch (e) {
      console.error('Save roster error:', e);
      alert('Failed to save roster: ' + (e?.message || 'Unknown error'));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingRoster ? 'Edit Roster' : 'Create Roster'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Roster Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tuesday Net Roster" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>Roster Type</Label>
            <Select value={rosterType} onValueChange={(v) => { setRosterType(v); if (v === 'custom') { setClubId(''); setSyncEnabled(false); } }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom — manually built list</SelectItem>
                <SelectItem value="club_sync">Club Sync — linked to a club</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rosterType === 'club_sync' && (
            <div className="space-y-3 rounded-lg border p-3">
              <div>
                <Label>Select Club</Label>
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading clubs…</div>
                ) : clubs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">You are not an active member of any club.</p>
                ) : (
                  <div className="flex gap-2">
                    <Select value={clubId} onValueChange={(v) => { setClubId(v); syncFromClub(v); }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Choose a club…" /></SelectTrigger>
                      <SelectContent>{clubs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {clubId && <Button variant="outline" onClick={() => syncFromClub(clubId)} disabled={syncing}>{syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</Button>}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Auto-Sync</Label>
                  <p className="text-xs text-muted-foreground">Keep this roster synced with the club's current members.</p>
                </div>
                <Switch checked={syncEnabled} onCheckedChange={setSyncEnabled} />
              </div>
            </div>
          )}

          {/* Members */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2"><Users className="w-4 h-4" />Members ({members.length})</Label>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}><Plus className="w-4 h-4 mr-1" />Add Station</Button>
            </div>
            {showAdd && (
              <Card className="p-3 space-y-2">
                <div className="grid sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <Input placeholder="Callsign *" value={newMember.callsign} onChange={(e) => { setNewMember({ ...newMember, callsign: e.target.value }); setMemberAutoFilled(false); }} />
                    {memberLookup && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                  </div>
                  <Input placeholder="Name" value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
                  <Input placeholder="Location" value={newMember.location} onChange={(e) => setNewMember({ ...newMember, location: e.target.value })} />
                  <Input placeholder="Station type" value={newMember.station_type} onChange={(e) => setNewMember({ ...newMember, station_type: e.target.value })} />
                </div>
                {memberAutoFilled && <p className="text-xs text-success flex items-center gap-1"><Check className="w-3 h-3" />Member info auto-filled from callsign.</p>}
                <Input placeholder="Notes" value={newMember.notes} onChange={(e) => setNewMember({ ...newMember, notes: e.target.value })} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={addMember}>Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                </div>
              </Card>
            )}
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No members yet.</p>
            ) : (
              members.map((m, i) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                  <div className="flex flex-col">
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moveMember(i, -1)} disabled={i === 0}><ArrowUp className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moveMember(i, 1)} disabled={i === members.length - 1}><ArrowDown className="w-3 h-3" /></Button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{m.callsign}</span>
                    {m.name && <span className="text-muted-foreground ml-2">{m.name}</span>}
                    {m.location && <span className="text-muted-foreground ml-2 text-xs">· {m.location}</span>}
                    {m.source === 'club' && <Badge variant="outline" className="text-xs ml-2">Club</Badge>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeMember(m.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            {editingRoster ? 'Save Changes' : 'Create Roster'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}