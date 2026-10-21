import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, GitCompare } from 'lucide-react';
import { getMatrix, optimizeWithMatrix, calculateRouteStats } from '@/lib/routeOptimizer';

const kmToMi = (km) => (km || 0) / 1.60934;

function fmtDuration(min) {
  if (!min || min < 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return `${h} hr ${m} min`;
}

export default function RouteComparison({ allPoints, roundTrip, onApply }) {
  const [comparing, setComparing] = useState(false);
  const [results, setResults] = useState(null);

  const compare = async () => {
    if (allPoints.length < 3) return;
    setComparing(true);
    try {
      const matrix = await getMatrix(allPoints);
      const opts = {
        keepStartFixed: true,
        keepEndFixed: true,
        includeCustomStops: true,
        includeRepeaters: true,
        roundTrip,
      };
      const currentRoute = allPoints.map((_, i) => i);
      const currentStats = calculateRouteStats(currentRoute, matrix);

      const distResult = optimizeWithMatrix(allPoints, matrix, { ...opts, metric: 'distance' });
      const distStats = calculateRouteStats(distResult.route, matrix);

      const timeResult = optimizeWithMatrix(allPoints, matrix, { ...opts, metric: 'duration' });
      const timeStats = calculateRouteStats(timeResult.route, matrix);

      setResults({
        current: { route: currentRoute, stats: currentStats },
        shortestDistance: { route: distResult.route, stats: distStats },
        shortestTime: { route: timeResult.route, stats: timeStats },
      });
    } catch (e) {
      console.error(e);
    }
    setComparing(false);
  };

  if (allPoints.length < 3) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-primary" />
          <h3 className="font-heading font-semibold text-sm">Compare Routes</h3>
        </div>
        {!results && (
          <Button onClick={compare} disabled={comparing} size="sm" variant="outline">
            {comparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompare className="w-4 h-4" />}
            Compare
          </Button>
        )}
      </div>

      {results && (
        <>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-1.5 rounded-md bg-muted/60 text-xs font-medium">
              <span>Route</span>
              <span className="text-right w-16">Distance</span>
              <span className="text-right w-20">Drive Time</span>
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-1.5 rounded-md border border-border">
              <span className="text-sm font-medium">Current / Manual</span>
              <span className="text-sm text-right w-16">{kmToMi(results.current.stats.distanceKm).toFixed(0)} mi</span>
              <span className="text-xs text-right w-20 text-muted-foreground">{fmtDuration(results.current.stats.durationMin)}</span>
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-1.5 rounded-md border border-border">
              <span className="text-sm font-medium">Shortest Distance</span>
              <span className="text-sm text-right w-16">{kmToMi(results.shortestDistance.stats.distanceKm).toFixed(0)} mi</span>
              <span className="text-xs text-right w-20 text-muted-foreground">{fmtDuration(results.shortestDistance.stats.durationMin)}</span>
              <div className="col-span-3 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => onApply(results.shortestDistance.route, 'shortest_distance')} className="h-7 text-xs">
                  Apply
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-1.5 rounded-md border border-border">
              <span className="text-sm font-medium">Shortest Time</span>
              <span className="text-sm text-right w-16">{kmToMi(results.shortestTime.stats.distanceKm).toFixed(0)} mi</span>
              <span className="text-xs text-right w-20 text-muted-foreground">{fmtDuration(results.shortestTime.stats.durationMin)}</span>
              <div className="col-span-3 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => onApply(results.shortestTime.route, 'shortest_time')} className="h-7 text-xs">
                  Apply
                </Button>
              </div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setResults(null)} className="w-full">
            Close comparison
          </Button>
        </>
      )}
    </Card>
  );
}