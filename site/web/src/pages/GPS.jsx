import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Settings, LocateFixed, Navigation, Play, Square, AlertTriangle, MapPinOff, Loader2, FolderOpen, Route as RouteIcon } from 'lucide-react';
import { useTripRoute } from '@/hooks/useTripRoute';
import { useLiveNav } from '@/hooks/useLiveNav';
import { useNearbyRepeaters } from '@/hooks/useNearbyRepeaters';
import { useLogbookRadioInfo } from '@/hooks/useLogbookRadioInfo';
import GPSMap from '@/components/gps/GPSMap';
import NearbyRepeaterPanel from '@/components/gps/NearbyRepeaterPanel';
import DrivingModeBar from '@/components/gps/DrivingModeBar';
import RepeaterAlertBanner from '@/components/gps/RepeaterAlertBanner';
import GpsSettingsSheet from '@/components/gps/GpsSettingsSheet';
import RepeaterDetailDialog from '@/components/repeaters/RepeaterDetailDialog';
import QsoFormDialog from '@/components/logbook/QsoFormDialog';

const angularDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

export default function GPS() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const tripIdParam = searchParams.get('tripId');
  const { radioInfo } = useLogbookRadioInfo();

  const {
    trips, tripsLoading, trip, loadTrip, loadTripById, newTrip, save, saving,
    startPoint, endPoint, setEndPoint,
    allPoints, routeInfo, routeLoading,
    addRepeaterStop, addedRepeaterIds,
    serviceFilter, setServiceFilter,
    alongRoute, alongRouteLoading, alongRouteCorridorMi, findRepeatersAlongRoute,
  } = useTripRoute();

  const [loadedFromUrl, setLoadedFromUrl] = useState(false);
  const [tripPicker, setTripPicker] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [following, setFollowing] = useState(true);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [drivingMode, setDrivingMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [alertDistanceMi, setAlertDistanceMi] = useState(5);
  const [radiusMi, setRadiusMi] = useState(25);
  const [autoRange, setAutoRange] = useState(false);
  const [tech, setTech] = useState('');
  const [gpsError, setGpsError] = useState(null);
  const [selectedRepeater, setSelectedRepeater] = useState(null);
  const [logContactRepeater, setLogContactRepeater] = useState(null);
  const [activeAlert, setActiveAlert] = useState(null);
  const announcedRef = useRef(new Set());
  const saveTimerRef = useRef(null);

  // Load the shared trip/route from the handoff link (Trip Planner -> "Start
  // GPS Navigation"), or start empty and let the user pick a saved trip.
  useEffect(() => {
    if (loadedFromUrl) return;
    setLoadedFromUrl(true);
    if (tripIdParam) {
      loadTripById(tripIdParam).then((ok) => { if (ok) setNavigating(true); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripIdParam, loadedFromUrl]);

  const { location, heading, speedMph, accuracyM, progress } = useLiveNav({
    enabled: true,
    route: routeInfo,
    onError: (msg) => setGpsError(msg),
  });
  useEffect(() => { if (location) setGpsError(null); }, [location]);

  const { repeaters: nearbyRepeaters, loading: nearbyLoading } = useNearbyRepeaters({
    location, enabled: !!location, radiusMi, autoRange, service: serviceFilter === 'BOTH' ? 'ALL' : serviceFilter, tech,
  });

  // Auto-save mutations back to the shared Trip record so Trip Planner picks
  // up the same changes next time it loads this trip. Only for trips that are
  // already saved — an unsaved ad-hoc GPS session isn't persisted until the
  // user explicitly sends it to Trip Planner.
  useEffect(() => {
    if (!trip.id) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { save(); }, 1500);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.stops, trip.round_trip, startPoint, endPoint]);

  // Repeater-ahead alerts: based on live nearby detections roughly in the
  // direction of travel, not the on-demand route corridor search (which the
  // user may not have run) — this is "what's coming up right now".
  useEffect(() => {
    if (!alertsEnabled || !navigating || heading == null || !location) return;
    const candidate = nearbyRepeaters.find(
      ({ repeater: r, distanceMi, bearingDeg }) => distanceMi <= alertDistanceMi && angularDiff(bearingDeg, heading) <= 30 && !announcedRef.current.has(r.id)
    );
    if (candidate) {
      announcedRef.current.add(candidate.repeater.id);
      setActiveAlert({ repeater: candidate.repeater, milesAhead: candidate.distanceMi });
    }
  }, [nearbyRepeaters, alertsEnabled, navigating, heading, location, alertDistanceMi]);

  useEffect(() => {
    if (!activeAlert) return;
    const t = setTimeout(() => setActiveAlert(null), 8000);
    return () => clearTimeout(t);
  }, [activeAlert]);

  const nextStep = useMemo(() => {
    if (!routeInfo?.steps?.length || progress?.stepIndex == null) return null;
    return routeInfo.steps[progress.stepIndex];
  }, [routeInfo, progress]);

  const navigateToRepeater = (r) => {
    setEndPoint({ label: r.name || r.callsign, lat: r.lat, lng: r.lng });
    setNavigating(true);
    setFollowing(true);
    toast({ title: `Navigating to ${r.callsign || r.name}` });
  };

  const addToRoute = (r) => {
    addRepeaterStop(r);
    toast({ title: `Added ${r.callsign || r.name} to route` });
  };

  const logContactPrefill = (r) => ({
    callsign: r.callsign || '',
    radio_service: r.radio_service || 'GMRS',
    frequency: r.frequency ? String(r.frequency) : '',
    mode: 'Repeater',
    notes: `Logged via GPS Navigation near ${r.name || r.callsign || 'repeater'}`,
  });

  const startGpsNavigation = () => { setNavigating(true); setFollowing(true); };
  const stopGpsNavigation = () => { setNavigating(false); };

  const sendToTripPlanner = async () => {
    if (!trip.id && !trip.name.trim()) {
      toast({ title: 'Name this trip before sending it to Trip Planner' });
      return;
    }
    const id = await save();
    if (id) navigate(`/trips?tripId=${id}`);
  };

  const enableLocation = () => {
    setGpsError(null);
    navigator.geolocation?.getCurrentPosition(() => setGpsError(null), (err) => {
      setGpsError(err.code === err.PERMISSION_DENIED
        ? 'GPS location is required for live repeater detection and navigation.'
        : 'Could not get your GPS location.');
    }, { enableHighAccuracy: true, timeout: 8000 });
  };

  const hasRoute = allPoints.length >= 2;
  const poorAccuracy = accuracyM != null && accuracyM > 50;

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      <header className="flex items-center gap-2 h-14 px-3 border-b border-border bg-card shrink-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate('/trips')} aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate flex items-center gap-1.5">
            <Navigation className="w-4 h-4 text-primary shrink-0" /> {trip.name || 'GPS Navigation'}
          </div>
          {routeLoading && <div className="text-[11px] text-muted-foreground">Calculating route…</div>}
        </div>
        {trip.id && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/trips?tripId=${trip.id}`)}>Edit Trip</Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => setTripPicker(true)} aria-label="Saved trips">
          <FolderOpen className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <Settings className="w-5 h-5" />
        </Button>
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="relative flex-1 min-h-[42vh] lg:min-h-0">
          <GPSMap
            location={location}
            heading={heading}
            route={routeInfo}
            waypoints={allPoints}
            repeaterMarkers={nearbyRepeaters}
            routeRepeaterMarkers={alongRoute || []}
            selectedRepeater={selectedRepeater}
            following={navigating && following}
            onUserPanned={() => setFollowing(false)}
            recenterSignal={recenterSignal}
            onSelectRepeater={setSelectedRepeater}
          />

          {drivingMode && navigating && (
            <DrivingModeBar
              nextStep={nextStep}
              road={nextStep?.road}
              remainingKm={progress?.remainingKm}
              remainingMin={progress?.remainingMin}
              speedMph={speedMph}
            />
          )}

          <RepeaterAlertBanner alert={activeAlert} onDismiss={() => setActiveAlert(null)} />

          {(accuracyM != null || poorAccuracy) && (
            <div className={`absolute left-3 z-[500] px-2.5 py-1 rounded-md text-[11px] font-medium shadow-sm backdrop-blur ${drivingMode ? 'bottom-3' : 'top-3'} ${poorAccuracy ? 'bg-orange-500 text-white' : 'bg-white/90 dark:bg-navy/90'}`}>
              {poorAccuracy && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />}
              GPS Accuracy: ±{Math.round(accuracyM)} m
            </div>
          )}

          <button
            onClick={() => { setFollowing(true); setRecenterSignal((n) => n + 1); }}
            className="absolute right-3 bottom-3 z-[500] w-11 h-11 rounded-full bg-white dark:bg-navy shadow-lg grid place-items-center hover:bg-muted"
            aria-label="Recenter"
          >
            <LocateFixed className="w-5 h-5 text-primary" />
          </button>

          {gpsError && (
            <div className="absolute inset-0 z-[700] bg-background/95 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="max-w-sm text-center space-y-3">
                <MapPinOff className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="font-medium">{gpsError}</p>
                <p className="text-sm text-muted-foreground">Trip Planner still works with manually entered addresses if you'd rather plan without GPS.</p>
                <div className="flex items-center justify-center gap-2">
                  <Button onClick={enableLocation}>Enable Location</Button>
                  <Button variant="outline" onClick={() => navigate('/trips')}>Go to Trip Planner</Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {!drivingMode && (
          <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-border flex flex-col min-h-[38vh] lg:min-h-0">
            <NearbyRepeaterPanel
              nearby={nearbyRepeaters} nearbyLoading={nearbyLoading}
              alongRoute={alongRoute} alongRouteLoading={alongRouteLoading}
              hasRoute={hasRoute} onFindAlongRoute={findRepeatersAlongRoute} alongRouteCorridorMi={alongRouteCorridorMi}
              radiusMi={radiusMi} onRadiusChange={setRadiusMi} autoRange={autoRange} onAutoRangeChange={setAutoRange}
              service={serviceFilter === 'BOTH' ? 'ALL' : serviceFilter} onServiceChange={(v) => setServiceFilter(v === 'ALL' ? 'BOTH' : v)}
              tech={tech} onTechChange={setTech}
              addedRepeaterIds={addedRepeaterIds}
              onView={setSelectedRepeater}
              onNavigate={navigateToRepeater}
              onAddToRoute={addToRoute}
              onLogContact={setLogContactRepeater}
            />
          </div>
        )}
      </div>

      {!drivingMode && (
        <div className="flex items-center gap-2 p-2 border-t border-border bg-card shrink-0 flex-wrap">
          {navigating ? (
            <Button variant="destructive" onClick={stopGpsNavigation} className="flex-1 min-w-[140px]"><Square className="w-4 h-4" /> Stop Navigation</Button>
          ) : (
            <Button onClick={startGpsNavigation} disabled={!hasRoute} className="flex-1 min-w-[140px]"><Play className="w-4 h-4" /> Start Navigation</Button>
          )}
          <Button variant="outline" onClick={() => setDrivingMode(true)} disabled={!navigating}>Driving Mode</Button>
          {!trip.id && hasRoute && <Button variant="outline" onClick={sendToTripPlanner} disabled={saving}><RouteIcon className="w-4 h-4" /> Send to Trip Planner</Button>}
        </div>
      )}
      {drivingMode && (
        <button
          onClick={() => setDrivingMode(false)}
          className="absolute left-1/2 -translate-x-1/2 bottom-3 z-[500] px-4 py-2 rounded-full bg-black/70 text-white text-xs font-medium"
        >
          Exit Driving Mode
        </button>
      )}

      {tripPicker && (
        <div className="fixed inset-0 z-[800] bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={() => setTripPicker(false)}>
          <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[70vh] overflow-y-auto scrollbar-thin p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Saved Trips</h2>
              <Button variant="ghost" size="sm" onClick={() => { newTrip(); setTripPicker(false); }}>New Trip</Button>
            </div>
            {tripsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : trips.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No saved trips yet. Plan one in Trip Planner.</p>
            ) : trips.map((t) => (
              <button
                key={t.id}
                onClick={() => { loadTrip(t); setTripPicker(false); setNavigating(true); }}
                className="w-full text-left p-2.5 rounded-lg border border-border hover:bg-muted"
              >
                <div className="font-medium text-sm">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.start_address || 'No start address'}{t.end_address ? ` → ${t.end_address}` : ''}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <RepeaterDetailDialog
        repeater={selectedRepeater}
        open={!!selectedRepeater}
        onOpenChange={(v) => !v && setSelectedRepeater(null)}
        canEdit={false}
        isFav={false}
        onToggleFav={() => {}}
        userId={null}
        onUpdated={(updated) => setSelectedRepeater(updated)}
        onReport={() => {}}
      />

      <QsoFormDialog
        open={!!logContactRepeater}
        onOpenChange={(v) => !v && setLogContactRepeater(null)}
        prefill={logContactRepeater ? logContactPrefill(logContactRepeater) : null}
        radioInfo={radioInfo}
        onSaved={() => { toast({ title: 'Contact logged' }); setLogContactRepeater(null); }}
      />

      <GpsSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        drivingMode={drivingMode}
        onDrivingModeChange={setDrivingMode}
        alertsEnabled={alertsEnabled}
        onAlertsEnabledChange={setAlertsEnabled}
        alertDistanceMi={alertDistanceMi}
        onAlertDistanceChange={setAlertDistanceMi}
      />
    </div>
  );
}
