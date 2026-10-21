import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Zap, Check, X } from 'lucide-react';
import { optimizeRoute, calculateRouteStats } from '@/lib/routeOptimizer';

const kmToMi = (km) => (km || 0) / 1.60934;

function fmtDuration(min) {
  if (!min || min < 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return `${h} hr ${m} min`;
}

const METHODS = [
  { value: 'shortest_distance', label: 'Shortest Distance' },
  { value: 'shortest_time', label: 'Shortest Drive Time' },
  { value: 'auto', label: 'Optimize Route' },
];

export default function OptimizePanel({ allPoints, roundTrip, onRoundTripChange, onApply, stopsCount }) {
  const [method, setMethod] = useState('auto');
  const [settings, setSettings] = useState({
    keepStartFixed: true,
    keepEndFixed: true,
    includeCustomStops: true,
    includeRepeaters: true,
  });
  const [calculating, setCalculating] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);

  const canOptimize = allPoints.length >= 3 && stopsCount >= 1;

  const updateSetting = (key, val) => setSettings({ ...settings, [key]: val });

  const calculate = async () => {
    if (!canOptimize) return;
    setCalculating(true);
    setError(null);
    try {
      const metric = method === 'shortest_distance' ? 'distance' : 'duration';
      const opts = {
        ...settings,
        roundTrip,
        metric,
      };
      const result = await optimizeRoute(allPoints, opts);
      const matrix = result.matrix;
      const currentRoute = allPoints.map((_, i) => i);
      const currentStats = calculateRouteStats(currentRoute, matrix);
      const optimizedStats = calculateRouteStats(result.route, matrix);
      const savings = {
        distanceKm: currentStats.distanceKm - optimizedStats.distanceKm,
        durationMin: currentStats.durationMin - optimizedStats.durationMin,
      };
      setPreview({
        optimizedOrder: result.route,
        currentStats,
        optimizedStats,
        savings,
      });
    } catch (e) {
      console.error(e);
      setError('Could not calculate optimization. Please try again.');
    }
    setCalculating(false);
  };

  const apply = () => {
    if (!preview) return;
    onApply(preview.optimizedOrder, method);
    setPreview(null);
  };

  const cancel = () => setPreview(null);

  const orderLabels = (order) =>
    order.map((idx, i) => {
      const p = allPoints[idx];
      if (!p) return `${i + 1}. ?`;
      const name = p.label || 'Stop';
      return `${i + 1}. ${name}`;
    });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" />
        <h3 className="font-heading font-semibold text-sm">Optimize Route</h3>
      </div>

      {!preview && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Optimization Method</Label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 rounded-lg bg-muted/50 p-3">
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span>Keep Start Fixed</span>
              <Switch checked={settings.keepStartFixed} onCheckedChange={(v) => updateSetting('keepStartFixed', v)} />
            </label>
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span>Keep End Fixed</span>
              <Switch checked={settings.keepEndFixed} onCheckedChange={(v) => updateSetting('keepEndFixed', v)} />
            </label>
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span>Include Custom Stops</span>
              <Switch checked={settings.includeCustomStops} onCheckedChange={(v) => updateSetting('includeCustomStops', v)} />
            </label>
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span>Include Repeaters</span>
              <Switch checked={settings.includeRepeaters} onCheckedChange={(v) => updateSetting('includeRepeaters', v)} />
            </label>
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span>Round Trip</span>
              <Switch checked={roundTrip} onCheckedChange={onRoundTripChange} />
            </label>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button onClick={calculate} disabled={calculating || !canOptimize} className="w-full" size="sm">
            {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Calculate Optimization
          </Button>
          {!canOptimize && (
            <p className="text-xs text-muted-foreground text-center">Add at least a start, one stop, and an end to optimize.</p>
          )}
        </>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3 space-y-1">
              <div className="text-[10px] font-bold uppercase text-muted-foreground">Current Route</div>
              <div className="text-sm font-semibold">{kmToMi(preview.currentStats.distanceKm).toFixed(0)} mi</div>
              <div className="text-xs text-muted-foreground">{fmtDuration(preview.currentStats.durationMin)}</div>
            </div>
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-1">
              <div className="text-[10px] font-bold uppercase text-primary">Optimized Route</div>
              <div className="text-sm font-semibold">{kmToMi(preview.optimizedStats.distanceKm).toFixed(0)} mi</div>
              <div className="text-xs text-muted-foreground">{fmtDuration(preview.optimizedStats.durationMin)}</div>
            </div>
          </div>

          {preview.savings.distanceKm > 0.1 || preview.savings.durationMin > 0.5 ? (
            <div className="rounded-lg bg-success/10 p-2 text-center text-sm font-medium text-success">
              Savings: {kmToMi(preview.savings.distanceKm).toFixed(0)} mi / {fmtDuration(preview.savings.durationMin)}
            </div>
          ) : (
            <div className="rounded-lg bg-muted p-2 text-center text-xs text-muted-foreground">
              Current order is already efficient.
            </div>
          )}

          <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
            {orderLabels(preview.optimizedOrder).map((label, i) => (
              <div key={i} className="text-xs px-2 py-1 rounded bg-muted/50 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold grid place-items-center flex-shrink-0">{i + 1}</span>
                {label}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button onClick={apply} className="flex-1" size="sm">
              <Check className="w-4 h-4" /> Apply Optimized
            </Button>
            <Button onClick={cancel} variant="outline" className="flex-1" size="sm">
              <X className="w-4 h-4" /> Keep Current
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}