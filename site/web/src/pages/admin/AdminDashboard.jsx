import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserPlus, RadioTower, Flag, ScrollText, ShieldCheck, Activity, AlertTriangle } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { PageHeader, StatCard, Loading, ErrorState, Badge, formatDateTime } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { errMsg } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { hasPermission } from '@/lib/permissions';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true); setError('');
    adminApi('stats').then(setData).catch((e) => setError(errMsg(e) || e?.message || 'Failed to load stats')).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const quickActions = [
    { label: 'Review repeaters', to: '/admin/repeaters', icon: RadioTower, perm: 'repeaters.view' },
    { label: 'Manage users', to: '/admin/users', icon: Users, perm: 'users.view' },
    { label: 'Open reports', to: '/admin/reports', icon: Flag, perm: 'reports.view' },
    { label: 'Audit log', to: '/admin/audit', icon: ScrollText, perm: 'audit.view' },
    { label: 'Settings', to: '/admin/settings', icon: ShieldCheck, perm: 'settings.manage' },
  ].filter((a) => hasPermission(user, a.perm)); // same perms as the admin nav

  return (
    <div>
      <PageHeader title="Admin Dashboard" subtitle="Overview of platform activity and system health" />

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={Users} label="Total users" value={data.stats.totalUsers} tone="navy" />
            <StatCard icon={Activity} label="Active (30m)" value={data.stats.activeUsers} tone="success" />
            <StatCard icon={UserPlus} label="New (7 days)" value={data.stats.newUsers} tone="primary" />
            <StatCard icon={RadioTower} label="Total repeaters" value={data.stats.totalRepeaters} tone="navy" />
            <StatCard icon={AlertTriangle} label="Pending repeaters" value={data.stats.pendingRepeaters} tone="warn" />
            <StatCard icon={AlertTriangle} label="Needs review" value={data.stats.needsReview} tone="warn" />
            <StatCard icon={Flag} label="Open reports" value={data.stats.openReports} tone={data.stats.openReports ? 'destructive' : 'success'} />
            <StatCard icon={ShieldCheck} label="System status" value={data.stats.maintenanceMode ? 'Maintenance' : 'Operational'} tone={data.stats.maintenanceMode ? 'destructive' : 'success'} />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Quick actions</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {quickActions.map((a) => (
                  <Button key={a.to} asChild variant="outline" className="justify-start h-auto py-3">
                    <Link to={a.to}><a.icon className="w-4 h-4" /> {a.label}</Link>
                  </Button>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="font-semibold mb-4">Recent admin actions</h2>
              {data.recentAudit.length === 0 ? (
                <p className="text-sm text-muted-foreground">No administrative actions recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data.recentAudit.map((a) => (
                    <li key={a.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <Badge tone="muted">{a.category}</Badge>
                        <span className="font-medium">{a.action}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {a.admin_name || 'admin'} · {a.target_label || '—'} · {formatDateTime(a.created_date)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}