import { useEffect, useState } from 'react';
import { Save, Settings as SettingsIcon, Percent, Share2, Heart, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { PageHeader, Loading, ErrorState } from '@/components/admin/parts';
import StreakManagement from '@/components/admin/StreakManagement';
import DiscordWebhooksSection from '@/components/admin/DiscordWebhooksSection';
import DiscordEventsCard from '@/components/admin/DiscordEventsCard';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

import { errMsg } from '@/lib/utils';
export default function AdminSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [stripeStatus, setStripeStatus] = useState(null);
  const [stripeStatusLoading, setStripeStatusLoading] = useState(true);

  const loadStripeStatus = () => {
    setStripeStatusLoading(true);
    adminApi('donations:status').then(setStripeStatus).catch(() => setStripeStatus({ connected: false })).finally(() => setStripeStatusLoading(false));
  };
  useEffect(loadStripeStatus, []);

  const load = () => {
    setLoading(true); setError('');
    adminApi('settings:get').then((d) => {
      const s = d.settings;
      if (s?.nav_order && typeof s.nav_order === 'string') {
        try { s.nav_order = JSON.parse(s.nav_order); } catch { s.nav_order = []; }
      }
      if (s) {
        if (typeof s.discord_message_templates === 'string') {
          try { s.discord_message_templates = JSON.parse(s.discord_message_templates) || {}; } catch { s.discord_message_templates = {}; }
        } else if (!s.discord_message_templates) {
          s.discord_message_templates = {};
        }
        if (typeof s.discord_bot_usernames === 'string') {
          try { s.discord_bot_usernames = JSON.parse(s.discord_bot_usernames) || {}; } catch { s.discord_bot_usernames = {}; }
        } else if (!s.discord_bot_usernames) {
          s.discord_bot_usernames = {};
        }
      }
      setSettings(s);
    }).catch((e) => setError(errMsg(e) || 'Could not load settings')).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi('settings:update', {
        maintenance_mode: !!settings.maintenance_mode,
        registration_open: !!settings.registration_open,
        allow_new_repeaters: !!settings.allow_new_repeaters,
        fcc_auto_verify: !!settings.fcc_auto_verify,
        map_default_zoom: Number(settings.map_default_zoom) || 4,
        announcement: settings.announcement || '',
        changelog_webhook_url: settings.changelog_webhook_url || '',
        bug_report_webhook_url: settings.bug_report_webhook_url || '',
        webhook_access_requests: settings.webhook_access_requests || '',
        webhook_friend_requests: settings.webhook_friend_requests || '',
        webhook_messages: settings.webhook_messages || '',
        webhook_forum_replies: settings.webhook_forum_replies || '',
        webhook_net_host_invites: settings.webhook_net_host_invites || '',
        webhook_repeater_submissions: settings.webhook_repeater_submissions || '',
        webhook_club_joins: settings.webhook_club_joins || '',
        webhook_pota_submissions: settings.webhook_pota_submissions || '',
        webhook_badge_awards: settings.webhook_badge_awards || '',
        webhook_payments: settings.webhook_payments || '',
        webhook_events: settings.webhook_events || '',
        discord_events_enabled: settings.discord_events_enabled !== false,
        ...(Array.isArray(settings.discord_event_kinds) && settings.discord_event_kinds.length ? { discord_event_kinds: settings.discord_event_kinds } : {}),
        discord_message_templates: JSON.stringify(settings.discord_message_templates || {}),
        discord_bot_usernames: JSON.stringify(settings.discord_bot_usernames || {}),
        tool_frequency_calc: settings.tool_frequency_calc !== false,
        tool_tone_calc: settings.tool_tone_calc !== false,
        tool_channel_planner: settings.tool_channel_planner !== false,
        tool_antenna_calc: settings.tool_antenna_calc !== false,
        tool_coax_calc: settings.tool_coax_calc !== false,
        tool_power_calc: settings.tool_power_calc !== false,
        tool_distance_calc: settings.tool_distance_calc !== false,
        tool_weather: settings.tool_weather !== false,
        tool_sunrise_sunset: settings.tool_sunrise_sunset !== false,
        tool_morse_code: settings.tool_morse_code !== false,
        tool_sdr: settings.tool_sdr !== false,
        nav_order: JSON.stringify(settings.nav_order || []),
        platform_fee_percent: Number(settings.platform_fee_percent ?? 5),
        gamification_enabled: settings.gamification_enabled !== false,
        show_bug_report_link: settings.show_bug_report_link !== false,
        social_discord_url: settings.social_discord_url || '',
        social_twitter_url: settings.social_twitter_url || '',
        social_facebook_url: settings.social_facebook_url || '',
        social_instagram_url: settings.social_instagram_url || '',
        social_youtube_url: settings.social_youtube_url || '',
        social_tiktok_url: settings.social_tiktok_url || '',
        donation_url: settings.donation_url || '',
        donation_stripe_enabled: !!settings.donation_stripe_enabled,
        signup_announcement_enabled: !!settings.signup_announcement_enabled,
        signup_announcement_title: settings.signup_announcement_title || '',
        signup_announcement_body: settings.signup_announcement_body || '',
      });
      toast({ title: 'Settings saved' });
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

  return (
    <div>
      <PageHeader title="Settings" subtitle="Website, registration, map, and notification settings" >
        <Button onClick={save} disabled={saving || !settings}><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}</Button>
      </PageHeader>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : settings && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-2"><SettingsIcon className="w-4 h-4 text-primary" /><h2 className="font-semibold">General</h2></div>
            <Toggle field="maintenance_mode" label="Maintenance mode" description="Take the site offline for maintenance (status indicator only)." />
            <Toggle field="registration_open" label="Registration open" description="Allow new user sign-ups." />
            <Toggle field="allow_new_repeaters" label="Allow new repeater submissions" description="Let users submit new repeater entries." />
            <Toggle defaultTrue field="gamification_enabled" label="Net gamification" description="Enable check-in streaks, badges, and leaderboards across the platform." />
            <Toggle defaultTrue field="show_bug_report_link" label="Report a Bug link" description="Show the “Report a Bug” link in the member sidebar." />
          </Card>

          <StreakManagement />

          <Card className="p-5">
            <h2 className="font-semibold mb-4">Map & FCC</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Default map zoom</Label>
                <Input type="number" min={1} max={18} value={settings.map_default_zoom ?? 4} onChange={(e) => setSettings({ ...settings, map_default_zoom: Number(e.target.value) })} />
              </div>
              <Toggle field="fcc_auto_verify" label="Auto-verify FCC callsigns" description="Attempt automatic FCC verification on registration." />
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <h2 className="font-semibold mb-4">Announcement</h2>
            <div className="space-y-1.5">
              <Label>Site-wide announcement (optional)</Label>
              <Textarea value={settings.announcement || ''} onChange={(e) => setSettings({ ...settings, announcement: e.target.value })} rows={3} placeholder="Shown to users across the site." />
            </div>
            <p className="text-xs text-muted-foreground mt-3">Last updated by {settings.updated_by_name || '—'}. Sensitive credentials and API secrets are managed server-side and are not exposed here.</p>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <h2 className="font-semibold mb-4">Signup Announcement</h2>
            <p className="text-xs text-muted-foreground mb-3">
              A separate popup shown only on the registration page, before someone signs up — independent of the
              site-wide announcement above and the general Announcements shown elsewhere in the app.
            </p>
            <Toggle field="signup_announcement_enabled" label="Show on the signup page" description="Turn this notice on or off without losing the saved title/body." />
            <div className="space-y-3 mt-3">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={settings.signup_announcement_title || ''} onChange={(e) => setSettings({ ...settings, signup_announcement_title: e.target.value })} placeholder="e.g. New GMRS License? You Can Now Sign Up Right Away" />
              </div>
              <div className="space-y-1.5">
                <Label>Body</Label>
                <Textarea value={settings.signup_announcement_body || ''} onChange={(e) => setSettings({ ...settings, signup_announcement_body: e.target.value })} rows={4} placeholder="Shown to visitors on the registration page." />
              </div>
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <h2 className="font-semibold mb-4">Operator Tools</h2>
            <p className="text-xs text-muted-foreground mb-3">Enable or disable individual operator tools. Disabled tools are hidden from the Tools page for all users.</p>
            <div className="grid sm:grid-cols-2 gap-x-6">
              <Toggle defaultTrue field="tool_frequency_calc" label="Frequency Calculator" description="Repeater input/output and offset math." />
              <Toggle defaultTrue field="tool_tone_calc" label="CTCSS / DCS Tones" description="Search and copy tones and codes." />
              <Toggle defaultTrue field="tool_channel_planner" label="Channel Planner" description="Build, save, and export channel lists." />
              <Toggle defaultTrue field="tool_antenna_calc" label="Antenna Calculator" description="Estimate antenna element lengths." />
              <Toggle defaultTrue field="tool_coax_calc" label="Coax Loss Calculator" description="Estimate feedline loss." />
              <Toggle defaultTrue field="tool_power_calc" label="Power & ERP Calculator" description="Estimate EIRP and ERP." />
              <Toggle defaultTrue field="tool_distance_calc" label="Distance Calculator" description="Measure distance between locations." />
              <Toggle defaultTrue field="tool_weather" label="Weather" description="Current conditions and forecast." />
              <Toggle defaultTrue field="tool_sunrise_sunset" label="Sunrise & Sunset" description="Sun times and civil twilight." />
              <Toggle defaultTrue field="tool_morse_code" label="Morse Code" description="Reference chart for CW code groups." />
              <Toggle defaultTrue field="tool_sdr" label="SDR Streams" description="Browse and submit member-run SDR web receivers." />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-2"><Percent className="w-4 h-4 text-primary" /><h2 className="font-semibold">Platform Transaction Fee</h2></div>
            <p className="text-xs text-muted-foreground mb-3">Percentage of each club membership payment kept by the platform. The remainder goes to the club owner's Stripe account. Applied to all new membership checkouts.</p>
            <div className="space-y-1.5">
              <Label>Platform fee (%)</Label>
              <Input type="number" min={0} max={100} step={0.5} value={settings.platform_fee_percent ?? 5} onChange={(e) => setSettings({ ...settings, platform_fee_percent: Number(e.target.value) })} />
            </div>
          </Card>


          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-2"><Share2 className="w-4 h-4 text-primary" /><h2 className="font-semibold">Social Links</h2></div>
            <p className="text-xs text-muted-foreground mb-4">Shown across the site — sidebar, landing page, and contact page. Leave a field blank to hide that platform's link/icon.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Discord invite</Label>
                <Input value={settings.social_discord_url || ''} onChange={(e) => setSettings({ ...settings, social_discord_url: e.target.value })} placeholder="https://discord.gg/…" />
              </div>
              <div className="space-y-1.5">
                <Label>Twitter / X</Label>
                <Input value={settings.social_twitter_url || ''} onChange={(e) => setSettings({ ...settings, social_twitter_url: e.target.value })} placeholder="https://x.com/…" />
              </div>
              <div className="space-y-1.5">
                <Label>Facebook</Label>
                <Input value={settings.social_facebook_url || ''} onChange={(e) => setSettings({ ...settings, social_facebook_url: e.target.value })} placeholder="https://facebook.com/…" />
              </div>
              <div className="space-y-1.5">
                <Label>Instagram</Label>
                <Input value={settings.social_instagram_url || ''} onChange={(e) => setSettings({ ...settings, social_instagram_url: e.target.value })} placeholder="https://instagram.com/…" />
              </div>
              <div className="space-y-1.5">
                <Label>YouTube</Label>
                <Input value={settings.social_youtube_url || ''} onChange={(e) => setSettings({ ...settings, social_youtube_url: e.target.value })} placeholder="https://youtube.com/@…" />
              </div>
              <div className="space-y-1.5">
                <Label>TikTok</Label>
                <Input value={settings.social_tiktok_url || ''} onChange={(e) => setSettings({ ...settings, social_tiktok_url: e.target.value })} placeholder="https://tiktok.com/@…" />
              </div>
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-2"><Heart className="w-4 h-4 text-primary" /><h2 className="font-semibold">Donations</h2></div>
            <p className="text-xs text-muted-foreground mb-4">A Donate button appears in the app header, the landing page, and a "help keep this free" section on the homepage whenever either option below is set.</p>

            <div className="rounded-lg border border-border p-4 mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {stripeStatusLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : stripeStatus?.connected ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <XCircle className="w-4 h-4 text-muted-foreground" />
                  )}
                  {stripeStatusLoading ? 'Checking Stripe…' : stripeStatus?.connected ? `Stripe connected${stripeStatus.businessName ? ` — ${stripeStatus.businessName}` : ''}` : 'Stripe not connected'}
                </div>
                <Button variant="ghost" size="sm" onClick={loadStripeStatus}><RefreshCw className="w-4 h-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stripeStatus?.connected
                  ? 'Donations can be accepted directly via Stripe Checkout, using the same Stripe account already connected for club membership payments.'
                  : 'Set the STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET) secrets to accept donations directly on the site — the same Stripe account already used for club membership payments. No separate "connect" step needed once those are set.'}
              </p>
              <div className="flex items-center justify-between gap-4 mt-3 pt-3 border-t border-border">
                <div>
                  <div className="font-medium text-sm">Accept donations via Stripe Checkout</div>
                  <div className="text-xs text-muted-foreground">Donors pay in-app with a card — no redirect to an external site.</div>
                </div>
                <Switch checked={!!settings.donation_stripe_enabled} onCheckedChange={(v) => setSettings({ ...settings, donation_stripe_enabled: v })} disabled={!stripeStatus?.connected} />
              </div>
            </div>

            <div className="space-y-1.5 max-w-md">
              <Label>External donation link (fallback)</Label>
              <Input value={settings.donation_url || ''} onChange={(e) => setSettings({ ...settings, donation_url: e.target.value })} placeholder="https://paypal.me/… or https://ko-fi.com/…" />
              <p className="text-xs text-muted-foreground">Used when Stripe donations are off or not connected. Ignored while Stripe donations above are on.</p>
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <DiscordEventsCard settings={settings} setSettings={setSettings} />
          </Card>

          <Card className="p-5 lg:col-span-2">
            <h2 className="font-semibold mb-4">Discord Webhooks</h2>
            <DiscordWebhooksSection settings={settings} setSettings={setSettings} />
          </Card>
        </div>
      )}
    </div>
  );
}
