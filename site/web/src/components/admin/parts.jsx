import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Inbox, AlertCircle } from 'lucide-react';

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-start gap-3 mb-6 pb-5 border-b border-border/60">
      <div className="min-w-0">
        <h1 className="text-2xl font-heading font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children && <div className="ml-auto flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

const STAT_TONES = {
  primary: { bg: 'bg-primary/10 text-primary', accent: 'bg-primary' },
  navy: { bg: 'bg-navy/10 text-foreground', accent: 'bg-foreground/40' },
  success: { bg: 'bg-success/10 text-success', accent: 'bg-success' },
  warn: { bg: 'bg-warning/10 text-warning', accent: 'bg-warning' },
  destructive: { bg: 'bg-destructive/10 text-destructive', accent: 'bg-destructive' },
  muted: { bg: 'bg-muted text-muted-foreground', accent: 'bg-muted-foreground/40' },
};

export function StatCard({ icon: Icon, label, value, hint, tone = 'primary' }) {
  const t = STAT_TONES[tone] || STAT_TONES.primary;
  return (
    <Card className="relative p-5 overflow-hidden transition-shadow hover:shadow-lg">
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${t.accent}`} />
      <div className="flex items-center gap-3">
        <div className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${t.bg}`}>
          {Icon ? <Icon className="w-5 h-5" /> : null}
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-none font-mono tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-3">{hint}</div>}
    </Card>
  );
}

export function EmptyState({ title = 'Nothing here yet', description, icon: Icon = Inbox }) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto grid place-items-center w-12 h-12 rounded-xl bg-muted text-muted-foreground mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <div className="font-medium">{title}</div>
      {description && <div className="text-sm text-muted-foreground mt-1">{description}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm font-mono">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="text-center py-10 space-y-3">
      <div className="flex items-center justify-center text-destructive"><AlertCircle className="w-5 h-5" /></div>
      <div className="text-sm text-muted-foreground">{message || 'Something went wrong.'}</div>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

const BADGE_TONES = {
  muted: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warn: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
  navy: 'bg-navy/10 text-foreground',
};

export function Badge({ children, tone = 'muted' }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${BADGE_TONES[tone] || BADGE_TONES.muted}`}>{children}</span>;
}

// A small pulsing status dot (green/amber/red) for live/session indicators —
// used in AdminLayout's topbar and available to any admin page that wants
// its own live-status readout (e.g. "N active now").
export function LiveDot({ label, tone = 'success' }) {
  const cls = tone === 'success' ? 'bg-success' : tone === 'warn' ? 'bg-warning' : tone === 'destructive' ? 'bg-destructive' : 'bg-muted-foreground';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cls} opacity-75`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${cls}`} />
      </span>
      {label && <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>}
    </span>
  );
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

function formatEta(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// A visual progress bar for client-driven batch operations (bulk reverify,
// bulk notify, broadcast email, etc.) -- these run as a loop of several
// backend calls from the browser rather than one request, so the UI needs
// its own live "done / total" indicator instead of a single spinner.
// `startedAt` (a Date.now() timestamp from when the operation began) adds a
// live-ticking elapsed timer -- useful for a run slow/flaky enough that
// "is this still going?" is a real question (e.g. rate-limited reverify).
export function BatchProgress({ done, total, label, startedAt }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!total || total <= 0) return null;
  const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  const elapsedMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
  const elapsed = startedAt ? formatDuration(elapsedMs) : null;
  const remainingMs = startedAt && done > 0 && done < total
    ? (elapsedMs / done) * (total - done)
    : null;
  const eta = remainingMs !== null ? formatEta(Date.now() + remainingMs) : null;

  return (
    <div className="space-y-1 w-full">
      {(label || elapsed || eta) && (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {label && <span>{label}</span>}
          {startedAt && (
            <span className="font-mono tabular-nums ml-auto shrink-0">
              ⏱ {eta ? `ETA ${eta} · ~${formatDuration(remainingMs)} left` : done >= total ? 'Complete' : 'Estimating completion…'}
            </span>
          )}
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-muted-foreground text-right font-mono tabular-nums">
        {done} / {total} · {pct}%{elapsed ? ` · elapsed ${elapsed}` : ''}
      </div>
    </div>
  );
}

// `progress`, when given `{ done, total }`, renders a BatchProgress bar
// between the description and footer -- for a ConfirmDialog whose onConfirm
// runs a client-driven batch loop rather than a single call.
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', onConfirm, loading, destructive, progress }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {progress && <BatchProgress done={progress.done} total={progress.total} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={loading}>
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function formatDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}
