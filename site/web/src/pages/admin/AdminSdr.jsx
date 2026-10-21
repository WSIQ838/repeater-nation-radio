import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AlertCircle, Antenna, Check, Download, ExternalLink, Loader2, MapPin, Navigation, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react';
import SdrMap from '@/components/tools/SdrMap';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader, Loading, EmptyState } from '@/components/admin/parts';
import { errMsg } from '@/lib/utils';
import BodyPortal from '@/components/shared/BodyPortal';

const STATUS_STYLE = {
  approved: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  rejected: 'bg-destructive/15 text-destructive',
};

export default function AdminSdr() {
  const { toast } = useToast();
  const [tab, setTab] = useState('submissions');
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [noteTarget, setNoteTarget] = useState(null);
  const [noteValue, setNoteValue] = useState('');
  const [importing, setImporting] = useState(false);
  const [importDryRun, setImportDryRun] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [visibleStreamIds, setVisibleStreamIds] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await base44.entities.SdrStream.list('-created_date', 1000).catch(() => []);
      setStreams(rows || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const locateMe = () => {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported');
      toast({ title: 'Location unavailable', description: 'This browser does not provide geolocation.', variant: 'destructive' });
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationStatus('ready');
        setVisibleStreamIds(null);
        toast({ title: 'Map centered on your location' });
      },
      () => {
        setLocationStatus('denied');
        toast({ title: 'Location permission needed', description: 'Allow location access to sort SDR streams by distance from you.', variant: 'destructive' });
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
    );
  };

  const pending = useMemo(() => streams.filter((s) => s.verification_status === 'pending'), [streams]);

  const filtered = useMemo(() => {
    let list = streams.slice();
    if (statusFilter !== 'all') list = list.filter((s) => s.verification_status === statusFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((r) => (r.name || '').toLowerCase().includes(s) || (r.city || '').toLowerCase().includes(s) || (r.state || '').toLowerCase().includes(s));
    }
    return list;
  }, [streams, q, statusFilter]);

  const distanceMiles = (a, b) => {
    if (!userLocation || !Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng))) return null;
    const toRad = (v) => v * Math.PI / 180;
    const dLat = toRad(Number(a.lat) - userLocation.lat);
    const dLng = toRad(Number(a.lng) - userLocation.lng);
    const lat1 = toRad(userLocation.lat);
    const lat2 = toRad(Number(a.lat));
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  };

  const mappedStreams = useMemo(
    () => streams.filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng))),
    [streams]
  );

  const mapStreams = useMemo(() => {
    if (visibleStreamIds === null) return mappedStreams;
    const ids = new Set(visibleStreamIds);
    return mappedStreams.filter((s) => ids.has(s.id));
  }, [mappedStreams, visibleStreamIds]);

  const locationSorted = useMemo(() => {
    const list = mapStreams.slice();
    if (!userLocation) return list;
    return list.sort((a, b) => {
      const da = distanceMiles(a, userLocation);
      const db = distanceMiles(b, userLocation);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }, [mapStreams, userLocation]);

  const setStatus = async (stream, status, review_notes) => {
    try {
      await base44.entities.SdrStream.update(stream.id, { verification_status: status, ...(review_notes !== undefined ? { review_notes } : {}) });
      toast({ title: `Marked ${status}` });
      setNoteTarget(null);
      load();
    } catch (e) {
      toast({ title: 'Update failed', description: errMsg(e), variant: 'destructive' });
    }
  };

  const removeStream = async (stream) => {
    if (!confirm(`Remove "${stream.name}"? This deletes the submission.`)) return;
    try {
      await base44.entities.SdrStream.delete(stream.id);
      toast({ title: 'Stream removed' });
      load();
    } catch (e) {
      toast({ title: 'Delete failed', description: errMsg(e), variant: 'destructive' });
    }
  };

  const runImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await base44.functions.invoke('import-sdr-streams', { dryRun: importDryRun, countries: ['US'] });
      const data = res.data || res;
      setImportResult(data);
      toast({
        title: importDryRun ? 'Dry run complete' : 'Import complete',
        description: `${data.created} ${importDryRun ? 'would be added' : 'added'} · ${data.skipped_existing} already imported`,
      });
      if (!importDryRun) load();
    } catch (e) {
      toast({ title: 'Import failed', description: errMsg(e), variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const tabs = [
    { key: 'submissions', label: `Submissions${pending.length ? ` (${pending.length})` : ''}`, icon: AlertCircle },
    { key: 'streams', label: 'All Streams', icon: Antenna },
    { key: 'import', label: 'Import', icon: Download },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="SDR Streams" subtitle="Review member-submitted SDR receivers before they appear on the public Tools page." />

      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : tab === 'submissions' ? (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <EmptyState title="No pending submissions" description="Member-submitted streams awaiting review will show up here." icon={Antenna} />
          ) : (
            pending.map((s) => (
              <Card key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300 grid place-items-center shrink-0"><Antenna className="w-5 h-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{s.name} {s.radio_service && s.radio_service !== 'Other' && <span className="text-muted-foreground font-mono text-xs">· {s.radio_service}</span>}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[s.city, s.state].filter(Boolean).join(', ')}{s.submitted_by_name ? ` · by ${s.submitted_by_name}` : ''}
                  </div>
                  <a href={s.stream_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-0.5">
                    <ExternalLink className="w-3 h-3" /> {s.stream_url}
                  </a>
                  {s.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" title="Approve this stream" onClick={() => setStatus(s, 'approved')}><Check className="w-3.5 h-3.5 text-green-600" /></Button>
                  <Button size="sm" variant="outline" title="Reject with a note" onClick={() => { setNoteTarget(s); setNoteValue(''); }}><X className="w-3.5 h-3.5 text-destructive" /></Button>
                  <Button size="sm" variant="ghost" title="Delete" onClick={() => removeStream(s)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : tab === 'streams' ? (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="font-heading font-semibold">SDR Map & Nearby Streams</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  The list follows the current map view. Use your location to center the map and sort mapped receivers by distance.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={locateMe} disabled={locationStatus === 'loading'} className="gap-1.5 shrink-0">
                {locationStatus === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                {locationStatus === 'ready' ? 'My Location' : 'Find My Location'}
              </Button>
            </div>
          </Card>

          {mappedStreams.length > 0 && (
            <SdrMap
              streams={mappedStreams}
              height="430px"
              userLocation={userLocation}
              onVisibleChange={setVisibleStreamIds}
            />
          )}

          <Card className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city, state…" className="pl-9" />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
                <option value="all">All statuses</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {locationSorted.length} mapped streams in current map view · {filtered.length} matching search/filter · {mappedStreams.length} mapped / {streams.length} total
            </div>
          </Card>
          <div className="space-y-2">
            {locationSorted.filter((s) => filtered.some((f) => f.id === s.id)).slice(0, 200).map((s) => (
              <Card key={s.id} className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate text-sm">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[s.city, s.state].filter(Boolean).join(', ')}{s.source_name ? ` · via ${s.source_name}` : ''}
                    {userLocation && distanceMiles(s, userLocation) != null ? ` · ${distanceMiles(s, userLocation).toFixed(0)} mi away` : ''}
                  </div>
                </div>
                <Badge className={STATUS_STYLE[s.verification_status]}>{s.verification_status}</Badge>
                <div className="flex gap-1">
                  {s.verification_status !== 'approved' && (
                    <Button size="sm" variant="ghost" title="Approve" onClick={() => setStatus(s, 'approved')}><Check className="w-3.5 h-3.5 text-green-600" /></Button>
                  )}
                  {s.verification_status !== 'rejected' && (
                    <Button size="sm" variant="ghost" title="Reject" onClick={() => { setNoteTarget(s); setNoteValue(s.review_notes || ''); }}><Pencil className="w-3.5 h-3.5" /></Button>
                  )}
                  <Button size="sm" variant="ghost" title="Delete" onClick={() => removeStream(s)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              </Card>
            ))}
            {locationSorted.filter((s) => filtered.some((f) => f.id === s.id)).length === 0 && (
              <EmptyState title="No SDR streams in this map view" description="Pan or zoom the map to another area, or clear the search/filter." icon={Antenna} />
            )}
          </div>
        </div>
      ) : tab === 'import' ? (
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city, state…" className="pl-9" />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
                <option value="all">All statuses</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="text-xs text-muted-foreground mt-2">{filtered.length} streams · {streams.length} total</div>
          </Card>
          <div className="space-y-2">
            {filtered.slice(0, 200).map((s) => (
              <Card key={s.id} className="p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate text-sm">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[s.city, s.state].filter(Boolean).join(', ')}{s.source_name ? ` · via ${s.source_name}` : ''}
                  </div>
                </div>
                <Badge className={STATUS_STYLE[s.verification_status]}>{s.verification_status}</Badge>
                <div className="flex gap-1">
                  {s.verification_status !== 'approved' && (
                    <Button size="sm" variant="ghost" title="Approve" onClick={() => setStatus(s, 'approved')}><Check className="w-3.5 h-3.5 text-green-600" /></Button>
                  )}
                  {s.verification_status !== 'rejected' && (
                    <Button size="sm" variant="ghost" title="Reject" onClick={() => { setNoteTarget(s); setNoteValue(s.review_notes || ''); }}><Pencil className="w-3.5 h-3.5" /></Button>
                  )}
                  <Button size="sm" variant="ghost" title="Delete" onClick={() => removeStream(s)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              </Card>
            ))}
            {filtered.length > 200 && <div className="text-xs text-muted-foreground text-center">Showing first 200. Refine your search to see more.</div>}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-heading font-semibold text-lg mb-1">Import from rx-tx.info</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Pulls US-located SDR receivers from the RX-TX.info directory table and uses its map data for receiver coordinates. 
              <a href="https://rx-tx.info/table-sdr-points?freq_of=&freq_to=&band=All&country=4&title=&url=&qth=&type=All" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">rx-tx.info SDR directory</a>.
              Since that site isn't ours, every imported stream is auto-approved but keeps a visible "via rx-tx.info" attribution linking back to the source.
              Re-running only adds new receivers — anything already imported is skipped.
            </p>
            <div className="space-y-3 max-w-xl">
              <label className="flex items-center gap-2 text-sm">
                <input title="Preview the import without saving anything." type="checkbox" checked={importDryRun} onChange={(e) => setImportDryRun(e.target.checked)} />
                Dry run (preview without saving)
              </label>
              <Button title={importDryRun ? 'Preview the import.' : 'Run the import.'} onClick={runImport} disabled={importing}>
                {importing ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                {importDryRun ? 'Preview import' : 'Run import'}
              </Button>
            </div>
          </Card>

          {importResult && (
            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-3">{importResult.dry_run ? 'Preview Result' : 'Import Result'}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Points on page</div><div className="text-lg font-semibold">{importResult.total_points_on_page}</div></div>
                <div><div className="text-xs text-muted-foreground">US-located</div><div className="text-lg font-semibold">{importResult.matching_country}</div></div>
                <div><div className="text-xs text-muted-foreground">{importResult.dry_run ? 'Would add' : 'Added'}</div><div className="text-lg font-semibold text-green-600">{importResult.created}</div></div>
                <div><div className="text-xs text-muted-foreground">Already imported</div><div className="text-lg font-semibold">{importResult.skipped_existing}</div></div>
              </div>
            </Card>
          )}
        </div>
      )}

      {noteTarget && (
        <BodyPortal>
          <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={() => setNoteTarget(null)}>
            <Card className="p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold">Reject "{noteTarget.name}"</h3>
              <textarea
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                placeholder="Reason (shown to the submitter)"
                className="w-full h-24 rounded-md border border-input bg-background p-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setNoteTarget(null)}>Cancel</Button>
                <Button size="sm" variant="destructive" onClick={() => setStatus(noteTarget, 'rejected', noteValue)}>Reject</Button>
              </div>
            </Card>
          </div>
        </BodyPortal>
      )}
    </div>
  );
}
