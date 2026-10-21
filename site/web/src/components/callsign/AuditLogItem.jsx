import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Crown, UserPlus, UserCheck, UserX, Shield, RefreshCw, FileText, CheckCircle2
} from 'lucide-react';

const ACTION_META = {
  claimed: { icon: Crown, label: 'Callsign claimed', color: 'text-primary' },
  verification_completed: { icon: CheckCircle2, label: 'Verification completed', color: 'text-success' },
  access_requested: { icon: UserPlus, label: 'Access requested', color: 'text-blue-500' },
  access_approved: { icon: UserCheck, label: 'Access approved', color: 'text-success' },
  access_denied: { icon: UserX, label: 'Access denied', color: 'text-destructive' },
  access_revoked: { icon: UserX, label: 'Access revoked', color: 'text-destructive' },
  primary_changed: { icon: RefreshCw, label: 'Primary account changed', color: 'text-primary' },
  admin_override: { icon: Shield, label: 'Admin override', color: 'text-primary' },
  request_cancelled: { icon: FileText, label: 'Request cancelled', color: 'text-muted-foreground' },
};

export default function AuditLogItem({ log }) {
  const meta = ACTION_META[log.action] || { icon: FileText, label: log.action, color: 'text-muted-foreground' };
  const Icon = meta.icon;
  return (
    <Card>
      <CardContent className="p-3.5">
        <div className="flex items-start gap-3">
          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.color}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{meta.label}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(log.created_date).toLocaleDateString()}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
              {log.actor_name && <div>By: {log.actor_name}</div>}
              {log.affected_name && log.affected_user_id !== log.actor_user_id && (
                <div>Affected: {log.affected_name}</div>
              )}
              {log.reason && <div className="text-muted-foreground/80">Reason: {log.reason}</div>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}