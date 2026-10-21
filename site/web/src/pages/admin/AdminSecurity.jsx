import { useEffect, useState } from 'react';
import { ShieldCheck, KeyRound, Activity, Lock } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { PageHeader, Loading, ErrorState, EmptyState, Badge, formatDateTime } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';

import { errMsg } from '@/lib/utils';
export default function AdminSecurity() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true); setError('');
    adminApi('audit:list', { category: 'security', limit: 200 })
      .then((d) => setEvents(d.audit || []))
      .catch((e) => setError(errMsg(e) || 'Could not load security events'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div>
      <PageHeader title="Security" subtitle="Account security events and administrative actions" />

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-2"><Lock className="w-4 h-4 text-primary" /><h2 className="font-semibold">Authentication</h2></div>
          <p className="text-sm text-muted-foreground">Authentication and session handling are managed securely by the platform. Passwords are never stored or transmitted in plaintext, and sessions expire according to the platform's token policy.</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-2"><Activity className="w-4 h-4 text-primary" /><h2 className="font-semibold">Active sessions</h2></div>
          <p className="text-sm text-muted-foreground">Live session enumeration is managed by the platform auth provider and is not exposed to the application. Users can sign out from their own profile to end their session.</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-2"><KeyRound className="w-4 h-4 text-primary" /><h2 className="font-semibold">API keys & secrets</h2></div>
          <p className="text-sm text-muted-foreground">All credentials (Stripe, Discord, Wix/FCC keys) are stored as server-side environment secrets and are never sent to the frontend. No secrets are exposed in this panel.</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4"><ShieldCheck className="w-4 h-4 text-primary" /><h2 className="font-semibold">Security events</h2></div>
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : events.length === 0 ? <EmptyState title="No security events" description="Account suspensions, re-enables, and role changes will appear here." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">Admin</th>
                  <th className="text-left px-4 py-3 font-medium">Target</th>
                  <th className="text-left px-4 py-3 font-medium">Change</th>
                  <th className="text-left px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3"><Badge tone="destructive">{e.action}</Badge></td>
                    <td className="px-4 py-3">{e.admin_name || '—'}</td>
                    <td className="px-4 py-3">{e.target_label || '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {e.before && e.after ? `${e.before} → ${e.after}` : e.after || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(e.created_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}