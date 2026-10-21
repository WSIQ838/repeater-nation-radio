import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, Bell, Power, Mail, Send } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { PageHeader, Loading, ErrorState, EmptyState, Badge, ConfirmDialog, BatchProgress, formatDateTime } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { timeAgo } from '@/lib/timeAgo';
import ImageUploader from '@/components/forums/ImageUploader';
import { Image as ImageComponent } from '@/components/ui/image';

import { errMsg } from '@/lib/utils';
const TYPES = ['Announcement', 'Alert', 'Maintenance', 'System'];
const AUDIENCES = ['All', 'Admins'];
const typeTone = { Announcement: 'primary', Alert: 'warn', Maintenance: 'destructive', System: 'muted' };

export default function AdminNotifications() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteUserNotifTarget, setDeleteUserNotifTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', type: 'Announcement', audience: 'All', active: true, expires_at: '', send_email: false, image_url: '', link_url: '', link_label: '' });
  const [userForm, setUserForm] = useState({ title: '', message: '', type: 'announcement', recipient_ids: '', scheduled_date: '', link_url: '', link_label: '' });
  const [userNotifs, setUserNotifs] = useState([]);
  const [sendBusy, setSendBusy] = useState(false);
  const [me, setMe] = useState(null);
  const [emailProgress, setEmailProgress] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    adminApi('notifications:list').then((d) => setItems(d.notifications || [])).catch((e) => setError(errMsg(e) || 'Could not load notifications')).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const toggleActive = async (n) => {
    try {
      await adminApi('notifications:update', { id: n.id, active: !n.active });
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, active: !n.active } : x)));
      toast({ title: n.active ? 'Deactivated' : 'Activated' });
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
  };

  // notifications:sendEmail sends real emails one at a time server-side, so it's
  // paginated to avoid a large recipient list timing out mid-send in one request
  // (same reasoning as users:notifyAll). Loop batches here until done.
  const sendBroadcastEmail = async (id) => {
    let afterId = '';
    const totals = { sent: 0, recipients: 0 };
    setEmailProgress({ id, done: 0, total: 0 });
    try {
      for (let i = 0; i < 1000; i++) {
        const d = await adminApi('notifications:sendEmail', { id, after_id: afterId, batchSize: 25 });
        totals.sent += d.sent || 0;
        totals.recipients = d.recipients || totals.recipients;
        setEmailProgress({ id, done: totals.sent, total: totals.recipients });
        if (d.done) break;
        afterId = d.after_id || afterId;
      }
    } finally {
      setEmailProgress(null);
    }
    return totals;
  };

  const create = async () => {
    if (!form.title || !form.body) { toast({ title: 'Title and body are required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const d = await adminApi('notifications:create', {
        ...form,
        image_url: form.image_url || undefined,
        link_url: form.link_url || undefined,
        link_label: form.link_label || undefined,
      });
      setItems((xs) => [d.notification, ...xs]);
      if (form.send_email) {
        try {
          const r = await sendBroadcastEmail(d.notification.id);
          toast({ title: `Notification created · emailed ${r.sent}/${r.recipients}` });
        } catch (e) { toast({ title: 'Created, but email send failed', variant: 'destructive' }); }
      } else {
        toast({ title: 'Notification created' });
      }
      setCreateOpen(false);
      setForm({ title: '', body: '', type: 'Announcement', audience: 'All', active: true, expires_at: '', send_email: false, image_url: '', link_url: '', link_label: '' });
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const sendEmailFor = async (n) => {
    if (emailProgress) return;
    try {
      const d = await sendBroadcastEmail(n.id);
      toast({ title: `Emailed ${d.sent} of ${d.recipients} recipients` });
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await adminApi('notifications:delete', { id: deleteTarget.id });
      setItems((xs) => xs.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: 'Notification deleted' });
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const loadUserNotifs = async () => {
    try {
      const m = await base44.auth.me().catch(() => null);
      setMe(m);
      const res = await base44.functions.invoke('send-notification', { action: 'list_all', requester_id: m?.id, page: 1, pageSize: 50 });
      setUserNotifs(res.data?.notifications || res?.notifications || []);
    } catch (e) { console.error(e); }
  };
  useEffect(() => { loadUserNotifs(); }, []);

  const sendUserNotif = async () => {
    if (!userForm.title || !userForm.message) { toast({ title: 'Title and message are required', variant: 'destructive' }); return; }
    setSendBusy(true);
    try {
      const recipient_ids = userForm.recipient_ids ? userForm.recipient_ids.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      const res = await base44.functions.invoke('send-notification', {
        action: 'send', requester_id: me?.id, title: userForm.title, message: userForm.message,
        type: userForm.type, sender_name: me?.full_name || 'Admin',
        link_url: userForm.link_url || undefined, link_label: userForm.link_label || undefined,
        recipient_ids, scheduled_date: userForm.scheduled_date ? new Date(userForm.scheduled_date).toISOString() : undefined,
      });
      const sent = res.data?.sent ?? res?.sent ?? 0;
      toast({ title: `Sent to ${sent} user${sent === 1 ? '' : 's'}` });
      setUserForm({ title: '', message: '', type: 'announcement', recipient_ids: '', scheduled_date: '', link_url: '', link_label: '' });
      loadUserNotifs();
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
    finally { setSendBusy(false); }
  };

  const confirmDeleteUserNotif = async () => {
    if (!deleteUserNotifTarget) return;
    try {
      await base44.functions.invoke('send-notification', { action: 'delete', requester_id: me?.id, id: deleteUserNotifTarget.id });
      setUserNotifs((ns) => ns.filter((n) => n.id !== deleteUserNotifTarget.id));
      setDeleteUserNotifTarget(null);
      toast({ title: 'Deleted' });
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" subtitle="Site-wide popup announcements, plus direct user alerts" >
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> New announcement</Button>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</Button>
      </PageHeader>

      <Card className="overflow-hidden">
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : items.length === 0 ? <EmptyState icon={Bell} title="No announcements" description="Create one to show a popup announcement to users on the home page and dashboard." /> : (
          <div className="divide-y divide-border">
            {items.map((n) => (
              <div key={n.id} className="p-4 flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{n.title}</span>
                    <Badge tone={typeTone[n.type] || 'muted'}>{n.type}</Badge>
                    <Badge tone="muted">{n.audience}</Badge>
                    {n.active ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{n.body}</p>
                  {n.image_url && (
                    <div className="mt-2 w-24 h-24 rounded-lg overflow-hidden border border-border">
                      <ImageComponent src={n.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">By {n.created_by_name || 'admin'} · {formatDateTime(n.created_date)}{n.expires_at ? ` · expires ${formatDateTime(n.expires_at)}` : ''}</div>
                  {emailProgress?.id === n.id && (
                    <div className="mt-2 max-w-xs"><BatchProgress done={emailProgress.done} total={emailProgress.total} label="Sending broadcast email…" /></div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" disabled={!!emailProgress} onClick={() => sendEmailFor(n)} title="Send as email broadcast">
                    <Mail className={`w-4 h-4 ${emailProgress?.id === n.id ? 'animate-pulse' : ''}`} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleActive(n)} title={n.active ? 'Deactivate' : 'Activate'}>
                    <Power className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(n)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New announcement</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Body</Label><Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3} /></div>
            <div className="space-y-1.5"><Label>Image (optional)</Label>
              <ImageUploader images={form.image_url ? [form.image_url] : []} onChange={(imgs) => setForm({ ...form, image_url: imgs[imgs.length - 1] || '' })} />
              <p className="text-xs text-muted-foreground">Attach a photo to display at the top of the popup announcement.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Link URL (optional)</Label><Input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="https://…" /></div>
              <div className="space-y-1.5"><Label>Link label (optional)</Label><Input value={form.link_label} onChange={(e) => setForm({ ...form, link_label: e.target.value })} placeholder="Read more" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Type</Label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>Audience</Label>
                <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
                  {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Expires at (optional)</Label>
              <Input type="datetime-local" value={form.expires_at ? form.expires_at.slice(0, 16) : ''} onChange={(e) => setForm({ ...form, expires_at: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
              <div>
                <Label>Also send as email now</Label>
                <p className="text-xs text-muted-foreground">Emails all matching members who opted into announcements.</p>
              </div>
              <Switch checked={form.send_email} onCheckedChange={(v) => setForm({ ...form, send_email: v })} />
            </div>
            {emailProgress && <BatchProgress done={emailProgress.done} total={emailProgress.total} label="Sending broadcast email…" />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={!!emailProgress}>Cancel</Button>
            <Button onClick={create} disabled={busy || !!emailProgress}>{emailProgress ? 'Sending…' : busy ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Direct User Notifications */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Send className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-semibold">Send Direct Notification</h3>
        </div>
        <div className="grid gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Title</Label><Input value={userForm.title} onChange={(e) => setUserForm({ ...userForm, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Type</Label>
              <select value={userForm.type} onChange={(e) => setUserForm({ ...userForm, type: e.target.value })} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
                <option value="announcement">Announcement</option>
                <option value="message">Message</option>
                <option value="system">System</option>
                <option value="alert">Alert</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Message</Label><Textarea value={userForm.message} onChange={(e) => setUserForm({ ...userForm, message: e.target.value })} rows={3} /></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Recipients (user IDs, comma-separated — leave blank for all)</Label><Input value={userForm.recipient_ids} onChange={(e) => setUserForm({ ...userForm, recipient_ids: e.target.value })} placeholder="All users" /></div>
            <div className="space-y-1.5"><Label>Schedule (optional)</Label><Input type="datetime-local" value={userForm.scheduled_date ? userForm.scheduled_date.slice(0, 16) : ''} onChange={(e) => setUserForm({ ...userForm, scheduled_date: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Link URL (optional)</Label><Input value={userForm.link_url} onChange={(e) => setUserForm({ ...userForm, link_url: e.target.value })} placeholder="https://…" /></div>
            <div className="space-y-1.5"><Label>Link Label (optional)</Label><Input value={userForm.link_label} onChange={(e) => setUserForm({ ...userForm, link_label: e.target.value })} placeholder="Open Link" /></div>
          </div>
          <Button onClick={sendUserNotif} disabled={sendBusy} className="w-fit"><Send className="w-4 h-4" /> {sendBusy ? 'Sending…' : 'Send notification'}</Button>
        </div>
      </Card>

      {/* Notification History */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2"><Bell className="w-5 h-5 text-primary" /><h3 className="font-heading font-semibold">Notification History</h3></div>
          <Button variant="ghost" size="sm" onClick={loadUserNotifs}><RefreshCw className="w-4 h-4" /></Button>
        </div>
        {userNotifs.length === 0 ? <EmptyState icon={Bell} title="No notifications sent yet" description="Use the form above to send a direct notification." /> : (
          <div className="divide-y divide-border max-h-96 overflow-y-auto scrollbar-thin">
            {userNotifs.map((n) => (
              <div key={n.id} className="p-4 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{n.title}</span>
                    <Badge tone="muted">{n.type}</Badge>
                    {n.read ? <Badge tone="success">Read</Badge> : <Badge tone="primary">Unread</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{n.message}</p>
                  <div className="text-xs text-muted-foreground mt-0.5">To {n.user_name || n.user_id} · {timeAgo(n.created_date)}{n.scheduled_date ? ` · scheduled ${formatDateTime(n.scheduled_date)}` : ''}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setDeleteUserNotifTarget(n)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete notification?"
        description={`"${deleteTarget?.title}" will be removed.`}
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={!!deleteUserNotifTarget}
        onOpenChange={(o) => !o && setDeleteUserNotifTarget(null)}
        title="Delete this notification?"
        description={`"${deleteUserNotifTarget?.title}" sent to ${deleteUserNotifTarget?.user_name || deleteUserNotifTarget?.user_id} will be removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDeleteUserNotif}
      />
    </div>
  );
}