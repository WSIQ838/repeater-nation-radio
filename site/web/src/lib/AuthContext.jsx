import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const callsignSyncAttemptedRef = useRef('');

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    setIsLoadingPublicSettings(true);
    setAuthError(null);

    // These two requests do not depend on each other. Running them together
    // removes one full network round-trip from every fresh page load.
    const publicSettingsPromise = fetch('/api/public-settings').then((r) => { if (!r.ok) throw Object.assign(new Error('Failed to load app'), { status: r.status }); return r.json(); });
    const authPromise = appParams.token ? checkUserAuth() : Promise.resolve();

    const [publicResult, authResult] = await Promise.allSettled([publicSettingsPromise, authPromise]);

    if (publicResult.status === 'fulfilled') {
      setAppPublicSettings(publicResult.value);
      setIsLoadingPublicSettings(false);
    } else {
      const appError = publicResult.reason;
      console.error('App state check failed:', appError);
      if (appError?.status === 403 && appError?.data?.extra_data?.reason) {
        const reason = appError.data.extra_data.reason;
        setAuthError({
          type: reason,
          message: reason === 'auth_required' ? 'Authentication required' :
            reason === 'user_not_registered' ? 'User not registered for this app' :
            appError.message
        });
      } else {
        setAuthError({ type: 'unknown', message: appError?.message || 'Failed to load app' });
      }
      setIsLoadingPublicSettings(false);
    }

    if (!appParams.token) {
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
    } else if (authResult.status === 'rejected') {
      // checkUserAuth normally handles its own errors; this is only a safety net.
      console.error('Parallel auth check failed:', authResult.reason);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      if (currentUser && !currentUser.role && currentUser._app_role) {
        currentUser.role = currentUser._app_role;
      }
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      return currentUser;
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
      throw error;
    }
  };

  // Repair legacy/multi-callsign drift for the currently signed-in member.
  // This is deliberately self-scoped server-side, so a user with a verified
  // Callsign record but an empty User.callsign field gets repaired without
  // touching anyone else's account.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (callsignSyncAttemptedRef.current === String(user.id)) return;
    callsignSyncAttemptedRef.current = String(user.id);
    if (String(user.callsign || '').trim() && String(user.callsign || '').trim().toLowerCase() !== 'none') return;

    base44.functions.invoke('sync-my-callsign', {})
      .then((res) => {
        const data = res?.data || res || {};
        if (!data.changed) return;
        setUser((current) => current
          ? {
              ...current,
              callsign: data.callsign || current.callsign,
              callsign_verified: typeof data.callsign_verified === 'boolean' ? data.callsign_verified : current.callsign_verified,
            }
          : current);
      })
      .catch((error) => {
        // Account repair is best-effort and must never block login or navigation.
        console.error('[Auth] callsign sync failed:', error?.message || error);
      });
  }, [isAuthenticated, user?.id]);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) base44.auth.logout(window.location.href);
    else base44.auth.logout();
  };

  const navigateToLogin = () => base44.auth.redirectToLogin(window.location.href);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    let lastInteraction = Date.now();
    const markActive = () => { lastInteraction = Date.now(); };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    // Saves last_active at most about once every two minutes. Coming back to
    // the tab used to save every time, so switching tabs often meant a
    // write each switch.
    let lastSaved = 0;
    const updateActive = () => {
      const now = Date.now();
      if (now - lastInteraction >= 120000 || now - lastSaved < 110000) return;
      lastSaved = now;
      base44.auth.updateMe({ last_active: new Date(now).toISOString() }).catch(() => {});
    };
    updateActive();
    const interval = setInterval(updateActive, 120000);
    const onVisibility = () => { if (!document.hidden) { lastInteraction = Date.now(); updateActive(); } };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive));
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [isAuthenticated, user?.id]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};