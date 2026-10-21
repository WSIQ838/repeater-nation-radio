import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Consistently styled textarea with better focus states.
 */
const FormTextarea = React.forwardRef(({ className, ...props }, ref) => (
  <Textarea
    ref={ref}
    className={cn(
      'transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring',
      className
    )}
    {...props}
  />
));
FormTextarea.displayName = 'FormTextarea';

export default FormTextarea;