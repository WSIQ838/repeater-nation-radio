import { useEffect, useState } from 'react';
import { Save, RotateCcw, Send, Mail, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { PageHeader, Loading, ErrorState, Badge, ConfirmDialog } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import FormSelect from '@/components/forms/FormSelect';
import { useToast } from '@/components/ui/use-toast';

import { errMsg } from '@/lib/utils';

const AUDIENCE_LABELS = {
  all: 'All members (who allow announcement email)',
  admins: 'Admins only',
  custom: 'Custom list',
};

function TemplateCard({ template, onSave, onTest }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => { setSubject(template.subject); setBody(template.body); }, [template.subject, template.body]);

  const dirty = subject !== template.subject || body !== template.body;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(template.id, subject, body);
      toast({ title: 'Template saved' });
    } catch (e) { toast({ title: errMsg(e) || 'Save failed', variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await onSave(template.id, template.default_subject, template.default_body);
      setSubject(template.default_subject);
      setBody(template.default_body);
      toast({ title: 'Reset to default' });
    } catch (e) { toast({ title: errMsg(e) || 'Reset failed', variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const d = await onTest(template.id);
      if (d.html === false) {
        toast({
          title: `Test email sent to ${d.to} as plain text`,
          description: `The styled HTML version failed to send: ${d.htmlError || 'unknown error'}`,
          variant: 'destructive',
        });
      } else {
        toast({ title: `Styled test email sent to ${d.to}` });
      }
    } catch (e) { toast({ title: errMsg(e) || 'Test send failed', variant: 'destructive' }); }
    finally { setTesting(false); }
  };

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{template.label}</span>
            {template.customized && <Badge tone="primary">Customized</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{template.description}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <div className="p-4 pt-0 space-y-4 border-t border-border">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="font-mono text-sm" />
          </div>
          <div className="text-xs text-muted-foreground">
            Placeholders: {template.vars.map((v) => <code key={v} className="mx-0.5 px-1 py-0.5 rounded bg-muted">{`{{${v}}}`}</code>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving || !dirty}><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}</Button>
            <Button size="sm" variant="outline" onClick={reset} disabled={saving}><RotateCcw className="w-4 h-4" /> Reset to default</Button>
            <Button size="sm" variant="outline" onClick={test} disabled={testing}><FlaskConical className="w-4 h-4" /> {testing ? 'Sending…' : 'Send test to me'}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AdminEmail() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [audience, setAudience] = useState('custom');
  const [recipientEmails, setRecipientEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const load = () => {
    setLoading(true); setError('');
    adminApi('email:templates:list').then((d) => setTemplates(d.templates || [])).catch((e) => setError(errMsg(e) || 'Could not load email templates')).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const saveTemplate = async (id, subj, bodyText) => {
    await adminApi('email:templates:update', { id, subject: subj, body: bodyText });
    load();
  };

  const testTemplate = (id) => adminApi('email:templates:test', { id });

  const canSend = subject.trim() && body.trim() && (audience !== 'custom' || recipientEmails.trim());

  const doSend = async () => {
    setSending(true);
    setConfirmSend(false);
    try {
      const d = await adminApi('email:send', {
        audience,
        recipient_emails: audience === 'custom' ? recipientEmails : undefined,
        subject: subject.trim(),
        body: body.trim(),
      });
      setLastResult(d);
      const plainFallback = d.sent - (d.htmlSent || 0);
      if (d.sent > 0 && plainFallback === d.sent) {
        toast({
          title: `Sent ${d.sent} of ${d.recipients} email${d.recipients === 1 ? '' : 's'} as plain text`,
          description: `The styled HTML version failed to send: ${d.htmlError || 'unknown error'}`,
          variant: 'destructive',
        });
      } else if (plainFallback > 0) {
        toast({
          title: `Sent ${d.sent} of ${d.recipients} email${d.recipients === 1 ? '' : 's'}`,
          description: `${plainFallback} fell back to plain text: ${d.htmlError || 'unknown error'}`,
        });
      } else {
        toast({ title: `Sent ${d.sent} of ${d.recipients} styled email${d.recipients === 1 ? '' : 's'}` });
      }
      setSubject(''); setBody('');
      if (audience === 'custom') setRecipientEmails('');
    } catch (e) { toast({ title: errMsg(e) || 'Send failed', variant: 'destructive' }); }
    finally { setSending(false); }
  };

  const send = () => {
    if (!canSend) return;
    if (audience === 'all' || audience === 'admins') { setConfirmSend(true); return; }
    doSend();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Email" subtitle="Outbound noreply templates and member email for Repeater Nation" />

      <div>
        <h2 className="font-heading font-semibold mb-3">System Email Templates</h2>
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : (
          <div className="space-y-3">
            {templates.map((t) => (
              <TemplateCard key={t.id} template={t} onSave={saveTemplate} onTest={testTemplate} />
            ))}
          </div>
        )}
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4"><Mail className="w-4 h-4 text-primary" /><h2 className="font-heading font-semibold">Compose & Send</h2></div>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Audience</Label>
            <FormSelect value={audience} onChange={(e) => setAudience(e.target.value)}>
              {Object.entries(AUDIENCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </FormSelect>
          </div>
          {audience === 'custom' && (
            <div className="space-y-1.5">
              <Label>Recipient emails (comma or newline-separated)</Label>
              <Textarea value={recipientEmails} onChange={(e) => setRecipientEmails(e.target.value)} rows={3} placeholder="w1aw@example.com, wrxy123@example.com" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
          </div>
          <Button onClick={send} disabled={sending || !canSend} className="w-fit">
            <Send className="w-4 h-4" /> {sending ? 'Sending…' : 'Send email'}
          </Button>
          {lastResult && (
            <p className="text-xs text-muted-foreground">
              Last send: {lastResult.sent} of {lastResult.recipients} delivered{lastResult.failed ? `, ${lastResult.failed} failed` : ''}
              {lastResult.sent > (lastResult.htmlSent || 0) ? `, ${lastResult.sent - (lastResult.htmlSent || 0)} as plain text (HTML error: ${lastResult.htmlError || 'unknown'})` : ''}.
            </p>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title={`Email ${audience === 'all' ? 'all members' : 'all admins'}?`}
        description={`This sends "${subject}" to every ${audience === 'all' ? 'member who allows announcement email' : 'admin with email on file'}. This can't be undone.`}
        confirmLabel="Send"
        destructive
        loading={sending}
        onConfirm={doSend}
      />
    </div>
  );
}
