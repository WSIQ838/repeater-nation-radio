import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, Pencil, Trash2, EyeOff, Eye, BadgeCheck, Download } from 'lucide-react';
import { adminApi } from '@/lib/adminClient';
import { PageHeader, Loading, ErrorState, EmptyState, Badge, ConfirmDialog, BatchProgress } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatFreq } from '@/utils';
import { GMRS_REPEATER_CHANNELS } from '@/lib/gmrsChannels';
import RepeaterBookImport from '@/components/repeaters/RepeaterBookImport';

import { errMsg } from '@/lib/utils';
const VERIFICATIONS = ['Verified', 'Pending', 'Needs Review', 'Rejected'];
const STATUSES = ['Online', 'Offline', 'Maintenance'];

const verificationTone = { Verified: 'success', Pending: 'warn', 'Needs Review': 'destructive', Rejected: 'muted' };

export default function AdminRepeaters() {
  const { toast } = useToast();
  const [repeaters, setRepeaters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [verification, setVerification] = useState('all');
  const [status, setStatus] = useState('all');
  const [hidden, setHidden] = useState('all');
  const [service, setService] = useState('GMRS');
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [verifyAllOpen, setVerifyAllOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [bulkStartedAt, setBulkStartedAt] = useState(null);
  const [verifyAllProgress, setVerifyAllProgress] = useState(null);
  const [verifyAllStartedAt, setVerifyAllStartedAt] = useState(null);
  const [repeaterBookOpen, setRepeaterBookOpen] = useState(false);

  const toggleSelect = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const allSelected = repeaters.length > 0 && selected.length === repeaters.length;
  const toggleSelectAll = () => setSelected(allSelected ? [] : repeaters.map((r) => r.id));

  const runBulk = async (op) => {
    if (!selected.length) return;
    const ids = [...selected];
    setBusy(true);
    setBulkProgress({ done: 0, total: ids.length });
    setBulkStartedAt(Date.now());
    let ok = 0;
    let failed = 0;
    try {
      const chunkSize = 20;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        try {
          await adminApi('repeaters:bulk', { ids: chunk, op });
          ok += chunk.length;
          if (op === 'delete') setRepeaters((rs) => rs.filter((x) => !chunk.includes(x.id)));
          else setRepeaters((rs) => rs.map((x) => chunk.includes(x.id) ? { ...x, verification: op === 'verify' ? 'Verified' : x.verification, hidden: op === 'hide' ? true : op === 'unhide' ? false : x.hidden } : x));
        } catch {
          failed += chunk.length;
        }
        setBulkProgress({ done: Math.min(i + chunk.length, ids.length), total: ids.length });
      }
      setSelected([]);
      setBulkOpen(null);
      toast({ title: `Bulk ${op} complete`, description: `${ok} updated${failed ? `, ${failed} failed` : ''}.` });
    } catch (e) {
      toast({ title: errMsg(e) || 'Failed', variant: 'destructive' });
    } finally {
      setBusy(false);
      setBulkProgress(null);
      setBulkStartedAt(null);
    }
  };

  const load = useCallback(() => {
    setLoading(true); setError('');
    adminApi('repeaters:list', { query, verification, status, hidden, service })
      .then((d) => setRepeaters(d.repeaters || []))
      .catch((e) => setError(errMsg(e) || e?.message || 'Could not load repeaters'))
      .finally(() => setLoading(false));
  }, [query, verification, status, hidden, service]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const setVerificationStatus = async (r, v) => {
    try {
      await adminApi('repeaters:setVerification', { id: r.id, verification: v });
      setRepeaters((rs) => rs.map((x) => (x.id === r.id ? { ...x, verification: v } : x)));
      toast({ title: `Marked ${v}` });
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
  };

  const toggleHidden = async (r) => {
    try {
      await adminApi('repeaters:update', { id: r.id, fields: { hidden: !r.hidden } });
      setRepeaters((rs) => rs.map((x) => (x.id === r.id ? { ...x, hidden: !x.hidden } : x)));
      toast({ title: r.hidden ? 'Repeater unhidden' : 'Repeater hidden' });
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setBusy(true);
    try {
      const f = { ...editTarget.fields };
      await adminApi('repeaters:update', { id: editTarget.id, fields: f });
      setRepeaters((rs) => rs.map((x) => (x.id === editTarget.id ? { ...x, ...f } : x)));
      toast({ title: 'Repeater updated' });
      setEditTarget(null);
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const confirmVerifyAll = async () => {
    if (busy) return;
    setBusy(true);
    setVerifyAllProgress({ done: 0, total: 0 });
    setVerifyAllStartedAt(Date.now());
    let ok = 0;
    let failed = 0;
    try {
      // Load every Pending repeater for the selected service so progress reflects
      // the same full population the old server-side Verify All action handled.
      const data = await adminApi('repeaters:list', {
        query: '', verification: 'Pending', status: 'all', hidden: 'all', service,
      });
      const ids = (data.repeaters || []).map((r) => r.id).filter(Boolean);
      setVerifyAllProgress({ done: 0, total: ids.length });

      if (!ids.length) {
        toast({ title: `No pending ${service} repeaters`, description: 'Nothing needs verification.' });
        return;
      }

      const chunkSize = 20;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        try {
          await adminApi('repeaters:bulk', { ids: chunk, op: 'verify' });
          ok += chunk.length;
          setRepeaters((rs) => rs.map((x) => chunk.includes(x.id) ? { ...x, verification: 'Verified' } : x));
        } catch {
          failed += chunk.length;
        }
        setVerifyAllProgress({ done: Math.min(i + chunk.length, ids.length), total: ids.length });
      }

      toast({
        title: `Verified ${ok} pending ${service} repeater${ok === 1 ? '' : 's'}`,
        description: failed ? `${failed} could not be updated.` : undefined,
      });
      setVerifyAllOpen(false);
      load();
    } catch (e) {
      toast({ title: errMsg(e) || 'Failed', variant: 'destructive' });
    } finally {
      setBusy(false);
      setVerifyAllProgress(null);
      setVerifyAllStartedAt(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await adminApi('repeaters:delete', { id: deleteTarget.id });
      setRepeaters((rs) => rs.filter((x) => x.id !== deleteTarget.id));
      toast({ title: 'Repeater deleted' });
      setDeleteTarget(null);
    } catch (e) { toast({ title: errMsg(e) || 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Repeaters" subtitle={`${repeaters.length} shown`} >
        <Button variant="outline" size="sm" onClick={() => setRepeaterBookOpen(true)}><Download className="w-4 h-4" /> Import from RepeaterBook</Button>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</Button>
        <Button variant="default" size="sm" onClick={() => setVerifyAllOpen(true)}><BadgeCheck className="w-4 h-4" /> Verify all {service} Pending</Button>
      </PageHeader>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg border border-primary/40 bg-primary/5">
          <span className="text-sm font-medium mr-2">{selected.length} selected</span>
          {bulkProgress && (
            <div className="w-full pt-1">
              <BatchProgress done={bulkProgress.done} total={bulkProgress.total} label="Processing selected repeaters…" startedAt={bulkStartedAt} />
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => runBulk('verify')} disabled={busy}><BadgeCheck className="w-4 h-4" /> Verify</Button>
          <Button size="sm" variant="outline" onClick={() => runBulk('unhide')} disabled={busy}><Eye className="w-4 h-4" /> Unhide</Button>
          <Button size="sm" variant="outline" onClick={() => runBulk('hide')} disabled={busy}><EyeOff className="w-4 h-4" /> Hide</Button>
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setBulkOpen('delete')} disabled={busy}><Trash2 className="w-4 h-4" /> Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, callsign, owner…" className="pl-9" />
        </div>
        <select value={verification} onChange={(e) => setVerification(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
          <option value="all">All verification</option>
          {VERIFICATIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
          <option value="all">All status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={service} onChange={(e) => { setService(e.target.value); setSelected([]); }} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
          <option value="GMRS">GMRS Repeaters</option>
          <option value="HAM">HAM Repeaters</option>
        </select>
        <select value={hidden} onChange={(e) => setHidden(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
          <option value="all">All visibility</option>
          <option value="false">Visible</option>
          <option value="true">Hidden</option>
        </select>
      </div>

      <RepeaterBookImport open={repeaterBookOpen} onOpenChange={setRepeaterBookOpen} onImported={load} />

      <Card className="overflow-hidden">
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : repeaters.length === 0 ? <EmptyState title="No repeaters found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded border-input" />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Repeater</th>
                  <th className="text-left px-4 py-3 font-medium">Frequency</th>
                  <th className="text-left px-4 py-3 font-medium">Verification</th>
                  <th className="text-left px-4 py-3 font-medium">Visibility</th>
                  <th className="text-left px-4 py-3 font-medium">Coordinates</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {repeaters.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} className="w-4 h-4 rounded border-input" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.callsign} {r.owner && `· ${r.owner}`}</div>
                    </td>
                    <td className="px-4 py-3 font-mono">{r.frequency ? `${formatFreq(r.frequency)} MHz` : '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={r.verification}
                        onChange={(e) => setVerificationStatus(r, e.target.value)}
                        className="h-8 px-2 rounded-md border border-input bg-background text-xs"
                      >
                        {VERIFICATIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {r.hidden ? <Badge tone="destructive">Hidden</Badge> : <Badge tone="success">Visible</Badge>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.lat != null && r.lng != null ? `${Number(r.lat).toFixed(4)}, ${Number(r.lng).toFixed(4)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditTarget({ id: r.id, fields: { radio_service: r.radio_service || 'GMRS', name: r.name, callsign: r.callsign, frequency: r.frequency, offset: r.offset, tone: r.tone || '', input_tone: r.input_tone || '', mode: r.mode || 'Analog', access: r.access || 'Public', lat: r.lat, lng: r.lng, elevation: r.elevation, coverage_radius: r.coverage_radius, owner: r.owner || '', linked_system: r.linked_system || '', status: r.status || 'Online', verification: r.verification || 'Pending', notes: r.notes || '' } })}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => toggleHidden(r)}>
                          {r.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit repeater</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
              <div className="space-y-1.5 col-span-2">
                <Label>Radio Service</Label>
                <select value={editTarget.fields.radio_service || 'GMRS'} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, radio_service: e.target.value } })} className="h-9 w-full rounded-md border border-input bg-background text-sm">
                  <option value="GMRS">GMRS</option><option value="HAM">HAM</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1.5"><Label>Name</Label>
                <Input value={editTarget.fields.name || ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, name: e.target.value } })} />
              </div>
              <div className="space-y-1.5">
                <Label>Callsign</Label>
                <Input value={editTarget.fields.callsign || ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, callsign: e.target.value } })} />
              </div>
              <div className="space-y-1.5">
                {editTarget.fields.radio_service === 'GMRS' && <>
                  <Label>GMRS Repeater Channel</Label>
                  <select
                    value={GMRS_REPEATER_CHANNELS.find((c) => Number(c.freq) === Number(editTarget.fields.frequency))?.ch || ''}
                    onChange={(e) => {
                      const ch = GMRS_REPEATER_CHANNELS.find((c) => c.ch === e.target.value);
                      if (ch) setEditTarget({ ...editTarget, fields: { ...editTarget.fields, frequency: Number(ch.freq), offset: 5 } });
                    }}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Custom frequency</option>
                    {GMRS_REPEATER_CHANNELS.map((c) => <option key={c.ch} value={c.ch}>{c.label} · Input {c.input} MHz</option>)}
                  </select>
                </>}
                <Label>Frequency (MHz)</Label>
                <Input type="number" step="0.0001" value={editTarget.fields.frequency ?? ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, frequency: e.target.value === '' ? null : Number(e.target.value) } })} />
              </div>
              <div className="space-y-1.5">
                <Label>TX Tone (CTCSS/DCS)</Label>
                <Input value={editTarget.fields.tone || ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, tone: e.target.value } })} placeholder="e.g. 141.3 or D023" />
              </div>
              <div className="space-y-1.5">
                <Label>RX Tone (CTCSS/DCS)</Label>
                <Input value={editTarget.fields.input_tone || ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, input_tone: e.target.value } })} placeholder="e.g. 141.3 or D023" />
              </div>
              <div className="space-y-1.5">
                <Label>Offset (MHz)</Label>
                <Input type="number" step="any" value={editTarget.fields.offset ?? ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, offset: e.target.value === '' ? null : Number(e.target.value) } })} />
              </div>
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <select value={editTarget.fields.mode || 'Analog'} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, mode: e.target.value } })} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
                  <option value="Analog">Analog</option><option value="Digital">Digital</option><option value="Mixed">Mixed</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Access</Label>
                <select value={editTarget.fields.access || 'Public'} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, access: e.target.value } })} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
                  <option value="Public">Public</option><option value="Closed">Closed</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Latitude</Label>
                <Input type="number" step="any" value={editTarget.fields.lat ?? ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, lat: e.target.value === '' ? null : Number(e.target.value) } })} />
              </div>
              <div className="space-y-1.5">
                <Label>Longitude</Label>
                <Input type="number" step="any" value={editTarget.fields.lng ?? ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, lng: e.target.value === '' ? null : Number(e.target.value) } })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select value={editTarget.fields.status || 'Online'} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, status: e.target.value } })} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Elevation (ft)</Label>
                <Input type="number" step="any" value={editTarget.fields.elevation ?? ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, elevation: e.target.value === '' ? null : Number(e.target.value) } })} />
              </div>
              <div className="space-y-1.5">
                <Label>Coverage Radius (mi)</Label>
                <Input type="number" step="any" value={editTarget.fields.coverage_radius ?? ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, coverage_radius: e.target.value === '' ? null : Number(e.target.value) } })} />
              </div>
              <div className="space-y-1.5">
                <Label>Owner Callsign</Label>
                <Input value={editTarget.fields.owner || ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, owner: e.target.value } })} />
              </div>
              <div className="space-y-1.5">
                <Label>Linked System</Label>
                <Input value={editTarget.fields.linked_system || ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, linked_system: e.target.value } })} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Input value={editTarget.fields.notes || ''} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, notes: e.target.value } })} />
              </div>
              <div className="space-y-1.5">
                <Label>Verification</Label>
                <select value={editTarget.fields.verification || 'Pending'} onChange={(e) => setEditTarget({ ...editTarget, fields: { ...editTarget.fields, verification: e.target.value } })} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">
                  {VERIFICATIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete repeater?"
        description={`"${deleteTarget?.name}" will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={verifyAllOpen}
        onOpenChange={setVerifyAllOpen}
        title={`Verify all pending ${service} repeaters?`}
        description={`Every ${service} repeater still marked Pending will be set to Verified. Rejected and Needs Review repeaters, and every ${service === 'HAM' ? 'GMRS' : 'HAM'} repeater, are left alone.`}
        confirmLabel={`Verify pending ${service}`}
        loading={busy}
        progress={verifyAllProgress}
        onConfirm={confirmVerifyAll}
      />

      <ConfirmDialog
        open={bulkOpen === 'delete'}
        onOpenChange={(o) => !o && setBulkOpen(null)}
        title={`Delete ${selected.length} repeater(s)?`}
        description="The selected repeaters will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={busy}
        progress={bulkProgress}
        onConfirm={() => runBulk('delete')}
      />
    </div>
  );
}