import { cn } from '@/lib/utils';

// Command-console building blocks: dense panels, hairline borders, small uppercase labels and
// monospace numbers. They only use the site's own theme tokens (background, card, border, primary,
// success, destructive), so they follow light/dark mode and never introduce new colors.

const TONE_TEXT = {
  primary: 'text-primary',
  success: 'text-success',
  danger: 'text-destructive',
  muted: 'text-muted-foreground',
};

const TONE_DOT = {
  primary: 'bg-primary',
  success: 'bg-success',
  danger: 'bg-destructive',
  muted: 'bg-muted-foreground/50',
};

const TONE_CHIP = {
  primary: 'border-primary/60 text-primary',
  success: 'border-success/60 text-success',
  danger: 'border-destructive/60 text-destructive',
  muted: 'border-border text-muted-foreground',
};

const ACCENT_BAR = {
  primary: 'bg-primary',
  success: 'bg-success',
  danger: 'bg-destructive',
  muted: 'bg-muted-foreground/50',
};

export function ConsolePage({ children, className }) {
  return (
    <div className={cn('min-h-full bg-background p-3 sm:p-4 lg:p-5 max-w-[1700px] mx-auto space-y-3', className)}>
      {children}
    </div>
  );
}

export function StatusDot({ tone = 'muted', pulse = false, className }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block w-2 h-2 rounded-full shrink-0', TONE_DOT[tone] || TONE_DOT.muted, pulse && 'animate-pulse', className)}
    />
  );
}

export function StatusChip({ tone = 'muted', pulse = false, children, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] border text-[10px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap',
        TONE_CHIP[tone] || TONE_CHIP.muted,
        className,
      )}
    >
      {pulse && <StatusDot tone={tone} pulse className="w-1.5 h-1.5" />}
      {children}
    </span>
  );
}

// Top bar: identity, live status, actions, and an optional strip of key figures.
// kpis: [{ label, value, tone? }]
export function CommandBar({ icon: Icon, title, subtitle, status, statusTone = 'success', statusPulse = true, actions, kpis }) {
  return (
    <div className="rounded border border-border bg-card overflow-hidden">
      <div className="px-3.5 py-2.5 sm:px-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="grid place-items-center w-8 h-8 rounded bg-primary text-primary-foreground shrink-0">
              <Icon className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-base sm:text-lg font-heading font-semibold tracking-tight leading-tight">{title}</h1>
              {status && <StatusChip tone={statusTone} pulse={statusPulse}>{status}</StatusChip>}
            </div>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {kpis && kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border bg-muted/30">
          {kpis.map((k, i) => (
            <div key={k.label} title={k.title} className={cn('px-3.5 sm:px-4 py-2 border-border', k.title && 'cursor-help', i < kpis.length - 1 && 'sm:border-r', i % 2 === 0 && 'border-r sm:border-r', i >= 2 && 'border-t sm:border-t-0')}>
              <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">{k.label}</div>
              <div className={cn('text-lg font-mono font-semibold leading-tight mt-0.5', TONE_TEXT[k.tone] || '')}>{k.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tab strip with an underline on the active tab. tabs: [{ id, label, count? }]
export function ConsoleTabs({ tabs, value, onChange, right }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-border">
      <div className="flex overflow-x-auto scrollbar-thin" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={value === t.id}
            title={t.title}
            onClick={() => onChange(t.id)}
            className={cn(
              'px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap border-b-2 -mb-px transition-colors',
              value === t.id
                ? 'text-foreground border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('ml-2 font-mono text-[11px]', value === t.id ? 'text-primary' : 'text-muted-foreground')}>{t.count}</span>
            )}
          </button>
        ))}
      </div>
      {right && <div className="pb-1.5 flex items-center gap-2">{right}</div>}
    </div>
  );
}

// A bordered panel with a slim header: accent bar + uppercase title on the left, meta/actions on the right.
export function Panel({ title, accent = 'primary', meta, actions, children, className, bodyClassName }) {
  return (
    <section className={cn('rounded border border-border bg-card overflow-hidden flex flex-col min-w-0', className)}>
      <header className="flex items-center justify-between gap-3 px-3.5 py-2 border-b border-border bg-card">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground min-w-0">
          <span className={cn('inline-block w-[3px] h-3 shrink-0', ACCENT_BAR[accent] || ACCENT_BAR.primary)} />
          <span className="truncate">{title}</span>
        </h2>
        {(meta || actions) && (
          <div className="flex items-center gap-3 shrink-0">
            {meta && <span className="text-[11px] text-muted-foreground font-mono">{meta}</span>}
            {actions}
          </div>
        )}
      </header>
      <div className={cn('flex-1 min-h-0', bodyClassName)}>{children}</div>
    </section>
  );
}

// Column header row for a data grid. Pass the grid-template-columns classes in `className`.
export function DataHead({ className, children }) {
  return (
    <div className={cn('grid items-center gap-x-3 px-3.5 py-1.5 border-b border-border bg-muted/30 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground', className)}>
      {children}
    </div>
  );
}

// One data row. Pass the same grid-template-columns classes in `className`.
export function DataRow({ className, children, highlight = false }) {
  return (
    <div
      className={cn(
        'grid items-center gap-x-3 px-3.5 py-2 border-b border-border/60 last:border-b-0 text-[13px] hover:bg-muted/40 transition-colors',
        highlight && 'bg-primary/5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyPanel({ icon: Icon, title, text, action }) {
  return (
    <div className="px-6 py-14 text-center">
      {Icon && (
        <div className="mx-auto mb-3 grid place-items-center w-10 h-10 rounded border border-border text-muted-foreground">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="text-sm font-heading font-semibold">{title}</div>
      {text && <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
