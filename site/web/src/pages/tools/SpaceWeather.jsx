import { useState } from 'react';
import { Sun, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import ToolConsole, { KpiGrid, PanelLoading, TABLE, THEAD, TH, TR, TD } from '@/components/tools/ToolConsole';
import { Panel } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import useSpaceWeather from '@/hooks/useSpaceWeather';

// NOAA G-scale thresholds for the planetary Kp index.
function kpLevel(kp) {
  if (kp >= 5) return { label: `G${Math.min(5, Math.floor(kp) - 4)} storm`, tone: 'critical' };
  if (kp >= 4) return { label: 'Active', tone: 'warning' };
  return { label: 'Quiet', tone: 'good' };
}

const TONE_BAR = { good: 'bg-primary/70', warning: 'bg-amber-500', critical: 'bg-destructive' };

function ScaleBadge({ letter, scale, text, title }) {
  const n = Number(scale);
  const active = Number.isFinite(n) && n > 0;
  return (
    <div className={`rounded border p-3 ${active ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`} title={title}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {active ? <AlertTriangle className="w-3.5 h-3.5 text-destructive" /> : <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
        {title}
      </div>
      <div className="font-mono font-semibold text-lg mt-0.5">{letter}{Number.isFinite(n) ? n : 0}</div>
      <div className="text-[11px] text-muted-foreground capitalize">{text || 'none'}</div>
    </div>
  );
}

// Single-series bar chart of 3-hour Kp readings (0-9 scale). Each bar
// carries its own hover tooltip; storm-level bars are also labeled in text,
// so the warning never relies on color alone.
function KpChart({ rows }) {
  const [hover, setHover] = useState(null);
  if (!rows?.length) return <p className="text-sm text-muted-foreground">No Kp readings available.</p>;
  const fmt = (t) => new Date(/Z$/.test(t) ? t : `${t}Z`).toLocaleString(undefined, { weekday: 'short', hour: 'numeric' });
  const active = hover != null ? rows[hover] : rows[rows.length - 1];
  const lvl = kpLevel(active.kp);
  return (
    <div>
      <div className="text-sm mb-3 min-h-5">
        <span className="font-semibold">Kp {active.kp.toFixed(2)}</span>
        <span className="text-muted-foreground"> · {lvl.label} · {fmt(active.time)}{hover == null ? ' (latest)' : ''}</span>
      </div>
      <div className="relative h-40 flex items-end gap-[2px] border-b border-border" role="img" aria-label="Planetary Kp index, last three days">
        {[3, 6].map((g) => (
          <div key={g} className="absolute left-0 right-0 border-t border-dashed border-border/70" style={{ bottom: `${(g / 9) * 100}%` }}>
            <span className="absolute -top-2 -left-0.5 -translate-x-full pr-1 text-[10px] text-muted-foreground">{g}</span>
          </div>
        ))}
        {rows.map((r, i) => {
          const tone = kpLevel(r.kp).tone;
          return (
            <div
              key={r.time}
              className="flex-1 h-full flex items-end cursor-default"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className={`w-full rounded-t-[4px] ${TONE_BAR[tone]} ${hover === i ? 'opacity-100 ring-2 ring-foreground/30' : 'opacity-90'}`}
                style={{ height: `${Math.max(2, (r.kp / 9) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>{fmt(rows[0].time)}</span><span>{fmt(rows[rows.length - 1].time)}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-2">Kp 0–3 quiet · 4 active · 5+ geomagnetic storm (NOAA G1–G5). Hover a bar for its reading.</div>
    </div>
  );
}

export default function SpaceWeather() {
  const { data, loading, error, reload } = useSpaceWeather();
  const s = data?.solar;
  const sc = data?.scales;
  const latestKp = data?.kp?.length ? data.kp[data.kp.length - 1].kp : null;
  const kpTone = latestKp == null ? undefined : latestKp >= 5 ? 'danger' : latestKp >= 4 ? 'primary' : 'success';

  return (
    <ToolConsole
      icon={Sun}
      title="Solar / Space Weather"
      subtitle="Solar and geomagnetic conditions for radio"
      status={data ? 'Live' : undefined}
      actions={<Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className="w-4 h-4 mr-1.5" /> Refresh</Button>}
      kpis={[
        { label: 'Solar flux', value: s?.solarFlux ?? '—', title: 'Solar flux index (SFI). Higher favors the upper HF bands.' },
        { label: 'Sunspots', value: s?.sunspots ?? '—' },
        { label: 'K-index', value: s?.kIndex ?? '—', tone: Number(s?.kIndex) >= 5 ? 'danger' : undefined },
        { label: 'Planetary Kp', value: latestKp != null ? latestKp.toFixed(2) : '—', tone: kpTone },
      ]}
      footnote={`Solar data updated ${s?.updated || 'recently'} · sources: N0NBH (hamqsl.com), NOAA SWPC`}
    >
      {loading ? (
        <Panel title="Space weather"><PanelLoading text="Loading space weather…" /></Panel>
      ) : error && !data ? (
        <Panel title="Space weather" accent="danger">
          <div className="p-3.5 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={reload}><RefreshCw className="w-4 h-4 mr-2" /> Try again</Button>
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="Solar conditions" meta={s?.updated}>
            <KpiGrid items={[
              { label: 'Solar flux (SFI)', value: s?.solarFlux, hint: 'Higher favors the upper HF bands' },
              { label: 'Sunspot number', value: s?.sunspots },
              { label: 'A-index', value: s?.aIndex, hint: 'Daily geomagnetic activity' },
              { label: 'K-index', value: s?.kIndex, hint: s?.geomagField ? `Field: ${s.geomagField.toLowerCase()}` : undefined },
              { label: 'X-ray flux', value: s?.xray, hint: 'Flares (M/X class) can black out HF' },
              { label: 'Solar wind', value: s?.solarWind, unit: 'km/s' },
              { label: 'Bz (IMF)', value: s?.magneticField, unit: 'nT', hint: 'Strongly negative favors storms' },
              { label: 'Aurora', value: s?.auroraLatitude != null ? `${s.auroraLatitude}°` : null, hint: 'Lowest latitude of the aurora' },
            ]} />
          </Panel>

          <div className="grid xl:grid-cols-2 gap-3 items-start">
            {sc?.current && (
              <Panel title="NOAA space-weather scales" accent="success" meta="now + 3-day forecast">
                <div className="p-3.5 grid grid-cols-3 gap-2">
                  <ScaleBadge letter="R" title="Radio blackouts" scale={sc.current.r.scale} text={sc.current.r.text} />
                  <ScaleBadge letter="S" title="Solar radiation" scale={sc.current.s.scale} text={sc.current.s.text} />
                  <ScaleBadge letter="G" title="Geomagnetic storms" scale={sc.current.g.scale} text={sc.current.g.text} />
                </div>
                {sc.forecast?.length > 0 && (
                  <div className="overflow-x-auto border-t border-border">
                    <table className={TABLE}>
                      <thead className={THEAD}>
                        <tr><th className={TH}>Forecast</th><th className={TH}>Minor blackout</th><th className={TH}>Major blackout</th><th className={TH}>Radiation storm</th><th className={TH}>Geomagnetic</th></tr>
                      </thead>
                      <tbody>
                        {sc.forecast.map((f) => (
                          <tr key={f.date} className={TR}>
                            <td className={`${TD} font-mono text-[12px] whitespace-nowrap`}>{f.date}</td>
                            <td className={TD}>{f.r.minorProb != null ? `${f.r.minorProb}%` : '—'}</td>
                            <td className={TD}>{f.r.majorProb != null ? `${f.r.majorProb}%` : '—'}</td>
                            <td className={TD}>{f.s.prob != null ? `${f.s.prob}%` : '—'}</td>
                            <td className={`${TD} capitalize whitespace-nowrap`}>G{f.g.scale ?? 0} {f.g.text && f.g.text !== 'none' ? `(${f.g.text})` : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            )}

            <Panel title="Planetary Kp index" meta="last 3 days">
              <div className="p-3.5 pl-7"><KpChart rows={data?.kp} /></div>
            </Panel>
          </div>

          <Panel title="Reading the numbers" accent="muted">
            <div className="p-3.5 text-sm text-muted-foreground space-y-1.5">
              <p>SFI above ~120 usually opens 15–10 m in daylight; below ~80 the higher bands are often quiet.</p>
              <p>K-index 0–2 means stable conditions. K 5+ (a geomagnetic storm) degrades HF, especially polar paths, but can bring VHF aurora.</p>
              <p>GMRS and local VHF/UHF repeaters are line-of-sight and are rarely affected by space weather.</p>
            </div>
          </Panel>
        </>
      )}
    </ToolConsole>
  );
}
