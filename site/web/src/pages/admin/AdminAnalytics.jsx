import { useEffect, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Save, Globe, Search, CheckCircle2, RefreshCw, ExternalLink, Image as ImageIcon, BarChart3, TrendingUp } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { PageHeader, Loading, ErrorState, StatCard, Badge } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import FormSelect from '@/components/forms/FormSelect';
import { useToast } from '@/components/ui/use-toast';
import { Users, RadioTower, Flag } from 'lucide-react';

import { errMsg } from '@/lib/utils';

const PIE_COLORS = ['#16a34a', '#f59e0b', '#ef4444', '#94a3b8'];
const SITEMAP_URL = 'https://repeaternation.com/functions/sitemap-generator';
const TABS = [
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'seo', label: 'SEO & GEO', icon: Globe },
];

function last14Days() {
  const days = [];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    days.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), count: 0 });
  }
  return days;
}

function AnalyticsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      adminApi('users:list', { limit: 500 }),
      adminApi('repeaters:list', { hidden: 'all', limit: 500 }),
      adminApi('reports:list'),
    ]).then(([u, r, rep]) => {
      const users = u.users || [];
      const repeaters = r.repeaters || [];
      const reports = rep.reports || [];

      const days = last14Days();
      users.forEach((x) => {
        if (!x.created_date) return;
        const k = new Date(x.created_date).toISOString().slice(0, 10);
        const d = days.find((dd) => dd.key === k);
        if (d) d.count++;
      });

      const verCounts = ['Verified', 'Pending', 'Needs Review', 'Rejected'].map((v) => ({
        name: v, value: repeaters.filter((x) => (x.verification || 'Pending') === v).length,
      }));
      const repCounts = ['Open', 'Investigating', 'Resolved', 'Dismissed'].map((s) => ({
        name: s, value: reports.filter((x) => (x.status || 'Open') === s).length,
      }));
      const statusCounts = ['Online', 'Offline', 'Maintenance'].map((s) => ({
        name: s, value: repeaters.filter((x) => (x.status || 'Online') === s).length,
      }));

      setData({ days, verCounts, repCounts, statusCounts, totals: { users: u.total || users.length, repeaters: repeaters.length, reports: reports.length } });
    }).catch((e) => setError(errMsg(e) || 'Could not load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard icon={Users} label="Users" value={data.totals.users} tone="navy" />
        <StatCard icon={RadioTower} label="Repeaters" value={data.totals.repeaters} tone="primary" />
        <StatCard icon={Flag} label="Reports" value={data.totals.reports} tone="muted" />
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4 text-primary" /><h2 className="font-semibold">User registrations (last 14 days)</h2></div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.days}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={1} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5">
          <h2 className="font-semibold mb-4">Repeater verification</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.verCounts} dataKey="value" nameKey="name" outerRadius={70} label>
                  {data.verCounts.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="text-xs space-y-1 mt-2">
            {data.verCounts.map((v, i) => (
              <li key={v.name} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} /> {v.name}: {v.value}</li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Reports by status</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.repCounts} layout="vertical">
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Repeater status</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.statusCounts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--navy))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}

