import { RadioTower, X } from 'lucide-react';
import { formatFreq } from '@/utils';

// "REPEATER AHEAD" banner — large, dismissible, and deliberately the only
// thing that interrupts Driving Mode. No confirmation dialogs, no nested menus.
export default function RepeaterAlertBanner({ alert, onDismiss }) {
  if (!alert) return null;
  const { repeater: r, milesAhead } = alert;
  return (
    <div className="absolute inset-x-3 bottom-24 z-[600] rounded-xl bg-orange-500 text-white shadow-xl px-4 py-3 flex items-center gap-3 animate-fade-in">
      <RadioTower className="w-8 h-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold uppercase tracking-wide opacity-90">Repeater Ahead</div>
        <div className="text-lg font-bold leading-tight truncate">{r.callsign}</div>
        <div className="text-sm opacity-95">
          {formatFreq(r.frequency)} MHz{r.tone ? ` · ${r.tone} PL` : ''} · {milesAhead.toFixed(1)} mi ahead
        </div>
      </div>
      <button onClick={onDismiss} className="p-1.5 rounded-md hover:bg-white/20 shrink-0" aria-label="Dismiss">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
