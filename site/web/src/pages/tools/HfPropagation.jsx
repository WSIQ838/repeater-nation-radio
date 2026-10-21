import { Activity, RefreshCw, Sun, Moon } from 'lucide-react';
import { Link } from 'react-router-dom';
import ToolConsole, { PanelLoading, TABLE, THEAD, TH, TR, TD } from '@/components/tools/ToolConsole';
import { Panel, DataRow } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import useSpaceWeather from '@/hooks/useSpaceWeather';

// Condition words come straight from the N0NBH calculation; each is shown
// as text, with the colored dot only reinforcing it.
const CONDITION_STYLE = {
  good: { dot: 'bg-success', text: 'text-success' },
  fair: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  poor: { dot: 'bg-destructive', text: 'text-destructive' },
};

function Condition({ value }) {
  const key = String(value || '').toLowerCase();
  const style = CONDITION_STYLE[key] || { dot: 'bg-muted-foreground', text: 'text-muted-foreground' };
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${style.text}`}>
      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
      {value || '—'}
    </span>
  );
}

const VHF_LABELS = {
  'vhf-aurora:northern_hemi': 'VHF aurora (northern hemisphere)',
  'E-Skip:north_america': 'Sporadic-E (North America, 2 m)',
  'E-Skip:europe': 'Sporadic-E (Europe, 2 m)',
  'E-Skip:europe_6m': 'Sporadic-E (Europe, 6 m)',
  'E-Skip:europe_4m': 'Sporadic-E (Europe, 4 m)',
};

export default function HfPropagation() {
  const { data, loading, error, reload } = useSpaceWeather();
  const s = data?.solar;
  const bandNames = [...new Set((s?.bands || []).map((b) => b.band))];
  const cond = (band, time) => s?.bands?.find((b) => b.band === band && b.time === time)?.condition;
  const hour = new Date().getUTCHours();

  const openings = (s?.vhf || []).filter((v) => !/closed/i.test(v.condition)).length;

  return (
    <ToolConsole
      icon={Activity}
      title="HF Propagation"
      subtitle="Band conditions · day and night"
      status={data ? 'Live' : undefined}
      actions={<Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className="w-4 h-4 mr-1.5" /> Refresh</Button>}
      kpis={[
        { label: 'Band noise', value: s?.signalNoise || '—' },
        { label: 'MUF', value: s?.muf ? `${s.muf} MHz` : 'No report' },
        { label: 'SFI / K-index', value: `${s?.solarFlux ?? '—'} / ${s?.kIndex ?? '—'}` },
        { label: 'VHF openings', value: s?.vhf ? openings : '—', tone: openings ? 'success' : undefined },
      ]}
      footnote={`Updated ${s?.updated || 'recently'} · calculated by N0NBH (hamqsl.com) · it is ${String(hour).padStart(2, '0')}00 UTC now`}
    >
      {loading ? (
        <Panel title="HF band conditions"><PanelLoading text="Loading band conditions…" /></Panel>
      ) : error && !data ? (
        <Panel title="HF band conditions" accent="danger">
          <div className="p-3.5 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={reload}><RefreshCw className="w-4 h-4 mr-2" /> Try again</Button>
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3 items-start">
            <Panel title="HF band conditions" meta={s?.updated}>
              {bandNames.length ? (
                <table className={TABLE}>
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Bands</th>
                      <th className={TH}><span className="inline-flex items-center gap-1"><Sun className="w-3.5 h-3.5" /> Day</span></th>
                      <th className={TH}><span className="inline-flex items-center gap-1"><Moon className="w-3.5 h-3.5" /> Night</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bandNames.map((b) => (
                      <tr key={b} className={TR}>
                        <td className={`${TD} font-mono text-[12px]`}>{b}</td>
                        <td className={TD}><Condition value={cond(b, 'day')} /></td>
                        <td className={TD}><Condition value={cond(b, 'night')} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground p-3.5">Band conditions are not available right now.</p>
              )}
            </Panel>

            {s?.vhf?.length > 0 && (
              <Panel title="VHF openings" accent="success" meta={`${openings} open`}>
                {s.vhf.map((v) => (
                  <DataRow key={`${v.name}:${v.location}`} className="grid-cols-[minmax(0,1fr)_auto]">
                    <span className="truncate">{VHF_LABELS[`${v.name}:${v.location}`] || `${v.name} (${v.location.replace(/_/g, ' ')})`}</span>
                    <span className={/closed/i.test(v.condition) ? 'text-muted-foreground text-[12px]' : 'font-semibold text-success text-[12px]'}>{v.condition}</span>
                  </DataRow>
                ))}
              </Panel>
            )}
          </div>

          <Panel title="Tips" accent="muted">
            <div className="p-3.5 text-sm text-muted-foreground space-y-1.5">
              <p>Lower bands (80–40 m) generally work best at night; higher bands (20–10 m) during daylight.</p>
              <p>These are band-wide estimates. Real openings depend on your path, time of day, and antenna. For full solar data see <Link to="/tools/space-weather" className="text-primary hover:underline">Solar / Space Weather</Link>.</p>
            </div>
          </Panel>
        </>
      )}
    </ToolConsole>
  );
}
