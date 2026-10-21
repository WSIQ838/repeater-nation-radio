import { useMemo, useState } from 'react';
import { Binary, Copy, Check } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const MORSE_MAP = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
  ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
  '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
};
const MORSE_TO_CHAR = Object.fromEntries(Object.entries(MORSE_MAP).map(([c, m]) => [m, c]));

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '0123456789'.split('');
const PUNCTUATION = ['.', ',', '?', "'", '!', '/', '(', ')', '&', ':', ';', '=', '+', '-', '_', '"', '$', '@'];
const PROSIGNS = [
  ['SOS', '...---...', 'Distress signal'],
  ['AR', '.-.-.', 'End of message'],
  ['SK', '...-.-', 'End of contact / clear'],
  ['BT', '-...-', 'Break / new paragraph'],
  ['KN', '-.--.', 'Invitation for a specific station to transmit'],
  ['AS', '.-...', 'Please stand by'],
];

function textToMorse(text) {
  return text
    .toUpperCase()
    .split(' ')
    .map((word) => word.split('').map((ch) => MORSE_MAP[ch] || '').filter(Boolean).join(' '))
    .join(' / ');
}

function morseToText(code) {
  return code
    .trim()
    .split('/')
    .map((word) =>
      word
        .trim()
        .split(/\s+/)
        .map((m) => MORSE_TO_CHAR[m] || '')
        .join('')
    )
    .join(' ');
}

function ReferenceGrid({ items }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
      {items.map((ch) => (
        <div key={ch} className="rounded-lg border border-border bg-muted/40 p-3 text-center">
          <div className="font-heading font-bold text-lg">{ch}</div>
          <div className="font-mono text-sm tracking-widest text-primary mt-1">{MORSE_MAP[ch]}</div>
        </div>
      ))}
    </div>
  );
}

export default function MorseCode() {
  const [text, setText] = useState('SOS');
  const [morse, setMorse] = useState('');
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState('text');

  const output = useMemo(() => {
    return mode === 'text' ? textToMorse(text) : morseToText(morse);
  }, [mode, text, morse]);

  const copy = () => {
    navigator.clipboard?.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <ToolShell title="Morse Code Chart" description="Reference chart plus a live text ⇄ Morse code converter." icon={Binary} disclaimer={false}>
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
          <button onClick={() => setMode('text')} className={`px-4 h-9 rounded-md text-sm font-semibold transition-colors ${mode === 'text' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Text → Morse</button>
          <button onClick={() => setMode('morse')} className={`px-4 h-9 rounded-md text-sm font-semibold transition-colors ${mode === 'morse' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Morse → Text</button>
        </div>

        {mode === 'text' ? (
          <div>
            <Label>Text</Label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Type a message…"
              className="w-full mt-1.5 px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 font-mono"
            />
          </div>
        ) : (
          <div>
            <Label>Morse code <span className="text-muted-foreground font-normal">(use spaces between letters, " / " between words)</span></Label>
            <textarea
              value={morse}
              onChange={(e) => setMorse(e.target.value)}
              rows={3}
              placeholder="... --- ..."
              className="w-full mt-1.5 px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 font-mono"
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Result</Label>
            <Button variant="ghost" size="sm" onClick={copy} disabled={!output}>
              {copied ? <Check className="w-3.5 h-3.5 mr-1.5 text-success" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div className="rounded-lg bg-muted p-4 font-mono text-lg tracking-wide break-words min-h-[3rem]">
            {output || <span className="text-muted-foreground text-sm font-sans">Result will appear here</span>}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-6">
        <div>
          <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Letters</h2>
          <ReferenceGrid items={ALPHABET} />
        </div>
        <div>
          <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Numbers</h2>
          <ReferenceGrid items={DIGITS} />
        </div>
        <div>
          <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Punctuation</h2>
          <ReferenceGrid items={PUNCTUATION} />
        </div>
        <div>
          <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Common Prosigns</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PROSIGNS.map(([code, morseCode, meaning]) => (
              <div key={code} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading font-bold">{code}</span>
                  <span className="font-mono text-sm tracking-widest text-primary">{morseCode}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{meaning}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Timing Reference</h2>
        <p className="text-sm text-muted-foreground mb-3">Standard International Morse Code timing, measured in units of one "dot" length:</p>
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          <div className="flex items-center justify-between rounded-lg bg-muted p-3"><span>Dot (dit)</span><span className="font-mono font-semibold">1 unit</span></div>
          <div className="flex items-center justify-between rounded-lg bg-muted p-3"><span>Dash (dah)</span><span className="font-mono font-semibold">3 units</span></div>
          <div className="flex items-center justify-between rounded-lg bg-muted p-3"><span>Gap between dots/dashes in a letter</span><span className="font-mono font-semibold">1 unit</span></div>
          <div className="flex items-center justify-between rounded-lg bg-muted p-3"><span>Gap between letters</span><span className="font-mono font-semibold">3 units</span></div>
          <div className="flex items-center justify-between rounded-lg bg-muted p-3 sm:col-span-2"><span>Gap between words</span><span className="font-mono font-semibold">7 units</span></div>
        </div>
      </Card>
    </ToolShell>
  );
}
