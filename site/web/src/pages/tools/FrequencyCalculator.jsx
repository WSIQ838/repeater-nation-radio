import { useState } from 'react';
import { Radio } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatFreq } from '@/utils';
import { GMRS_FREQUENCY_OPTIONS } from '@/lib/gmrsChannels';

export default function FrequencyCalculator() {
  const [output, setOutput] = useState('462.550');
  const [offset, setOffset] = useState('5.000');
  const [direction, setDirection] = useState('+');
  const [reverse, setReverse] = useState(false);
  const selectedPreset = GMRS_FREQUENCY_OPTIONS.find((f) => Number(f.freq) === Number(output));

  const outNum = parseFloat(output);
  const offNum = parseFloat(offset);
  const valid = !isNaN(outNum) && !isNaN(offNum);
  const signed = direction === '+' ? offNum : -offNum;

  const inputValue = valid ? outNum + signed : null;       // input from output
  const outputValue = valid ? outNum - signed : null;     // output from input
  const result = reverse ? outputValue : inputValue;
  const resultLabel = reverse ? 'Output Frequency' : 'Input Frequency';

  return (
    <ToolShell title="Frequency Calculator" description="Calculate repeater input/output frequencies and offsets. Informational only." icon={Radio}>
      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Label className="text-base font-medium">{reverse ? 'Enter the input (repeater) frequency' : 'Enter the output frequency'}</Label>
          <Button variant="outline" size="sm" onClick={() => setReverse(!reverse)}>
            {reverse ? 'Calculate from output' : 'Calculate from input'}
          </Button>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label>GMRS Frequency Preset</Label>
            <select value={selectedPreset ? `${selectedPreset.ch}-${selectedPreset.direction}` : ''} onChange={(e) => {
              const preset = GMRS_FREQUENCY_OPTIONS.find((f) => `${f.ch}-${f.direction}` === e.target.value);
              if (preset) setOutput(preset.freq);
            }} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">Custom frequency</option>
              {GMRS_FREQUENCY_OPTIONS.map((f) => <option key={`${f.ch}-${f.direction}`} value={`${f.ch}-${f.direction}`}>{f.label}</option>)}
            </select>
            <Input className="mt-2" type="number" step="0.0001" value={output} onChange={(e) => setOutput(e.target.value)} />
          </div>
          <div>
            <Label>Offset (MHz)</Label>
            <Input type="number" step="0.001" value={offset} onChange={(e) => setOffset(e.target.value)} />
          </div>
          <div>
            <Label>Offset Direction</Label>
            <div className="flex gap-2">
              {['+', '-'].map((d) => (
                <Button key={d} type="button" variant={direction === d ? 'default' : 'outline'} onClick={() => setDirection(d)} className="flex-1">
                  {d === '+' ? '+ (input above)' : '− (input below)'}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-muted p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{resultLabel}</div>
          <div className="text-3xl font-heading font-bold mt-1">{result != null ? `${formatFreq(result)} MHz` : '—'}</div>
          {valid && (
            <div className="text-sm text-muted-foreground mt-2">
              {reverse ? 'Input' : 'Output'} = {formatFreq(reverse ? inputValue : outputValue)} MHz · Offset {direction}{formatFreq(offNum)} MHz
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          GMRS repeater channels (15–22) use a +5.000 MHz offset: output 462.550–462.725 MHz, input 467.550–467.725 MHz.
        </div>
      </Card>
    </ToolShell>
  );
}