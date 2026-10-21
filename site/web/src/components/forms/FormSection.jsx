import React from 'react';
import { cn } from '@/lib/utils';

/**
 * A titled section card used to group related form fields.
 * Renders a clean header with optional icon and description.
 */
export default function FormSection({ icon: Icon, title, description, children, className, columns = true }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4', className)}>
      {(title || description) && (
        <div className="flex items-start gap-2.5">
          {Icon && (
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground shrink-0 mt-0.5">
              <Icon className="w-4 h-4" />
            </div>
          )}
          <div className="space-y-0.5">
            {title && <h3 className="text-sm font-semibold font-heading">{title}</h3>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
      )}
      <div className={columns ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-4'}>
        {children}
      </div>
    </div>
  );
}