function SeoPanel() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const load = () => {
    setLoading(true); setError('');
    adminApi('seo:get').then((d) => setSettings(d.settings)).catch((e) => setError(errMsg(e) || 'Could not load SEO settings')).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const runAudit = () => {
    setAuditLoading(true);
    adminApi('seo:audit').then((d) => setAudit(d)).catch((e) => toast({ title: errMsg(e) || 'Audit failed', variant: 'destructive' })).finally(() => setAuditLoading(false));
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminApi('seo:update', {
        site_title: settings.site_title || '',
        site_description: settings.site_description || '',
        default_keywords: settings.default_keywords || '',
        social_image_url: settings.social_image_url || '',
        twitter_card_type: settings.twitter_card_type || 'summary_large_image',
        google_verification: settings.google_verification || '',
        bing_verification: settings.bing_verification || '',
        default_robots: settings.default_robots || 'index, follow',
        index_repeaters: settings.index_repeaters !== false,
        index_clubs: settings.index_clubs !== false,
        index_nets: settings.index_nets !== false,
        index_events: settings.index_events !== false,
        index_forum: settings.index_forum !== false,
        index_profiles: !!settings.index_profiles,
        enable_structured_data: settings.enable_structured_data !== false,
        enable_breadcrumbs: settings.enable_breadcrumbs !== false,
        enable_sitemap: settings.enable_sitemap !== false,
      });
      toast({ title: 'SEO settings saved' });
    } catch (e) { toast({ title: errMsg(e) || 'Save failed', variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const Toggle = ({ field, label, description, defaultTrue = false }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="min-w-0">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={defaultTrue ? settings[field] !== false : !!settings[field]} onCheckedChange={(v) => setSettings({ ...settings, [field]: v })} />
    </div>
  );

  const severityTone = { high: 'destructive', medium: 'warn', low: 'muted' };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={runAudit} disabled={auditLoading}>
          {auditLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Run SEO Audit
        </Button>
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Globe className="w-4 h-4 text-primary" /><h2 className="font-semibold">Global SEO</h2></div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Site title</Label>
              <Input value={settings.site_title || ''} onChange={(e) => setSettings({ ...settings, site_title: e.target.value })} placeholder="Repeater Nation — GMRS Repeater Directory…" />
              <p className="text-xs text-muted-foreground">Default title tag. Aim for 10–60 characters.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Site description</Label>
              <Textarea value={settings.site_description || ''} onChange={(e) => setSettings({ ...settings, site_description: e.target.value })} rows={3} placeholder="Repeater Nation is a community-driven platform…" />
              <p className="text-xs text-muted-foreground">Default meta description. Aim for up to 160 characters.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Default keywords</Label>
              <Input value={settings.default_keywords || ''} onChange={(e) => setSettings({ ...settings, default_keywords: e.target.value })} placeholder="GMRS, GMRS repeaters, GMRS clubs…" />
              <p className="text-xs text-muted-foreground">Comma-separated. Used as a reference — modern search engines focus on content.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Default robots directive</Label>
              <Input value={settings.default_robots || ''} onChange={(e) => setSettings({ ...settings, default_robots: e.target.value })} placeholder="index, follow" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><ImageIcon className="w-4 h-4 text-primary" /><h2 className="font-semibold">Social & Verification</h2></div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Social sharing image URL</Label>
              <Input value={settings.social_image_url || ''} onChange={(e) => setSettings({ ...settings, social_image_url: e.target.value })} placeholder="https://…" />
              <p className="text-xs text-muted-foreground">Default Open Graph image (1200×630 recommended).</p>
            </div>
            <div className="space-y-1.5">
              <Label>Twitter / X card type</Label>
              <FormSelect value={settings.twitter_card_type || 'summary_large_image'} onChange={(e) => setSettings({ ...settings, twitter_card_type: e.target.value })}>
                <option value="summary">Summary</option>
                <option value="summary_large_image">Summary with large image</option>
              </FormSelect>
            </div>
            <div className="space-y-1.5">
              <Label>Google Search Console verification</Label>
              <Input value={settings.google_verification || ''} onChange={(e) => setSettings({ ...settings, google_verification: e.target.value })} placeholder="google-site-verification content value" />
              <p className="text-xs text-muted-foreground">Paste the content attribute value from the verification meta tag.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Bing Webmaster verification</Label>
              <Input value={settings.bing_verification || ''} onChange={(e) => setSettings({ ...settings, bing_verification: e.target.value })} placeholder="msvalidate.01 content value" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-2">Index / Noindex Controls</h2>
          <p className="text-xs text-muted-foreground mb-3">Control which public content types search engines can index. Private and admin pages are never indexable.</p>
          <Toggle field="index_repeaters" defaultTrue label="Index repeater pages" description="Allow search engines to index public repeater pages." />
          <Toggle field="index_clubs" defaultTrue label="Index club pages" description="Allow search engines to index public club pages." />
          <Toggle field="index_nets" defaultTrue label="Index net pages" description="Allow search engines to index public net pages." />
          <Toggle field="index_events" defaultTrue label="Index event pages" description="Allow search engines to index public event pages." />
          <Toggle field="index_forum" defaultTrue label="Index forum pages" description="Allow search engines to index forum posts." />
          <Toggle field="index_profiles" label="Index member profiles" description="Allow search engines to index public member profiles. Off by default for privacy." />
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-2">SEO Features & Sitemap</h2>
          <Toggle field="enable_structured_data" defaultTrue label="Structured data (JSON-LD)" description="Inject Schema.org structured data on public pages." />
          <Toggle field="enable_breadcrumbs" defaultTrue label="Breadcrumb navigation" description="Display breadcrumbs with BreadcrumbList schema on public pages." />
          <Toggle field="enable_sitemap" defaultTrue label="XML sitemap" description="Generate and serve the dynamic XML sitemap." />
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Sitemap URL</span>
            </div>
            <p className="text-xs text-muted-foreground break-all">{SITEMAP_URL}</p>
            <p className="text-xs text-muted-foreground mt-2">Submit this URL in Google Search Console and Bing Webmaster Tools.</p>
          </div>
        </Card>

        {audit && (
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4"><Search className="w-4 h-4 text-primary" /><h2 className="font-semibold">SEO Audit</h2></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="text-center p-3 rounded-lg bg-muted"><div className="text-2xl font-bold">{audit.counts.total}</div><div className="text-xs text-muted-foreground">Total issues</div></div>
              <div className="text-center p-3 rounded-lg bg-destructive/10"><div className="text-2xl font-bold text-destructive">{audit.counts.high}</div><div className="text-xs text-muted-foreground">High</div></div>
              <div className="text-center p-3 rounded-lg bg-amber-500/10"><div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{audit.counts.medium}</div><div className="text-xs text-muted-foreground">Medium</div></div>
              <div className="text-center p-3 rounded-lg bg-muted"><div className="text-2xl font-bold">{audit.counts.low}</div><div className="text-xs text-muted-foreground">Low</div></div>
            </div>
            {audit.issues.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="w-5 h-5" /> No SEO issues found. All public content is well-structured.</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
                {audit.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                    <Badge tone={severityTone[issue.severity]}>{issue.severity}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{issue.entity}</div>
                      <div className="text-xs text-muted-foreground">{issue.issue}</div>
                    </div>
                    <Badge tone="muted">{issue.type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <p className="text-xs text-muted-foreground lg:col-span-2">Last updated by {settings.updated_by_name || '—'}. Page-specific titles and meta descriptions are managed per-page in code. This panel controls app-level SEO settings, index controls, structured data, and the sitemap.</p>
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const [tab, setTab] = useState('analytics');

  return (
    <div>
      <PageHeader title="Analytics & SEO" subtitle="Platform usage trends plus search and generative-engine optimization for Repeater Nation" />

      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'analytics' ? <AnalyticsPanel /> : <SeoPanel />}
    </div>
  );
}
