import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trees, Plus, Loader2, Radio } from 'lucide-react';

const STATUS_STYLE = {
  Upcoming: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Active: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  Completed: 'bg-muted text-muted-foreground',
  Cancelled: 'bg-destructive/15 text-destructive',
};

export default function ClubPotaActivations({ clubId, canManage }) {
  const [activations, setActivations] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.PotaActivation.filter({ club_id: clubId }, '-scheduled_date', 100);
      setActivations(list || []);
    } catch {
      setActivations([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [clubId]);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-semibold flex items-center gap-2">
          <Trees className="w-5 h-5 text-green-600" /> POTA Activations
        </h3>
        <Link to="/tools/pota">
          <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1.5" /> New activation</Button>
        </Link>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : activations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No POTA activations for this club yet. Start one from the POTA tool and select this club.</p>
      ) : (
        <div className="space-y-2">
          {activations.map((a) => (
            <Link key={a.id} to={`/tools/pota/${a.id}`} className="block">
              <div className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary/50 hover:shadow-sm transition-all">
                <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400 grid place-items-center shrink-0">
                  <Trees className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{a.park_name} <span className="text-muted-foreground font-mono">· {a.park_number}</span></div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    {a.scheduled_date && <span>{format(new Date(a.scheduled_date), 'EEE, MMM d · h:mm a')}</span>}
                    {a.frequency && <span className="flex items-center gap-1"><Radio className="w-3 h-3" /> {a.frequency} MHz</span>}
                    <span>{a.contacts_count || 0} contacts</span>
                  </div>
                </div>
                <Badge className={`shrink-0 ${STATUS_STYLE[a.status] || ''}`}>{a.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}