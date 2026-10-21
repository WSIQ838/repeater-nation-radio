import { useState } from 'react';
import { Cable } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GMRS_FREQUENCY_OPTIONS } from '@/lib/gmrsChannels';

// Approximate attenuation (dB per 100 ft) at a reference frequency, scaled
// by sqrt(f / f_ref) which is a reasonable approximation for many coax types.
const CABLES = [
  { key: 'rg58', label: 'RG-58', loss100: 3.3, ref: 30 },
  { key: 'rg8x', label: 'RG-8X', loss100: 2.5, ref: 30 },
  { key: 'rg213', label: 'RG-213 / RG-8', loss100: 1.2, ref: 30 },
  { key: 'lmr240', label: 'LMR-240', loss100: 1.3, ref: 30 },
  { key: 'lmr400', label: 'LMR-400', loss100: 0.7, ref: 30 },
  { key: 'lmr600', label: 'LMR-600', loss100: 0.4, ref: 30 },
  { key: 'rg8', label: '9913 / RG-8 foam', loss100: 0.8, ref: 30 },
];

export default function CoaxLossCalculator() {
  const [cable, setCable] = useState('lmr400');
  const [length, setLength] = useState('50');
  const [freq, setFreq] = useState('462.550');
  const [power, setPower] = useState('50');
  const selectedPreset = GMRS_FREQUENCY_OPTIONS.find((f) => Number(f.freq) === Number(freq));

  const c = CABLES.find((x) => x.key === cable);
  const len = parseFloat(length);
  const fMHz = parseFloat(freq);
  const pIn = parseFloat(power);
  const valid = !isNaN(len) && !isNaN(fMHz) && fMHz > 0 && len > 0;

  const loss100 = valid ? c.loss100 * Math.sqrt(fMHz / c.ref) : 0; // dB per 100ft at f
  const totalLoss = valid ? (loss100 * len) / 100 : 0; // dB
  const pOut = !isNaN(pIn) && pIn > 0 ? pIn * Math.pow(10, -totalLoss / 10) : null;

  return (
    <ToolShell title="Coax Loss Calculator" description="Estimate feedline loss and remaining power for common coax types." icon={Cable}>
      <Card className="p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Cable Type</Label>
            <select value={cable} onChange={(e) => setCable(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              {CABLES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Cable Length (ft)</Label>
            <Input type="number" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} />
          </div>
          <div>
            <Label>GMRS Frequency Preset</Label>
            <select value={selectedPreset ? `${selectedPreset.ch}-${selectedPreset.direction}` : ''} onChange={(e) => {
              const preset = GMRS_FREQUENCY_OPTIONS.find((f) => `${f.ch}-${f.direction}` === e.target.value);
              if (preset) setFreq(preset.freq);
            }} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">Custom frequency</option>
              {GMRS_FREQUENCY_OPTIONS.map((f) => <option key={`${f.ch}-${f.direction}`} value={`${f.ch}-${f.direction}`}>{f.label}</option>)}
            </select>
            <Input className="mt-2" type="number" step="0.0001" value={freq} onChange={(e) => setFreq(e.target.value)} />
          </div>
          <div>
            <Label>Transmit Power (W) — optional</Label>
            <Input type="number" step="0.1" value={power} onChange={(e) => setPower(e.target.value)} />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-muted p-4">
            <div className="text-xs text-muted-foreground uppercase">Cable Loss</div>
            <div className="text-2xl font-heading font-bold mt-1">{valid ? loss100.toFixed(2) : '—'} <span className="text-sm font-normal">dB/100ft</span></div>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <div className="text-xs text-muted-foreground uppercase">Total Loss</div>
            <div className="text-2xl font-heading font-bold mt-1">{valid ? totalLoss.toFixed(2) : '—'} <span className="text-sm font-normal">dB</span></div>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <div className="text-xs text-muted-foreground uppercase">Power at Antenna</div>
            <div className="text-2xl font-heading font-bold mt-1">{pOut != null ? pOut.toFixed(1) : '—'} <span className="text-sm font-normal">W</span></div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Values are estimates based on typical published attenuation scaled by frequency. Actual loss depends on the specific cable batch, installation, connectors, VSWR, and temperature.
        </p>
      </Card>
    </ToolShell>
  );
}