import { HelpCircle } from 'lucide-react';
import HelpSection from '@/components/tools/HelpSection';

export default function Help() {
  return (
    <div className="p-5 sm:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
          <HelpCircle className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-bold">Help & Guides</h1>
          <p className="text-sm text-muted-foreground">How to use every feature on Repeater Nation.</p>
        </div>
      </div>
      <HelpSection />
    </div>
  );
}