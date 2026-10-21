import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Send, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { useToast } from '@/components/ui/use-toast';
import { errMsg } from '@/lib/utils';
import { DISCORD_CHANNELS, DISCORD_TEMPLATES } from '@/lib/discordTemplates';

const channelByType = Object.fromEntries(DISCORD_CHANNELS.map((c) => [c.type, c]));

export default function DiscordWebhooksSection({ settings, setSettings }) {
  const { toast } = useToast();
  const [testingId, setTestingId] = useState(null);
  const templateOverrides = settings.discord_message_templates || {};
  const usernameOverrides = settings.discord_bot_usernames || {};

  const setTemplateField = (id, field, value) => {
    setSettings({
      ...settings,
      discord_message_templates: {
        ...templateOverrides,
        [id]: { ...templateOverrides[id], [field]: value },
      },
    });
  };

  const resetTemplate = (id) => {
    const next = { ...templateOverrides };
    delete next[id];
    setSettings({ ...settings, discord_message_templates: next });
  };

  const setUsername = (type, value) => {
    setSettings({ ...settings, discord_bot_usernames: { ...usernameOverrides, [type]: value } });
  };

  const sendTest = async (tmpl) => {
    const channel = channelByType[tmpl.channelType];
    const webhookUrl = settings[channel?.field] || '';
    const override = templateOverrides[tmpl.id] || {};
    setTestingId(tmpl.id);
    try {
      await adminApi('discord:test', {
        template_id: tmpl.id,
        webhook_url: webhookUrl,
        username: usernameOverrides[tmpl.channelType] || '',
        title: override.title || '',
        description: override.description || '',
        color: override.color || '',
      });
      toast({ title: 'Test message sent', description: `Check the "${channel?.label}" Discord channel.` });
    } catch (e) {
      toast({ title: errMsg(e) || 'Test failed', variant: 'destructive' });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Route each notification type to its own Discord channel and give it a bot display name. If a webhook URL is blank, that notification will not be posted to Discord. Create separate webhooks in your Discord server's channel settings (Edit Channel → Integrations → Webhooks).
        </p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          {DISCORD_CHANNELS.map(({ type, field, label, emoji, defaultUsername }) => (
            <div key={field} className="space-y-1.5">
              <Label>{emoji} {label}</Label>
              <Input
                value={settings[field] || ''}
                onChange={(e) => setSettings({ ...settings, [field]: e.target.value })}
                placeholder="https://discord.com/api/webhooks/…"
              />
              <Input
                value={usernameOverrides[type] || ''}
                onChange={(e) => setUsername(type, e.target.value)}
                placeholder={`Bot name (default: ${defaultUsername})`}
                className="text-xs"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Message Templates</h3>
        <p className="text-xs text-muted-foreground">
          Customize the title, description, and color of each message. Use <code className="font-mono">{'{{variable}}'}</code> placeholders — they're filled in with real data when the message is sent. Leave a field blank to use the default shown as its placeholder.
        </p>
        <Accordion type="multiple" className="border rounded-lg px-3">
          {DISCORD_TEMPLATES.map((tmpl) => {
            const channel = channelByType[tmpl.channelType];
            const override = templateOverrides[tmpl.id] || {};
            const hasOverride = !!(override.title || override.description || override.color);
            const hasWebhook = !!(settings[channel?.field] || '').trim();
            const isTesting = testingId === tmpl.id;
            return (
              <AccordionItem key={tmpl.id} value={tmpl.id}>
                <AccordionTrigger className="text-sm">
                  <span className="flex items-center gap-2">
                    {channel?.emoji} {tmpl.label}
                    {hasOverride && <Badge variant="outline" className="text-[10px]">Customized</Badge>}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Title</Label>
                    <Input
                      value={override.title || ''}
                      onChange={(e) => setTemplateField(tmpl.id, 'title', e.target.value)}
                      placeholder={tmpl.defaultTitle}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <Textarea
                      value={override.description || ''}
                      onChange={(e) => setTemplateField(tmpl.id, 'description', e.target.value)}
                      placeholder={tmpl.defaultDescription}
                      rows={2}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground shrink-0">Color</Label>
                    <input
                      type="color"
                      value={override.color || tmpl.defaultColor}
                      onChange={(e) => setTemplateField(tmpl.id, 'color', e.target.value)}
                      className="h-8 w-10 rounded border border-input bg-background p-0.5"
                    />
                    <Input
                      value={override.color || ''}
                      onChange={(e) => setTemplateField(tmpl.id, 'color', e.target.value)}
                      placeholder={tmpl.defaultColor}
                      className="w-28 font-mono text-xs"
                    />
                    {hasOverride && (
                      <Button type="button" size="sm" variant="ghost" className="text-xs" onClick={() => resetTemplate(tmpl.id)}>
                        Reset to default
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {tmpl.vars.map((v) => (
                      <code key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{`{{${v}}}`}</code>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs mt-2"
                      disabled={!hasWebhook || isTesting}
                      onClick={() => sendTest(tmpl)}
                    >
                      {isTesting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                      Send test
                    </Button>
                    {!hasWebhook && <p className="text-[10px] text-muted-foreground mt-2">Add a webhook URL above to test this channel.</p>}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
}
