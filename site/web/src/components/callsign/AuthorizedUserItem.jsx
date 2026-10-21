import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { UserX, Loader2, BadgeCheck } from 'lucide-react';

export default function AuthorizedUserItem({ access, onRevoke, actingId, colored = false }) {
  const acting = actingId === access.id;
  return (
    <Card className={colored ? "bg-black/15 border-white/20 text-white" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BadgeCheck className={`w-4 h-4 shrink-0 ${colored ? "text-white" : "text-success"}`} />
              {access.user_id ? (
                <Link to={`/members/${access.user_id}`} className={colored ? "font-medium truncate text-white hover:text-white hover:underline" : "font-medium truncate text-primary hover:underline"}>
                  {access.user_name || 'Unknown'}
                </Link>
              ) : (
                <span className={`font-medium truncate ${colored ? "text-white" : ""}`}>{access.user_name || "Unknown"}</span>
              )}
            </div>
            <p className={colored ? "text-xs text-white/80 mt-1" : "text-xs text-muted-foreground mt-1"}>
              Authorized {access.approved_at ? new Date(access.approved_at).toLocaleDateString() : ''}
              {access.approved_by_name ? ` by ${access.approved_by_name}` : ''}
            </p>
          </div>
          <Button size="sm" variant="outline" className={colored ? "border-white/50 text-white hover:bg-white/10 hover:text-white" : undefined} disabled={acting} onClick={() => onRevoke(access.id)}>
            {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
            Revoke
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}