import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const ALERT_DISTANCES = [1, 5, 10, 25];
const selectClass = 'h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm';

export default function GpsSettingsSheet({
  open, onOpenChange,
  drivingMode, onDrivingModeChange,
  alertsEnabled, onAlertsEnabledChange,
  alertDistanceMi, onAlertDistanceChange,
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-w-lg mx-auto">
        <SheetHeader>
          <SheetTitle>GPS Settings</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 py-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-medium text-sm">Driving Mode</div>
              <div className="text-xs text-muted-foreground">Large, simplified readout — map follows your position</div>
            </div>
            <Switch checked={drivingMode} onCheckedChange={onDrivingModeChange} />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-medium text-sm">Repeater Alerts</div>
              <div className="text-xs text-muted-foreground">Notify when approaching a repeater on your route</div>
            </div>
            <Switch checked={alertsEnabled} onCheckedChange={onAlertsEnabledChange} />
          </label>

          <div className="space-y-2">
            <Label className="text-sm">Alert Distance</Label>
            <select
              value={alertDistanceMi}
              onChange={(e) => onAlertDistanceChange(Number(e.target.value))}
              disabled={!alertsEnabled}
              className={`${selectClass} w-full disabled:opacity-50`}
            >
              {ALERT_DISTANCES.map((mi) => <option key={mi} value={mi}>{mi} mile{mi > 1 ? 's' : ''} ahead</option>)}
            </select>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
