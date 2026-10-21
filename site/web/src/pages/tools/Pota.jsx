import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trees, Plus, Star, Radio, Loader2, Locate } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import ClusteredPotaMap from '@/components/pota/ClusteredPotaMap';
import PotaActivationDialog from '@/components/pota/PotaActivationDialog';
import AddParkDialog from '@/components/pota/AddParkDialog';
import { loadAll } from '@/lib/loadAll';
import {
  ConsolePage, CommandBar, ConsoleTabs, Panel, DataHead, DataRow, EmptyPanel, StatusChip,
} from '@/components/console/Console';

const PARK_TYPES = [
  'State Park', 'National Park', 'National Forest', 'Wildlife Area', 'Recreation Area',
  'Historic Site', 'State Forest', 'Nature Preserve', 'National Historic Site',
  'National Monument', 'National Recreation Area', 'National Wildlife Refuge',
  'State Recreation Area', 'State Historic Site', 'State Nature Area', 'Other',
];

const STATUS_TONE = {
  Upcoming: 'primary',
  Active: 'success',
  Completed: 'muted',
  Cancelled: 'danger',
};

// Grid column templates shared by the header and rows so the columns always line up.
const PARK_GRID = 'grid-cols-[28px_74px_minmax(0,1fr)_92px] sm:grid-cols-[28px_84px_minmax(0,1fr)_60px_100px]';
const ACT_GRID = 'grid-cols-[minmax(0,1fr)_92px] sm:grid-cols-[92px_minmax(0,1fr)_150px_96px_64px_92px]';

