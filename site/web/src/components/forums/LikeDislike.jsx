import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Reusable upvote/downvote control for forum posts and replies.
// Stores voter user ids in liked_by / disliked_by arrays; clicking the active
// vote toggles it off; switching votes moves the user between the two arrays.
export default function LikeDislike({ entity, recordId, likedBy = [], dislikedBy = [], userId, onChange }) {
  if (!userId) return null;
  const liked = likedBy.includes(userId);
  const disliked = dislikedBy.includes(userId);

  const vote = async (type) => {
    // Optimistic local update; the server (which owns the actual liked_by/
    // disliked_by arrays via a service-role function, since these entities'
    // RLS doesn't allow direct cross-user writes) sends back the real state.
    let nextLiked = [...likedBy];
    let nextDisliked = [...dislikedBy];
    if (type === 'like') {
      if (liked) {
        nextLiked = nextLiked.filter((id) => id !== userId);
      } else {
        nextLiked.push(userId);
        nextDisliked = nextDisliked.filter((id) => id !== userId);
      }
    } else {
      if (disliked) {
        nextDisliked = nextDisliked.filter((id) => id !== userId);
      } else {
        nextDisliked.push(userId);
        nextLiked = nextLiked.filter((id) => id !== userId);
      }
    }
    onChange?.({ liked_by: nextLiked, disliked_by: nextDisliked });
    try {
      const res = await base44.functions.invoke('toggle-post-reaction', {
        entity, record_id: recordId, reaction: type === 'like' ? 'like' : 'dislike',
      });
      if (res?.data?.liked_by) {
        onChange?.({ liked_by: res.data.liked_by, disliked_by: res.data.disliked_by || [] });
      }
    } catch (e) {
      console.error(e);
      onChange?.({ liked_by: likedBy, disliked_by: dislikedBy });
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => vote('like')}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${liked ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
      >
        <ThumbsUp className={`w-3.5 h-3.5 ${liked ? 'fill-primary' : ''}`} /> {likedBy.length}
      </button>
      <button
        type="button"
        onClick={() => vote('dislike')}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${disliked ? 'bg-destructive/15 text-destructive' : 'text-muted-foreground hover:bg-muted'}`}
      >
        <ThumbsDown className={`w-3.5 h-3.5 ${disliked ? 'fill-destructive' : ''}`} /> {dislikedBy.length}
      </button>
    </div>
  );
}