import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { MessageSquare, Plus, MessageCircle, User, Trash2, Pencil, Search, ChevronDown, Flame } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { formatDistanceToNow } from 'date-fns';
import LikeDislike from '@/components/forums/LikeDislike';
import PostDialog from '@/components/forums/PostDialog';
import MentionPills from '@/components/shared/MentionPills';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

const CATEGORY_COLORS = {
  General: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Technical: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  Equipment: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  Events: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  Swap: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'Off-Topic': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};
const CATEGORY_DOT = {
  General: 'bg-blue-500', Technical: 'bg-orange-500', Equipment: 'bg-purple-500',
  Events: 'bg-green-500', Swap: 'bg-amber-500', 'Off-Topic': 'bg-gray-500',
};
const CATEGORIES = ['General', 'Technical', 'Equipment', 'Events', 'Swap', 'Off-Topic'];
const SORTS = [['newest', 'Newest'], ['replies', 'Most Replies'], ['liked', 'Most Liked']];

export default function Forums() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [callsignToUserId, setCallsignToUserId] = useState({});
  const [showNew, setShowNew] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    base44.entities.ForumPost.list('-created_date', 50).then(setPosts).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const ps = await base44.entities.Profile.list('-updated_date', 500);
        const map = {};
        const callsignMap = {};
        (ps || []).forEach((p) => {
          if (p?.created_by_id) map[p.created_by_id] = p;
          if (p?.callsign && p?.created_by_id) callsignMap[p.callsign.trim().toUpperCase()] = p.created_by_id;
        });
        setProfiles(map);
        setCallsignToUserId(callsignMap);
      } catch (e) { console.error(e); }
      load();
    })();
  }, []);

  const deletePost = async (e, p) => {
    e.stopPropagation();
    if (!p?.id) return;
    try { await base44.entities.ForumPost.delete(p.id); setPosts((ps) => ps.filter((x) => x.id !== p.id)); } catch (err) { console.error(err); }
  };

  const canModerate = ['admin', 'super_admin', 'moderator'].includes(user?.role);
  const canEdit = (p) => p?.created_by_id === user?.id || canModerate;

  const categoryCounts = useMemo(() => {
    const map = {};
    CATEGORIES.forEach((c) => { map[c] = 0; });
    posts.forEach((p) => { if (map[p.category] !== undefined) map[p.category] += 1; });
    return map;
  }, [posts]);

  const trending = useMemo(() => [...posts].sort((a, b) => (b.replies_count || 0) - (a.replies_count || 0)).slice(0, 5), [posts]);

  const filteredPosts = useMemo(() => {
    let list = activeCategory === 'All' ? posts : posts.filter((p) => p.category === activeCategory);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.title?.toLowerCase().includes(q) || p.body?.toLowerCase().includes(q));
    const sorted = [...list];
    if (sort === 'replies') sorted.sort((a, b) => (b.replies_count || 0) - (a.replies_count || 0));
    else if (sort === 'liked') sorted.sort((a, b) => (b.liked_by?.length || 0) - (a.liked_by?.length || 0));
    return sorted;
  }, [posts, activeCategory, search, sort]);

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center w-11 h-11 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold">Forums</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">{posts.length} discussion{posts.length !== 1 ? 's' : ''} in the community</p>
          </div>
        </div>
        <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-1.5" /> New post</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search discussions…" className="pl-9" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">{SORTS.find(([k]) => k === sort)?.[1]} <ChevronDown className="w-3.5 h-3.5 ml-1.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
              {SORTS.map(([key, label]) => <DropdownMenuRadioItem key={key} value={key}>{label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-6 items-start">
        <div className="min-w-0">
          {loading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
          ) : filteredPosts.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
              No discussions match your filters. {activeCategory === 'All' && !search && 'Be the first to post.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPosts.map((p) => (
                <Card key={p.id} className="p-4 sm:p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/forums/${p.id}`)}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary overflow-hidden shrink-0 grid place-items-center">
                      {profiles[p.created_by_id]?.avatar_url ? <img src={profiles[p.created_by_id].avatar_url} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.category && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[p.category] || CATEGORY_COLORS.General}`}>{p.category}</span>}
                        <h3 className="font-semibold truncate">{p.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2"><Linkify text={p.body} /></p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1.5"><span className="font-mono">{p.author_callsign || p.author_name || 'Anonymous'}</span><StaffTag userId={p.created_by_id} /></span>
                        {p.created_date && <span>{formatDistanceToNow(new Date(p.created_date), { addSuffix: true })}</span>}
                        <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {p.replies_count || 0} replies</span>
                      </div>
                      {p.image_urls?.length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {p.image_urls.slice(0, 3).map((url, i) => (
                            <div key={i} className="w-14 h-14 rounded-lg overflow-hidden border border-border shrink-0"><Image src={url} alt="" className="w-full h-full object-cover" /></div>
                          ))}
                          {p.image_urls.length > 3 && <span className="text-xs text-muted-foreground self-center">+{p.image_urls.length - 3}</span>}
                        </div>
                      )}
                      {p.mentions?.length > 0 && (
                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          <MentionPills mentions={p.mentions} callsignToUserId={callsignToUserId} size="xs" />
                        </div>
                      )}
                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <LikeDislike entity="ForumPost" recordId={p.id} likedBy={p.liked_by || []} dislikedBy={p.disliked_by || []} userId={user?.id} onChange={(d) => setPosts((ps) => ps.map((x) => x.id === p.id ? { ...x, ...d } : x))} />
                      </div>
                    </div>
                    {canEdit(p) && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); setEditingPost(p); }} className="p-1.5 text-muted-foreground hover:text-primary" title="Edit"><Pencil className="w-4 h-4" /></button>
                        <button onClick={(e) => deletePost(e, p)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5 lg:sticky lg:top-4">
          <Card className="p-5">
            <h2 className="font-heading font-semibold text-base mb-3">Categories</h2>
            <div className="space-y-0.5">
              <button
                onClick={() => setActiveCategory('All')}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${activeCategory === 'All' ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-foreground/80'}`}
              >
                <span>All</span>
                <span className="text-xs text-muted-foreground">{posts.length}</span>
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${activeCategory === cat ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-foreground/80'}`}
                >
                  <span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[cat]}`} /> {cat}</span>
                  <span className="text-xs text-muted-foreground">{categoryCounts[cat]}</span>
                </button>
              ))}
            </div>
          </Card>

          {trending.length > 0 && (
            <Card className="p-5">
              <h2 className="font-heading font-semibold text-base mb-3 flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-500" /> Trending</h2>
              <div className="space-y-3">
                {trending.map((p) => (
                  <button key={p.id} onClick={() => navigate(`/forums/${p.id}`)} className="block w-full text-left">
                    <div className="text-sm font-medium text-primary hover:underline truncate">{p.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MessageCircle className="w-3 h-3" /> {p.replies_count || 0} replies</div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <PostDialog open={showNew} onClose={() => setShowNew(false)} onCreated={load} user={user} />
      <PostDialog open={!!editingPost} onClose={() => setEditingPost(null)} onCreated={load} user={user} post={editingPost} />
    </div>
  );
}
