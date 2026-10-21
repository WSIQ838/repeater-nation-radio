import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useTripRoute } from '@/hooks/useTripRoute';
import { useLiveNav } from '@/hooks/useLiveNav';
import TripPlannerMap from '@/components/trips/TripPlannerMap';
import StopList from '@/components/trips/StopList';
import OptimizePanel from '@/components/trips/OptimizePanel';
import RouteComparison from '@/components/trips/RouteComparison';
import RepeaterCard from '@/components/gps/RepeaterCard';
import { MapPin, Plus, Save, Trash2, RadioTower, X, Loader2, Route, FolderOpen, Navigation, Download, Home, Flag, GripVertical, LocateFixed, Square, Compass } from 'lucide-react';
import { formatFreq } from '@/utils';
import { jsPDF } from 'jspdf';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import TooltipHint from '@/components/ui/TooltipHint';

const kmToMi = (km) => (km || 0) / 1.60934;
const CORRIDOR_OPTIONS = [5, 10, 25, 50];

export default function TripPlanner() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    trips, tripsLoading,
    trip, setTrip,
    startPoint, setStartPoint, endPoint, setEndPoint,
    saving, save,
    loadTrip, loadTripById, newTrip, removeTrip,
    isCustomRoute,
    radiusKm,
    allPoints,
    routeInfo,
    serviceFilter, setServiceFilter,
    nearby, addedRepeaterIds,
    geocode, geocoding,
    addMapStop, addRepeaterStop, removeStop, moveStop, reorderStops, handleMapRemove,
    applyOptimizedRoute,
    alongRoute, alongRouteLoading, findRepeatersAlongRoute, clearAlongRoute,
  } = useTripRoute();

  const [startAddrInput, setStartAddrInput] = useState('');
  const [endAddrInput, setEndAddrInput] = useState('');
  const [stopAddrInput, setStopAddrInput] = useState('');
  const [corridorMi, setCorridorMi] = useState(10);

  const [navigating, setNavigating] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const stepRefs = useRef([]);
  const loadedTripIdParam = useRef(false);

  const { location: liveLocation, heading: liveHeading, progress: navUpdate } = useLiveNav({
    enabled: navigating,
    route: routeInfo,
    onError: (msg) => { toast({ title: msg, variant: 'destructive' }); setNavigating(false); },
  });

  // Deep link from GPS Navigation's "Edit Trip" (same shared Trip record).
  useEffect(() => {
    if (loadedTripIdParam.current) return;
    const id = searchParams.get('tripId');
    if (id) { loadedTripIdParam.current = true; loadTripById(id); }
  }, [searchParams, loadTripById]);

  useEffect(() => {
    if (navigating && !routeInfo) setNavigating(false);
  }, [routeInfo, navigating]);

  useEffect(() => {
    if (!navigating || navUpdate?.stepIndex == null) return;
    stepRefs.current[navUpdate.stepIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [navigating, navUpdate?.stepIndex]);

  const recenter = () => setRecenterSignal((n) => n + 1);

  const startGpsNavigation = async () => {
    let id = trip.id;
    if (!id) {
      if (!trip.name.trim()) setTrip((t) => ({ ...t, name: `Trip ${new Date().toLocaleDateString()}` }));
      id = await save();
      if (!id) return;
    } else {
      await save();
    }
    navigate(`/gps?tripId=${id}`);
  };

  const handleMapAdd = (lat, lng) => addMapStop(lat, lng);

  const handleGeocode = async (input, type, clearInput) => {
    const ok = await geocode(input, type);
    if (ok) clearInput('');
  };

  const safeName = (s) => (s || 'trip').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);

  const downloadBlob = (content, type, filename) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (!nearby.length) return;
    const headers = ['Name', 'Callsign', 'Frequency (MHz)', 'Channel', 'Tone (TX)', 'Tone (RX)', 'City', 'State', 'Latitude', 'Longitude', 'Distance (mi)'];
    const rows = nearby.map(({ repeater: r, distance, routeDist }) => [
      r.name || '', r.callsign || '', r.frequency || '', r.channel || '', r.tone || '', r.input_tone || '',
      r.city || '', r.state || '', r.lat || '', r.lng || '',
      routeDist != null ? kmToMi(routeDist).toFixed(1) : kmToMi(distance).toFixed(1),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob(csv, 'text/csv', `${safeName(trip.name)}-repeaters.csv`);
  };

  const exportJSON = () => {
    if (!nearby.length) return;
    const data = nearby.map(({ repeater: r, distance, routeDist, routeKm }) => ({
      name: r.name, callsign: r.callsign, frequency: r.frequency, channel: r.channel, tone: r.tone, input_tone: r.input_tone,
      city: r.city, state: r.state, lat: r.lat, lng: r.lng,
      distance_mi: routeDist != null ? Number(kmToMi(routeDist).toFixed(1)) : Number(kmToMi(distance).toFixed(1)),
      route_position_mi: routeKm != null ? Number(kmToMi(routeKm).toFixed(1)) : null,
    }));
    downloadBlob(JSON.stringify(data, null, 2), 'application/json', `${safeName(trip.name)}-repeaters.json`);
  };

  const exportTXT = () => {
    if (!nearby.length) return;
    const lines = [`Trip: ${trip.name || 'Untitled'}`, `Generated: ${new Date().toLocaleString()}`, `Repeaters in Range: ${nearby.length}`, ''];
    nearby.forEach(({ repeater: r, distance, routeDist, routeKm }, i) => {
      const dist = routeDist != null ? `${kmToMi(routeDist).toFixed(1)} mi off route` : `${kmToMi(distance).toFixed(1)} mi from nearest stop`;
      lines.push(`${i + 1}. ${r.name || 'Unnamed'} (${r.callsign || '—'})`);
      lines.push(`   Frequency: ${formatFreq(r.frequency)} MHz${r.channel ? ' · Ch ' + r.channel : ''}${r.tone ? ' · TX Tone ' + r.tone : ''}${r.input_tone ? ' · RX Tone ' + r.input_tone : ''}`);
      lines.push(`   Location: ${[r.city, r.state].filter(Boolean).join(', ') || '—'} (${r.lat}, ${r.lng})`);
      lines.push(`   Distance: ${dist}`);
      if (routeKm != null) lines.push(`   Route position: ${kmToMi(routeKm).toFixed(0)} mi into route`);
      lines.push('');
    });
    downloadBlob(lines.join('\n'), 'text/plain', `${safeName(trip.name)}-repeaters.txt`);
  };

  const exportPDF = () => {
    if (!nearby.length) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Trip Repeater List', 14, 20);
    doc.setFontSize(11);
    doc.text(`Trip: ${trip.name || 'Untitled'}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 37);
    doc.text(`Repeaters in range: ${nearby.length}`, 14, 44);
    const startY = 55;
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('#', 14, startY); doc.text('Name', 22, startY); doc.text('Callsign', 72, startY);
    doc.text('Freq (MHz)', 97, startY); doc.text('TX Tone', 120, startY); doc.text('RX Tone', 140, startY);
    doc.text('Location', 160, startY); doc.text('Distance', 185, startY);
    doc.setFont(undefined, 'normal');
    let y = startY + 6;
    nearby.forEach(({ repeater: r, distance, routeDist }, i) => {
      if (y > 280) { doc.addPage(); y = 20; }
      const dist = routeDist != null ? `${kmToMi(routeDist).toFixed(1)} mi` : `${kmToMi(distance).toFixed(1)} mi`;
      doc.text(String(i + 1), 14, y); doc.text(String(r.name || '').slice(0, 22), 22, y);
      doc.text(String(r.callsign || ''), 72, y); doc.text(formatFreq(r.frequency), 97, y);
      doc.text(String(r.tone || ''), 120, y); doc.text(String(r.input_tone || ''), 140, y);
      doc.text(String([r.city, r.state].filter(Boolean).join(', ')).slice(0, 18), 160, y);
      doc.text(dist, 185, y); y += 6;
    });
    doc.save(`${safeName(trip.name)}-repeaters.pdf`);
  };

  if (tripsLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold flex items-center gap-2">
            <Route className="w-7 h-7 text-primary" /> Trip Planner <TooltipHint>Build a route from a starting point to an ending point, add stops and repeaters, reorder them, compare routes, and navigate with GPS.</TooltipHint>
          </h1>
          <p className="text-muted-foreground mt-1">
            Plot your route, add repeaters and stops, optimize the order, and see which repeaters are in range.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" title="Clear the current route and start a new trip." onClick={newTrip}>
            <Plus className="w-4 h-4" /> New Trip
          </Button>
          <Button variant="outline" title="Save a new trip or update the trip you currently have open." onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {trip.id ? 'Update' : 'Save'} Trip
          </Button>
          <Button title="Start turn-by-turn navigation for the route points you have added." onClick={startGpsNavigation} disabled={allPoints.length < 2 || saving}>
            <Compass className="w-4 h-4" /> Start GPS Navigation
          </Button>
        </div>
      </div>

      {isCustomRoute && (
        <div className="px-4 py-2 rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-sm font-medium flex items-center gap-2">
          <GripVertical className="w-4 h-4" /> Custom Route — manually ordered. Use Optimize Route to find a more efficient order.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="lg:col-span-1 space-y-4">
          {/* Trip Details */}
          <Card className="p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Trip Name</Label>
              <Input id="name" value={trip.name} onChange={(e) => setTrip({ ...trip, name: e.target.value })} placeholder="e.g. Desert Crossing" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start">Start Date</Label>
                <Input id="start" type="date" value={trip.start_date} onChange={(e) => setTrip({ ...trip, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">End Date</Label>
                <Input id="end" type="date" value={trip.end_date} onChange={(e) => setTrip({ ...trip, end_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="radius" className="flex items-center gap-1">Coverage Radius (mi) <TooltipHint>Repeaters within this distance of your route stops can be shown on the map and in the nearby repeater results.</TooltipHint></Label>
              <Input
                id="radius"
                type="number"
                min="1"
                value={trip.search_radius_km ? (Number(trip.search_radius_km) / 1.60934).toFixed(0) : ''}
                onChange={(e) => setTrip({ ...trip, search_radius_km: e.target.value ? Number(e.target.value) * 1.60934 : '' })}
              />
              <p className="text-xs text-muted-foreground">Repeaters within this distance of any stop appear on the map.</p>
            </div>
            <div className="space-y-2 pt-1">
              <Label className="text-xs flex items-center gap-1"><RadioTower className="w-3 h-3 text-orange-500" /> Radio Service <TooltipHint>Choose whether the planner shows GMRS repeaters, HAM repeaters, or both.</TooltipHint></Label>
              <div className="grid grid-cols-3 gap-1 rounded-lg border p-1 bg-muted/30">
                {[
                  ['BOTH', 'GMRS + HAM'],
                  ['GMRS', 'GMRS Only'],
                  ['HAM', 'HAM Only'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setServiceFilter(value)}
                    className={`px-2 py-2 rounded-md text-xs font-medium transition-colors ${serviceFilter === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Choose which repeater service is shown on the map and in the list.</p>
            </div>
          </Card>

          {/* Start/End Addresses + Stops */}
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold text-sm flex items-center gap-2"><Home className="w-4 h-4 text-primary" /> Route Stops <TooltipHint>Add your start, end, and custom stops here. Drag stops to change the route order.</TooltipHint></h2>

            {/* Start Address */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1"><Home className="w-3 h-3 text-green-500" /> Starting Address <TooltipHint>Enter the trip starting location. Press Enter or use the add button to geocode it and place it on the route.</TooltipHint></Label>
              <div className="flex gap-2">
                <Input
                  value={startAddrInput}
                  onChange={(e) => setStartAddrInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGeocode(startAddrInput, 'start', setStartAddrInput)}
                  placeholder="Enter start address"
                  className="text-sm"
                />
                <Button title="Geocode and add this starting address to the route." onClick={() => handleGeocode(startAddrInput, 'start', setStartAddrInput)} disabled={geocoding === 'start'} size="icon">
                  {geocoding === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
              {startPoint && (
                <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-green-100 dark:bg-green-950/40 text-xs">
                  <Home className="w-3 h-3 text-green-600" />
                  <span className="flex-1 truncate">{startPoint.label}</span>
                  <button onClick={() => { setStartPoint(null); setTrip({ ...trip, start_address: '' }); }} className="text-red-500 hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* End Address */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1"><Flag className="w-3 h-3 text-red-500" /> Ending Address <TooltipHint>Enter the destination for a one-way trip. It is disabled when Round Trip is turned on.</TooltipHint></Label>
              <div className="flex gap-2">
                <Input
                  value={endAddrInput}
                  onChange={(e) => setEndAddrInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGeocode(endAddrInput, 'end', setEndAddrInput)}
                  placeholder="Enter end address"
                  className="text-sm"
                  disabled={trip.round_trip}
                />
                <Button title="Geocode and add this ending address to the route." onClick={() => handleGeocode(endAddrInput, 'end', setEndAddrInput)} disabled={geocoding === 'end' || trip.round_trip} size="icon">
                  {geocoding === 'end' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
              {endPoint && !trip.round_trip && (
                <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-red-100 dark:bg-red-950/40 text-xs">
                  <Flag className="w-3 h-3 text-red-600" />
                  <span className="flex-1 truncate">{endPoint.label}</span>
                  <button onClick={() => { setEndPoint(null); setTrip({ ...trip, end_address: '' }); }} className="text-red-500 hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Round Trip */}
            <label className="flex items-center justify-between text-sm cursor-pointer">
              <span className="font-medium flex items-center gap-1">Round Trip <TooltipHint>Return to the starting point after the last stop. When enabled, a separate ending address is not required.</TooltipHint></span>
              <Switch checked={trip.round_trip} onCheckedChange={(v) => setTrip({ ...trip, round_trip: v })} />
            </label>

            {/* Add Custom Stop */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">Add Custom Stop <TooltipHint>Add another address or place name that should be included in the route order.</TooltipHint></Label>
              <div className="flex gap-2">
                <Input
                  value={stopAddrInput}
                  onChange={(e) => setStopAddrInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGeocode(stopAddrInput, 'stop', setStopAddrInput)}
                  placeholder="Enter address or place name"
                  className="text-sm"
                />
                <Button title="Geocode and add this custom stop to the route." onClick={() => handleGeocode(stopAddrInput, 'stop', setStopAddrInput)} disabled={geocoding === 'stop'} size="icon">
                  {geocoding === 'stop' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Stop List */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">Stops ({trip.stops.length}) — drag to reorder <TooltipHint>Manual ordering is preserved until you use Optimize Route. Use the list controls to move or remove stops.</TooltipHint></Label>
              <StopList
                startPoint={startPoint}
                endPoint={endPoint}
                stops={trip.stops}
                roundTrip={trip.round_trip}
                onReorder={reorderStops}
                onMoveUp={(i) => moveStop(i, i - 1)}
                onMoveDown={(i) => moveStop(i, i + 1)}
                onRemove={removeStop}
              />
            </div>
          </Card>

          {/* Optimize Panel */}
          <OptimizePanel
            allPoints={allPoints}
            roundTrip={trip.round_trip}
            onRoundTripChange={(v) => setTrip({ ...trip, round_trip: v })}
            onApply={applyOptimizedRoute}
            stopsCount={trip.stops.length}
          />

          {/* Route Comparison */}
          <RouteComparison
            allPoints={allPoints}
            roundTrip={trip.round_trip}
            onApply={applyOptimizedRoute}
          />

          {/* Notes */}
          <Card className="p-5 space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-1">Notes <TooltipHint>Store trip-specific reminders such as gear, frequencies, meeting points, or other radio notes.</TooltipHint></Label>
            <Textarea
              id="notes"
              rows={3}
              value={trip.notes}
              onChange={(e) => setTrip({ ...trip, notes: e.target.value })}
              placeholder="Gear, frequencies, reminders…"
            />
          </Card>

          {/* Saved Trips */}
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2 text-sm">
              <FolderOpen className="w-4 h-4" /> Saved Trips
            </h2>
            {trips.length === 0 && <p className="text-sm text-muted-foreground">No saved trips yet.</p>}
            <div className="space-y-2">
              {trips.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
                    trip.id === t.id ? 'border-primary/40 bg-primary/5' : 'border-border'
                  }`}
                >
                  <button onClick={() => loadTrip(t)} className="flex-1 text-left min-w-0">
                    <div className="font-medium text-sm truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.round_trip ? 'Round trip' : ''}
                      {t.start_address ? ` · ${t.start_address.slice(0, 20)}` : ''}
                    </div>
                  </button>
                  <button onClick={() => removeTrip(t.id)} className="text-red-500 hover:text-red-600 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right column: map + directions + repeaters */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-0 overflow-hidden h-[55vh] relative">
            <TripPlannerMap
              waypoints={allPoints}
              radiusKm={radiusKm}
              nearby={nearby}
              onAdd={handleMapAdd}
              onRemove={handleMapRemove}
              route={routeInfo}
              navigating={navigating}
              liveLocation={liveLocation}
              liveHeading={liveHeading}
              recenterSignal={recenterSignal}
            />
            {routeInfo && (
              <div className="absolute z-[500] left-2 right-2 bottom-3 sm:left-3 sm:right-auto flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-2 rounded-lg bg-white/95 dark:bg-navy/95 backdrop-blur text-[11px] sm:text-xs font-medium shadow-md overflow-x-auto whitespace-nowrap">
                {navigating && navUpdate ? (
                  <>
                    <span className="flex items-center gap-1 text-primary"><Navigation className="w-3.5 h-3.5" /> {kmToMi(navUpdate.remainingKm).toFixed(0)} mi left</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{Math.floor(navUpdate.remainingMin / 60)}h {Math.round(navUpdate.remainingMin % 60)}m</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1"><Route className="w-3.5 h-3.5 text-primary" /> {kmToMi(routeInfo.distanceKm).toFixed(0)} mi</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{Math.floor(routeInfo.durationMin / 60)}h {Math.round(routeInfo.durationMin % 60)}m drive</span>
                    {trip.round_trip && <span className="text-green-600 dark:text-green-400">· Round trip</span>}
                  </>
                )}
              </div>
            )}
            {routeInfo?.steps?.length > 0 && (
              <div className="absolute z-[500] right-3 top-3 sm:top-auto sm:bottom-3 flex items-center gap-2">
                {navigating && (
                  <Button size="sm" variant="secondary" className="shadow-md" onClick={recenter}>
                    <LocateFixed className="w-4 h-4" /> Recenter
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={navigating ? 'destructive' : 'default'}
                  className="shadow-md"
                  onClick={() => setNavigating((v) => !v)}
                >
                  {navigating ? <><Square className="w-4 h-4" /> Stop Navigation</> : <><Navigation className="w-4 h-4" /> Preview Navigation</>}
                </Button>
              </div>
            )}
          </Card>

          {routeInfo?.steps?.length > 0 && (
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-primary" /> Turn-by-Turn Directions
                </h2>
                <span className="text-sm text-muted-foreground">{routeInfo.steps.length} steps</span>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
                {routeInfo.steps.map((s, i) => {
                  const isActive = navigating && navUpdate?.stepIndex === i;
                  return (
                    <div
                      key={i}
                      ref={(el) => { stepRefs.current[i] = el; }}
                      className={`flex items-start gap-2 py-1.5 px-2 rounded-md text-sm transition-colors ${isActive ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/50'}`}
                    >
                      <span className={`w-6 h-6 rounded-full text-xs font-bold grid place-items-center flex-shrink-0 mt-0.5 ${isActive ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'}`}>
                        {i + 1}
                      </span>
                      <span className="flex-1">{s.instruction}</span>
                      {s.distance > 0 && (
                        <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
                          {s.distance < 1609 ? `${Math.round(s.distance * 3.281)} ft` : `${(s.distance / 1609.34).toFixed(1)} mi`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Repeaters Along Route */}
          {allPoints.length >= 2 && (
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="font-semibold flex items-center gap-2">
                  <RadioTower className="w-4 h-4 text-orange-500" /> Repeaters Along Route
                </h2>
                <div className="flex items-center gap-2">
                  <select value={corridorMi} onChange={(e) => setCorridorMi(Number(e.target.value))} className="h-8 px-2 rounded-md border border-input bg-background text-xs">
                    {CORRIDOR_OPTIONS.map((mi) => <option key={mi} value={mi}>{mi} mi corridor</option>)}
                  </select>
                  <Button size="sm" onClick={() => findRepeatersAlongRoute(corridorMi)} disabled={!routeInfo || alongRouteLoading}>
                    {alongRouteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Find Repeaters Along Route'}
                  </Button>
                </div>
              </div>
              {!alongRoute ? (
                <p className="text-sm text-muted-foreground">Search a corridor around your planned route for nearby repeaters to add as stops.</p>
              ) : alongRoute.length === 0 ? (
                <p className="text-sm text-muted-foreground">No repeaters found within {corridorMi} mi of the route.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto scrollbar-thin">
                  {alongRoute.map(({ repeater: r, routeKm, routeDist }) => (
                    <RepeaterCard
                      key={r.id}
                      repeater={r}
                      meta={`${kmToMi(routeKm).toFixed(0)} mi into route · ${kmToMi(routeDist).toFixed(1)} mi off route`}
                      isAdded={addedRepeaterIds.has(r.id)}
                      onAddToRoute={(rep) => addRepeaterStop(rep)}
                    />
                  ))}
                </div>
              )}
              {alongRoute && (
                <button onClick={clearAlongRoute} className="text-xs text-muted-foreground hover:text-foreground underline">Clear results</button>
              )}
            </Card>
          )}

          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold flex items-center gap-2">
                <RadioTower className="w-4 h-4 text-orange-500" /> Repeaters in Range
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{nearby.length} found</span>
                {nearby.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm"><Download className="w-4 h-4" /> Export</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Export repeater list</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={exportCSV}>CSV (.csv)</DropdownMenuItem>
                      <DropdownMenuItem onClick={exportJSON}>JSON (.json)</DropdownMenuItem>
                      <DropdownMenuItem onClick={exportPDF}>PDF (.pdf)</DropdownMenuItem>
                      <DropdownMenuItem onClick={exportTXT}>Text (.txt)</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            {nearby.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {allPoints.length === 0
                  ? 'Add stops to your route to discover nearby repeaters.'
                  : 'No repeaters within range. Try increasing the coverage radius.'}
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto scrollbar-thin">
                {nearby.map(({ repeater: r, distance, stop, routeKm, routeDist }, i) => {
                  const isAdded = addedRepeaterIds.has(r.id);
                  return (
                    <div key={r.id} className="p-3 rounded-lg border border-border bg-muted/40">
                      <div className="flex items-center gap-2">
                        {routeKm != null && (
                          <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold grid place-items-center flex-shrink-0">
                            {i + 1}
                          </span>
                        )}
                        <div className="font-medium text-sm truncate flex-1">{r.name}</div>
                        <button
                          onClick={() => addRepeaterStop(r)}
                          disabled={isAdded}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                            isAdded
                              ? 'bg-muted text-muted-foreground cursor-default'
                              : 'bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground'
                          }`}
                        >
                          {isAdded ? 'Added' : '+ Stop'}
                        </button>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {formatFreq(r.frequency)} MHz · {r.callsign}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <MapPin className="w-3 h-3" />
                        {routeDist != null
                          ? `${kmToMi(routeDist).toFixed(1)} mi off route`
                          : `${kmToMi(distance).toFixed(1)} mi from ${stop?.label}`}
                      </div>
                      {routeKm != null && (
                        <div className="text-xs text-primary mt-0.5">
                          {kmToMi(routeKm).toFixed(0)} mi into route
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
