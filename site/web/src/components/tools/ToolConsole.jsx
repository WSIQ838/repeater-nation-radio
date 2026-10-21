import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConsolePage, CommandBar } from '@/components/console/Console';

// Page frame for the operator tools, matching POTA, Net Control and the
// Digital Logbook: the console command bar (identity, status, actions, key
// figures) above dense Panels from '@/components/console/Console'.
export default function ToolConsole({ icon, title, subtitle, status, statusTone, statusPulse, actions, kpis, footnote, children }) {
  return (
    <ConsolePage>
      <CommandBar
        icon={icon}
        title={title}
        subtitle={subtitle}
        status={status}
        statusTone={statusTone}
        statusPulse={statusPulse}
        actions={actions}
        kpis={kpis}
      />
      {children}
      {footnote && <p className="text-[11px] text-muted-foreground px-1">{footnote}</p>}
    </ConsolePage>
  );
}

// Key figures in the command-bar style, for panels that need more than the
// four the command bar holds. items: [{ label, value, unit?, hint?, tone?, title? }]
const TONE = { primary: 'text-primary', success: 'text-success', danger: 'text-destructive', warning: 'text-amber-600 dark:text-amber-400' };
export function KpiGrid({ items, className }) {
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 bg-border gap-px', className)}>
      {items.map((k) => (
        <div key={k.label} title={k.title} className="bg-card px-3.5 py-2.5 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold truncate">{k.label}</div>
          <div className={cn('text-lg font-mono font-semibold leading-tight mt-0.5 truncate', TONE[k.tone] || '')}>
            {k.value ?? '—'}
            {k.value != null && k.unit ? <span className="text-xs font-sans font-normal text-muted-foreground ml-1">{k.unit}</span> : null}
          </div>
          {k.hint && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{k.hint}</div>}
        </div>
      ))}
    </div>
  );
}

// Shared classes so plain <table>s inside Panels read like the console's data grids.
export const TABLE = 'w-full text-[13px]';
export const THEAD = 'bg-muted/30 border-b border-border text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground';
export const TH = 'text-left font-semibold px-3.5 py-1.5 whitespace-nowrap';
export const TR = 'border-b border-border/60 last:border-b-0 hover:bg-muted/40 transition-colors';
export const TD = 'px-3.5 py-2';

export function PanelLoading({ text = 'Loading…' }) {
  return <div className="flex items-center gap-2 text-sm text-muted-foreground px-3.5 py-6"><Loader2 className="w-4 h-4 animate-spin" /> {text}</div>;
}
