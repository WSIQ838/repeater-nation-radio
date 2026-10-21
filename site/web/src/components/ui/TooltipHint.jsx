import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function TooltipHint({ children, side = 'top', className = '' }) {
  return (
    <TooltipProvider delayDuration={180}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label="More information"
            className={`inline-flex items-center justify-center shrink-0 cursor-help text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full ${className}`}
          >
            <Info className="w-3.5 h-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[280px] leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
