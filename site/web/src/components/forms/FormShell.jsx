import React from 'react';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Consistent form header for dialog-based forms.
 * Supports both dialog and standalone/inline form contexts.
 */
export default function FormShell({ icon: Icon, title, description, children, className, standalone = false }) {
  const header = (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="space-y-0.5">
          {standalone ? (
            <>
              <h2 className="text-lg font-heading font-semibold">{title}</h2>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </>
          ) : (
            <>
              <DialogTitle className="text-lg font-heading">{title}</DialogTitle>
              {description && (
                <DialogDescription className="text-sm text-muted-foreground">
                  {description}
                </DialogDescription>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {standalone ? header : <DialogHeader className="space-y-2">{header}</DialogHeader>}
      {children && <div className={cn('space-y-5', className)}>{children}</div>}
    </>
  );
}
