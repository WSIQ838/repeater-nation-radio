import { Link } from 'react-router-dom';
import { AtSign } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';

// Renders a post/reply's tagged callsigns as pills. When the callsign
// resolves to a real member (via the callsignToUserId directory), the pill
// links to that member's profile; otherwise it renders as plain text so a
// stale/unknown tag never looks clickable.
export default function MentionPills({ mentions, callsignToUserId = {}, size = 'sm' }) {
  if (!mentions?.length) return null;
  const cls = size === 'xs'
    ? 'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium'
    : 'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium';
  const iconCls = size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <div className="flex flex-wrap gap-1.5">
      {mentions.map((m) => {
        const userId = callsignToUserId[String(m).toUpperCase()];
        return userId ? (
          <Link key={m} to={`/members/${userId}`} className={`${cls} hover:bg-primary/20 transition-colors`} title={`View ${m}'s profile`}>
            <AtSign className={iconCls} />{m}<StaffTag userId={userId} compact className="ml-1" />
          </Link>
        ) : (
          <span key={m} className={cls}>
            <AtSign className={iconCls} />{m}
          </span>
        );
      })}
    </div>
  );
}
