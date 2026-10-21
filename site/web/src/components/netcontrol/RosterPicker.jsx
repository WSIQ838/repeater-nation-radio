import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Users, Plus, Trash2, RefreshCw, Loader2, Globe, List, Save, Upload, ArrowUp, ArrowDown, Check,
} from 'lucide-react';
import { lookupProfileByCallsign } from '@/lib/netRosterLookup';

const normalizeImportedMember = (item, index) => ({
  id: item?.id || ('import-' + Date.now() + '-' + index),
  callsign: String(item?.callsign ?? item?.Callsign ?? item?.call_sign ?? '').trim().toUpperCase(),
  name: String(item?.name ?? item?.Name ?? item?.full_name ?? item?.operator_name ?? '').trim(),
  location: String(item?.location ?? item?.Location ?? item?.city ?? item?.qth ?? '').trim(),
  station_type: String(item?.station_type ?? item?.stationType ?? item?.type ?? item?.StationType ?? '').trim(),
  notes: String(item?.notes ?? item?.Notes ?? '').trim(),
  source: 'file_import',
});

function parseCsvRoster(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return [];

  const normalizedHeaders = rows[0].map((h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, ''));
  const hasHeader = normalizedHeaders.some((h) => ['callsign','callsignid','callsignnumber','name','fullname','location','stationtype','notes'].includes(h));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const indexFor = (names) => normalizedHeaders.findIndex((h) => names.includes(h));
  const callsignIndex = hasHeader ? indexFor(['callsign','callsignid','callsignnumber']) : 0;
  const nameIndex = hasHeader ? indexFor(['name','fullname','operatorname']) : 1;
  const locationIndex = hasHeader ? indexFor(['location','city','qth']) : 2;
  const stationIndex = hasHeader ? indexFor(['stationtype','station']) : 3;
  const notesIndex = hasHeader ? indexFor(['notes','note']) : 4;

  return dataRows.map((values, index) => normalizeImportedMember({
    callsign: values[callsignIndex],
    name: nameIndex >= 0 ? values[nameIndex] : '',
    location: locationIndex >= 0 ? values[locationIndex] : '',
    station_type: stationIndex >= 0 ? values[stationIndex] : '',
    notes: notesIndex >= 0 ? values[notesIndex] : '',
  }, index)).filter((m) => m.callsign);
}

async function readRosterFile(file) {
  const text = await file.text();
  if (/\.json$/i.test(file.name) || /json/i.test(file.type)) {
    const parsed = JSON.parse(text);
    const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.members) ? parsed.members : [];
    return source.map((item, index) => normalizeImportedMember(item, index)).filter((m) => m.callsign);
  }
  return parseCsvRoster(text);
}

function MemberEditor({ members, onChange, title }) {
  const [adding, setAdding] = useState(false);
  const [newMember, setNewMember] = useState({ callsign: '', name: '', location: '', station_type: '', notes: '' });
  const [memberLookup, setMemberLookup] = useState(false);
  const [memberAutoFilled, setMemberAutoFilled] = useState(false);

  // Live-fill name/location from the member's profile as the callsign is typed.
  useEffect(() => {
    if (!adding) return;
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
  }, [newMember.callsign, adding]);

  const add = () => {
    if (!newMember.callsign.trim()) return;
    const m = { ...newMember, id: `custom-${Date.now()}`, callsign: newMember.callsign.trim().toUpperCase(), source: 'custom' };
    onChange([...members, m]);
    setNewMember({ callsign: '', name: '', location: '', station_type: '', notes: '' });
    setMemberAutoFilled(false);
    setAdding(false);
  };

  const remove = (id) => onChange(members.filter((m) => m.id !== id));
  const move = (i, dir) => {
    const arr = [...members];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{title} ({members.length})</Label>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}><Plus className="w-4 h-4 mr-1" />Add Station</Button>
      </div>
      {adding && (
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
            <Button size="sm" onClick={add}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </Card>
      )}
      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No stations added yet.</p>
      ) : (
        members.map((m, i) => (
          <div key={m.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
            <div className="flex flex-col">
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="w-3 h-3" /></Button>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => move(i, 1)} disabled={i === members.length - 1}><ArrowDown className="w-3 h-3" /></Button>
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium">{m.callsign}</span>
              {m.name && <span className="text-muted-foreground ml-2">{m.name}</span>}
              {m.location && <span className="text-muted-foreground ml-2 text-xs">· {m.location}</span>}
              {m.station_type && <span className="text-muted-foreground ml-2 text-xs">· {m.station_type}</span>}
              {m.club_role && <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-muted">{m.club_role}</span>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => remove(m.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
          </div>
        ))
      )}
    </div>
  );
}

