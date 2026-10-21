import { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioTower, Check, X, Inbox, Loader2, MessageSquare, Lock } from 'lucide-react';
import { formatFreq } from '@/utils';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

function Info({ label, value, col2 }) {
  return (
    <div className={col2 ? 'col-span-2' : ''}>
      <span className="text-muted-foreground block">{label}</span>
      <span className="font-medium text-foreground break-words">{value}</span>
    </div>
  );
}

/**
 * Shows the signed-in user's own repeaters plus pending access requests
 * for those repeaters, with accept / deny + a reply message.
 */
export default function MyRepeatersPanel({ user, onPickRepeater }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState({}); // { [requestId]: ownerMessageDraft }
  const [busy, setBusy] = useState({}); // { [requestId]: 'grant'|'deny' }
  const [myRepeaters, setMyRepeaters] = useState([]);

  const myRepeaterIds = useMemo(() => new Set(myRepeaters.map((r) => r.id)), [myRepeaters]);

  const loadRequests = () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    base44.entities.RepeaterAccessRequest.filter({ owner_id: user.id })
      .then((rows) => {
        setRequests(rows || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      base44.entities.Repeater.filter({ owner_user_id: user.id }, '-updated_date', 500),
      base44.entities.Repeater.filter({ created_by_id: user.id }, '-updated_date', 500),
    ]).then(([owned, created]) => {
      const seen = new Set();
      const merged = [...(owned || []), ...(created || [])].filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      setMyRepeaters(merged);
    }).catch(console.error);
    loadRequests();
  }, [user?.id]);

  const setReply = (id, val) => setReplies((p) => ({ ...p, [id]: val }));

  const respond = async (req, newStatus) => {
    setBusy((p) => ({ ...p, [req.id]: newStatus === 'Granted' ? 'grant' : 'deny' }));
    try {
      await base44.entities.RepeaterAccessRequest.update(req.id, {
        status: newStatus,
        owner_message: (replies[req.id] || '').trim() || undefined,
      });
      base44.functions.invoke('notify-access-decision', { request_id: req.id }).catch((err) => {
        console.error('[MyRepeatersPanel] access decision notification failed:', err);
      });
      setRequests((rs) => rs.map((r) => (r.id === req.id ? { ...r, status: newStatus, owner_message: replies[req.id] } : r)));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy((p) => { const n = { ...p }; delete n[req.id]; return n; });
    }
  };

  const pending = requests.filter((r) => r.status === 'Pending');
  const recent = requests.filter((r) => r.status !== 'Pending').sort((a, b) => (b.updated_date || '').localeCompare(a.updated_date || '')).slice(0, 6);

  if (!user) return null;

  return (
    <div className="space-y-5">
      {/* My repeaters */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <RadioTower className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-heading font-semibold">My Repeaters</h2>
          <span className="text-sm text-muted-foreground">({myRepeaters.length})</span>
        </div>
        {myRepeaters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            You haven't added or claimed any repeaters yet. Use the <span className="font-medium text-foreground">Add</span> button to create one.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {myRepeaters.map((r) => {
              const reqCount = requests.filter((q) => q.repeater_id === r.id && q.status === 'Pending').length;
              return (
                <Card key={r.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onPickRepeater(r)}>
                  <div className="flex items-start gap-3">
                    <div className="grid place-items-center w-10 h-10 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 shrink-0">
                      <RadioTower className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{r.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${r.status === 'Online' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>{r.status}</span>
                        {r.access === 'Closed' && <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"><Lock className="w-2.5 h-2.5" /> Closed</span>}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{formatFreq(r.frequency)} MHz · {r.callsign}</div>
                      {reqCount > 0 && (
                        <div className="text-xs mt-1 inline-flex items-center gap-1 text-primary font-medium"><Inbox className="w-3 h-3" /> {reqCount} pending request{reqCount > 1 ? 's' : ''}</div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Access requests */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Inbox className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-heading font-semibold">Access Requests</h2>
          {pending.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">{pending.length} pending</span>}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading requests…</div>
        ) : pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No pending access requests for your repeaters.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((req) => {
              const repeater = myRepeaters.find((r) => r.id === req.repeater_id);
              const action = busy[req.id];
              return (
                <Card key={req.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {req.requester_callsign || 'Unknown'}
                        {req.requester_name ? <span className="text-muted-foreground font-normal"> · {req.requester_name}</span> : null}
                        <StaffTag userId={req.created_by_id} callsign={req.created_by_id ? undefined : req.requester_callsign} className="ml-1.5" />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        wants access to <span className="font-medium text-foreground">{req.repeater_name || repeater?.name || 'this repeater'}</span>
                        {repeater?.access === 'Closed' && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"><Lock className="w-2.5 h-2.5" /> Closed</span>}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-3 text-xs rounded-lg bg-muted/40 p-3">
                    {req.licensee_name && <Info label="Licensee" value={req.licensee_name} />}
                    {req.usage_purpose && <Info label="Use" value={req.usage_purpose} />}
                    {req.family_members && <Info label="Family" value={req.family_members} />}
                    {req.phone_number && <Info label="Phone" value={req.phone_number} />}
                    {req.email && <Info label="Email" value={req.email} col2 />}
                    {req.repeater_frequency != null && <Info label="Freq" value={`${formatFreq(req.repeater_frequency)} MHz`} />}
                  </div>

                  {req.message && (
                    <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-muted/60 text-sm">
                      <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground"><Linkify text={req.message} /></span>
                    </div>
                  )}

                  <Input
                    value={replies[req.id] || ''}
                    onChange={(e) => setReply(req.id, e.target.value)}
                    placeholder="Reply (optional) — e.g. tone & welcome info"
                    className="h-10 mb-3"
                  />

                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => respond(req, 'Granted')} disabled={!!action} className="bg-success hover:bg-success/90">
                      {action === 'grant' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />} Grant
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => respond(req, 'Denied')} disabled={!!action}>
                      {action === 'deny' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1.5" />} Deny
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {recent.length > 0 && (
          <details className="mt-4 group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">Recently handled ({recent.length})</summary>
            <div className="mt-2 space-y-1.5">
              {recent.map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg bg-muted/40">
                  <span className="truncate"><span className="font-medium">{req.requester_callsign || 'Unknown'}</span> · {req.repeater_name}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full font-medium ${req.status === 'Granted' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>{req.status}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}