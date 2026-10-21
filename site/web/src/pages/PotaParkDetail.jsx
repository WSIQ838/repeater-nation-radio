import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import { Trees, ArrowLeft, Radio, MapPin, Globe, Star, ExternalLink, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PotaMap from '@/components/pota/PotaMap';
import PotaActivationDialog from '@/components/pota/PotaActivationDialog';
import { ConsolePage, CommandBar, Panel, DataHead, DataRow, EmptyPanel, StatusChip } from '@/components/console/Console';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

const STATUS_TONE = {
  Upcoming: 'primary',
  Active: 'success',
  Completed: 'muted',
  Cancelled: 'danger',
};

const UPCOMING_GRID = 'grid-cols-[minmax(0,1fr)_92px] sm:grid-cols-[minmax(0,1fr)_160px_100px_minmax(0,140px)_92px]';
const PREVIOUS_GRID = 'grid-cols-[minmax(0,1fr)_92px] sm:grid-cols-[minmax(0,1fr)_110px_64px_minmax(0,140px)_92px]';

export default function PotaParkDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [park, setPark] = useState(null);
  const [activations, setActivations] = useState([]);
  const [fav, setFav] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    try {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      const [p, acts, favs] = await Promise.all([
        base44.entities.PotaPark.get(id).catch(() => null),
        base44.entities.PotaActivation.filter({ park_id: id }, '-scheduled_date', 200).catch(() => []),
        u ? base44.entities.PotaFavorite.filter({ park_id: id }).catch(() => []) : [],
      ]);
      setPark(p);
      setActivations(acts || []);
      setFav((favs || [])[0] || null);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const toggleFav = async () => {
    try {
      if (fav) {
        await base44.entities.PotaFavorite.delete(fav.id);
        setFav(null);
      } else if (park) {
        const rec = await base44.entities.PotaFavorite.create({
          park_id: park.id,
          park_name: park.name,
          park_number: park.park_number,
          park_location: [park.city, park.state].filter(Boolean).join(', '),
        });
        setFav(rec);
      }
    } catch { toast({ title: 'Could not update favorite', variant: 'destructive' }); }
  };

  const now = new Date();
  const upcoming = useMemo(() => activations.filter((a) => a.status === 'Upcoming' || a.status === 'Active'), [activations]);
  const previous = useMemo(() => activations.filter((a) => a.status === 'Completed' || a.status === 'Cancelled'), [activations]);

  if (loading) return <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading park…</div>;
  if (!park) return (
    <div className="p-8 max-w-3xl mx-auto text-center">
      <Trees className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground mb-4">This park could not be found, or is pending review.</p>
      <Link to="/tools/pota"><Button variant="outline" title="Return to the POTA park directory."><ArrowLeft className="w-4 h-4 mr-1.5" /> Back to POTA</Button></Link>
    </div>
  );

  const isOfficial = park.source !== 'community';

  const hasMap = !!(park.lat && park.lng);

  return (
    <ConsolePage>
      <CommandBar
        icon={Trees}
        title={park.name}
        subtitle={`${park.park_number} · ${isOfficial ? 'Official POTA reference' : 'Repeater Nation community park'}`}
        status={park.pota_status === 'inactive' ? 'Inactive' : undefined}
        statusTone="muted"
        statusPulse={false}
        actions={(
          <>
            <Link to="/tools/pota" className="hidden sm:inline-flex"><Button variant="outline" size="sm" title="Return to the POTA park directory."><ArrowLeft className="w-4 h-4 mr-1.5" /> POTA</Button></Link>
            <Button variant="outline" size="sm" className="px-2.5" title={fav ? "Remove this park from your favorites." : "Save this park to your favorites."} onClick={toggleFav} aria-label={fav ? 'Remove favorite' : 'Add favorite'}>
              <Star className={`w-4 h-4 ${fav ? 'fill-amber-400 text-amber-500' : ''}`} />
            </Button>
            <Button size="sm" title="Create a new POTA activation at this park." onClick={() => setDialogOpen(true)}><Radio className="w-4 h-4 mr-1.5" /> Activate This Park</Button>
          </>
        )}
        kpis={[
          { label: 'Activations', value: park.activation_count || activations.length, title: 'Total activations recorded for this park.' },
          { label: 'Upcoming / active', value: upcoming.length, tone: 'primary', title: 'Activations at this park that are upcoming or currently active.' },
          { label: 'Last activation', value: <span className="text-sm">{park.last_activation_date ? format(new Date(park.last_activation_date), 'MMM d, yyyy') : '—'}</span>, title: 'Date of the most recent recorded activation at this park.' },
          { label: 'Park type', value: <span className="text-sm block truncate">{park.park_type && park.park_type !== 'Other' ? park.park_type : '—'}</span>, title: 'The directory category assigned to this park.' },
        ]}
      />

      <div className={`grid gap-3 items-start ${hasMap ? 'xl:grid-cols-2' : ''}`}>
        <Panel title="Park details" accent="primary" meta={isOfficial ? 'Official' : 'Community'}>
          <div className="p-3.5 space-y-3 text-sm">
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              <div className="space-y-2">
                {(park.city || park.state || park.county) && (
                  <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <span>{[park.address, park.city, park.county, park.state].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {park.website && <a href={park.website} target="_blank" rel="noreferrer" title="Open the official park website." className="flex items-center gap-2 text-primary hover:underline"><Globe className="w-4 h-4" /> Official website <ExternalLink className="w-3 h-3" /></a>}
                {park.pota_url && <a href={park.pota_url} target="_blank" rel="noreferrer" title="Open the POTA park reference." className="flex items-center gap-2 text-primary hover:underline"><ExternalLink className="w-4 h-4" /> POTA reference</a>}
              </div>
              <div className="space-y-2 text-muted-foreground text-[13px]">
                {park.submitted_by_name && <div>Submitted by <span className="text-foreground">{park.submitted_by_name}</span></div>}
              </div>
            </div>
            {park.description && <p className="text-sm text-muted-foreground"><Linkify text={park.description} /></p>}
            {park.photo_urls?.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {park.photo_urls.map((url, i) => (
                  <div key={i} className="aspect-video rounded overflow-hidden border border-border">
                    <Image src={url} fittingType="fill" className="w-full h-full" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>

        {hasMap && (
          <Panel title="Park map" accent="success" meta={`${Number(park.lat).toFixed(3)}, ${Number(park.lng).toFixed(3)}`}>
            <PotaMap parks={[park]} height="320px" bare />
          </Panel>
        )}
      </div>

      <Panel title="Upcoming and active activations" accent="primary" meta={`${upcoming.length}`}>
        {upcoming.length === 0 ? (
          <EmptyPanel
            icon={Radio}
            title="No upcoming activations"
            text="Be the first to plan one at this park."
            action={<Button size="sm" title="Create an activation at this park now." onClick={() => setDialogOpen(true)}>Start one now</Button>}
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
              <Link key={a.id} to={`/tools/pota/${a.id}`} title="Open this POTA activation." className="block">
                <DataRow className={UPCOMING_GRID}>
                  <span className="min-w-0 truncate font-medium">{a.operator_name || 'Activation'} {a.operator_callsign && <span className="text-primary font-mono text-[12px]">· {a.operator_callsign}</span>} <StaffTag callsign={a.operator_callsign} /></span>
                  <span className="hidden sm:block text-[12px] text-muted-foreground">{a.scheduled_date ? format(new Date(a.scheduled_date), 'EEE, MMM d · h:mm a') : '—'}</span>
                  <span className="hidden sm:block font-mono text-[12px] text-muted-foreground">{a.frequency ? `${a.frequency} MHz` : '—'}</span>
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
          <EmptyPanel icon={Radio} title="No previous activations" text="No previous activations recorded at this park yet." />
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
              <Link key={a.id} to={`/tools/pota/${a.id}`} title="Open this POTA activation." className="block">
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

      <PotaActivationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        user={user}
        onSaved={load}
        presetPark={park}
      />
    </ConsolePage>
  );
}
