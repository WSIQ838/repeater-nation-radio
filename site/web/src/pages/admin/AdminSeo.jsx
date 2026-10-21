import { useEffect, useState } from 'react';
import { Save, Globe, Search, AlertTriangle, CheckCircle2, RefreshCw, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { PageHeader, Loading, ErrorState, Badge } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import FormSelect from '@/components/forms/FormSelect';
import { useToast } from '@/components/ui/use-toast';

const SITEMAP_URL = 'https://repeaternation.com/functions/sitemap-generator';

export default function AdminSeo() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const load = () => {
    setLoading(true); setError('');
    adminApi('seo:get').then((d) => setSettings(d.settings)).catch((e) => setError(e?.error || 'Could not load SEO settings')).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const runAudit = () => {
    setAuditLoading(true);
    adminApi('seo:audit').then((d) => setAudit(d)).catch((e) => toast({ title: e?.error || 'Audit failed', variant: 'destructive' })).finally(() => setAuditLoading(false));
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
    } catch (e) { toast({ title: e?.error || 'Save failed', variant: 'destructive' }); }
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

  return (
    <div>
      <PageHeader title="SEO & GEO" subtitle="Search engine and generative engine optimization for Repeater Nation">
        <Button variant="outline" onClick={runAudit} disabled={auditLoading || !settings}>
          {auditLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Run SEO Audit
        </Button>
        <Button onClick={save} disabled={saving || !settings}>
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </PageHeader>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : settings && (
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

          <p className="text-xs text-muted-foreground lg:col-span-2">Last updated by {settings.updated_by_name || '—'}. Page-specific titles and meta descriptions are managed in Marketing → SEO & GEO. This panel controls app-level SEO settings, index controls, structured data, and the sitemap.</p>
        </div>
      )}
    </div>
  );
}