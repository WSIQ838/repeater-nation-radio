import { Link } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';

export function Disclaimer({ children }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
      <Info className="w-4 h-4 shrink-0 mt-0.5" />
      <p>
        {children ||
          'These tools provide estimates and general information for educational and planning purposes. They do not replace FCC rules, official licensing information, equipment documentation, or professional engineering advice. Always operate within applicable laws and regulations.'}
      </p>
    </div>
  );
}

export default function ToolShell({ title, description, icon: Icon, children, disclaimer = true }) {
  return (
    <div className="p-5 sm:p-8 max-w-5xl mx-auto space-y-6">
      <Link to="/tools" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> All tools
      </Link>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
            <Icon className="w-6 h-6" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-heading font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      </div>
      {children}
      {disclaimer && <Disclaimer />}
    </div>
  );
}