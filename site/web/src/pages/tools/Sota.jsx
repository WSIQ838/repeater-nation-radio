import { useCallback, useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mountain, Plus, Star, Radio, Loader2, Locate, ExternalLink, Shield } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import ClusteredSotaMap from '@/components/sota/ClusteredSotaMap';
import SotaActivationDialog from '@/components/sota/SotaActivationDialog';
import AddSummitDialog from '@/components/sota/AddSummitDialog';
import SotaChases from '@/components/sota/SotaChases';
import { loadAll } from '@/lib/loadAll';
import { STATUS_TONE, SOTA_LINKS, summitLocation } from '@/lib/sota';
import {
  ConsolePage, CommandBar, ConsoleTabs, Panel, DataHead, DataRow, EmptyPanel, StatusChip,
} from '@/components/console/Console';
import StaffTag from '@/components/shared/StaffTag';

// Grid column templates shared by the header and rows so the columns always line up.
const SUMMIT_GRID = 'grid-cols-[28px_96px_minmax(0,1fr)_92px] sm:grid-cols-[28px_104px_minmax(0,1fr)_64px_44px_60px_100px]';
const ACT_GRID = 'grid-cols-[minmax(0,1fr)_92px] sm:grid-cols-[104px_minmax(0,1fr)_150px_96px_64px_92px]';
const ADMIN_ROLES = ['admin', 'super_admin'];

