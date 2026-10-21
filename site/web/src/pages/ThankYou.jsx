import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Users, Heart, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ThankYou() {
  const [searchParams] = useSearchParams();
  const isDonation = searchParams.get('donation') === '1';

  if (isDonation) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="grid place-items-center w-16 h-16 rounded-2xl bg-destructive/10 text-destructive mx-auto">
            <Heart className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-heading font-bold">Thank you for your donation!</h1>
          <p className="text-muted-foreground">
            Your support helps keep Repeater Nation free for every GMRS and HAM operator. We really appreciate it.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link to="/"><Button className="gap-2"><Home className="w-4 h-4" /> Back to home</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="grid place-items-center w-16 h-16 rounded-2xl bg-success/10 text-success mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-heading font-bold">Payment complete</h1>
        <p className="text-muted-foreground">
          Thanks for your payment! Your club membership is being activated and will appear under your clubs shortly.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link to="/clubs"><Button className="gap-2"><Users className="w-4 h-4" /> Go to clubs</Button></Link>
          <Link to="/dashboard"><Button variant="outline">Dashboard</Button></Link>
        </div>
      </div>
    </div>
  );
}
