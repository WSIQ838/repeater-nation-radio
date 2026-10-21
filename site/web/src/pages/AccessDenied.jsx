import { Link } from 'react-router-dom';
import { ShieldX, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';

export default function AccessDenied() {
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="text-center max-w-md space-y-5">
        <Link to="/" className="flex items-center justify-center gap-2 mb-2 hover:opacity-80 transition-opacity">
          <Logo className="w-9 h-9" />
          <span className="font-heading font-bold text-lg">Repeater Nation</span>
        </Link>
        <div className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-destructive/10 text-destructive">
          <ShieldX className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-heading font-bold">Access Denied</h1>
        <p className="text-muted-foreground">
          You do not have permission to access the administration panel.
        </p>
        <Button asChild>
          <Link to="/dashboard"><ArrowLeft className="w-4 h-4" /> Return to main website</Link>
        </Button>
      </div>
    </div>
  );
}