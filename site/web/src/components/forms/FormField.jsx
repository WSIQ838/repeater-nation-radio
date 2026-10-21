import React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

/**
 * Wraps a single form field with a label, required indicator,
 * optional description, and inline error message.
 * Pass `full` to span both columns in a FormSection grid.
 */
export default function FormField({ label, required, description, error, children, full, className }) {
  return (
    <div className={cn('space-y-1.5', full && 'sm:col-span-2', className)}>
      {label && (
        <Label className="text-sm font-medium flex items-center gap-1">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {description && <p className="text-xs text-muted-foreground -mt-0.5">{description}</p>}
      {children}
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1 mt-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}