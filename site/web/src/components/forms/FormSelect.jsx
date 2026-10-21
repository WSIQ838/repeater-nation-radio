import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Consistently styled native <select> matching the Input component.
 * Supports optgroups via children.
 */
const FormSelect = React.forwardRef(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-lg border border-input bg-background text-foreground px-3 py-1.5 text-sm shadow-sm',
      'transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
  </select>
));
FormSelect.displayName = 'FormSelect';

export default FormSelect;