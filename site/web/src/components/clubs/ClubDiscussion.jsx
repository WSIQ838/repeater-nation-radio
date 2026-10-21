import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Plus, Pin, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import ClubThreadDialog from '@/components/clubs/ClubThreadDialog';
import ClubThreadFormDialog from '@/components/clubs/ClubThreadFormDialog';
import { toast } from '@/components/ui/use-toast';
import StaffTag from '@/components/shared/StaffTag';

const CATEGORIES = ['General', 'Repeater News', 'Meetups', 'Technical', 'Off-Topic'];

const CAT_STYLES = {
  General: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  'Repeater News': 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  Meetups: 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400',
  Technical: 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  'Off-Topic': 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
};

export default function ClubDiscussion({ club, user, canModerate }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeThread, setActiveThread] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('All');

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.ClubThread.filter({ club_id: club.id }, '-pinned,-created_date', 200).catch(() => []);
      setThreads(list || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [club.id]);

  const onDelete = async (t) => {
    if (!t?.id) return;
    try {
      await base44.entities.ClubThreadReply.deleteMany({ thread_id: t.id }).catch(() => {});
      await base44.entities.ClubThread.delete(t.id);
      setThreads((ts) => ts.filter((x) => x.id !== t.id));
      toast({ title: 'Thread deleted' });
    } catch (e) { toast({ title: 'Could not delete', description: e.message, variant: 'destructive' }); }
  };

  const onTogglePin = async (t) => {
    try {
      await base44.entities.ClubThread.update(t.id, { pinned: !t.pinned });
      setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, pinned: !x.pinned } : x)));
    } catch (e) { toast({ title: 'Could not update', variant: 'destructive' }); }
  };

  const onThreadCreated = () => { setShowForm(false); load(); };
  const onThreadUpdated = (updated) => {
    setThreads((ts) => ts.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
  };

  const visible = filter === 'All' ? threads : threads.filter((t) => t.category === filter);
  const sorted = [...visible].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="font-heading font-semibold text-lg">Discussion board</h3>
        <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-1.5" /> New thread</Button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {['All', ...CATEGORIES].map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>{c}</button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : sorted.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground"><MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />No threads yet. Start the conversation.</Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((t) => (
            <Card key={t.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveThread(t)}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0"><MessageSquare className="w-4 h-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.pinned && <Pin className="w-3.5 h-3.5 text-primary shrink-0" />}
                    <span className="font-medium">{t.title}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${CAT_STYLES[t.category] || CAT_STYLES.General}`}>{t.category}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5">by {t.author_callsign || t.author_name || '—'}<StaffTag userId={t.created_by_id} callsign={t.created_by_id ? undefined : t.author_callsign} /></span>
                    <span>·</span>
                    <span>{t.created_date ? format(new Date(t.created_date), 'MMM d, yyyy') : ''}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {t.replies_count || 0}</span>
                  </div>
                </div>
                {canModerate && (
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onTogglePin(t)} className="p-1.5 text-muted-foreground hover:text-primary" title={t.pinned ? 'Unpin' : 'Pin'}><Pin className="w-4 h-4" /></button>
                    <button onClick={() => onDelete(t)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ClubThreadFormDialog open={showForm} onClose={() => setShowForm(false)} club={club} user={user} onCreated={onThreadCreated} />
      <ClubThreadDialog open={!!activeThread} thread={activeThread} club={club} user={user} canModerate={canModerate} onClose={() => setActiveThread(null)} onUpdated={onThreadUpdated} />
    </div>
  );
}