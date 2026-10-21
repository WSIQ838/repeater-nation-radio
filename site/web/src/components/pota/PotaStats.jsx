import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Trees } from 'lucide-react';

export default function PotaStats({ userId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      try {
        const acts = await base44.entities.PotaActivation.filter({ created_by_id: userId }, '-scheduled_date', 200);
        if (!active) return;
        const list = acts || [];
        const parks = new Set(list.map((a) => a.park_id).filter(Boolean));
        const contacts = list.reduce((s, a) => s + (a.contacts_count || 0), 0);
        setData({ activations: list.length, parks: parks.size, contacts });
      } catch {
        if (active) setData(null);
      }
    })();
    return () => { active = false; };
  }, [userId]);

  if (!data || data.activations === 0) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-semibold flex items-center gap-2">
          <Trees className="w-5 h-5 text-green-600" /> POTA Activity
        </h3>
        <Link to="/tools/pota" title="Open the full POTA operations tool." className="text-sm text-primary hover:underline">View POTA</Link>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center" title="Total POTA activations created by this operator.">
          <div className="text-2xl font-bold text-green-600">{data.activations}</div>
          <div className="text-xs text-muted-foreground">Activations</div>
        </div>
        <div className="text-center" title="Unique POTA parks associated with this operator’s activations.">
          <div className="text-2xl font-bold text-green-600">{data.parks}</div>
          <div className="text-xs text-muted-foreground">Parks</div>
        </div>
        <div className="text-center" title="Total contacts logged across this operator’s POTA activations.">
          <div className="text-2xl font-bold text-green-600">{data.contacts}</div>
          <div className="text-xs text-muted-foreground">Contacts</div>
        </div>
      </div>
    </Card>
  );
}