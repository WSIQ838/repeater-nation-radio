import { Navigation, Gauge } from 'lucide-react';

const kmToMi = (km) => (km || 0) / 1.60934;

// Large, simple, glanceable readout for Driving Mode — deliberately not a
// dashboard. Next turn, current road, distance/time remaining, and speed
// only; everything else (repeater lists, settings) stays off this overlay so
// there's as little to read as possible while the vehicle is moving.
export default function DrivingModeBar({ nextStep, road, remainingKm, remainingMin, speedMph }) {
  return (
    <div className="absolute inset-x-0 top-0 z-[500] p-3 space-y-2">
      {nextStep && (
        <div className="rounded-xl bg-primary text-primary-foreground shadow-lg px-4 py-3 flex items-center gap-3">
          <Navigation className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight truncate">{nextStep.instruction}</div>
            {nextStep.distance > 0 && (
              <div className="text-sm opacity-90">
                {nextStep.distance < 1609 ? `${Math.round(nextStep.distance * 3.281)} ft` : `${(nextStep.distance / 1609.34).toFixed(1)} mi`}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-xl bg-white/95 dark:bg-navy/95 backdrop-blur shadow-md px-4 py-2.5">
          <div className="text-xs text-muted-foreground truncate">{road || 'On route'}</div>
          <div className="text-xl font-bold">
            {kmToMi(remainingKm).toFixed(0)} mi <span className="text-sm font-medium text-muted-foreground">· {Math.floor((remainingMin || 0) / 60)}h {Math.round((remainingMin || 0) % 60)}m</span>
          </div>
        </div>
        {speedMph != null && (
          <div className="rounded-xl bg-white/95 dark:bg-navy/95 backdrop-blur shadow-md px-4 py-2.5 text-center">
            <Gauge className="w-4 h-4 mx-auto text-muted-foreground" />
            <div className="text-xl font-bold leading-none mt-0.5">{Math.max(0, Math.round(speedMph))}</div>
            <div className="text-[10px] text-muted-foreground">mph</div>
          </div>
        )}
      </div>
    </div>
  );
}