const distKm = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export default function Pota() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [parks, setParks] = useState([]);
  const [favs, setFavs] = useState([]);
  const [activations, setActivations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('parks');
  const [q, setQ] = useState({ name: '', number: '', city: '', state: '', county: '', type: '' });
  const [nearMe, setNearMe] = useState(null);
  const [locating, setLocating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [presetPark, setPresetPark] = useState(null);
  const [editing, setEditing] = useState(null);
  const [addParkOpen, setAddParkOpen] = useState(false);

  const load = async () => {
    try {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      const [p, f, a] = await Promise.all([
        loadAll('PotaPark', '-created_date', 1000).catch(() => []),
        base44.entities.PotaFavorite.list('-created_date', 200).catch(() => []),
        u ? base44.entities.PotaActivation.filter({ created_by_id: u.id }, '-scheduled_date', 100).catch(() => []) : [],
      ]);
      setParks(p || []);
      setFavs(f || []);
      setActivations(a || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Auto-locate the user on first load so the map centers on them.
  useEffect(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setNearMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => setLocating(false),
      { timeout: 10000 }
    );
  }, []);

  const favIds = useMemo(() => new Set(favs.map((f) => f.park_id)), [favs]);

  const toggleFav = async (park) => {
    const existing = favs.find((f) => f.park_id === park.id);
    try {
      if (existing) {
        await base44.entities.PotaFavorite.delete(existing.id);
        setFavs((s) => s.filter((f) => f.id !== existing.id));
      } else {
        const rec = await base44.entities.PotaFavorite.create({
          park_id: park.id,
          park_name: park.name,
          park_number: park.park_number,
          park_location: [park.city, park.state].filter(Boolean).join(', '),
        });
        setFavs((s) => [...s, rec]);
      }
    } catch { toast({ title: 'Could not update favorite', variant: 'destructive' }); }
  };

  const filtered = useMemo(() => {
    let list = parks.slice();
    if (q.name) list = list.filter((p) => p.name?.toLowerCase().includes(q.name.toLowerCase()));
    if (q.number) list = list.filter((p) => p.park_number?.toLowerCase().includes(q.number.toLowerCase()));
    if (q.city) list = list.filter((p) => p.city?.toLowerCase().includes(q.city.toLowerCase()));
    if (q.state) list = list.filter((p) => p.state?.toLowerCase().includes(q.state.toLowerCase()));
    if (q.county) list = list.filter((p) => p.county?.toLowerCase().includes(q.county.toLowerCase()));
    if (q.type) list = list.filter((p) => p.park_type === q.type);
    if (nearMe) list = list.filter((p) => p.lat && p.lng).sort((a, b) => distKm(nearMe, a) - distKm(nearMe, b));
    return list;
  }, [parks, q, nearMe]);

  const favoriteParks = useMemo(() => parks.filter((p) => favIds.has(p.id)), [parks, favIds]);

  const locate = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setNearMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => { toast({ title: 'Could not get your location', variant: 'destructive' }); setLocating(false); },
      { timeout: 10000 }
    );
  };

  const activateHere = (park) => { setEditing(null); setPresetPark(park); setDialogOpen(true); };
  const newActivation = () => { setEditing(null); setPresetPark(null); setDialogOpen(true); };

  const renderParkRow = (p) => (
    <DataRow key={p.id} className={PARK_GRID}>
      <button
        type="button"
        title={favIds.has(p.id) ? 'Remove this park from your favorites.' : 'Save this park to your favorites.'}
        onClick={() => toggleFav(p)}
        aria-label={favIds.has(p.id) ? 'Remove favorite' : 'Add favorite'}
        className={`p-0.5 ${favIds.has(p.id) ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Star className={`w-4 h-4 ${favIds.has(p.id) ? 'fill-amber-400' : ''}`} />
      </button>
      <Link to={`/tools/pota/parks/${p.id}`} title="Open the park details page." className="font-mono text-[12px] text-primary hover:underline truncate">{p.park_number}</Link>
      <Link to={`/tools/pota/parks/${p.id}`} className="min-w-0 block">
        <div className="truncate font-medium">{p.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {[p.city, p.state].filter(Boolean).join(', ') || '—'} · {p.source === 'community' ? 'Community' : 'Official'}{p.pota_status === 'inactive' ? ' · Inactive' : ''}
        </div>
      </Link>
      <span className="hidden sm:block text-right font-mono text-[12px] text-muted-foreground">
        {nearMe && p.lat && p.lng ? `${Math.round(distKm(nearMe, p))} km` : '—'}
      </span>
      <Button size="sm" className="h-7 px-2 text-[11px]" title={`Start a POTA activation at ${p.name || p.park_number || 'this park'}.`} onClick={() => activateHere(p)}>
        <Radio className="w-3.5 h-3.5 mr-1" /> Activate
      </Button>
    </DataRow>
  );

  const parkGridHead = (
    <DataHead className={PARK_GRID}>
      <span />
      <span>Ref</span>
      <span>Park</span>
      <span className="hidden sm:block text-right">Dist</span>
      <span />
    </DataHead>
  );

  return (
    <ConsolePage>
      <CommandBar
        icon={Trees}
        title="Parks on the Air (POTA)"
        subtitle="Park activation operations"
        status="Live"
        actions={(
          <>
            <Button variant="outline" size="sm" title="Add a community POTA park to the directory." onClick={() => setAddParkOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Add a Park</Button>
            <Button size="sm" title="Create a new POTA park activation." onClick={newActivation}><Radio className="w-4 h-4 mr-1.5" /> New Activation</Button>
          </>
        )}
        kpis={[
          { label: 'Parks', value: parks.length, title: 'Total parks currently in the POTA directory.' },
          { label: 'Favorites', value: favoriteParks.length, title: 'POTA parks you have saved as favorites.' },
          { label: 'Activations', value: activations.length, tone: 'primary', title: 'POTA activations you have created.' },
          { label: 'Mapped parks', value: parks.filter((p) => p.lat && p.lng).length, title: 'Directory parks that have saved map coordinates.' },
        ]}
      />

      <ConsoleTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'parks', label: 'Parks', count: parks.length, title: 'Browse and filter the POTA park directory.' },
          { id: 'activations', label: 'My Activations', count: activations.length, title: 'View the POTA activations you have created.' },
          { id: 'favorites', label: 'Favorites', count: favoriteParks.length, title: 'View parks you have saved as favorites.' },
        ]}
      />

      {tab === 'parks' && (
        <div className="space-y-3">
          <Panel title="Directory filters" accent="muted" meta={locating ? 'Locating…' : nearMe ? 'Sorted by distance' : undefined}>
            <div className="p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              <Input className="h-8 text-xs" title="Filter the directory by park name." value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} placeholder="Park name" />
              <Input className="h-8 text-xs" title="Filter by official or community park reference number." value={q.number} onChange={(e) => setQ({ ...q, number: e.target.value })} placeholder="Park #" />
              <Input className="h-8 text-xs" title="Filter by park city." value={q.city} onChange={(e) => setQ({ ...q, city: e.target.value })} placeholder="City" />
              <Input className="h-8 text-xs" title="Filter by park state or region code." value={q.state} onChange={(e) => setQ({ ...q, state: e.target.value })} placeholder="State" />
              <Input className="h-8 text-xs" title="Filter by park county." value={q.county} onChange={(e) => setQ({ ...q, county: e.target.value })} placeholder="County" />
              <select
                title="Filter by park type."
                aria-label="Park type"
                value={q.type}
                onChange={(e) => setQ({ ...q, type: e.target.value })}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All types</option>
                {PARK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <Button size="sm" className="h-8 text-xs" title="Use your current location and sort nearby parks by distance." variant={nearMe ? 'default' : 'outline'} onClick={locate} disabled={locating}>
                {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Locate className="w-3.5 h-3.5 mr-1.5" />}
                {nearMe ? 'Near me ✓' : 'Near me'}
              </Button>
            </div>
          </Panel>

          <div className="grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 items-start">
            <Panel title="Park directory" meta={`${Math.min(filtered.length, 60)} of ${filtered.length}`}>
              {parkGridHead}
              <div className="max-h-[62vh] overflow-y-auto scrollbar-thin">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground px-3.5 py-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading parks…</div>
                ) : filtered.length === 0 ? (
                  <EmptyPanel icon={Trees} title="No parks match your search" text="Try clearing a filter or searching a different area." />
                ) : (
                  filtered.slice(0, 60).map(renderParkRow)
                )}
              </div>
              {filtered.length > 60 && (
                <div className="px-3.5 py-2 border-t border-border bg-muted/30 text-[11px] text-muted-foreground text-center">
                  Showing 60 of {filtered.length} parks — use the filters above to narrow results.
                </div>
              )}
            </Panel>

            <Panel title="Park operations map" accent="success" meta={`${filtered.length} parks`}>
              {filtered.length > 0 ? (
                <ClusteredPotaMap parks={filtered} onActivate={activateHere} userLocation={nearMe} height="62vh" bare />
              ) : (
                <EmptyPanel icon={Trees} title="Nothing to map" text="No parks match the current filters." />
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'activations' && (
        <Panel title="My activations" accent="primary" meta={`${activations.length} total`}>
          {activations.length === 0 ? (
            <EmptyPanel
              icon={Trees}
              title="No activations yet"
              text="You haven't created any POTA activations yet."
              action={<Button size="sm" title="Create a new POTA activation from the empty-state panel." onClick={newActivation}><Plus className="w-4 h-4 mr-1.5" /> New Activation</Button>}
            />
          ) : (
            <>
              <DataHead className={ACT_GRID}>
                <span className="hidden sm:block">Ref</span>
                <span>Park</span>
                <span className="hidden sm:block">Scheduled</span>
                <span className="hidden sm:block">Freq</span>
                <span className="hidden sm:block text-right">QSOs</span>
                <span className="text-right">Status</span>
              </DataHead>
              {activations.map((a) => (
                <Link key={a.id} to={`/tools/pota/${a.id}`} className="block">
                  <DataRow className={ACT_GRID}>
                    <span className="hidden sm:block font-mono text-[12px] text-primary truncate">{a.park_number}</span>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.park_name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        <span className="sm:hidden font-mono text-primary">{a.park_number} · </span>
                        {a.club_name ? `${a.club_name}` : 'Personal activation'}
                        <span className="sm:hidden">{a.scheduled_date ? ` · ${format(new Date(a.scheduled_date), 'MMM d, h:mm a')}` : ''}</span>
                      </div>
                    </div>
                    <span className="hidden sm:block text-[12px] text-muted-foreground">
                      {a.scheduled_date ? format(new Date(a.scheduled_date), 'EEE, MMM d · h:mm a') : '—'}
                    </span>
                    <span className="hidden sm:block font-mono text-[12px] text-muted-foreground">{a.frequency ? `${a.frequency} MHz` : '—'}</span>
                    <span className="hidden sm:block text-right font-mono text-[12px]">{a.contacts_count || 0}</span>
                    <span className="text-right"><StatusChip tone={STATUS_TONE[a.status] || 'muted'}>{a.status}</StatusChip></span>
                  </DataRow>
                </Link>
              ))}
            </>
          )}
        </Panel>
      )}

      {tab === 'favorites' && (
        <Panel title="Favorite parks" accent="primary" meta={`${favoriteParks.length} saved`}>
          {favoriteParks.length === 0 ? (
            <EmptyPanel icon={Star} title="No favorite parks yet" text="Tap the star on a park to save it." />
          ) : (
            <>
              {parkGridHead}
              {favoriteParks.map(renderParkRow)}
            </>
          )}
        </Panel>
      )}

      <PotaActivationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        user={user}
        onSaved={load}
        editing={editing}
        presetPark={presetPark}
      />
      <AddParkDialog open={addParkOpen} onClose={() => setAddParkOpen(false)} user={user} onSaved={load} />
    </ConsolePage>
  );
}
