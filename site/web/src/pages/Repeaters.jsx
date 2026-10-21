import { useEffect, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { repeaterIcon, clusterIcon } from '@/lib/leaflet-setup';
import { Search, Star, RadioTower, MapPin, Satellite, Layers, Trash2, Plus, Lock, MessageSquare, Inbox, Download, ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import RepeaterDialog from '@/components/repeaters/RepeaterDialog';
import RepeaterReportDialog from '@/components/repeaters/RepeaterReportDialog';
import RepeaterDetailDialog from '@/components/repeaters/RepeaterDetailDialog';
import MyRepeatersPanel from '@/components/repeaters/MyRepeatersPanel';
import RepeaterBookImport from '@/components/repeaters/RepeaterBookImport';
import MapFilterBar from '@/components/map/MapFilterBar';
import MapBoundsTracker from '@/components/map/MapBoundsTracker';
import { useUserLocation } from '@/hooks/useUserLocation';
import FlyToUser from '@/components/map/FlyToUser';
import { formatFreq } from '@/utils';
import { clusterRepeaters } from '@/lib/clusterUtils';
import StructuredData from '@/components/seo/StructuredData';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

const collectionSchema = {
  '@context': 'https://schema.org', '@type': 'CollectionPage',
  name: 'GMRS Repeater Directory', url: 'https://repeaternation.com/repeaters',
  description: 'Search the nationwide GMRS repeater directory with an interactive map, coverage radius, live status, and access controls.',
};

const getFavKey = (service) => `${String(service || 'GMRS').toLowerCase()}_fav_repeaters`;
const getFavs = (service = 'GMRS') => { try { return JSON.parse(localStorage.getItem(getFavKey(service)) || '[]'); } catch { return []; } };
const toggleFav = (id, service = 'GMRS') => {
  const favKey = getFavKey(service);
  const f = getFavs(service); const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.push(id);
  localStorage.setItem(favKey, JSON.stringify(f));
  return f;
};

const PAGE_SIZE = 50;

const SORT_OPTIONS = [
  { value: '-rating', label: 'Top Rated' },
  { value: 'callsign', label: 'Callsign (A-Z)' },
  { value: 'frequency', label: 'Frequency (Low-High)' },
  { value: 'updated', label: 'Last Updated' },
  { value: 'verification', label: 'Verification' },
  { value: 'state', label: 'State' },
  { value: 'city', label: 'City' },
  { value: 'distance', label: 'Distance' },
];

function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

export default function Repeaters({ service = 'GMRS' }) {
  const isHam = service === 'HAM';
  const directoryTitle = isHam ? 'HAM Repeater Directory' : 'GMRS Repeater Directory';
  const directoryDescription = isHam ? 'Search amateur radio repeaters with an interactive map and directory.' : 'Search the nationwide GMRS repeater directory with an interactive map, coverage radius, live status, and access controls.';

  // Directory state
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('-rating');
  const [favs, setFavs] = useState(getFavs(service));
  const [favsOnly, setFavsOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Map state
  const [mapRepeaters, setMapRepeaters] = useState([]);
  const [directoryRepeaters, setDirectoryRepeaters] = useState([]);
  const [directoryTotal, setDirectoryTotal] = useState(0);
  const [directoryTotalPages, setDirectoryTotalPages] = useState(1);
  const [mapFetching, setMapFetching] = useState(false);
  const [directoryFetching, setDirectoryFetching] = useState(false);
  const [zoom, setZoom] = useState(4);
  const [bounds, setBounds] = useState(null);
  const [mapRef, setMapRef] = useState(null);
  const [sat, setSat] = useState(false);
  const [focusRepeater, setFocusRepeater] = useState(null);
  const { location: gpsLoc, usingFallback: locFailed } = useUserLocation();
  const [manualLoc, setManualLoc] = useState(null);
  const [locQuery, setLocQuery] = useState('');
  const [locSearching, setLocSearching] = useState(false);
  const [locError, setLocError] = useState('');
  const userLoc = manualLoc || gpsLoc;

  const searchLocation = async () => {
    const q = locQuery.trim();
    if (!q) return;
    setLocSearching(true);
    setLocError('');
    try {
      const res = await base44.functions.invoke('geocode-location', { query: q });
      const data = res?.data || res;
      if (data?.lat != null && data?.lng != null) {
        setManualLoc([data.lat, data.lng]);
      } else {
        setLocError('Location not found. Try a different city, state, or ZIP.');
      }
    } catch {
      setLocError('Could not look up that location. Try again.');
    }
    setLocSearching(false);
  };

  // Other state
  const [user, setUser] = useState(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('directory');
  const [importOpen, setImportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);

  const currentPage = Math.min(page, directoryTotalPages);

  // Only re-fetch when favorites change if favorites-only mode is active
  const favsKey = favsOnly ? favs.join(',') : '';

  // Load user
  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // Live updates: refresh the directory when repeaters change anywhere
  // Each refresh re-runs two query-repeaters calls, and a bulk import or
  // sync emits one event per repeater -- so batch bursts into one refresh
  // and skip it entirely while the tab is in the background.
  useEffect(() => {
    let timer = null;
    let missed = false;
    const bump = () => setRefreshKey((k) => k + 1);
    const unsubscribe = base44.entities.Repeater.subscribe(() => {
      if (document.hidden) { missed = true; return; }
      if (timer) return;
      timer = setTimeout(() => { timer = null; bump(); }, 3000);
    });
    const onVisible = () => { if (!document.hidden && missed) { missed = false; bump(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe?.();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch the map independently from the directory. Both the map and directory
  // are bounded to the current map viewport so they stay synchronized.
  useEffect(() => {
    if (!bounds || tab !== 'directory') return;
    // Moving the map starts the directory at page 1 for the new viewport.
    setPage(1);
    let cancelled = false;
    const timer = setTimeout(async () => {
      setMapFetching(true);
      try {
        const center = mapRef ? mapRef.getCenter() : null;
        const res = await base44.functions.invoke('query-repeaters', {
          north: bounds.north, south: bounds.south, east: bounds.east, west: bounds.west,
          filters, service, search: debouncedSearch, sort, paginate: false,
          favorite_ids: favsOnly ? favs : undefined,
          lat: filters.radius && center ? center.lat : undefined,
          lng: filters.radius && center ? center.lng : undefined,
        });
        if (!cancelled) setMapRepeaters(res.data.repeaters || []);
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setMapFetching(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [bounds, filters, debouncedSearch, sort, favsOnly, favsKey, refreshKey, tab, mapRef]);

  // Keep the directory synchronized with the current map viewport.
  // Whenever the user pans/zooms, the visible repeater list follows the map.
  useEffect(() => {
    if (!bounds || tab !== 'directory') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setDirectoryFetching(true);
      try {
        const center = mapRef ? mapRef.getCenter() : null;
        const res = await base44.functions.invoke('query-repeaters', {
          north: bounds.north, south: bounds.south, east: bounds.east, west: bounds.west,
          filters, service, page: currentPage, pageSize: PAGE_SIZE, search: debouncedSearch,
          sort, paginate: true, favorite_ids: favsOnly ? favs : undefined,
          lat: filters.radius && center ? center.lat : undefined,
          lng: filters.radius && center ? center.lng : undefined,
        });

        let directoryRows = res.data.repeaters || [];
        let directoryCount = Number(res.data.total || 0);
        let directoryPages = Math.max(1, Number(res.data.totalPages || 1));

        // Callsign searches get a direct entity lookup as a safety net. This
        // prevents a stale/older deployed query function from hiding a repeater
        // that definitely exists in the Repeater entity.
        const exactCallsign = String(debouncedSearch || '').trim().toUpperCase();
        if (/^[A-Z]{1,2}[0-9][A-Z]{3}$/.test(exactCallsign)) {
          const direct = await base44.entities.Repeater
            .filter({ callsign: exactCallsign }, '-updated_date', 50)
            .catch(() => []);
          const inViewport = direct.filter((r) => {
            if (r?.hidden === true) return false;
            if (r?.lat == null || r?.lng == null) return false;
            return Number(r.lat) >= Number(bounds.south) && Number(r.lat) <= Number(bounds.north) &&
              Number(r.lng) >= Number(bounds.west) && Number(r.lng) <= Number(bounds.east);
          });
          if (inViewport.length) {
            directoryRows = inViewport;
            directoryCount = inViewport.length;
            directoryPages = 1;
          }
        }

        if (!cancelled) {
          setDirectoryRepeaters(directoryRows);
          setDirectoryTotal(directoryCount);
          setDirectoryTotalPages(directoryPages);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) { setDirectoryRepeaters([]); setDirectoryTotal(0); setDirectoryTotalPages(1); }
      } finally { if (!cancelled) setDirectoryFetching(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [bounds, filters, debouncedSearch, sort, favsOnly, favsKey, refreshKey, tab, currentPage, mapRef]);

  // Cluster only the viewport-bounded map results.
  const { clusters, markers } = useMemo(() => clusterRepeaters(mapRepeaters, zoom), [mapRepeaters, zoom]);
  const total = directoryTotal;
  const totalPages = directoryTotalPages;
  const repeaters = directoryRepeaters;
  const loading = directoryFetching && directoryRepeaters.length === 0;

  // Fly to repeater when selected from directory "View on Map"
  const viewOnMap = useCallback((r) => {
    if (mapRef && r.lat != null && r.lng != null) {
      mapRef.flyTo([r.lat, r.lng], Math.max(zoom, 10), { duration: 0.5 });
      setFocusRepeater(r);
      document.getElementById('repeater-map')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [mapRef, zoom]);

  const showCircles = zoom >= 8;
  const hasActiveFilters = Object.values(filters).some((v) => v !== '' && v != null) || !!debouncedSearch || favsOnly;

  const clearFilters = () => {
    setFilters({});
    setSearch('');
    setFavsOnly(false);
    setPage(1);
  };

  const deleteRepeater = async (r) => {
    if (!r?.id) return;
    try {
      await base44.entities.Repeater.delete(r.id);
      setMapRepeaters((rs) => rs.filter((x) => x.id !== r.id));
    } catch (e) { console.error(e); }
  };

  const refresh = () => { setRefreshKey((k) => k + 1); setPage(1); };

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-6">
      <StructuredData data={collectionSchema} />
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Repeater Directory' }]} />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">{directoryTitle}</h1>
          <p className="text-muted-foreground mt-1">
            {directoryDescription}<br />
            {loading ? 'Loading…' : `${total} repeaters · Showing ${total > 0 ? Math.min((currentPage - 1) * PAGE_SIZE + 1, total) : 0}–${Math.min(currentPage * PAGE_SIZE, total)}`}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search callsign, name, city, state, freq…" className="pl-9" />
          </div>
          {user && (
            <div className="flex items-center gap-2 shrink-0">
              {user.role === 'admin' && (
                <Button variant="outline" onClick={() => setImportOpen(true)}><Download className="w-4 h-4" /> Import</Button>
              )}
              <Button onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add</Button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      {user && (
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setTab('directory')}
            className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-md border transition-colors ${tab === 'directory' ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground'}`}
          >
            <RadioTower className="w-4 h-4" /> Directory
          </button>
          <button
            onClick={() => setTab('mine')}
            className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-md border transition-colors ${tab === 'mine' ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground'}`}
          >
            <Inbox className="w-4 h-4" /> My Repeaters & Requests
          </button>
        </div>
      )}

      <RepeaterDialog service={service} open={adding} onOpenChange={setAdding} onCreated={(r) => { if (r) refresh(); }} />
      <RepeaterBookImport open={importOpen} onOpenChange={setImportOpen} onImported={refresh} />
      <RepeaterReportDialog repeater={reportTarget} open={!!reportTarget} onOpenChange={(v) => !v && setReportTarget(null)} />

      <RepeaterDetailDialog
        repeater={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        onDelete={deleteRepeater}
        canEdit={selected && (selected.created_by_id === user?.id || selected.owner_user_id === user?.id)}
        isFav={selected && favs.includes(selected.id)}
        onToggleFav={() => selected && setFavs(toggleFav(selected.id, service))}
        userId={user?.id}
        onUpdated={(updated) => {
          setMapRepeaters((rs) => rs.map((x) => (x.id === updated.id ? updated : x)));
          setSelected(updated);
        }}
        onReport={setReportTarget}
      />

      {tab === 'mine' && user ? (
        <MyRepeatersPanel user={user} onPickRepeater={setSelected} />
      ) : (
        <>
          {/* Filters + Sort + Favorites */}
          <div className="flex flex-wrap items-center gap-2">
            <MapFilterBar service={service} filters={filters} onChange={(f) => { setFilters(f); setPage(1); }} resultCount={total} fetching={loading} />
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={() => { setFavsOnly(!favsOnly); setPage(1); }}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm transition-colors shrink-0 ${favsOnly ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground'}`}
            >
              <Star className={`w-4 h-4 ${favsOnly ? 'fill-primary' : ''}`} /> Favorites
            </button>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-sm text-muted-foreground hover:text-foreground underline shrink-0">Clear filters</button>
            )}
          </div>

          {/* Directory + Map */}
          <div className="grid lg:grid-cols-5 gap-6">
            {/* Directory list */}
            <div className="lg:col-span-2 space-y-3 max-h-[50vh] lg:max-h-[70vh] overflow-y-auto scrollbar-thin pr-1">
              {loading ? (
                [...Array(8)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)
              ) : repeaters.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-3">No repeaters found</p>
                  {hasActiveFilters && <Button variant="outline" onClick={clearFilters}>Clear filters</Button>}
                </div>
              ) : repeaters.map((r) => (
                <Card key={r.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelected(r)}>
                  <div className="flex items-start gap-3">
                    <div className="grid place-items-center w-10 h-10 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 shrink-0">
                      <RadioTower className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{r.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${r.status === 'Online' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>{r.status}</span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{formatFreq(r.frequency)} MHz {r.offset ? `· ${r.offset > 0 ? '+' : ''}${r.offset}` : ''} {r.tone ? `· ${r.tone}` : ''}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{r.callsign} · {r.mode}</span>
                        {r.access === 'Closed' && <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"><Lock className="w-2.5 h-2.5" /> Closed</span>}
                      </div>
                      {r.coverage_radius && <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {r.coverage_radius} mi coverage</div>}
                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Click to view &amp; add comments</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.lat != null && r.lng != null && (
                        <button onClick={(e) => { e.stopPropagation(); viewOnMap(r); }} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted" title="View on Map">
                          <MapPin className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setFavs(toggleFav(r.id, service)); }} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Favorite">
                        <Star className={`w-4 h-4 ${favs.includes(r.id) ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
                      </button>
                      {(r.created_by_id === user?.id || r.owner_user_id === user?.id) && (
                        <button onClick={(e) => { e.stopPropagation(); deleteRepeater(r); }} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10" title={r.owner_user_id === user?.id ? 'Delete your repeater' : 'Delete'}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {user && (
                        <button onClick={(e) => { e.stopPropagation(); setReportTarget(r); }} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Report this repeater">
                          <Flag className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Map */}
            <Card id="repeater-map" className="lg:col-span-3 p-0 overflow-hidden h-[50vh] lg:h-[70vh] relative">
              <button onClick={() => setSat(!sat)} className="absolute z-[500] right-3 top-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-navy/90 backdrop-blur text-xs font-medium shadow-sm hover:bg-white">
                {sat ? <Layers className="w-3.5 h-3.5" /> : <Satellite className="w-3.5 h-3.5" />}
                {sat ? 'Street' : 'Satellite'}
              </button>
              <div className="absolute z-[500] left-3 bottom-3 right-3 sm:right-auto sm:max-w-sm px-3 py-2 rounded-lg bg-white/95 dark:bg-navy/95 backdrop-blur text-xs shadow-sm space-y-1.5">
                {locFailed ? (
                  <div>We couldn't find your location, so the whole U.S. is shown. Allow location access in your browser, or search a city, state, or ZIP below.</div>
                ) : manualLoc ? (
                  <div>Showing your search location. <button type="button" className="underline" onClick={() => setManualLoc(null)}>Use detected location instead</button></div>
                ) : (
                  <div>Not your location? Search a city, state, or ZIP below.</div>
                )}
                <div className="flex gap-1.5">
                  <Input
                    value={locQuery}
                    onChange={(e) => setLocQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchLocation()}
                    placeholder="City, state, or ZIP"
                    className="h-7 text-xs"
                  />
                  <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onClick={searchLocation} disabled={locSearching || !locQuery.trim()}>
                    {locSearching ? '…' : 'Go'}
                  </Button>
                </div>
                {locError && <div className="text-destructive">{locError}</div>}
              </div>
              {mapFetching && (
                <div className="absolute z-[500] left-3 top-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-navy/90 backdrop-blur text-xs font-medium shadow-sm">
                  <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  Loading…
                </div>
              )}
              {user && (
                <Button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="absolute z-[500] top-14 right-3 sm:top-auto sm:right-auto sm:left-3 sm:bottom-3 shadow-lg"
                  title={isHam ? 'Add a HAM repeater' : 'Add a GMRS repeater'}
                >
                  <Plus className="w-4 h-4" />
                  Add a Repeater
                </Button>
              )}
              <MapContainer center={[39.5, -98.35]} zoom={4} className="h-full w-full" scrollWheelZoom>
                <MapBoundsTracker onBoundsChange={setBounds} onZoomChange={setZoom} onMapReady={setMapRef} />
                <FlyToUser location={userLoc} />
                <TileLayer
                  attribution='&copy; Esri'
                  url={sat ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'}
                  maxZoom={20}
                />
                {clusters.map((c, i) => (
                  <Marker
                    key={`cluster-${i}`}
                    position={[c.lat, c.lng]}
                    icon={clusterIcon(c.count)}
                    eventHandlers={{ click: () => mapRef?.flyTo([c.lat, c.lng], Math.min(zoom + 2, 10)) }}
                  >
                    <Popup>{c.count} repeaters in this area. Zoom in to see them.</Popup>
                  </Marker>
                ))}
                {markers.map((r) => (
                  <Marker key={`r-${r.id}`} position={[r.lat, r.lng]} icon={repeaterIcon}>
                    <Popup>
                      <div className="min-w-[160px]">
                        <div className="font-semibold">{r.name}</div>
                        <div className="text-xs font-mono">{formatFreq(r.frequency)} MHz · {r.callsign}</div>
                        <div className="text-xs">{r.mode} · {r.status}</div>
                        <button onClick={() => setSelected(r)} className="text-xs text-primary hover:underline mt-1">View details</button>
                      </div>
                    </Popup>
                    {showCircles && r.coverage_radius ? (
                      <Circle center={[r.lat, r.lng]} radius={r.coverage_radius * 1609} pathOptions={{ color: '#f97316', fillOpacity: 0.08 }} />
                    ) : null}
                  </Marker>
                ))}
                {focusRepeater && focusRepeater.lat != null && focusRepeater.lng != null && (
                  <Marker position={[focusRepeater.lat, focusRepeater.lng]} icon={repeaterIcon}>
                    <Popup>
                      <div className="min-w-[160px]">
                        <div className="font-semibold">{focusRepeater.name}</div>
                        <div className="text-xs font-mono">{formatFreq(focusRepeater.frequency)} MHz · {focusRepeater.callsign}</div>
                        <button onClick={() => setSelected(focusRepeater)} className="text-xs text-primary hover:underline mt-1">View details</button>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            </Card>
          </div>

          {/* Pagination */}
          {!loading && total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, total)}–{Math.min(currentPage * PAGE_SIZE, total)} of {total} repeaters
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                  <ChevronLeft className="w-4 h-4" /> Prev
                </Button>
                {pageNumbers(currentPage, totalPages).map((p, i) =>
                  p === '...' ? <span key={`e${i}`} className="px-2 text-muted-foreground">…</span> :
                  <Button key={p} variant={p === currentPage ? 'default' : 'outline'} size="sm" className="min-w-9" onClick={() => setPage(p)}>{p}</Button>
                )}
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}