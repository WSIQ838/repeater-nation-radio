import { RadioTower, Navigation, Plus, BookPlus, Eye, Lock } from 'lucide-react';
import { formatFreq } from '@/utils';

// Radio-style card for a single repeater result, shared by the GPS Nearby
// panel, the GPS "Along Route" panel, and Trip Planner's "Repeaters Along
// Route" results — one card design for every "here's a repeater" list.
export default function RepeaterCard({
  repeater: r, distanceMi, compass, meta, isAdded,
  onView, onNavigate, onAddToRoute, onLogContact,
}) {
  const isHam = r.radio_service === 'HAM';
  return (
    <div className="p-3 rounded-lg border border-border bg-card">
      <div className="flex items-start gap-2">
        <div className="grid place-items-center w-9 h-9 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 shrink-0">
          <RadioTower className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-bold text-sm">{r.callsign}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isHam ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-primary/15 text-primary'}`}>
              {r.radio_service || 'GMRS'}
            </span>
            {r.access === 'Closed' && <Lock className="w-3 h-3 text-orange-500" />}
          </div>
          <div className="text-sm font-mono font-semibold mt-0.5">{formatFreq(r.frequency)} MHz</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {r.mode || 'Analog'}{r.tone ? ` · Tone: ${r.tone}` : ''}{r.input_tone ? ` / ${r.input_tone}` : ''}
          </div>
          {r.name && <div className="text-xs text-muted-foreground truncate">{r.name}</div>}
          {distanceMi != null && (
            <div className="text-sm font-semibold text-primary mt-1">
              {distanceMi.toFixed(1)} mi {compass}
            </div>
          )}
          {meta && <div className="text-xs text-muted-foreground mt-0.5">{meta}</div>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {onView && (
          <button onClick={() => onView(r)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-input hover:bg-muted">
            <Eye className="w-3.5 h-3.5" /> View
          </button>
        )}
        {onNavigate && (
          <button onClick={() => onNavigate(r)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-input hover:bg-muted">
            <Navigation className="w-3.5 h-3.5" /> Navigate
          </button>
        )}
        {onAddToRoute && (
          <button
            onClick={() => onAddToRoute(r)}
            disabled={isAdded}
            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border ${isAdded ? 'border-input text-muted-foreground cursor-default' : 'border-primary/40 text-primary hover:bg-primary/10'}`}
          >
            <Plus className="w-3.5 h-3.5" /> {isAdded ? 'Added' : 'Add to Route'}
          </button>
        )}
        {onLogContact && (
          <button onClick={() => onLogContact(r)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-input hover:bg-muted">
            <BookPlus className="w-3.5 h-3.5" /> Log Contact
          </button>
        )}
      </div>
    </div>
  );
}
