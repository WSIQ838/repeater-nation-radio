import { useState } from 'react';
import { Zap } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function PowerCalculator() {
  const [tx, setTx] = useState('50');
  const [gain, setGain] = useState('6');
  const [coaxLoss, setCoaxLoss] = useState('1.5');
  const [otherLoss, setOtherLoss] = useState('0.5');

  const txW = parseFloat(tx);
  const g = parseFloat(gain);
  const cl = parseFloat(coaxLoss);
  const ol = parseFloat(otherLoss);
  const valid = [txW, g, cl, ol].every((n) => !isNaN(n));

  const totalLoss = valid ? cl + ol : 0; // dB
  const netGain = valid ? g - totalLoss : 0; // dB
  const eirp = valid ? txW * Math.pow(10, netGain / 10) : null; // W (EIRP, gain in dBi)
  const erp = eirp != null ? eirp / 1.64 : null; // W (ERP, gain in dBd relation)

  const fmt = (n) => (n != null ? (n >= 100 ? n.toFixed(0) : n.toFixed(1)) : '—');

  return (
    <ToolShell
      title="Power & ERP Calculator"
      description="Estimate system loss, EIRP, and ERP from transmitter power, antenna gain, and feedline losses."
      icon={Zap}
      disclaimer={false}
    >
      <Card className="p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Transmitter Power (W)</Label>
            <Input type="number" step="0.1" value={tx} onChange={(e) => setTx(e.target.value)} />
          </div>
          <div>
            <Label>Antenna Gain (dBi)</Label>
            <Input type="number" step="0.1" value={gain} onChange={(e) => setGain(e.target.value)} />
          </div>
          <div>
            <Label>Coax Loss (dB)</Label>
            <Input type="number" step="0.1" value={coaxLoss} onChange={(e) => setCoaxLoss(e.target.value)} />
          </div>
          <div>
            <Label>Connector / System Loss (dB)</Label>
            <Input type="number" step="0.1" value={otherLoss} onChange={(e) => setOtherLoss(e.target.value)} />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-muted p-4">
            <div className="text-xs text-muted-foreground uppercase">Total System Loss</div>
            <div className="text-2xl font-heading font-bold mt-1">{valid ? totalLoss.toFixed(2) : '—'} <span className="text-sm font-normal">dB</span></div>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <div className="text-xs text-muted-foreground uppercase">EIRP</div>
            <div className="text-2xl font-heading font-bold mt-1">{fmt(eirp)} <span className="text-sm font-normal">W</span></div>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <div className="text-xs text-muted-foreground uppercase">ERP</div>
            <div className="text-2xl font-heading font-bold mt-1">{fmt(erp)} <span className="text-sm font-normal">W</span></div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          EIRP uses antenna gain in dBi; ERP ≈ EIRP / 1.64 (gain expressed as dBd). Estimates only — actual figures depend on antenna pattern, VSWR, and installation.
        </p>
      </Card>

      <div className="flex gap-2.5 rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
        <Zap className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          <strong>FCC compliance:</strong> GMRS limits vary by channel type — e.g. 50 W ERP on repeater channels (15–22) and 0.5 W on channels 8–14. These estimates do not confirm legal compliance. Always verify your effective power against current FCC GMRS rules before transmitting.
        </p>
      </div>
    </ToolShell>
  );
}