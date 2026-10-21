import { useState } from 'react';
import { Ruler } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { GMRS_FREQUENCY_OPTIONS } from '@/lib/gmrsChannels';

const C = 299792458; // m/s
const WAVES = [
  { key: 'quarter', label: '1/4 wave', factor: 0.25 },
  { key: 'half', label: '1/2 wave', factor: 0.5 },
  { key: 'fiveEighths', label: '5/8 wave', factor: 0.625 },
];
const UNITS = [
  { key: 'ft', label: 'Feet', to: 3.28084 },
  { key: 'in', label: 'Inches', to: 39.3701 },
];

export default function AntennaCalculator() {
  const [freq, setFreq] = useState('462.550');
  const [wave, setWave] = useState('quarter');
  const [unit, setUnit] = useState('in');
  const selectedPreset = GMRS_FREQUENCY_OPTIONS.find((f) => Number(f.freq) === Number(freq));

  const fMHz = parseFloat(freq);
  const valid = !isNaN(fMHz) && fMHz > 0;
  const factor = WAVES.find((w) => w.key === wave).factor;
  const conv = UNITS.find((u) => u.key === unit).to;

  const lengthM = valid ? (C / (fMHz * 1e6)) * factor : null;

  return (
    <ToolShell title="Antenna Calculator" description="Estimate antenna element lengths for 1/4, 1/2, and 5/8 wave antennas." icon={Ruler}>
      <Card className="p-6 space-y-5">
        <div className="grid sm:grid-cols-3 gap-4">
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
            <Label>Antenna Type</Label>
            <select value={wave} onChange={(e) => setWave(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              {WAVES.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Display Unit</Label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              {UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-xl bg-muted p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Approximate Element Length</div>
          <div className="text-3xl font-heading font-bold mt-1">
            {lengthM != null ? `${(lengthM * conv).toFixed(2)} ${UNITS.find((u) => u.key === unit).label.toLowerCase()}` : '—'}
          </div>
          <div className="text-sm text-muted-foreground mt-2">
            {valid && <>Full wavelength: {(C / (fMHz * 1e6) * conv).toFixed(2)} · {WAVES.find((w) => w.key === wave).label} factor {factor}</>}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {WAVES.map((w) => (
            <Button key={w.key} variant={wave === w.key ? 'default' : 'outline'} onClick={() => setWave(w.key)}>
              {w.label}: {valid ? `${((C / (fMHz * 1e6)) * w.factor * conv).toFixed(2)}` : '—'}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Lengths are approximate and assume free-space. Real antennas are affected by element diameter, nearby objects, and ground plane. Use as a starting point and tune with an SWR meter.
        </p>
      </Card>
    </ToolShell>
  );
}