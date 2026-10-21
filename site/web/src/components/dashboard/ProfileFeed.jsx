import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { Heart, Trash2, MessageCircle, Send, Loader2 } from 'lucide-react';
import ImageLightbox from '@/components/messages/ImageLightbox';
import { MessageAttachments } from '@/components/messages/AttachmentUploader';
import MessageBody from '@/components/messages/MessageBody';
import MentionPills from '@/components/shared/MentionPills';
import ShareButton from '@/components/shared/ShareButton';
import useCallsignDirectory from '@/lib/useCallsignDirectory';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';
import LinkPreviews from '@/components/shared/LinkPreviews';

function CommentRow({ comment, userId, canModerate, onDelete, onToggleLike, profile }) {
  const likedBy = comment.liked_by || [];
  const liked = userId && likedBy.includes(userId);
  const canDelete = userId && (comment.created_by_id === userId || canModerate);
  return (
    <div className="flex items-start gap-2.5">
      <Link to={`/members/${comment.created_by_id}`} className="w-7 h-7 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold shrink-0 overflow-hidden">
        {profile?.avatar_url || comment.author_avatar_url ? (
          <img src={profile?.avatar_url || comment.author_avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (comment.author_name || '?').charAt(0).toUpperCase()}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="bg-muted/60 rounded-xl px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 min-w-0"><Link to={`/members/${comment.created_by_id}`} className="text-xs font-medium hover:underline truncate">{comment.author_name || 'Member'}</Link><StaffTag userId={comment.created_by_id} compact /></span>
            {canDelete && (
              <button onClick={() => onDelete(comment)} className="text-muted-foreground hover:text-destructive shrink-0" title="Delete comment">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap break-words mt-0.5"><Linkify text={comment.body} /></p>
        </div>
        <div className="flex items-center gap-3 mt-1 ml-1">
          <button
            type="button"
            onClick={() => onToggleLike(comment)}
            disabled={!userId}
            className={`inline-flex items-center gap-1 text-[11px] font-medium ${liked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Heart className={`w-3 h-3 ${liked ? 'fill-primary' : ''}`} /> {likedBy.length > 0 ? likedBy.length : 'Like'}
          </button>
          {comment.created_date && (
            <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(comment.created_date), { addSuffix: true })}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfileFeed({ userId, authorId, refreshKey }) {
  const [posts, setPosts] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [me, setMe] = useState(null);
  const [openComments, setOpenComments] = useState({});
  const [comments, setComments] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentBusy, setCommentBusy] = useState({});
  const { callsignToUserId, profileByUserId } = useCallsignDirectory();

  useEffect(() => { base44.auth.me().then(setMe).catch(() => {}); }, []);

  const load = useCallback(() => {
    if (authorId) {
      base44.entities.ProfilePost.filter({ created_by_id: authorId }, '-created_date', 30)
        .then(setPosts).catch(() => setPosts([]));
      return;
    }
    // Public feed: every member's Dashboard shows the same recent, site-wide
    // feed, not just their own posts and friends'.
    base44.entities.ProfilePost.list('-created_date', 30).then(setPosts).catch(() => setPosts([]));
  }, [authorId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Live updates: new posts, likes, and deletions from anyone appear without
  // needing a manual refresh. Every open feed hears every post and like on the
  // site, so the change is applied from the event itself instead of reloading
  // the feed for each one. An event that arrives without its record, or with
  // one Base44 cut down to fit the realtime channel (_oversize), falls back to
  // a reload, batched; a hidden tab reloads once when it's shown.
  useEffect(() => {
    let timer = null;
    let missed = false;
    const scheduleReload = () => {
      if (document.hidden) { missed = true; return; }
      if (timer) return;
      timer = setTimeout(() => { timer = null; load(); }, 800);
    };
    const onVisible = () => { if (!document.hidden && missed) { missed = false; scheduleReload(); } };
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribe = base44.entities.ProfilePost.subscribe((event) => {
      const row = event?.data;
      const id = row?.id || event?.id;
      if (!id || (event?.type !== 'delete' && (!row || row._oversize))) { scheduleReload(); return; }
      // A member's profile shows only their own posts.
      if (row && authorId && row.created_by_id !== authorId) return;
      setPosts((prev) => {
        if (!prev) return prev;
        if (event.type === 'delete') return prev.filter((p) => p.id !== id);
        if (event.type === 'create') return prev.some((p) => p.id === id) ? prev : [row, ...prev].slice(0, 30);
        return prev.map((p) => (p.id === id ? { ...p, ...row } : p));
      });
    });
    return () => {
      unsubscribe?.();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, authorId]);

  const toggleLike = async (post) => {
    if (!userId) return;
    const likedBy = post.liked_by || [];
    const liked = likedBy.includes(userId);
    const optimisticLiked = liked ? likedBy.filter((uid) => uid !== userId) : [...likedBy, userId];
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, liked_by: optimisticLiked } : p)));
    try {
      const res = await base44.functions.invoke('toggle-post-reaction', {
        entity: 'ProfilePost', record_id: post.id, reaction: 'like',
      });
      const serverLiked = res?.data?.liked_by;
      if (Array.isArray(serverLiked)) {
        setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, liked_by: serverLiked } : p)));
      }
    } catch (e) {
      console.error(e);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, liked_by: likedBy } : p)));
    }
  };

  const remove = async (post) => {
    if (!userId || (post.created_by_id !== userId && !canManagePostMedia)) return;
    if (!window.confirm('Remove this post?')) return;
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    try {
      await base44.entities.ProfilePost.delete(post.id);
    } catch (e) {
      console.error(e);
      load();
    }
  };

  const removePhoto = async (post, { kind, index }) => {
    if (!userId || (post.created_by_id !== userId && !canManagePostMedia)) return;
    if (!window.confirm('Remove this photo?')) return;

    const attachments = Array.isArray(post.attachments) ? post.attachments : [];
    const imageUrls = Array.isArray(post.image_urls) ? post.image_urls : [];
    const nextAttachments = kind === 'attachment'
      ? attachments.filter((_, i) => i !== index)
      : attachments;
    const nextImageUrls = kind === 'legacy'
      ? imageUrls.filter((_, i) => i !== index)
      : imageUrls;

    const nextPost = { ...post, attachments: nextAttachments, image_urls: nextImageUrls };
    const hasRemainingContent = Boolean(
      nextPost.content?.trim() ||
      nextAttachments.length ||
      nextImageUrls.length ||
      nextPost.mentions?.length
    );

    setPosts((prev) => prev.map((p) => (p.id === post.id ? nextPost : p)));
    try {
      if (!hasRemainingContent) {
        await base44.entities.ProfilePost.delete(post.id);
        setPosts((prev) => prev.filter((p) => p.id !== post.id));
      } else {
        await base44.entities.ProfilePost.update(post.id, {
          attachments: nextAttachments,
          image_urls: nextImageUrls,
        });
      }
    } catch (e) {
      console.error('photo removal failed', e);
      load();
    }
  };

  const toggleComments = async (post) => {
    const isOpen = !!openComments[post.id];
    setOpenComments((o) => ({ ...o, [post.id]: !isOpen }));
    if (!isOpen && !comments[post.id]) {
      try {
        const rows = await base44.entities.ProfilePostComment.filter({ post_id: post.id }, 'created_date', 200);
        setComments((c) => ({ ...c, [post.id]: rows || [] }));
      } catch (e) {
        console.error(e);
        setComments((c) => ({ ...c, [post.id]: [] }));
      }
    }
  };

  const submitComment = async (post) => {
    const text = (commentDrafts[post.id] || '').trim();
    if (!text || !me || commentBusy[post.id]) return;
    setCommentBusy((b) => ({ ...b, [post.id]: true }));
    try {
      const displayName = me.full_name || me.email || 'Member';
      const comment = await base44.entities.ProfilePostComment.create({
        post_id: post.id,
        body: text,
        author_name: displayName,
        author_avatar_url: profileByUserId[me.id]?.avatar_url || '',
        liked_by: [],
      });
      setComments((c) => ({ ...c, [post.id]: [...(c[post.id] || []), comment] }));
      setCommentDrafts((d) => ({ ...d, [post.id]: '' }));
      base44.functions.invoke('notify-profile-comment', {
        post_id: post.id,
        comment_id: comment.id,
        preview: text,
      }).catch((e) => console.error('profile comment notify failed', e));
      const res = await base44.functions.invoke('adjust-profile-post-comments', { post_id: post.id, delta: 1 });
      const next = res?.data?.comments_count ?? (post.comments_count || 0) + 1;
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, comments_count: next } : p)));
    } catch (e) {
      console.error(e);
    } finally {
      setCommentBusy((b) => ({ ...b, [post.id]: false }));
    }
  };

  const deleteComment = async (post, comment) => {
    setComments((c) => ({ ...c, [post.id]: (c[post.id] || []).filter((x) => x.id !== comment.id) }));
    try {
      await base44.entities.ProfilePostComment.delete(comment.id);
      const res = await base44.functions.invoke('adjust-profile-post-comments', { post_id: post.id, delta: -1 });
      const next = res?.data?.comments_count ?? Math.max(0, (post.comments_count || 0) - 1);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, comments_count: next } : p)));
    } catch (e) { console.error(e); }
  };

  const toggleCommentLike = async (post, comment) => {
    if (!userId) return;
    const likedBy = comment.liked_by || [];
    const liked = likedBy.includes(userId);
    const optimisticLiked = liked ? likedBy.filter((uid) => uid !== userId) : [...likedBy, userId];
    setComments((c) => ({
      ...c,
      [post.id]: (c[post.id] || []).map((x) => (x.id === comment.id ? { ...x, liked_by: optimisticLiked } : x)),
    }));
    try {
      const res = await base44.functions.invoke('toggle-post-reaction', {
        entity: 'ProfilePostComment', record_id: comment.id, reaction: 'like',
      });
      const serverLiked = res?.data?.liked_by;
      if (Array.isArray(serverLiked)) {
        setComments((c) => ({
          ...c,
          [post.id]: (c[post.id] || []).map((x) => (x.id === comment.id ? { ...x, liked_by: serverLiked } : x)),
        }));
      }
    } catch (e) {
      console.error(e);
      setComments((c) => ({
        ...c,
        [post.id]: (c[post.id] || []).map((x) => (x.id === comment.id ? { ...x, liked_by: likedBy } : x)),
      }));
    }
  };

  const canModerate = me?.role === 'admin' || me?.role === 'super_admin' || me?.role === 'moderator';
  const canManagePostMedia = me?.role === 'admin' || me?.role === 'super_admin';

  if (!posts) {
    return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  if (posts.length === 0) {
    return (
      <Card className="p-8 text-center">
        <MessageCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          {authorId ? 'No posts yet.' : 'No posts yet — be the first to share something.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => {
        const likedBy = post.liked_by || [];
        const liked = userId && likedBy.includes(userId);
        const isOwn = userId && post.created_by_id === userId;
        const commentsOpen = !!openComments[post.id];
        const postComments = comments[post.id] || [];
        return (
          <Card key={post.id} className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <Link to={`/members/${post.created_by_id}`} className="w-10 h-10 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold shrink-0 overflow-hidden">
                {post.author_avatar_url ? <img src={post.author_avatar_url} alt="" className="w-full h-full object-cover" /> : (post.author_name || '?').charAt(0).toUpperCase()}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0"><Link to={`/members/${post.created_by_id}`} className="font-medium text-sm hover:underline truncate">{post.author_name || 'Member'}</Link><StaffTag userId={post.created_by_id} /></span>
                    <div className="text-xs text-muted-foreground">{post.created_date ? formatDistanceToNow(new Date(post.created_date), { addSuffix: true }) : ''}</div>
                  </div>
                  {isOwn && (
                    <button onClick={() => remove(post)} className="text-muted-foreground hover:text-destructive shrink-0" title="Delete post">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {post.content && <div className="mt-2 text-sm leading-relaxed"><MessageBody body={post.content} /><LinkPreviews text={post.content} /></div>}
                <MessageAttachments
                  attachments={post.attachments}
                  canDelete={Boolean(isOwn || canManagePostMedia)}
                  onDelete={(attachment, index) => removePhoto(post, { kind: 'attachment', index })}
                />
                {post.image_urls?.length > 0 && (
                  <div className={`grid gap-1.5 mt-3 ${post.image_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {post.image_urls.map((url, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-border">
                        <button type="button" onClick={() => setLightbox(url)} className="block w-full">
                          <img src={url} alt="" className="w-full h-40 sm:h-52 object-cover hover:opacity-90 transition-opacity" />
                        </button>
                        {(isOwn || canManagePostMedia) && (
                          <button
                            type="button"
                            onClick={() => removePhoto(post, { kind: 'legacy', index: i })}
                            className="absolute top-2 right-2 grid place-items-center w-7 h-7 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                            title="Remove photo"
                            aria-label="Remove photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {post.mentions?.length > 0 && (
                  <div className="mt-3">
                    <MentionPills mentions={post.mentions} callsignToUserId={callsignToUserId} />
                  </div>
                )}
                <div className="flex items-center gap-1 mt-3">
                  <button
                    type="button"
                    onClick={() => toggleLike(post)}
                    disabled={!userId}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${liked ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-primary' : ''}`} /> {likedBy.length}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleComments(post)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${commentsOpen ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> {post.comments_count || 0}
                  </button>
                  <ShareButton
                    url={`${window.location.origin}/members/${post.created_by_id}`}
                    title={`${post.author_name || 'Member'} on Repeater Nation`}
                    text={post.body ? post.body.slice(0, 140) : ''}
                    size="sm"
                    variant="ghost"
                    className="px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
                  />
                </div>

                {commentsOpen && (
                  <div className="mt-3 pt-3 border-t border-border space-y-3">
                    {postComments.map((c) => (
                      <CommentRow
                        key={c.id}
                        comment={c}
                        userId={userId}
                        canModerate={canModerate}
                        onDelete={(comment) => deleteComment(post, comment)}
                        onToggleLike={(comment) => toggleCommentLike(post, comment)}
                        profile={profileByUserId[c.created_by_id]}
                      />
                    ))}
                    {postComments.length === 0 && (
                      <p className="text-xs text-muted-foreground">No comments yet.</p>
                    )}
                    {me && (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          value={commentDrafts[post.id] || ''}
                          onChange={(e) => setCommentDrafts((d) => ({ ...d, [post.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') submitComment(post); }}
                          placeholder="Write a comment…"
                          className="flex-1 h-8 px-3 rounded-full border border-input bg-background text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => submitComment(post)}
                          disabled={commentBusy[post.id] || !(commentDrafts[post.id] || '').trim()}
                          className="grid place-items-center w-8 h-8 rounded-full bg-primary text-primary-foreground disabled:opacity-50 shrink-0"
                          title="Post comment"
                        >
                          {commentBusy[post.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
      {lightbox && <ImageLightbox src={lightbox} alt="" onClose={() => setLightbox(null)} />}
    </div>
  );
}