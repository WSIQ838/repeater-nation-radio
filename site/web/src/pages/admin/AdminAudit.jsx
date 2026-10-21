import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Plus, Send, Trash2, History, ScrollText, GitCommitHorizontal } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { base44 } from '@/api/base44Client';
import { PageHeader, Loading, ErrorState, EmptyState, Badge, formatDateTime } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge as UiBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

import { errMsg } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { isAdminRole } from '@/lib/permissions';

const CATEGORIES = ['all', 'admin', 'user', 'repeater', 'report', 'settings', 'security', 'system'];
const catTone = { admin: 'muted', user: 'primary', repeater: 'warn', report: 'destructive', settings: 'navy', security: 'destructive', system: 'muted' };
const TABS = [
  { key: 'audit', label: 'Audit Log', icon: ScrollText },
  { key: 'changelog', label: 'Change Log', icon: GitCommitHorizontal },
];

function AuditPanel() {
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');

  const load = useCallback(() => {
    setLoading(true); setError('');
    adminApi('audit:list', { category, limit: 200 })
      .then((d) => setAudit(d.audit || []))
      .catch((e) => setError(errMsg(e) || 'Could not load audit log'))
      .finally(() => setLoading(false));
  }, [category]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition ${category === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
              {c}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : audit.length === 0 ? <EmptyState title="No audit entries" description="Administrative actions will be recorded here automatically." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">When</th>
                  <th className="text-left px-4 py-3 font-medium">Admin</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">Target</th>
                  <th className="text-left px-4 py-3 font-medium">Change</th>
                  <th className="text-left px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {audit.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 align-top">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(e.created_date)}</td>
                    <td className="px-4 py-3">{e.admin_name || '—'}</td>
                    <td className="px-4 py-3"><Badge tone={catTone[e.category] || 'muted'}>{e.category}</Badge></td>
                    <td className="px-4 py-3 font-mono text-xs">{e.action}</td>
                    <td className="px-4 py-3">{e.target_label || '—'}{e.target_type && <div className="text-xs text-muted-foreground">{e.target_type}</div>}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                      {e.before && <div>Before: {e.before}</div>}
                      {e.after && <div>After: {e.after}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-muted-foreground mt-3">Audit entries are append-only and cannot be edited or deleted, even by administrators.</p>
    </div>
  );
}

function ChangelogPanel() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true); setError('');
    base44.entities.ChangeLog.list('-created_date', 100)
      .then((e) => setEntries(Array.isArray(e) ? e : []))
      .catch((e) => setError(e?.message || 'Could not load changelog'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const add = async () => {
    if (!notes.trim()) { toast({ title: 'Notes are required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await base44.entities.ChangeLog.create({ version: version.trim(), notes: notes.trim(), sent: false });
      setVersion(''); setNotes('');
      toast({ title: 'Entry added · sending to Discord…' });
      // Auto-post pending entries to Discord immediately
      try {
        const res = await base44.functions.invoke('publish-changelog', {});
        const n = res?.data?.sent ?? 0;
        if (n > 0) toast({ title: `Posted ${n} ${n === 1 ? 'entry' : 'entries'} to Discord` });
      } catch (e) {
        toast({ title: 'Saved, but Discord send failed — will retry on next publish', variant: 'destructive' });
      }
      load();
    } catch (e) { toast({ title: e?.message || 'Add failed', variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    try { await base44.entities.ChangeLog.delete(id); setEntries((es) => es.filter((x) => x.id !== id)); }
    catch (e) { toast({ title: e?.message || 'Delete failed', variant: 'destructive' }); }
  };

  const unsent = entries.filter((e) => !e.sent);
  // ChangeLog writes and the Discord publish are administrator-only (entity
  // RLS and publish-changelog); other staff with audit access just read it.
  const canEdit = isAdminRole(user);

  return (
    <div>
      <div className="flex justify-end mb-4">
        <UiBadge variant="secondary" className="gap-1"><History className="w-3.5 h-3.5" /> {unsent.length} pending</UiBadge>
      </div>

      {canEdit && <Card className="p-5 mb-6">
        <h2 className="font-semibold mb-4">Add changelog entry</h2>
        <div className="space-y-3">
          <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Version label (optional, e.g. v1.4.2)" />
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="What changed in this release?" />
          <div className="flex justify-end">
            <Button onClick={add} disabled={saving || !notes.trim()}><Plus className="w-4 h-4" /> {saving ? 'Adding…' : 'Add entry'}</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Each new entry is sent to Discord automatically when added. The site publish also re-posts any still-pending entries as a safety net.</p>
      </Card>}

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <div className="space-y-3">
          {entries.length === 0 && <p className="text-sm text-muted-foreground">No changelog entries yet.</p>}
          {entries.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {e.version && <span className="font-semibold">{e.version}</span>}
                    {e.sent
                      ? <UiBadge variant="outline" className="gap-1"><Send className="w-3 h-3" /> Sent</UiBadge>
                      : <UiBadge className="gap-1 bg-primary text-primary-foreground">Pending</UiBadge>}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{e.notes}</p>
                  {e.sent_date && <p className="text-xs text-muted-foreground mt-2">Sent {new Date(e.sent_date).toLocaleString()}</p>}
                </div>
                {canEdit && <Button variant="ghost" size="icon" onClick={() => remove(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminAudit() {
  const [tab, setTab] = useState('audit');

  return (
    <div>
      <PageHeader title="Audit & Change Log" subtitle="Administrative action history and public release notes" />

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

      {tab === 'audit' ? <AuditPanel /> : <ChangelogPanel />}
    </div>
  );
}