const distKm = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export default function Sota() {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [summits, setSummits] = useState([]);
  const [favs, setFavs] = useState([]);
  const [activations, setActivations] = useState([]);
  const [live, setLive] = useState([]);
  const [chaseCount, setChaseCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('summits');
  const [q, setQ] = useState({ name: '', ref: '', region: '', state: '', minPoints: '' });
  const [nearMe, setNearMe] = useState(null);
  const [locating, setLocating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [presetSummit, setPresetSummit] = useState(null);
  const [addSummitOpen, setAddSummitOpen] = useState(false);

  const load = async () => {
    try {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      const [s, f, a, l] = await Promise.all([
        loadAll('SotaSummit', '-created_date', 1000).catch(() => []),
        u ? base44.entities.SotaFavorite.list('-created_date', 200).catch(() => []) : [],
        u ? base44.entities.SotaActivation.filter({ created_by_id: u.id }, '-scheduled_date', 100).catch(() => []) : [],
        base44.entities.SotaActivation.filter({ status: 'Active', is_public: true }, '-updated_date', 50).catch(() => []),
      ]);
      setSummits(s || []);
      setFavs(f || []);
      setActivations(a || []);
      setLive(l || []);
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

  const favIds = useMemo(() => new Set(favs.map((f) => f.summit_id)), [favs]);
  const onChaseCount = useCallback((n) => setChaseCount(n), []);

  const toggleFav = async (summit) => {
    if (!user) { toast({ title: 'Sign in to save favorite summits' }); return; }
    const existing = favs.find((f) => f.summit_id === summit.id);
    try {
      if (existing) {
        await base44.entities.SotaFavorite.delete(existing.id);
        setFavs((s) => s.filter((f) => f.id !== existing.id));
      } else {
        const rec = await base44.entities.SotaFavorite.create({
          summit_id: summit.id,
          summit_name: summit.name,
          summit_ref: summit.summit_ref,
          summit_location: summitLocation(summit),
        });
        setFavs((s) => [...s, rec]);
      }
    } catch { toast({ title: 'Could not update favorite', variant: 'destructive' }); }
  };

  const filtered = useMemo(() => {
    let list = summits.slice();
    const has = (v, s) => String(v || '').toLowerCase().includes(s.toLowerCase());
    if (q.name) list = list.filter((p) => has(p.name, q.name));
    if (q.ref) list = list.filter((p) => has(p.summit_ref, q.ref));
    if (q.region) list = list.filter((p) => has(p.region_name, q.region) || has(p.region, q.region) || has(p.county, q.region));
    if (q.state) list = list.filter((p) => has(p.state, q.state) || has(p.association, q.state) || has(p.association_name, q.state));
    if (q.minPoints) list = list.filter((p) => (p.points || 0) >= Number(q.minPoints));
    if (nearMe) list = list.filter((p) => p.lat && p.lng).sort((a, b) => distKm(nearMe, a) - distKm(nearMe, b));
    return list;
  }, [summits, q, nearMe]);

  const favoriteSummits = useMemo(() => summits.filter((p) => favIds.has(p.id)), [summits, favIds]);

  const locate = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setNearMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => { toast({ title: 'Could not get your location', variant: 'destructive' }); setLocating(false); },
      { timeout: 10000 }
    );
  };

  const needUser = () => { if (!user) { base44.auth.redirectToLogin(window.location.href); return true; } return false; };
  const activateHere = (summit) => { if (needUser()) return; setPresetSummit(summit); setDialogOpen(true); };
  const newActivation = () => { if (needUser()) return; setPresetSummit(null); setDialogOpen(true); };
  const addSummit = () => { if (needUser()) return; setAddSummitOpen(true); };
  const isAdmin = ADMIN_ROLES.includes(user?.role) || ADMIN_ROLES.includes(user?._app_role);

  const renderSummitRow = (p) => (
    <DataRow key={p.id} className={SUMMIT_GRID}>
      <button
        type="button"
        title={favIds.has(p.id) ? 'Remove this summit from your favorites.' : 'Save this summit to your favorites.'}
        onClick={() => toggleFav(p)}
        aria-label={favIds.has(p.id) ? 'Remove favorite' : 'Add favorite'}
        className={`p-0.5 ${favIds.has(p.id) ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Star className={`w-4 h-4 ${favIds.has(p.id) ? 'fill-amber-400' : ''}`} />
      </button>
      <Link to={`/tools/sota/summits/${p.id}`} title="Open the summit details page." className="font-mono text-[12px] text-primary hover:underline truncate">{p.summit_ref}</Link>
      <Link to={`/tools/sota/summits/${p.id}`} className="min-w-0 block">
        <div className="truncate font-medium">{p.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {summitLocation(p) || '—'} · {p.source === 'official' ? 'SOTA list' : 'Community'}{p.summit_status === 'inactive' ? ' · Inactive' : ''}
        </div>
      </Link>
      <span className="hidden sm:block text-right font-mono text-[12px] text-muted-foreground">{p.altitude_m ? `${Math.round(p.altitude_m)}m` : '—'}</span>
      <span className="hidden sm:block text-right font-mono text-[12px]">{p.points ?? '—'}</span>
      <span className="hidden sm:block text-right font-mono text-[12px] text-muted-foreground">
        {nearMe && p.lat && p.lng ? `${Math.round(distKm(nearMe, p))} km` : '—'}
      </span>
      <Button size="sm" className="h-7 px-2 text-[11px]" title={`Start a SOTA activation on ${p.name || p.summit_ref}.`} onClick={() => activateHere(p)}>
        <Radio className="w-3.5 h-3.5 mr-1" /> Activate
      </Button>
    </DataRow>
  );

  const summitGridHead = (
    <DataHead className={SUMMIT_GRID}>
      <span />
      <span>Ref</span>
      <span>Summit</span>
      <span className="hidden sm:block text-right">Alt</span>
      <span className="hidden sm:block text-right">Pts</span>
      <span className="hidden sm:block text-right">Dist</span>
      <span />
    </DataHead>
  );

  const renderActivation = (a, showOperator = false) => (
    <Link key={a.id} to={`/tools/sota/${a.id}`} className="block">
      <DataRow className={ACT_GRID}>
        <span className="hidden sm:block font-mono text-[12px] text-primary truncate">{a.summit_ref}</span>
        <div className="min-w-0">
          <div className="truncate font-medium">{a.summit_name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            <span className="sm:hidden font-mono text-primary">{a.summit_ref} · </span>
            {showOperator ? (a.operator_callsign || a.operator_name || 'Operator') : (a.club_name || 'Personal activation')}{showOperator && <StaffTag callsign={a.operator_callsign} className="ml-1.5" />}
          </div>
        </div>
        <span className="hidden sm:block text-[12px] text-muted-foreground">
          {a.scheduled_date ? format(new Date(a.scheduled_date), 'EEE, MMM d · h:mm a') : '—'}
        </span>
        <span className="hidden sm:block font-mono text-[12px] text-muted-foreground">{a.frequency ? `${a.frequency} ${a.tx_mode || ''}` : '—'}</span>
        <span className="hidden sm:block text-right font-mono text-[12px]">{a.contacts_count || 0}</span>
        <span className="text-right"><StatusChip tone={STATUS_TONE[a.status] || 'muted'} pulse={a.status === 'Active'}>{a.status}</StatusChip></span>
      </DataRow>
    </Link>
  );

  const actHead = (
    <DataHead className={ACT_GRID}>
      <span className="hidden sm:block">Ref</span>
      <span>Summit</span>
      <span className="hidden sm:block">Scheduled</span>
      <span className="hidden sm:block">Freq / mode</span>
      <span className="hidden sm:block text-right">QSOs</span>
      <span className="text-right">Status</span>
    </DataHead>
  );

  return (
    <ConsolePage>
      <CommandBar
        icon={Mountain}
        title="Summits on the Air (SOTA)"
        subtitle="Summit activation operations"
        status={live.length ? `${live.length} on air` : 'Live'}
        actions={(
          <>
            {isAdmin && <Link to="/admin/sota"><Button variant="outline" size="sm" title="Import the SOTA summits list and review submissions."><Shield className="w-4 h-4 mr-1.5" /> Admin</Button></Link>}
            <Button variant="outline" size="sm" title="Submit a summit to the directory." onClick={addSummit}><Plus className="w-4 h-4 mr-1.5" /> Add a Summit</Button>
            <Button size="sm" title="Create a new SOTA summit activation." onClick={newActivation}><Radio className="w-4 h-4 mr-1.5" /> New Activation</Button>
          </>
        )}
        kpis={[
          { label: 'Summits', value: summits.length, title: 'Summits currently in the SOTA directory.' },
          { label: 'Favorites', value: favoriteSummits.length, title: 'Summits you have saved as favorites.' },
          { label: 'Activations', value: activations.length, tone: 'primary', title: 'SOTA activations you have created.' },
          { label: 'Chases', value: chaseCount ?? '—', title: 'Summit stations you have logged as a chaser.' },
        ]}
      />

      <ConsoleTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'summits', label: 'Summits', count: summits.length, title: 'Browse and filter the summit directory.' },
          { id: 'activations', label: 'My Activations', count: activations.length, title: 'Your SOTA activations.' },
          { id: 'favorites', label: 'Favorites', count: favoriteSummits.length, title: 'Summits you have saved.' },
          { id: 'chases', label: 'Chases', count: chaseCount ?? undefined, title: 'Log and export the summits you chase.' },
        ]}
      />

      {live.length > 0 && tab !== 'chases' && (
        <Panel title="On the air now" accent="success" meta={`${live.length} live`}>
          {actHead}
          {live.map((a) => renderActivation(a, true))}
        </Panel>
      )}

      {tab === 'summits' && (
        <div className="space-y-3">
          <Panel title="Directory filters" accent="muted" meta={locating ? 'Locating…' : nearMe ? 'Sorted by distance' : undefined}>
            <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <Input className="h-8 text-xs" title="Filter by summit name." value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} placeholder="Summit name" />
              <Input className="h-8 text-xs font-mono" title="Filter by SOTA reference." value={q.ref} onChange={(e) => setQ({ ...q, ref: e.target.value })} placeholder="Ref, e.g. W7W/KG" />
              <Input className="h-8 text-xs" title="Filter by region or county." value={q.region} onChange={(e) => setQ({ ...q, region: e.target.value })} placeholder="Region / county" />
              <Input className="h-8 text-xs" title="Filter by state or association." value={q.state} onChange={(e) => setQ({ ...q, state: e.target.value })} placeholder="State / association" />
              <select
                title="Only show summits worth at least this many points."
                aria-label="Minimum points"
                value={q.minPoints}
                onChange={(e) => setQ({ ...q, minPoints: e.target.value })}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Any points</option>
                {[2, 4, 6, 8, 10].map((n) => <option key={n} value={n}>{n}+ points</option>)}
              </select>
              <Button size="sm" className="h-8 text-xs" title="Use your current location and sort nearby summits by distance." variant={nearMe ? 'default' : 'outline'} onClick={locate} disabled={locating}>
                {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Locate className="w-3.5 h-3.5 mr-1.5" />}
                {nearMe ? 'Near me ✓' : 'Near me'}
              </Button>
            </div>
          </Panel>

          <div className="grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 items-start">
            <Panel title="Summit directory" meta={`${Math.min(filtered.length, 60)} of ${filtered.length}`}>
              {summitGridHead}
              <div className="max-h-[62vh] overflow-y-auto scrollbar-thin">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground px-3.5 py-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading summits…</div>
                ) : summits.length === 0 ? (
                  <EmptyPanel
                    icon={Mountain}
                    title="No summits in the directory yet"
                    text={isAdmin ? 'Import the SOTA summits list from the Admin page, or add summits one at a time.' : 'Add a summit you activate, or ask an administrator to import the SOTA summits list.'}
                    action={isAdmin ? <Link to="/admin/sota"><Button size="sm">Import summits</Button></Link> : <Button size="sm" onClick={addSummit}><Plus className="w-4 h-4 mr-1.5" /> Add a Summit</Button>}
                  />
                ) : filtered.length === 0 ? (
                  <EmptyPanel icon={Mountain} title="No summits match your search" text="Try clearing a filter or searching a different area." />
                ) : (
                  filtered.slice(0, 60).map(renderSummitRow)
                )}
              </div>
              {filtered.length > 60 && (
                <div className="px-3.5 py-2 border-t border-border bg-muted/30 text-[11px] text-muted-foreground text-center">
                  Showing 60 of {filtered.length} summits — use the filters above to narrow results.
                </div>
              )}
            </Panel>

            <Panel title="Summit operations map" accent="success" meta={`${filtered.length} summits`}>
              {filtered.length > 0 ? (
                <ClusteredSotaMap summits={filtered} onActivate={activateHere} userLocation={nearMe} height="62vh" bare />
              ) : (
                <EmptyPanel icon={Mountain} title="Nothing to map" text="No summits match the current filters." />
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'activations' && (
        <Panel title="My activations" accent="primary" meta={`${activations.length} total`}>
          {activations.length === 0 ? (
            <EmptyPanel
              icon={Mountain}
              title="No activations yet"
              text={user ? "You haven't created any SOTA activations yet." : 'Sign in to plan and run SOTA activations.'}
              action={<Button size="sm" onClick={newActivation}><Plus className="w-4 h-4 mr-1.5" /> New Activation</Button>}
            />
          ) : (
            <>
              {actHead}
              {activations.map((a) => renderActivation(a))}
            </>
          )}
        </Panel>
      )}

      {tab === 'favorites' && (
        <Panel title="Favorite summits" accent="primary" meta={`${favoriteSummits.length} saved`}>
          {favoriteSummits.length === 0 ? (
            <EmptyPanel icon={Star} title="No favorite summits yet" text="Tap the star on a summit to save it." />
          ) : (
            <>
              {summitGridHead}
              {favoriteSummits.map(renderSummitRow)}
            </>
          )}
        </Panel>
      )}

      {tab === 'chases' && <SotaChases user={user} onCount={onChaseCount} />}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <span>Upload your SOTA CSV and find spots on the official SOTA sites:</span>
        {SOTA_LINKS.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{l.label} <ExternalLink className="w-3 h-3" /></a>
        ))}
      </div>

      <SotaActivationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        user={user}
        onSaved={load}
        presetSummit={presetSummit}
      />
      <AddSummitDialog open={addSummitOpen} onClose={() => setAddSummitOpen(false)} onSaved={load} />
    </ConsolePage>
  );
}
