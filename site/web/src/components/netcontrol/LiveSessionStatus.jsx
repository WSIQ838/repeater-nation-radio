import { Badge } from '@/components/ui/badge';
import { PERMISSION_SHORT, PERMISSION_COLORS } from '@/lib/netHostPermissions';
import { Crown, Wifi } from 'lucide-react';

// LiveSessionStatus — displays connected Net Control operators with live
// presence indicator. Pure display component; presence data comes from the
// parent (LiveNetDashboard) which manages the actor connection.
export default function LiveSessionStatus({ operators = [], myUserId }) {
  const count = operators.length;
  const isLive = count > 0;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {isLive && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          {count} Net Control{count !== 1 ? 's' : ''} Connected
        </div>
      )}
      {count > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {operators.map((op) => {
            const isMe = op.userId === myUserId;
            return (
              <div
                key={op.userId || op.userName}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border ${
                  op.isPrimary
                    ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700'
                    : 'border-border bg-card'
                }`}
              >
                {op.isPrimary ? (
                  <Crown className="w-3 h-3 text-amber-500" />
                ) : (
                  <Wifi className="w-3 h-3 text-green-500" />
                )}
                <span className="font-medium">
                  {op.callsign || op.userName || 'Operator'}
                  {isMe && <span className="text-muted-foreground ml-1">(You)</span>}
                </span>
                {!op.isPrimary && (
                  <Badge className={`text-[10px] px-1.5 py-0 ${PERMISSION_COLORS[op.permission] || ''}`}>
                    {PERMISSION_SHORT[op.permission] || 'View'}
                  </Badge>
                )}
                {op.isPrimary && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Primary</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}