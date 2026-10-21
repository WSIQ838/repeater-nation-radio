import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '@/lib/adminClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KeyRound, BarChart3, Trash2 } from 'lucide-react';
import { cn, errMsg } from '@/lib/utils';
import { PageHeader, Loading, EmptyState } from '@/components/admin/parts';

export default function AdminApiKeys() {
  const { toast } = useToast();
  const [tab, setTab] = useState('keys');
  const [keys, setKeys] = useState([]);
  const [totalsByKey, setTotalsByKey] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keysRes, usageRes] = await Promise.all([
        adminApi('apikeys:list'),
        adminApi('apikeys:usage'),
      ]);
      setKeys(keysRes?.keys || []);
      setTotalsByKey(usageRes?.totalsByKey || {});
    } catch (err) {
      toast({ title: 'Failed to load API keys', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (key) => {
    if (!confirm(`Revoke "${key.label}" (owned by ${key.owner_name || key.owner_user_id})? This takes effect immediately.`)) return;
    try {
      await adminApi('apikeys:revoke', { id: key.id, reason: 'Revoked by admin' });
      toast({ title: 'API key revoked' });
      load();
    } catch (err) {
      toast({ title: 'Revoke failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
  };

  const setTier = async (key, tier) => {
    try {
      await adminApi('apikeys:setTier', { id: key.id, tier });
      toast({ title: `Rate-limit tier set to ${tier}` });
      load();
    } catch (err) {
      toast({ title: 'Update failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
  };

  const activeCount = keys.filter((k) => k.status === 'active').length;
  const totalRequestsThisWindow = Object.values(totalsByKey).reduce((sum, n) => sum + (n || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="API Access" subtitle="Manage developer API keys and monitor usage of the public read-only API." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="keys" className="gap-1.5"><KeyRound className="w-4 h-4" /> Keys</TabsTrigger>
          <TabsTrigger value="usage" className="gap-1.5"><BarChart3 className="w-4 h-4" /> Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="keys">
          {loading ? (
            <Loading />
          ) : keys.length === 0 ? (
            <EmptyState title="No API keys yet" description="Members with API access will see issued keys here." icon={KeyRound} />
          ) : (
            <div className="space-y-2">
              {keys.map((key) => (
                <Card key={key.id} className={cn('p-4 flex items-center gap-4 flex-wrap', key.status !== 'active' && 'opacity-50')}>
                  <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0"><KeyRound className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                      {key.label}
                      <Badge variant={key.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{key.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {key.owner_name || key.owner_user_id} {key.owner_callsign ? `(${key.owner_callsign})` : ''} · {key.key_prefix}…
                      {key.last_used_at && ` · last used ${new Date(key.last_used_at).toLocaleString()}`}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{key.total_requests || 0} lifetime requests</span>
                  {key.status === 'active' && (
                    <select
                      value={key.rate_limit_tier || 'standard'}
                      onChange={(e) => setTier(key, e.target.value)}
                      className="h-8 px-2 rounded-md border border-input bg-background text-xs"
                    >
                      <option value="standard">Standard</option>
                      <option value="elevated">Elevated</option>
                    </select>
                  )}
                  {key.status === 'active' && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(key)} className="h-8 gap-1 text-xs text-destructive hover:text-destructive">
                      <Trash2 className="w-3 h-3" /> Revoke
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="usage">
          {loading ? (
            <Loading />
          ) : (
            <div className="space-y-4 max-w-2xl">
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Active keys</div>
                  <div className="text-2xl font-semibold mt-1">{activeCount}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Recent request volume</div>
                  <div className="text-2xl font-semibold mt-1">{totalRequestsThisWindow}</div>
                </Card>
              </div>
              <Card className="p-4">
                <div className="font-medium text-sm mb-3">Top keys by recent volume</div>
                <p className="text-[11px] text-muted-foreground mb-2">Rolling total across the most recently recorded rate-limit windows per key (not a live-updating count).</p>
                {Object.keys(totalsByKey).length === 0 ? (
                  <div className="text-xs text-muted-foreground">No API requests recorded yet.</div>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(totalsByKey)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 20)
                      .map(([keyId, count]) => {
                        const key = keys.find((k) => k.id === keyId);
                        return (
                          <div key={keyId} className="flex items-center justify-between text-sm py-1 border-b border-border/60 last:border-0">
                            <span className="truncate">{key?.label || keyId}</span>
                            <span className="font-mono text-xs text-muted-foreground shrink-0">{count} req</span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
