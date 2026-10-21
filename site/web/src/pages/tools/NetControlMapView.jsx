import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NetControlMapCard from '@/components/netcontrol/NetControlMapCard';

// Popped-out live map for Net Control — deliberately not nested in <Layout />
// so a second window/monitor shows just the map, no site chrome, no roster
// or controls. Loads and live-updates its own data since it runs in a
// separate window from the main dashboard.
export default function NetControlMapView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [checkIns, setCheckIns] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [hostLocations, setHostLocations] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadCheckIns = useCallback(async () => {
    try {
      const records = await base44.entities.NetControlCheckIn.filter({ session_id: sessionId }, 'check_in_time', 500);
      setCheckIns(records || []);
    } catch { /* ignore */ }
  }, [sessionId]);

  const loadHosts = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('manage-net-hosts', { action: 'list', session_id: sessionId });
      setHosts(res.data?.hosts || []);
    } catch { /* ignore */ }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sess = await base44.entities.NetControlSession.get(sessionId);
        if (cancelled) return;
        if (!sess) { setError('Net not found or you do not have access to it.'); setLoading(false); return; }
        setSession(sess);
      } catch {
        if (!cancelled) { setError('Net not found or you do not have access to it.'); setLoading(false); return; }
      }
      await Promise.all([loadCheckIns(), loadHosts()]);
      if (!cancelled) setLoading(false);
    })();
    // Same as the net dashboard: only this net's check-ins, a burst at once.
    let ciTimer = null;
    const unsubCi = base44.entities.NetControlCheckIn.subscribe((event) => {
      const row = event?.data;
      if (row && !row._oversize && event.type !== 'delete' && row.session_id !== sessionId) return;
      if (ciTimer) return;
      ciTimer = setTimeout(() => { ciTimer = null; loadCheckIns(); }, 500);
    });
    const unsubSession = base44.entities.NetControlSession.subscribe((event) => {
      if (event.id === sessionId && event.type === 'update') {
        setSession((prev) => (prev ? { ...prev, ...event.data } : prev));
      }
    });
    return () => { cancelled = true; unsubCi(); unsubSession(); if (ciTimer) clearTimeout(ciTimer); };
  }, [sessionId, loadCheckIns, loadHosts]);

  // Geocode the host's and each accepted co-host's callsign, same as the main dashboard.
  useEffect(() => {
    if (!session) return;
    const primaryHost = hosts.find((h) => h.is_primary && h.status === 'accepted');
    const hostCallsign = (primaryHost?.user_callsign || session.operator_callsign || '').toUpperCase();
    const coHostCallsigns = hosts
      .filter((h) => h.status === 'accepted' && !h.is_primary && h.user_callsign)
      .map((h) => h.user_callsign.toUpperCase());
    const callsigns = [...new Set([hostCallsign, ...coHostCallsigns].filter(Boolean))];
    const toLookup = callsigns.filter((cs) => !hostLocations[cs]);
    if (toLookup.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(toLookup.map(async (cs) => {
        try {
          const res = await base44.functions.invoke('lookup-callsign-location', { callsign: cs });
          const data = res?.data || res;
          return data?.found && data.lat ? [cs, { lat: data.lat, lng: data.lng }] : null;
        } catch { return null; }
      }));
      if (cancelled) return;
      setHostLocations((prev) => {
        const next = { ...prev };
        results.forEach((r) => { if (r) next[r[0]] = r[1]; });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [hosts, session?.operator_callsign]);

  if (loading) {
    return (
      <div className="h-screen grid place-items-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="h-screen grid place-items-center bg-background p-6">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-500" />
          <p className="text-sm text-muted-foreground">{error || 'Net not found.'}</p>
          <Button variant="outline" onClick={() => navigate('/tools/net-control')}>Back to Net Control</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="px-3 py-2 border-b bg-card text-sm font-heading font-semibold flex items-center gap-2 shrink-0">
        {session.name}
        <span className="text-xs font-normal text-muted-foreground uppercase">{session.status}</span>
      </div>
      <div className="flex-1 min-h-0">
        <NetControlMapCard session={session} checkIns={checkIns} hosts={hosts} hostLocations={hostLocations} className="h-full w-full" />
      </div>
    </div>
  );
}