export default function RosterPicker({ user, value, onChange }) {
  const [clubs, setClubs] = useState([]);
  const [savedRosters, setSavedRosters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const [importedFileName, setImportedFileName] = useState('');

  const loadClubs = useCallback(async () => {
    if (!user) return;
    try {
      const [allClubs, myMemberships] = await Promise.all([
        base44.entities.Club.list('-updated_date', 200),
        base44.entities.Membership.filter({ created_by_id: user.id, status: 'Active' }, '-updated_date', 200),
      ]);
      const memberClubIds = new Set((myMemberships || []).map((m) => m.club_id));
      setClubs((allClubs || []).filter((c) => c.created_by_id === user.id || memberClubIds.has(c.id)));
    } catch (e) { console.error('Club load error:', e); }
  }, [user]);

  const loadRosters = useCallback(async () => {
    if (!user) return;
    try {
      const r = await base44.entities.NetControlRoster.filter({ created_by_id: user.id }, '-updated_date', 100);
      setSavedRosters(r || []);
    } catch (e) { console.error('Roster load error:', e); }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadClubs(); loadRosters(); }, [loadClubs, loadRosters]);

  const syncClub = async (clubId) => {
    if (!clubId) return;
    setSyncing(true);
    try {
      const members = await base44.entities.Membership.filter({ club_id: clubId, status: 'Active' }, '-updated_date', 200);
      const mapped = (members || []).map((m) => ({
        id: `club-${m.id}`,
        callsign: m.member_callsign || '',
        name: m.member_name || '',
        club_role: m.role || 'Member',
        membership_status: m.status || 'Active',
        source: 'club',
      }));
      const club = clubs.find((c) => c.id === clubId);
      onChange({ ...value, type: 'club', club_id: clubId, club_name: club?.name || '', club_owner_id: club?.created_by_id || '', members: mapped });
    } catch (e) { console.error('Sync error:', e); }
    setSyncing(false);
  };

  const useSavedRoster = (rosterId) => {
    const roster = savedRosters.find((r) => r.id === rosterId);
    if (!roster) return;
    const members = roster.members ? JSON.parse(roster.members) : [];
    const club = clubs.find((c) => c.id === roster.club_id);
    onChange({ ...value, type: 'saved', roster_id: rosterId, members, club_id: roster.club_id || '', club_name: roster.club_name || '', club_owner_id: club?.created_by_id || '' });
  };

  const handleFileImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportingFile(true);
    try {
      const members = await readRosterFile(file);
      if (!members.length) throw new Error('No callsigns were found in that file. Use a CSV or JSON roster with a Callsign column/field.');
      setImportedFileName(file.name);
      onChange({ ...value, type: 'file_import', members, club_id: '', club_name: '', roster_id: '' });
    } catch (e) {
      console.error('Roster import error:', e);
      alert(e?.message || 'Could not import that roster file.');
    } finally {
      setImportingFile(false);
    }
  };

  const setMode = (mode) => {
    if (mode === 'none') onChange({ type: 'none', members: [], club_id: '', club_name: '', roster_id: '' });
    else if (mode === 'custom') onChange({ ...value, type: 'custom', members: value.members.filter((m) => m.source === 'custom'), club_id: '', club_name: '', roster_id: '' });
    else if (mode === 'club') onChange({ ...value, type: 'club' });
    else if (mode === 'saved') onChange({ ...value, type: 'saved' });
    else if (mode === 'file') { setImportedFileName(''); onChange({ ...value, type: 'file_import', members: [], club_id: '', club_name: '', roster_id: '' }); }
  };

  const MODES = [
    { key: 'club', label: 'Sync Club Roster', icon: Users, desc: 'Pull members from a club you belong to.' },
    { key: 'custom', label: 'Create My Own List', icon: List, desc: 'Build an independent custom roster.' },
    { key: 'saved', label: 'Use Saved Roster', icon: Save, desc: 'Use a roster you previously saved in Net Control.' },
    { key: 'file', label: 'Import from Computer', icon: Upload, desc: 'Import a CSV or JSON roster from your computer.' },
    { key: 'none', label: 'No Roster', icon: Globe, desc: 'Start empty — add stations during the net.' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-2">
        {MODES.map((m) => {
          const active = value.type === m.key || (value.type === 'club' && m.key === 'club');
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`text-left rounded-xl border p-3 transition-colors ${active ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}
            >
              <div className="flex items-center gap-2">
                <m.icon className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">{m.label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
            </button>
          );
        })}
      </div>

      {value.type === 'club' && (
        <div className="space-y-3">
          <div>
            <Label>Select Club</Label>
            {clubs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">You are not an active member of any club. Join a club first to sync its roster.</p>
            ) : (
              <div className="flex gap-2">
                <Select value={value.club_id} onValueChange={syncClub}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Choose a club…" /></SelectTrigger>
                  <SelectContent>{clubs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                {value.club_id && (
                  <Button variant="outline" onClick={() => syncClub(value.club_id)} disabled={syncing}>
                    {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </Button>
                )}
              </div>
            )}
          </div>
          {value.club_id && (
            <>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Users className="w-3 h-3" />{value.members.length} synced members
                {value.members.length > 0 && <span>· Last sync: {new Date().toLocaleTimeString()}</span>}
              </div>
              <MemberEditor
                title="Additional Stations (Combined)"
                members={value.members.filter((m) => m.source === 'custom')}
                onChange={(custom) => onChange({ ...value, members: [...value.members.filter((m) => m.source === 'club'), ...custom] })}
              />
            </>
          )}
        </div>
      )}

      {value.type === 'custom' && (
        <MemberEditor title="Custom Roster" members={value.members} onChange={(members) => onChange({ ...value, members })} />
      )}

      {value.type === 'saved' && (
        <div className="space-y-3">
          <div>
            <Label className="text-base font-semibold">Use a Saved Roster</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose a roster you already saved in Net Control and use its stations for this net.
            </p>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : savedRosters.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved rosters yet. Create one from the Rosters tab.</p>
          ) : (
            <Select value={value.roster_id || ''} onValueChange={useSavedRoster}>
              <SelectTrigger><SelectValue placeholder="Choose a saved roster to import…" /></SelectTrigger>
              <SelectContent>{savedRosters.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} ({r.member_count || 0} members)</SelectItem>)}</SelectContent>
            </Select>
          )}
          {value.members.length > 0 && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Users className="w-3 h-3" />{value.members.length} stations imported from the selected roster
            </div>
          )}
          {value.members.length > 0 && (
            <MemberEditor title="Additional Stations" members={value.members.filter((m) => m.source === 'custom')} onChange={(custom) => onChange({ ...value, members: [...value.members.filter((m) => m.source !== 'custom'), ...custom] })} />
          )}
        </div>
      )}

      {value.type === 'file_import' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-base font-semibold">Import a Roster from Your Computer</Label>
            <p className="text-xs text-muted-foreground">
              For the easiest import, make your spreadsheet a <strong>CSV</strong> file with <strong>one station per row</strong>. A header row is recommended. <strong>Callsign is required</strong>; the other columns are optional.
            </p>

            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Callsign *</th>
                    <th className="text-left px-3 py-2 font-semibold">Name</th>
                    <th className="text-left px-3 py-2 font-semibold">Location</th>
                    <th className="text-left px-3 py-2 font-semibold">Station Type</th>
                    <th className="text-left px-3 py-2 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="px-3 py-2 font-medium">W1ABC</td>
                    <td className="px-3 py-2">John Smith</td>
                    <td className="px-3 py-2">Irvine, CA</td>
                    <td className="px-3 py-2">Mobile</td>
                    <td className="px-3 py-2">Net control</td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-3 py-2 font-medium">K6XYZ</td>
                    <td className="px-3 py-2">Jane Doe</td>
                    <td className="px-3 py-2">Anaheim, CA</td>
                    <td className="px-3 py-2">Base</td>
                    <td className="px-3 py-2">2m/70cm</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-semibold">CSV format</p>
              <p>• Required: <strong>Callsign</strong></p>
              <p>• Optional: <strong>Name</strong>, <strong>Location</strong>, <strong>Station Type</strong>, <strong>Notes</strong></p>
              <p>• Keep the column names in the first row and put one station on each row.</p>
              <p>• Do not merge cells. Save/export the spreadsheet as <strong>CSV</strong> before importing.</p>
              <p>• The column order can be changed as long as the header names are present. The importer also recognizes common names such as Full Name, City/QTH, and Operator Name.</p>
            </div>

            <div className="rounded-lg border border-dashed p-3 text-xs">
              <p className="font-semibold mb-1">Example CSV</p>
              <pre className="whitespace-pre-wrap font-mono text-muted-foreground">{`Callsign,Name,Location,Station Type,Notes
W1ABC,John Smith,"Irvine, CA",Mobile,Net control
K6XYZ,Jane Doe,"Anaheim, CA",Base,2m/70cm`}</pre>
            </div>

            <p className="text-xs text-muted-foreground">
              JSON files are also supported. Imported stations are placed in the roster for review and editing before the net is saved.
            </p>
          </div>
          <div className="rounded-lg border border-dashed p-4 space-y-2">
            <Input type="file" accept=".csv,.json,text/csv,application/json" onChange={handleFileImport} disabled={importingFile} />
            {importingFile && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Reading roster…</div>}
            {importedFileName && !importingFile && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Upload className="w-3 h-3" />{importedFileName} · {value.members.length} stations imported
              </div>
            )}
          </div>
          {value.members.length > 0 && (
            <MemberEditor title="Imported Roster" members={value.members} onChange={(members) => onChange({ ...value, members })} />
          )}
        </div>
      )}

      {value.type === 'none' && (
        <p className="text-xs text-muted-foreground">You can add guest stations during the live net.</p>
      )}
    </div>
  );
}