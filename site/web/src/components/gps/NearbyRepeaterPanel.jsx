import { useMemo, useState } from 'react';
import { RadioTower, Route as RouteIcon, Loader2 } from 'lucide-react';
import RepeaterCard from './RepeaterCard';

const RANGE_OPTIONS = [5, 10, 25, 50, 100];
const CORRIDOR_OPTIONS = [5, 10, 25, 50];
const TECH_OPTIONS = ['FM', 'DMR', 'D-STAR', 'YSF', 'P25', 'NXDN', 'M17'];
const selectClass = 'h-8 px-2 rounded-md border border-input bg-background text-foreground text-xs';

const kmToMi = (km) => (km || 0) / 1.60934;

// Requirement: never mix "near me right now" with "near the planned route" in
// one list — two explicit tabs instead of one merged feed.
export default function NearbyRepeaterPanel({
  nearby, nearbyLoading,
  alongRoute, alongRouteLoading, hasRoute, onFindAlongRoute, alongRouteCorridorMi,
  radiusMi, onRadiusChange, autoRange, onAutoRangeChange,
  service, onServiceChange, tech, onTechChange,
  addedRepeaterIds,
  onView, onNavigate, onAddToRoute, onLogContact,
}) {
  const [tab, setTab] = useState('route');
  const [sortBy, setSortBy] = useState('distance');
  const [corridorMi, setCorridorMi] = useState(alongRouteCorridorMi || 10);

  const sortedNearby = useMemo(() => {
    const arr = [...(nearby || [])];
    if (sortBy === 'direction') arr.sort((a, b) => a.bearingDeg - b.bearingDeg);
    else if (sortBy === 'frequency') arr.sort((a, b) => (a.repeater.frequency || 0) - (b.repeater.frequency || 0));
    else arr.sort((a, b) => a.distanceMi - b.distanceMi);
    return arr;
  }, [nearby, sortBy]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 p-2 border-b border-border shrink-0">
        <button
          onClick={() => setTab('route')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-medium transition-colors ${tab === 'route' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
        >
          <RouteIcon className="w-3.5 h-3.5" /> Along Route
        </button>
        <button
          onClick={() => setTab('nearby')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-medium transition-colors ${tab === 'nearby' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
        >
          <RadioTower className="w-3.5 h-3.5" /> Nearby
        </button>
      </div>

      {tab === 'nearby' ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5 p-2 border-b border-border shrink-0">
            <select value={autoRange ? 'auto' : String(radiusMi)} onChange={(e) => e.target.value === 'auto' ? onAutoRangeChange(true) : (onAutoRangeChange(false), onRadiusChange(Number(e.target.value)))} className={selectClass}>
              {RANGE_OPTIONS.map((mi) => <option key={mi} value={mi}>{mi} mi</option>)}
              <option value="auto">Automatic Range</option>
            </select>
            <select value={service} onChange={(e) => onServiceChange(e.target.value)} className={selectClass}>
              <option value="ALL">All Services</option>
              <option value="GMRS">GMRS</option>
              <option value="HAM">HAM</option>
            </select>
            <select value={tech} onChange={(e) => onTechChange(e.target.value)} className={selectClass}>
              <option value="">Any Mode</option>
              {TECH_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={`${selectClass} ml-auto`}>
              <option value="distance">Sort: Distance</option>
              <option value="direction">Sort: Direction</option>
              <option value="frequency">Sort: Frequency</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2 min-h-0">
            {nearbyLoading && sortedNearby.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Scanning…</div>
            ) : sortedNearby.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No repeaters detected in range yet.</p>
            ) : sortedNearby.map(({ repeater: r, distanceMi, compass }) => (
              <RepeaterCard
                key={r.id}
                repeater={r}
                distanceMi={distanceMi}
                compass={compass}
                isAdded={addedRepeaterIds?.has(r.id)}
                onView={onView}
                onNavigate={onNavigate}
                onAddToRoute={onAddToRoute}
                onLogContact={onLogContact}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 p-2 border-b border-border shrink-0">
            <select value={corridorMi} onChange={(e) => setCorridorMi(Number(e.target.value))} className={selectClass}>
              {CORRIDOR_OPTIONS.map((mi) => <option key={mi} value={mi}>{mi} mi corridor</option>)}
            </select>
            <button
              onClick={() => onFindAlongRoute(corridorMi)}
              disabled={!hasRoute || alongRouteLoading}
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
            >
              {alongRouteLoading ? 'Searching…' : 'Find Repeaters Along Route'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2 min-h-0">
            {!hasRoute ? (
              <p className="text-sm text-muted-foreground text-center py-8">Plan a route first to search repeaters along it.</p>
            ) : !alongRoute ? (
              <p className="text-sm text-muted-foreground text-center py-8">Tap "Find Repeaters Along Route" to search the corridor around your route.</p>
            ) : alongRoute.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No repeaters found within {corridorMi} mi of the route.</p>
            ) : alongRoute.map(({ repeater: r, routeKm, routeDist }) => (
              <RepeaterCard
                key={r.id}
                repeater={r}
                meta={`${kmToMi(routeKm).toFixed(0)} mi into route · ${kmToMi(routeDist).toFixed(1)} mi off route`}
                isAdded={addedRepeaterIds?.has(r.id)}
                onView={onView}
                onAddToRoute={onAddToRoute}
                onLogContact={onLogContact}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
