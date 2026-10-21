import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, X, Loader2, Clock } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

export default function PendingRequestItem({ request, onAction, actingId }) {
  const acting = actingId === request.id;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <span className="font-medium truncate">{request.requester_name || 'Unknown'}</span><StaffTag userId={request.requester_user_id} />
            </div>
            {request.message && (
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2"><Linkify text={request.message} /></p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Requested {new Date(request.created_date).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" disabled={acting} onClick={() => onAction('approve', request.id)}>
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={acting} onClick={() => onAction('deny', request.id)}>
              <X className="w-3.5 h-3.5" />
              Deny
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}