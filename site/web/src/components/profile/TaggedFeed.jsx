import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { AtSign, MessageSquare } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

// Shows every post (profile feed or forums) this member was @tagged in,
// newest first. Pulled client-side over a recent window of each feed rather
// than a server-side array-containment query, matching how the rest of the
// app already windows these feeds (e.g. ProfileFeed's own 30/200-record caps).
// `callsigns` accepts every callsign this member holds (GMRS + HAM), since a
// tag could name either one.
export default function TaggedFeed({ callsigns }) {
  const [items, setItems] = useState(null);
  const key = (callsigns || []).join(',');

  useEffect(() => {
    const set = new Set((callsigns || []).map((c) => String(c || '').trim().toUpperCase()).filter(Boolean));
    if (!set.size) { setItems([]); return; }
    let cancelled = false;
    Promise.all([
      base44.entities.ProfilePost.list('-created_date', 200).catch(() => []),
      base44.entities.ForumPost.list('-created_date', 200).catch(() => []),
    ]).then(([profilePosts, forumPosts]) => {
      if (cancelled) return;
      const isTagged = (p) => (p.mentions || []).some((m) => set.has(String(m).toUpperCase()));
      const tagged = [
        ...(profilePosts || [])
          .filter(isTagged)
          .map((p) => ({ kind: 'profile', id: p.id, date: p.created_date, author: p.author_name, text: p.content, authorId: p.created_by_id })),
        ...(forumPosts || [])
          .filter(isTagged)
          .map((p) => ({ kind: 'forum', id: p.id, date: p.created_date, author: p.author_name || p.author_callsign, text: p.title, authorId: p.created_by_id })),
      ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setItems(tagged);
    });
    return () => { cancelled = true; };
  }, [key]);

  if (!items) {
    return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  if (items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <AtSign className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Not tagged in anything yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const to = item.kind === 'forum' ? `/forums/${item.id}` : `/members/${item.authorId}`;
        return (
          <Link key={`${item.kind}-${item.id}`} to={to}>
            <Card className="p-4 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                {item.kind === 'forum' ? <MessageSquare className="w-3.5 h-3.5" /> : <AtSign className="w-3.5 h-3.5" />}
                <span className="inline-flex items-center gap-1.5">{item.kind === 'forum' ? 'Forum post' : 'Profile post'} by {item.author || 'Member'}<StaffTag userId={item.authorId} /></span>
                {item.date && <span>· {formatDistanceToNow(new Date(item.date), { addSuffix: true })}</span>}
              </div>
              <p className="text-sm line-clamp-2 whitespace-pre-wrap"><Linkify text={item.text} nested /></p>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
