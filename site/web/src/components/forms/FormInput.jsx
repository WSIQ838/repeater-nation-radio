import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Consistently styled input with enhanced focus states.
 */
const FormInput = React.forwardRef(({ className, ...props }, ref) => (
  <Input
    ref={ref}
    className={cn(
      'transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring',
      className
    )}
    {...props}
  />
));
FormInput.displayName = 'FormInput';

export default FormInput;