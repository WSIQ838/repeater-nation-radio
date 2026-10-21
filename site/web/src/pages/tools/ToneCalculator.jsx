import { useState } from 'react';
import { Music } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const CTCSS = [
  67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8, 97.4, 100.0, 103.5,
  107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8, 136.5, 141.3, 146.2, 151.4, 156.7,
  159.8, 162.2, 165.5, 167.9, 171.3, 173.8, 177.3, 179.9, 183.5, 186.2, 189.9, 192.8,
  196.6, 199.5, 203.5, 206.5, 210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1,
];

const DCS = [
  '023', '025', '026', '031', '032', '036', '043', '047', '050', '051', '053', '054',
  '065', '071', '072', '073', '074', '114', '115', '116', '122', '125', '131', '132',
  '134', '143', '145', '152', '155', '156', '162', '165', '172', '174', '205', '212',
  '223', '225', '226', '243', '244', '245', '246', '251', '252', '255', '261', '263',
  '265', '266', '271', '274', '306', '311', '315', '325', '331', '332', '343', '346',
  '351', '356', '364', '365', '371', '411', '412', '413', '423', '431', '432', '445',
  '446', '452', '454', '455', '462', '464', '465', '466', '503', '506', '516', '523',
  '526', '532', '546', '565', '606', '612', '624', '627', '631', '632', '654', '662',
  '664', '703', '712', '723', '731', '732', '734', '743', '754',
];



const MIDLAND_CTCSS = [
  67.0, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8, 97.4, 100.0, 103.5,
  107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8, 136.5, 141.3, 146.2, 151.4, 156.7,
  162.2, 167.9, 173.8, 179.9, 186.2, 192.8, 203.5, 210.7, 218.1, 225.7, 233.6, 241.8, 250.3,
];

const MIDLAND_DCS_83 = [
  '023','025','026','031','032','043','047','051','054','065','071','072','073','074','114','115','116','125',
  '131','132','134','143','152','155','156','162','165','172','174','205','223','226','243','244','245','251',
  '261','263','265','271','306','311','315','331','343','346','351','364','365','371','411','412','413','423',
  '431','432','445','464','465','466','503','506','516','532','546','565','606','612','624','627','631','632',
  '654','662','664','703','712','723','731','732','734','743','754',
];

const MIDLAND_DCS_104 = [
  ...MIDLAND_DCS_83,
  '036','053','122','145','212','225','246','252','255','266','274','325','332','356','446','452','454','455','462','523','526',
];

function CopyChip({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <button onClick={copy} className="text-xs text-primary hover:underline shrink-0">
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function ToneCalculator() {
  const [tab, setTab] = useState('ctcss');
  const [midlandSet, setMidlandSet] = useState('121');
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const ctcss = CTCSS.filter((t) => !query || String(t).includes(query));
  const dcs = DCS.filter((c) => !query || c.includes(query));
  const midlandDcs = (midlandSet === '142' ? MIDLAND_DCS_104 : MIDLAND_DCS_83).filter((c) => !query || c.includes(query));

  return (
    <ToolShell title="CTCSS / DCS Tone Calculator" description="Browse, search, and copy CTCSS tones and DCS codes for repeater access." icon={Music}>
      <Card className="p-6 space-y-5">
        <div className="flex gap-2">
          <Button variant={tab === 'ctcss' ? 'default' : 'outline'} onClick={() => setTab('ctcss')}>CTCSS Tones</Button>
          <Button variant={tab === 'dcs' ? 'default' : 'outline'} onClick={() => setTab('dcs')}>DCS Codes</Button>
          <Button variant={tab === 'midland' ? 'default' : 'outline'} onClick={() => setTab('midland')}>Midland Privacy Codes</Button>
        </div>
        <div>
          <Label>Search</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tones or codes…" />
        </div>

        {tab === 'ctcss' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ctcss.map((t) => (
              <div key={t} className="flex items-center justify-between gap-2 rounded-lg border border-input px-3 py-2">
                <span className="font-mono text-sm">{t.toFixed(1)} Hz</span>
                <CopyChip value={t.toFixed(1)} />
              </div>
            ))}
            {ctcss.length === 0 && <p className="text-sm text-muted-foreground col-span-full">No tones match your search.</p>}
          </div>
        ) : tab === 'dcs' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {dcs.map((c) => (
              <div key={c} className="rounded-lg border border-input px-3 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">D{c}</span>
                  <CopyChip value={`D${c}`} />
                </div>
                <div className="flex gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">N <CopyChip value={`D${c}N`} /></span>
                  <span className="flex items-center gap-1">I <CopyChip value={`D${c}I`} /></span>
                </div>
              </div>
            ))}
            {dcs.length === 0 && <p className="text-sm text-muted-foreground col-span-full">No codes match your search.</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>Midland code set</Label>
                <select value={midlandSet} onChange={(e) => setMidlandSet(e.target.value)} className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="121">121 codes — 38 CTCSS + 83 DCS</option>
                  <option value="142">142 codes — 38 CTCSS + 104 DCS</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground max-w-xl">Midland privacy-code numbers are radio menu numbers. Match the Midland code number to the CTCSS frequency or DCS code shown here.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MIDLAND_CTCSS.map((tone, i) => {
                const code = i + 1;
                if (query && !String(code).includes(query) && !String(tone).includes(query)) return null;
                return <div key={'ctcss-' + code} className="rounded-lg border border-input px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="font-mono text-sm">CTCSS {code}</span><CopyChip value={tone.toFixed(1)} /></div><div className="text-xs text-muted-foreground mt-1">{tone.toFixed(1)} Hz</div></div>;
              })}
              {midlandDcs.map((code, i) => {
                const number = i + 1;
                if (query && !String(number).includes(query) && !code.includes(query)) return null;
                return <div key={'dcs-' + number} className="rounded-lg border border-input px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="font-mono text-sm">DCS {number}</span><CopyChip value={'D' + code} /></div><div className="text-xs text-muted-foreground mt-1">D{code} (N/I)</div></div>;
              })}
            </div>
            <p className="text-xs text-muted-foreground">Midland model code lists can differ. The 121-code set uses 38 CTCSS and 83 DCS codes; the 142-code set uses 38 CTCSS and 104 DCS codes.</p>
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-heading font-semibold">What are CTCSS and DCS?</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong>CTCSS</strong> (Continuous Tone-Coded Squelch) and <strong>DCS</strong> (Digital-Coded Squelch) are sub-audible tones/codes transmitted with your voice. A repeater only opens its squelch when it receives the correct tone, which keeps other users on the same frequency from activating it.
        </p>
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li><strong>CTCSS</strong> uses one of ~50 standard tones (67.0–254.1 Hz). Enter the tone in Hz.</li>
          <li><strong>DCS</strong> uses a 3-digit octal code with Normal (N) or Inverted (I) polarity, written as D023N or D023I.</li>
          <li>Match the tone/code and polarity exactly to what the repeater expects for access.</li>
        </ul>
      </Card>
    </ToolShell>
  );
}