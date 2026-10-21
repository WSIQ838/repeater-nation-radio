import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import { Mountain, ArrowLeft, Radio, MapPin, Star, ExternalLink, Loader2, Footprints } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import SotaMap from '@/components/sota/SotaMap';
import SotaActivationDialog from '@/components/sota/SotaActivationDialog';
import { STATUS_TONE, summitLocation } from '@/lib/sota';
import { ConsolePage, CommandBar, Panel, DataHead, DataRow, EmptyPanel, StatusChip } from '@/components/console/Console';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

const UPCOMING_GRID = 'grid-cols-[minmax(0,1fr)_92px] sm:grid-cols-[minmax(0,1fr)_160px_100px_minmax(0,140px)_92px]';
const PREVIOUS_GRID = 'grid-cols-[minmax(0,1fr)_92px] sm:grid-cols-[minmax(0,1fr)_110px_64px_minmax(0,140px)_92px]';

export default function SotaSummitDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [summit, setSummit] = useState(null);
  const [activations, setActivations] = useState([]);
  const [fav, setFav] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    try {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      const [p, acts, favs] = await Promise.all([
        base44.entities.SotaSummit.get(id).catch(() => null),
        base44.entities.SotaActivation.filter({ summit_id: id }, '-scheduled_date', 200).catch(() => []),
        u ? base44.entities.SotaFavorite.filter({ summit_id: id }).catch(() => []) : [],
      ]);
      setSummit(p);
      setActivations(acts || []);
      setFav((favs || [])[0] || null);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const toggleFav = async () => {
    try {
      if (fav) {
        await base44.entities.SotaFavorite.delete(fav.id);
        setFav(null);
      } else if (summit) {
        if (!user) { base44.auth.redirectToLogin(window.location.href); return; }
        const rec = await base44.entities.SotaFavorite.create({
          summit_id: summit.id,
          summit_name: summit.name,
          summit_ref: summit.summit_ref,
          summit_location: summitLocation(summit),
        });
        setFav(rec);
      }
    } catch { toast({ title: 'Could not update favorite', variant: 'destructive' }); }
  };

  const upcoming = useMemo(() => activations.filter((a) => a.status === 'Upcoming' || a.status === 'Active'), [activations]);
  const previous = useMemo(() => activations.filter((a) => a.status === 'Completed' || a.status === 'Cancelled'), [activations]);

  const startActivation = () => { if (!user) { base44.auth.redirectToLogin(window.location.href); return; } setDialogOpen(true); };

  if (loading) return <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading summit…</div>;
  if (!summit) return (
    <div className="p-8 max-w-3xl mx-auto text-center">
      <Mountain className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground mb-4">This summit could not be found, or is pending review.</p>
      <Link to="/tools/sota"><Button variant="outline"><ArrowLeft className="w-4 h-4 mr-1.5" /> Back to SOTA</Button></Link>
    </div>
  );

  const isOfficial = summit.source === 'official';
  const hasMap = !!(summit.lat && summit.lng);
  const lastActivation = activations.find((a) => a.status === 'Completed')?.ended_at || activations.find((a) => a.status === 'Completed')?.scheduled_date;

  return (
    <ConsolePage>
      <CommandBar
        icon={Mountain}
        title={summit.name}
        subtitle={`${summit.summit_ref} · ${isOfficial ? 'SOTA summits list' : 'Repeater Nation community summit'}`}
        status={summit.summit_status === 'inactive' ? 'Inactive' : undefined}
        statusTone="muted"
        statusPulse={false}
        actions={(
          <>
            <Link to="/tools/sota" className="hidden sm:inline-flex"><Button variant="outline" size="sm" title="Return to the SOTA summit directory."><ArrowLeft className="w-4 h-4 mr-1.5" /> SOTA</Button></Link>
            <Button variant="outline" size="sm" className="px-2.5" title={fav ? 'Remove this summit from your favorites.' : 'Save this summit to your favorites.'} onClick={toggleFav} aria-label={fav ? 'Remove favorite' : 'Add favorite'}>
              <Star className={`w-4 h-4 ${fav ? 'fill-amber-400 text-amber-500' : ''}`} />
            </Button>
            <Button size="sm" title="Plan or start a SOTA activation of this summit." onClick={startActivation}><Radio className="w-4 h-4 mr-1.5" /> Activate This Summit</Button>
          </>
        )}
        kpis={[
          { label: 'Points', value: summit.points != null ? `${summit.points}${summit.bonus_points ? ` +${summit.bonus_points}` : ''}` : '—', tone: 'primary', title: 'Activation points (plus seasonal bonus).' },
          { label: 'Altitude', value: summit.altitude_m ? <span className="text-sm">{Math.round(summit.altitude_m).toLocaleString()} m{summit.altitude_ft ? ` · ${Math.round(summit.altitude_ft).toLocaleString()} ft` : ''}</span> : '—' },
          { label: 'Activations here', value: activations.length, title: 'Repeater Nation activations of this summit.' },
          { label: 'Last activated', value: <span className="text-sm">{lastActivation ? format(new Date(lastActivation), 'MMM d, yyyy') : '—'}</span> },
        ]}
      />

      <div className={`grid gap-3 items-start ${hasMap ? 'xl:grid-cols-2' : ''}`}>
        <Panel title="Summit details" accent="primary" meta={isOfficial ? 'SOTA list' : 'Community'}>
          <div className="p-3.5 space-y-3 text-sm">
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              <div className="space-y-2">
                {summitLocation(summit) && (
                  <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <span>{[summit.region_name, summit.county, summit.state, summit.association_name].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                <a href={summit.sota_url || `https://www.sotadata.org.uk/en/summit/${summit.summit_ref}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline"><ExternalLink className="w-4 h-4" /> SOTA database page</a>
                <a href="https://sotawatch.sota.org.uk/" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline"><ExternalLink className="w-4 h-4" /> Post an alert / spot on SOTAwatch</a>
              </div>
              <div className="space-y-2 text-muted-foreground text-[13px]">
                <div>Reference <span className="font-mono text-foreground">{summit.summit_ref}</span></div>
                {summit.submitted_by_name && <div>Submitted by <span className="text-foreground">{summit.submitted_by_name}</span></div>}
              </div>
            </div>
            {summit.access_notes && (
              <div className="rounded border border-border bg-muted/30 p-2.5 text-[13px]">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-1"><Footprints className="w-3.5 h-3.5" /> Access</div>
                <p className="whitespace-pre-wrap">{summit.access_notes}</p>
              </div>
            )}
            {summit.description && <p className="text-sm text-muted-foreground"><Linkify text={summit.description} /></p>}
            {summit.photo_urls?.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {summit.photo_urls.map((url) => (
                  <div key={url} className="aspect-video rounded overflow-hidden border border-border">
                    <Image src={url} fittingType="fill" className="w-full h-full" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>

        {hasMap && (
          <Panel title="Summit map" accent="success" meta={`${Number(summit.lat).toFixed(3)}, ${Number(summit.lng).toFixed(3)}`}>
            <SotaMap summit={{ lat: summit.lat, lng: summit.lng, name: summit.name, ref: summit.summit_ref, location: summitLocation(summit) }} height="320px" bare />
          </Panel>
        )}
      </div>
      <Panel title="Upcoming and active activations" accent="primary" meta={`${upcoming.length}`}>
        {upcoming.length === 0 ? (
          <EmptyPanel
            icon={Radio}
            title="No upcoming activations"
            text="Be the first to plan one on this summit."
            action={<Button size="sm" title="Create an activation on this summit." onClick={startActivation}>Start one now</Button>}
          />
        ) : (
          <>
            <DataHead className={UPCOMING_GRID}>
              <span>Operator</span>
              <span className="hidden sm:block">Scheduled</span>
              <span className="hidden sm:block">Freq</span>
              <span className="hidden sm:block">Club</span>
              <span className="text-right">Status</span>
            </DataHead>
            {upcoming.map((a) => (
              <Link key={a.id} to={`/tools/sota/${a.id}`} title="Open this SOTA activation." className="block">
                <DataRow className={UPCOMING_GRID}>
                  <span className="min-w-0 truncate font-medium">{a.operator_name || 'Activation'} {a.operator_callsign && <span className="text-primary font-mono text-[12px]">· {a.operator_callsign}</span>} <StaffTag callsign={a.operator_callsign} /></span>
                  <span className="hidden sm:block text-[12px] text-muted-foreground">{a.scheduled_date ? format(new Date(a.scheduled_date), 'EEE, MMM d · h:mm a') : '—'}</span>
                  <span className="hidden sm:block font-mono text-[12px] text-muted-foreground">{a.frequency ? `${a.frequency} ${a.tx_mode || ''}` : '—'}</span>
                  <span className="hidden sm:block text-[12px] text-muted-foreground truncate">{a.club_name || '—'}</span>
                  <span className="text-right"><StatusChip tone={STATUS_TONE[a.status] || 'muted'}>{a.status}</StatusChip></span>
                </DataRow>
              </Link>
            ))}
          </>
        )}
      </Panel>

      <Panel title="Previous activations" accent="muted" meta={`${previous.length}`}>
        {previous.length === 0 ? (
          <EmptyPanel icon={Radio} title="No previous activations" text="No previous activations recorded on this summit yet." />
        ) : (
          <>
            <DataHead className={PREVIOUS_GRID}>
              <span>Operator</span>
              <span className="hidden sm:block">Date</span>
              <span className="hidden sm:block text-right">QSOs</span>
              <span className="hidden sm:block">Club</span>
              <span className="text-right">Status</span>
            </DataHead>
            {previous.map((a) => (
              <Link key={a.id} to={`/tools/sota/${a.id}`} title="Open this SOTA activation." className="block">
                <DataRow className={`${PREVIOUS_GRID} opacity-90`}>
                  <span className="min-w-0 truncate font-medium">{a.operator_name || 'Activation'} {a.operator_callsign && <span className="text-primary font-mono text-[12px]">· {a.operator_callsign}</span>} <StaffTag callsign={a.operator_callsign} /></span>
                  <span className="hidden sm:block text-[12px] text-muted-foreground">{a.scheduled_date ? format(new Date(a.scheduled_date), 'MMM d, yyyy') : '—'}</span>
                  <span className="hidden sm:block text-right font-mono text-[12px]">{a.contacts_count || 0}</span>
                  <span className="hidden sm:block text-[12px] text-muted-foreground truncate">{a.club_name || '—'}</span>
                  <span className="text-right"><StatusChip tone={STATUS_TONE[a.status] || 'muted'}>{a.status}</StatusChip></span>
                </DataRow>
              </Link>
            ))}
          </>
        )}
      </Panel>

      <SotaActivationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        user={user}
        onSaved={load}
        presetSummit={summit}
      />
    </ConsolePage>
  );
}
