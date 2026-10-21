import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { ShieldOff, Radio } from 'lucide-react';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const BlockedScreen = ({ logout, banned, deleted, investigation }) => {
  const title = deleted ? 'Account Deleted' : banned ? 'Account Banned' : investigation ? 'Account Under Investigation' : 'Account Suspended';
  const message = deleted
    ? 'Your account has been deleted. If you believe this is an error, please contact support.'
    : banned
      ? 'Your account has been permanently banned by an administrator. Please contact support if you believe this is an error.'
      : investigation
        ? 'Your account is temporarily restricted while an administrator reviews it. Please contact support if you need assistance.'
        : 'Your account has been suspended by an administrator. Please contact support if you believe this is an error.';
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="text-center max-w-md space-y-5">
        <div className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-destructive/10 text-destructive">
          <ShieldOff className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-heading font-bold">{title}</h1>
        <p className="text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={() => logout()}>Sign out</Button>
      </div>
    </div>
  );
};

// A callsign saved as Pending is one the FCC data didn't list yet at sign-up
// (brand-new licenses take a few days); the daily re-check unlocks the account
// and emails the member once it shows up, so say that instead of asking them
// to verify again.
const VerificationRequired = ({ user }) => {
  const callsign = String(user?.callsign || '').trim();
  const waiting = !!callsign && /^pending$/i.test(String(user?.license_status || ''));
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="text-center max-w-lg space-y-5">
        <div className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-primary/10 text-primary">
          <Radio className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-heading font-bold">{waiting ? 'Waiting on the FCC' : 'Callsign Verification Required'}</h1>
        {waiting ? (
          <p className="text-muted-foreground" data-callsign-waiting="">
            The FCC hasn't confirmed <span className="font-medium text-foreground">{callsign}</span> yet. New GMRS licenses can take a few days to show up.
            We check again every day and will email you as soon as it's confirmed, or you can check now.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Your account must have an active, verified GMRS or amateur radio (HAM) callsign before you can use member features.
            Please verify your callsign to unlock the Repeater Nation website.
          </p>
        )}
        <Button asChild><a href="/callsign-management">{waiting ? 'Check my callsign now' : 'Verify My Callsign'}</a></Button>
      </div>
    </div>
  );
};

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { user, isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  if (user?.account_status === 'suspended') {
    return <BlockedScreen logout={logout} />;
  }

  if (user?.account_status === 'banned') {
    return <BlockedScreen logout={logout} banned />;
  }

  if (user?.account_status === 'deleted') {
    return <BlockedScreen logout={logout} deleted />;
  }

  if (user?.account_status === 'investigation') {
    return <BlockedScreen logout={logout} investigation />;
  }

  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const isVerificationRoute = location.pathname === '/callsign-management' || location.pathname === '/settings' || location.pathname === '/profile';

  if (user?.account_status === 'callsign_restricted' && !isAdmin && !isVerificationRoute) {
    return <Navigate to="/settings" replace state={{ callsignRestricted: true }} />;
  }
  const needsVerification = !isAdmin && user?.callsign_verified !== true;

  if (needsVerification && !isVerificationRoute) {
    return <VerificationRequired user={user} />;
  }

  return <Outlet />;
}