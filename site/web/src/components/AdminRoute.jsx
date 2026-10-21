import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { hasPermission } from '@/lib/permissions';

const Fallback = () => (
  <div className="fixed inset-0 grid place-items-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

// Server-side authorization lives in the admin-api gateway; this guard adds a
// fast client-side check so non-admins never render admin pages, and redirects
// them to /access-denied. The backend still enforces on every request.
// Access is granted to any user with the 'admin.view' permission — this
// includes admins, super admins, moderators, and support staff depending on
// their role's permission set.
export default function AdminRoute({ unauthenticatedElement }) {
  const { user, isAuthenticated, isLoadingAuth, authChecked } = useAuth();

  if (isLoadingAuth || !authChecked) return <Fallback />;
  if (!isAuthenticated) return unauthenticatedElement || <Navigate to="/login" replace />;
  if (user?.account_status === 'suspended') return <Navigate to="/access-denied" replace />;
  if (!hasPermission(user, 'admin.view')) return <Navigate to="/access-denied" replace />;
  return <Outlet />;
}