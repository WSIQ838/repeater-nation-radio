import { useState } from 'react';
import { Landmark, Search } from 'lucide-react';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';

export default function FccLookup() {
  const [callsign, setCallsign] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const search = async () => {
    const cs = callsign.trim().toUpperCase();
    if (!cs) return;
    setLoading(true); setErr(''); setResult(null);
    try {
      const res = await base44.functions.invoke('verifyCallsign', { callsign: cs });
      const d = res?.data || res || {};
      setResult(d);
    } catch (e) { setErr('Lookup failed. Try again later.'); }
    setLoading(false);
  };

  return (
    <ToolShell title="FCC / Callsign Lookup" description="Verify a GMRS or amateur (HAM) callsign against the FCC Universal Licensing System. Reuses the existing FCC lookup." icon={Landmark} disclaimer={false}>
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label>Callsign</Label>
            <Input value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} placeholder="e.g. WRXYZ123" className="uppercase" onKeyDown={(e) => e.key === 'Enter' && search()} />
          </div>
          <Button onClick={search} disabled={loading}><Search className="w-4 h-4 mr-1.5" /> {loading ? 'Searching…' : 'Look up'}</Button>
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        {result && (
          <div className="rounded-xl border border-input p-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${result.verified ? 'bg-success/15 text-success' : result.found ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-muted text-muted-foreground'}`}>
                {result.verified ? 'Verified' : result.found ? 'Found' : 'Not found'}
              </span>
              {result.status && <span className="text-sm text-muted-foreground">Status: {result.status}</span>}
            </div>
            {result.licensee && <div><span className="text-xs text-muted-foreground">Licensee:</span> <span className="font-medium">{result.licensee}</span></div>}
            {result.frn && <div><span className="text-xs text-muted-foreground">FRN:</span> <span className="font-mono text-sm">{result.frn}</span></div>}
            {result.service && <div><span className="text-xs text-muted-foreground">Service:</span> <span className="text-sm">{result.service}</span></div>}
            {result.expiration && <div><span className="text-xs text-muted-foreground">Expires:</span> <span className="text-sm">{result.expiration}{new Date(result.expiration) < new Date() ? ' (expired)' : ''}</span></div>}
            {result.address && <div className="text-sm text-muted-foreground">{typeof result.address === 'string' ? result.address : [result.address.street, result.address.city, result.address.state, result.address.zip].filter(Boolean).join(', ')}</div>}
            {result.message && !result.found && <div className="text-sm text-muted-foreground">{result.message}</div>}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Data comes directly from the FCC ULS database and may lag recent filings.</p>
      </Card>
    </ToolShell>
  );
}