import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import NetControlMapCard from '@/components/netcontrol/NetControlMapCard';
import BodyPortal from '@/components/shared/BodyPortal';
import { signalTier, SIGNAL_REPORT_OPTIONS } from '@/lib/signalReport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatFreq } from '@/utils';
import TooltipHint from '@/components/ui/TooltipHint';
import { canCheckIn, canManageSession, canManageHosts, PERMISSION_LABELS, PERMISSION_COLORS } from '@/lib/netHostPermissions';
import { lookupProfileByCallsign } from '@/lib/netRosterLookup';
import LiveSessionStatus from '@/components/netcontrol/LiveSessionStatus';
import ShareNetControlDialog from '@/components/netcontrol/ShareNetControlDialog';
import HostManagementPanel from '@/components/netcontrol/HostManagementPanel';
import CreateNetDialog from '@/components/netcontrol/CreateNetDialog';
import {
  ArrowLeft, Play, Square, Search, Check, Clock, Radio,
  RefreshCw, Loader2, FileText, AlertTriangle, UserPlus, Share2,
  Settings2, Crown, Lock, MapPin, UserCheck,
  Users, Plus, Trash2, ArrowUp, ArrowDown,
  ExternalLink,
} from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

function fmtTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; }
}

function fmtDuration(started, ended) {
  if (!started) return '0m';
  const end = ended ? new Date(ended) : new Date();
  const mins = Math.floor((end - new Date(started)) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60); const m = mins % 60;
  return `${h}h ${m}m`;
}

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const SCRIPT_SECTIONS = [
  { key: 'script_opening', label: 'Opening' },
  { key: 'script_purpose', label: 'Purpose' },
  { key: 'script_roll_call', label: 'Roll Call' },
  { key: 'script_announcements', label: 'Announcements' },
  { key: 'script_traffic', label: 'Traffic' },
  { key: 'script_emergency', label: 'Emergency' },
  { key: 'script_closing', label: 'Closing' },
];

export default function LiveNetDashboard({ session, user, onBack }) {
  const [checkIns, setCheckIns] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showScript, setShowScript] = useState(false);
  const [editingNotes, setEditingNotes] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [noteSignalReport, setNoteSignalReport] = useState('');
  const [noteName, setNoteName] = useState('');
  const [noteLocation, setNoteLocation] = useState('');
  const [noteStationType, setNoteStationType] = useState('');
  const [earlyCallsign, setEarlyCallsign] = useState('');
  const [earlyBusy, setEarlyBusy] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [newRosterMember, setNewRosterMember] = useState({ callsign: '', name: '', location: '', station_type: '', notes: '' });
  const [rosterBusy, setRosterBusy] = useState(false);
  const [quickMember, setQuickMember] = useState({ callsign: '', name: '', location: '' });
  const [quickMemberLookup, setQuickMemberLookup] = useState(false);
  const [quickMemberAutoFilled, setQuickMemberAutoFilled] = useState(false);
  const [addMemberBusy, setAddMemberBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [, setTick] = useState(0);
  const [currentSession, setCurrentSession] = useState(session);
  const [actionMsg, setActionMsg] = useState(null);

  // Collaborative state. isPrimary/myPermission are authoritatively confirmed
  // by loadHostInfo() below (a server round trip), but defaulting to
  // false/null until that resolves meant EVERY user -- including the person
  // who just created this net -- saw a flash of the "view-only" banner on
  // open, sometimes longer if the request was slow. We already know from the
  // session/user props whether the current user is the creator or primary
  // operator, so seed the optimistic case correctly instead of always
  // starting pessimistic.
  const [isPrimary, setIsPrimary] = useState(
    () => !!user?.id && (session?.created_by_id === user.id || session?.primary_user_id === user.id)
  );
  const [myPermission, setMyPermission] = useState(() => (
    !!user?.id && (session?.created_by_id === user.id || session?.primary_user_id === user.id) ? 'full' : null
  ));
  const [connectedOps, setConnectedOps] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [hostLocations, setHostLocations] = useState({});
  const [showShare, setShowShare] = useState(false);
  const [showHosts, setShowHosts] = useState(false);
  const [showEditNet, setShowEditNet] = useState(false);
  const [activeSection, setActiveSection] = useState(session.current_script_section || '');
  const [busy, setBusy] = useState(false);
  const [activationForm, setActivationForm] = useState({ title: '', details: '', priority: 'Routine', agency: '', contact: '' });
  const actorRef = useRef(null);

  const roster = parseJsonArray(currentSession.roster_members);
  const emergencyPositions = parseJsonArray(currentSession.emergency_positions);

  // Determine access
  const canAct = canCheckIn(myPermission, isPrimary);
  const canManage = canManageSession(myPermission, isPrimary);
  const canHost = canManageHosts(isPrimary);

  // Load check-ins
  const loadCheckIns = useCallback(async () => {
    try {
      const records = await base44.entities.NetControlCheckIn.filter({ session_id: currentSession.id }, 'check_in_time', 500);
      setCheckIns(records || []);
    } catch (e) { console.error('Check-in load error:', e); }
    setLoading(false);
  }, [currentSession.id]);

  // Load host info
  const loadHostInfo = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('manage-net-hosts', { action: 'list', session_id: currentSession.id });
      setIsPrimary(res.data?.isPrimary || false);
      setMyPermission(res.data?.myPermission || null);
      setHosts(res.data?.hosts || []);
    } catch (e) { console.error('Host info error:', e); }
  }, [currentSession.id]);

  useEffect(() => {
    loadCheckIns();
    loadHostInfo();
    // Check-ins for every net on the site reach every open net dashboard. Only
    // this net's reload the list, and a burst of check-ins reloads it once.
    let ciTimer = null;
    const unsubCi = base44.entities.NetControlCheckIn.subscribe((event) => {
      const row = event?.data;
      if (row && !row._oversize && event.type !== 'delete' && row.session_id !== currentSession.id) return;
      if (ciTimer) return;
      ciTimer = setTimeout(() => { ciTimer = null; loadCheckIns(); }, 500);
    });
    const unsubSession = base44.entities.NetControlSession.subscribe((event) => {
      if (event.id === currentSession.id && event.type === 'update') {
        setCurrentSession((prev) => ({ ...prev, ...event.data }));
        if (event.data.current_script_section) setActiveSection(event.data.current_script_section);
      }
    });
    return () => { unsubCi(); unsubSession(); if (ciTimer) clearTimeout(ciTimer); };
  }, [loadCheckIns, loadHostInfo, currentSession.id]);

  // Geocode the primary host's and each accepted co-host's callsign so they
  // can be auto-plotted on the map with their own distinct icons.
  useEffect(() => {
    const primaryHost = hosts.find((h) => h.is_primary && h.status === 'accepted');
    const hostCallsign = (primaryHost?.user_callsign || currentSession.operator_callsign || '').toUpperCase();
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
  }, [hosts, currentSession.operator_callsign]);

  // Actor connection for live presence
  useEffect(() => {
    if (!user?.id) return;
    let connId = sessionStorage.getItem('netControlConnId');
    if (!connId) { connId = crypto.randomUUID(); sessionStorage.setItem('netControlConnId', connId); }
    try {
      const room = base44.actors.NetControlRoom(currentSession.id).connect({ id: connId });
      actorRef.current = room;
      const sub = room.subscribe((msg) => {
        if (msg.type === 'presence') {
          setConnectedOps(msg.operators || []);
        } else if (msg.type === 'action') {
          setActionMsg({ ...msg, id: Date.now() });
          setTimeout(() => setActionMsg(null), 4000);
        } else if (msg.type === 'script_section') {
          setActiveSection(msg.section);
        } else if (msg.type === 'status_change') {
          // The session subscription will handle the actual data update
        }
      });
      // Send join message
      room.send({
        type: 'join',
        userId: user.id,
        userName: user.full_name || user.email || '',
        callsign: user.callsign || '',
        permission: myPermission || 'full',
        isPrimary,
      });
      return () => { sub.unsubscribe(); room.close(); actorRef.current = null; };
    } catch (e) { console.error('Actor connection error:', e); }
  }, [currentSession.id, user?.id, myPermission, isPrimary]);

  // Duration ticker
  useEffect(() => {
    if (currentSession.status === 'active') {
      const interval = setInterval(() => setTick((t) => t + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [currentSession.status]);

  const popOut = () => {
    window.open(`/tools/net-control/map/${currentSession.id}`, '_blank', 'width=900,height=700,noopener,noreferrer');
  };

  // Quick Add Member: live-lookup name/location from the profile as the
  // callsign is typed, same as the other check-in flows, but shown right
  // in the form instead of filled in silently.
  useEffect(() => {
    const cs = quickMember.callsign.trim().toUpperCase();
    if (!canAct || cs.length < 3) { setQuickMemberLookup(false); setQuickMemberAutoFilled(false); return; }
    setQuickMemberLookup(true);
    const timer = setTimeout(async () => {
      const profile = await lookupProfileByCallsign(cs);
      if (profile) {
        setQuickMember((m) => ({ ...m, name: m.name || profile.name, location: m.location || profile.location }));
        setQuickMemberAutoFilled(true);
      } else {
        setQuickMemberAutoFilled(false);
      }
      setQuickMemberLookup(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [quickMember.callsign, canAct]);

  const sendActorAction = (action, callsign) => {
    try { actorRef.current?.send({ type: 'action', action, callsign }); } catch {}
  };

  const checkedInCallsigns = new Set(checkIns.filter((c) => c.status === 'checked_in').map((c) => c.callsign?.toUpperCase()));
  const checkInMap = new Map(checkIns.map((c) => [c.callsign?.toUpperCase(), c]));

  const filteredRoster = roster.filter((m) =>
    !search || m.callsign?.toLowerCase().includes(search.toLowerCase()) || m.name?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredGuests = checkIns.filter((c) =>
    c.is_guest && (!search || c.callsign?.toLowerCase().includes(search.toLowerCase()) || c.name?.toLowerCase().includes(search.toLowerCase()))
  );

  // Net log: a chronological record of check-in/check-out activity, newest first.
  const activityLog = [];
  checkIns.forEach((ci) => {
    if (ci.check_in_time) activityLog.push({ id: `${ci.id}-in`, time: ci.check_in_time, type: 'in', callsign: ci.callsign });
    if (ci.check_out_time) activityLog.push({ id: `${ci.id}-out`, time: ci.check_out_time, type: 'out', callsign: ci.callsign });
  });
  activityLog.sort((a, b) => new Date(b.time) - new Date(a.time));

  // Checks a station in and returns the created (or already-existing)
  // NetControlCheckIn record so callers can immediately open the Station
  // Details popup for it — signal report and other details are filled in
  // there, after the station is marked present, not before.
  const doCheckIn = async (member, signalReport) => {
    const cs = member.callsign?.toUpperCase();
    if (checkedInCallsigns.has(cs)) return checkInMap.get(cs) || null;
    setBusy(true);
    let result = null;
    try {
      let name = member.name || '';
      let location = member.location || '';
      if (!name || !location) {
        const profile = await lookupProfileByCallsign(cs);
        if (profile) {
          name = name || profile.name;
          location = location || profile.location;
        }
      }
      let lat, lng;
      try {
        const locRes = await base44.functions.invoke('lookup-callsign-location', { callsign: cs });
        const locData = locRes?.data || locRes;
        if (locData?.found && locData.lat) { lat = locData.lat; lng = locData.lng; }
      } catch { /* ignore lookup errors, check in without coordinates */ }
      const res = await base44.functions.invoke('net-checkin-action', {
        action: 'checkin',
        session_id: currentSession.id,
        station: {
          callsign: member.callsign || '',
          name,
          location,
          station_type: member.station_type || '',
          club_role: member.club_role || '',
          membership_status: member.membership_status || '',
          signal_report: signalReport || '',
          ...(lat && lng ? { lat, lng } : {}),
        },
      });
      result = res.data?.checkin || null;
      if (res.data?.error === 'already_checked_in') {
        // Already checked in by another operator — refresh
        loadCheckIns();
      } else {
        sendActorAction('checkin', member.callsign || '');
        setCurrentSession((prev) => ({ ...prev, total_checkins: (prev.total_checkins || 0) + 1 }));
      }
    } catch (e) { console.error('Check-in error:', e); }
    setBusy(false);
    return result;
  };

  const doCheckOut = async (checkIn) => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke('net-checkin-action', {
        action: 'checkout',
        session_id: currentSession.id,
        checkin_id: checkIn.id,
        callsign: checkIn.callsign || '',
      });
      if (res.data?.error || res.data?.ok === false) {
        throw new Error(res.data.error || 'Check-out failed');
      }
      sendActorAction('checkout', checkIn.callsign || '');
      await loadCheckIns();
    } catch (e) {
      console.error('Check-out error:', e);
      alert(e?.message || 'Unable to check out this station.');
    } finally {
      setBusy(false);
    }
  };

  // Early check-in: type a callsign, and whether they're already on the
  // roster or not, they end up at the bottom of the roster list (early
  // arrivals are moved out of call order once processed) and get checked
  // in immediately. Station Details then pops up so signal report and
  // other info can be filled in after they're marked present.
  const doEarlyCheckIn = async () => {
    const cs = earlyCallsign.trim().toUpperCase();
    if (!cs || earlyBusy) return;
    setEarlyBusy(true);
    try {
      const existing = roster.find((m) => m.callsign?.toUpperCase() === cs);
      let name = existing?.name || '';
      let location = existing?.location || '';
      if (!existing) {
        const profile = await lookupProfileByCallsign(cs);
        name = profile?.name || '';
        location = profile?.location || '';
      }
      // add_roster_member is checkin-tier (not manage-tier), so co-hosts who
      // can only check stations in -- not otherwise edit the roster -- can
      // still early-check-in a station.
      const res = await base44.functions.invoke('net-checkin-action', {
        action: 'add_roster_member',
        session_id: currentSession.id,
        callsign: cs,
        name,
        location,
        position: 'bottom',
      });
      if (res.data?.roster) {
        setCurrentSession((prev) => ({ ...prev, roster_members: JSON.stringify(res.data.roster) }));
      }
      const member = res.data?.member || existing || { callsign: cs, name, location };
      const created = await doCheckIn(member, '');
      setEarlyCallsign('');
      if (created) openStationDetails(created);
    } catch (e) { console.error('Early check-in error:', e); }
    setEarlyBusy(false);
  };

  // Manage roster: build the list of expected stations directly, without
  // checking anyone in yet (that's what Early Check-In / the roster
  // checkmark are for).
  const saveRoster = async (nextRoster) => {
    setRosterBusy(true);
    try {
      await updateSession({ roster_members: JSON.stringify(nextRoster) });
      setCurrentSession((prev) => ({ ...prev, roster_members: JSON.stringify(nextRoster) }));
    } catch (e) { console.error('Roster save error:', e); }
    setRosterBusy(false);
  };

  const addRosterMember = async () => {
    if (!newRosterMember.callsign.trim() || rosterBusy) return;
    const cs = newRosterMember.callsign.trim().toUpperCase();
    let name = newRosterMember.name.trim();
    let location = newRosterMember.location.trim();
    if (!name || !location) {
      const profile = await lookupProfileByCallsign(cs);
      if (profile) {
        name = name || profile.name;
        location = location || profile.location;
      }
    }
    const m = { ...newRosterMember, id: `custom-${Date.now()}`, callsign: cs, name, location, source: 'custom' };
    saveRoster([...roster, m]);
    setNewRosterMember({ callsign: '', name: '', location: '', station_type: '', notes: '' });
  };

  const removeRosterMember = (id) => saveRoster(roster.filter((m) => m.id !== id));

  // Quick Add Member: a fast, single-purpose way to add someone to the
  // roster (not checked in) without opening full roster management. Unlike
  // Early Check-In, which moves an arrival to the bottom of the list, a
  // quick add goes to the top since they're still expected/not yet reached.
  // Routed through the checkin-tier add_roster_member action (not the
  // manage-tier roster save) so check-in operators can use this too.
  const doAddMember = async () => {
    const cs = quickMember.callsign.trim().toUpperCase();
    if (!cs || addMemberBusy) return;
    setAddMemberBusy(true);
    try {
      let name = quickMember.name.trim();
      let location = quickMember.location.trim();
      if (!name || !location) {
        const profile = await lookupProfileByCallsign(cs);
        if (profile) {
          name = name || profile.name;
          location = location || profile.location;
        }
      }
      const res = await base44.functions.invoke('net-checkin-action', {
        action: 'add_roster_member',
        session_id: currentSession.id,
        callsign: cs,
        name,
        location,
        position: 'top',
      });
      if (res.data?.roster) {
        setCurrentSession((prev) => ({ ...prev, roster_members: JSON.stringify(res.data.roster) }));
      }
      setQuickMember({ callsign: '', name: '', location: '' });
      setQuickMemberAutoFilled(false);
    } catch (e) { console.error('Add member error:', e); }
    setAddMemberBusy(false);
  };

  const moveRosterMember = (i, dir) => {
    const arr = [...roster];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    saveRoster(arr);
  };

  const openStationDetails = (ci) => {
    setEditingNotes(ci);
    setNoteText(ci.notes || '');
    setNoteSignalReport(ci.signal_report || '');
    setNoteName(ci.name || '');
    setNoteLocation(ci.location || '');
    setNoteStationType(ci.station_type || '');
  };

  const saveNote = async (checkIn) => {
    setBusy(true);
    try {
      await base44.functions.invoke('net-checkin-action', {
        action: 'update_note',
        session_id: currentSession.id,
        checkin_id: checkIn.id,
        note_text: noteText,
        signal_report: noteSignalReport,
        name: noteName,
        location: noteLocation,
        station_type: noteStationType,
      });
      setEditingNotes(null);
    } catch (e) { console.error('Note error:', e); }
    setBusy(false);
  };

  const updateSession = async (updates) => {
    const res = await base44.functions.invoke('net-session-action', { session_id: currentSession.id, updates });
    const data = res?.data || res;
    if (data?.error || data?.ok === false) {
      throw new Error(data.error || 'The net update was not accepted.');
    }
    return data;
  };

  const startNet = async () => {
    if (!canManage) return;
    try {
      const now = new Date().toISOString();
      await updateSession({ status: 'active', started_at: now });
      setCurrentSession({ ...currentSession, status: 'active', started_at: now });
      try { actorRef.current?.send({ type: 'status_change', status: 'active' }); } catch {}
    } catch (e) { console.error('Start error:', e); }
  };

  const endNet = async () => {
    if (!canManage) return;
    if (!confirm('End this net? Check-ins will be preserved in history.')) return;
    try {
      const now = new Date().toISOString();
      const duration = currentSession.started_at ? Math.floor((new Date(now) - new Date(currentSession.started_at)) / 60000) : 0;
      await updateSession({ status: 'ended', ended_at: now, duration_minutes: duration });
      try { actorRef.current?.send({ type: 'status_change', status: 'ended' }); } catch {}
      onBack();
    } catch (e) { console.error('End error:', e); }
  };

  const syncRoster = async () => {
    if (!canManage || !currentSession.club_id) return;
    setSyncing(true);
    try {
      const members = await base44.entities.Membership.filter({ club_id: currentSession.club_id, status: 'Active' }, '-updated_date', 200);
      const clubMembers = (members || []).map((m) => ({
        id: `club-${m.id}`, callsign: m.member_callsign || '', name: m.member_name || '',
        club_role: m.role || 'Member', membership_status: m.status || 'Active', source: 'club',
      }));
      const customMembers = roster.filter((m) => m.source === 'custom');
      const allMembers = [...clubMembers, ...customMembers];
      await updateSession({
        roster_members: JSON.stringify(allMembers),
        roster_last_sync: new Date().toISOString(),
      });
      setCurrentSession({ ...currentSession, roster_members: JSON.stringify(allMembers), roster_last_sync: new Date().toISOString() });
    } catch (e) { console.error('Sync error:', e); }
    setSyncing(false);
  };

  const toggleActivationMode = async () => {
    if (!canManage || busy) return;
    const next = !currentSession.emergency_mode;
    setBusy(true);
    try {
      const updates = { emergency_mode: next };
      if (next && !currentSession.emergency_positions) updates.emergency_positions = JSON.stringify([]);
      await updateSession(updates);
      setCurrentSession((prev) => ({ ...prev, ...updates }));
      setActionMsg({
        by: user?.full_name || user?.callsign || 'Net Control',
        byCallsign: user?.callsign || '',
        action: next ? 'activation_mode_on' : 'activation_mode_off',
        callsign: next ? 'Emergency / Activation Mode' : 'Emergency / Activation Mode',
        id: Date.now(),
      });
      setTimeout(() => setActionMsg(null), 4000);
      try { actorRef.current?.send({ type: 'activation_mode', enabled: next }); } catch {}
    } catch (e) {
      console.error('Activation mode error:', e);
      alert(e?.message || 'Unable to change Emergency / Activation Mode.');
    } finally {
      setBusy(false);
    }
  };

  const addLivePosition = async () => {
    if (!canManage) return;
    const next = [...emergencyPositions, { id: `pos-${Date.now()}`, name: '', callsign: '', scheduled_time: '' }];
    try {
      const updates = { emergency_positions: JSON.stringify(next), emergency_mode: true };
      await updateSession(updates);
      setCurrentSession((prev) => ({ ...prev, ...updates }));
    } catch (e) { console.error('Activation position error:', e); }
  };

  const updateLivePosition = async (id, field, value) => {
    if (!canManage) return;
    const next = emergencyPositions.map((p) => p.id === id ? { ...p, [field]: value } : p);
    try {
      const updates = { emergency_positions: JSON.stringify(next) };
      await updateSession(updates);
      setCurrentSession((prev) => ({ ...prev, ...updates }));
    } catch (e) { console.error('Activation position update error:', e); }
  };

  const removeLivePosition = async (id) => {
    if (!canManage) return;
    const next = emergencyPositions.filter((p) => p.id !== id);
    try {
      const updates = { emergency_positions: JSON.stringify(next) };
      await updateSession(updates);
      setCurrentSession((prev) => ({ ...prev, ...updates }));
    } catch (e) { console.error('Activation position remove error:', e); }
  };

  const addLiveActivation = async () => {
    if (!canManage || !activationForm.title.trim()) return;
    const current = parseJsonArray(currentSession.activation_events);
    const item = {
      id: crypto.randomUUID(),
      ...activationForm,
      created_at: new Date().toISOString(),
      created_by: user?.full_name || user?.callsign || 'Net Control',
    };
    const updates = { activation_events: JSON.stringify([...current, item]), emergency_mode: true };
    try {
      await updateSession(updates);
      setCurrentSession((prev) => ({ ...prev, ...updates }));
      setActivationForm({ title: '', details: '', priority: 'Routine', agency: '', contact: '' });
    } catch (e) { console.error('Activation event error:', e); }
  };

  const setScriptSection = async (sectionKey) => {
    if (!canAct) return;
    setActiveSection(sectionKey);
    try {
      await updateSession({ current_script_section: sectionKey });
      try { actorRef.current?.send({ type: 'script_section', section: sectionKey }); } catch {}
    } catch (e) { console.error('Script section error:', e); }
  };

  const activeCount = checkIns.filter((c) => c.status === 'checked_in').length;
  const totalCheckIns = checkIns.length;
  const totalNotCheckedIn = Math.max(roster.length - activeCount, 0);
  const freq = currentSession.frequency ? `${formatFreq(currentSession.frequency)} MHz` : currentSession.channel ? `CH ${currentSession.channel}` : '—';
  const hasNetLocation = Number.isFinite(Number(currentSession.latitude)) && Number.isFinite(Number(currentSession.longitude));

  const netStatusDotClass = currentSession.status === 'active'
    ? 'bg-green-500'
    : currentSession.status === 'scheduled'
      ? 'bg-blue-500'
      : 'bg-gray-400';

  const overduePositions = emergencyPositions.filter((p) => {
    if (!p.scheduled_time || !p.callsign) return false;
    const now = new Date();
    const [h, m] = p.scheduled_time.split(':').map(Number);
    const scheduled = new Date(currentSession.started_at || currentSession.scheduled_date || now);
    scheduled.setHours(h, m, 0, 0);
    return now > scheduled && !checkedInCallsigns.has(p.callsign?.toUpperCase());
  });

  return (
    <div className="min-h-full bg-background p-3 sm:p-4 lg:p-5 max-w-[1700px] mx-auto space-y-4">
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-orange-500" />
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap p-3 sm:p-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
        <div className="flex-1 min-w-[180px]">
          <h1 className="text-xl font-heading font-bold flex items-center gap-2">
            {currentSession.name}
            <Badge className={currentSession.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'}>
              {currentSession.status}
            </Badge>
            {isPrimary && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Crown className="w-3 h-3 mr-1" />Primary</Badge>}
            {!isPrimary && myPermission && (
              <Badge className={PERMISSION_COLORS[myPermission] || ''}>{PERMISSION_LABELS[myPermission] || myPermission}</Badge>
            )}
          </h1>
          <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap mt-1">
            <span className="flex items-center gap-1"><Radio className="w-3 h-3" />{freq}</span>
            {currentSession.tone && <span>Tone: {currentSession.tone}</span>}
            {currentSession.repeater_name && <span>Rpt: {currentSession.repeater_name}</span>}
            {currentSession.location && <span>{currentSession.location}</span>}
            <span className="inline-flex items-center gap-1.5">Op: {currentSession.operator_callsign || currentSession.operator_name || '—'}<StaffTag userId={currentSession.primary_user_id} callsign={currentSession.primary_user_id ? undefined : currentSession.operator_callsign} /></span>
          </div>
        </div>
        {canHost && (
          <Button variant="outline" size="sm" onClick={() => setShowShare(true)}>
            <Share2 className="w-4 h-4 mr-1" />Share
          </Button>
        )}
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setShowEditNet(true)}>
            <Settings2 className="w-4 h-4 mr-1" />Edit Net
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setShowHosts(true)}>
          <Settings2 className="w-4 h-4 mr-1" />Hosts
        </Button>
        <Button variant="outline" size="sm" onClick={popOut}>
          <ExternalLink className="w-4 h-4 mr-1" />Map
        </Button>
        {currentSession.status === 'scheduled' && canManage && <Button onClick={startNet}><Play className="w-4 h-4 mr-1" />Start Net</Button>}
        {currentSession.status === 'active' && canManage && <Button variant="destructive" onClick={endNet}><Square className="w-4 h-4 mr-1" />End Net</Button>}
      </div>
      </div>

      {/* Live session status */}
      <LiveSessionStatus operators={connectedOps} myUserId={user?.id} />

      {/* Action toast */}
      {actionMsg && (
        <Card className="p-2 px-3 bg-primary/5 border-primary/30 text-sm flex items-center gap-2 animate-fade-in">
          <Radio className="w-4 h-4 text-primary" />
          <span><strong>{actionMsg.byCallsign || actionMsg.by}</strong> {actionMsg.action === 'checkin' ? 'checked in' : actionMsg.action === 'checkout' ? 'checked out' : actionMsg.action === 'activation_mode_on' ? 'activated' : actionMsg.action === 'activation_mode_off' ? 'deactivated' : 'added guest'} <strong>{actionMsg.callsign}</strong></span>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-3 bg-muted/30">
          <div className="flex items-center gap-1.5"><div className="text-xs text-muted-foreground">Net Status</div><TooltipHint>The current status of this Net Control event.</TooltipHint></div>
          <div className="text-lg font-heading font-bold uppercase flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${netStatusDotClass}`} />
            {currentSession.status}
          </div>
        </Card>
        <Card className="p-3"><div className="flex items-center gap-1.5"><div className="text-xs text-muted-foreground">Operators Connected</div><TooltipHint>Net Control operators currently connected to the live session.</TooltipHint></div><div className="text-2xl font-heading font-bold text-green-600">{connectedOps.length}</div></Card>
        <Card className="p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1.5"><div className="text-xs text-muted-foreground">Total Check-ins</div><TooltipHint>Stations currently checked in to this net.</TooltipHint></div>
              <div className="text-2xl font-heading font-bold text-green-600">{activeCount}</div>
            </div>
            <div className="border-l pl-3">
              <div className="flex items-center gap-1.5"><div className="text-xs text-muted-foreground">Total Not Checked-In</div><TooltipHint>Roster stations that are not currently checked in.</TooltipHint></div>
              <div className="text-2xl font-heading font-bold text-amber-600">{totalNotCheckedIn}</div>
            </div>
          </div>
        </Card>
        <Card className="p-3"><div className="flex items-center gap-1.5"><div className="text-xs text-muted-foreground">Net Duration</div><TooltipHint>Elapsed time since this net started.</TooltipHint></div><div className="text-2xl font-heading font-bold">{fmtDuration(currentSession.started_at, currentSession.ended_at)}</div></Card>
        <Card className="p-3"><div className="flex items-center gap-1.5"><div className="text-xs text-muted-foreground">Roster Size</div><TooltipHint>Total stations currently listed in the net roster.</TooltipHint></div><div className="text-2xl font-heading font-bold">{roster.length}</div></Card>
      </div>

      {/* Active Net Control Map + Emergency / Activation + Quick Add */}
      <div className="grid lg:grid-cols-5 gap-3 items-start">
        <Card className="rounded-xl shadow-sm overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-green-500" />
              <div className="flex items-center gap-1.5"><div><h2 className="text-sm font-heading font-semibold uppercase tracking-wide">Active Net Control Map</h2><p className="text-xs text-muted-foreground">Live operating position for this net</p></div><TooltipHint>Shows the live Net Control position and map locations for participating stations and operators.</TooltipHint></div>
            </div>
            {hasNetLocation ? <Badge variant="outline" className="text-green-600 border-green-300"><MapPin className="w-3 h-3 mr-1" />Position set</Badge> : <Badge variant="outline">No coordinates</Badge>}
          </div>
          <div className="h-[280px] sm:h-[340px] bg-muted/20">
            <NetControlMapCard session={currentSession} checkIns={checkIns} hosts={hosts} hostLocations={hostLocations} />
          </div>
        </Card>

        {/* Emergency / Activation */}
        <Card className={`rounded-xl shadow-sm overflow-hidden lg:col-span-2 ${currentSession.emergency_mode ? 'border-amber-400' : ''}`}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2"><span className={`w-1.5 h-5 rounded-full ${currentSession.emergency_mode ? 'bg-amber-500' : 'bg-muted-foreground/40'}`} /><div><h2 className="text-sm font-heading font-semibold uppercase tracking-wide">Emergency / Activation</h2><p className="text-xs text-muted-foreground">Activate this live net when an emergency or activation event is underway.</p></div></div>
            {canManage && <Button size="sm" variant={currentSession.emergency_mode ? 'destructive' : 'outline'} onClick={toggleActivationMode} disabled={busy} title={currentSession.emergency_mode ? 'Turn off Emergency / Activation Mode for this live net.' : 'Activate Emergency / Activation Mode for this live net.'}><AlertTriangle className="w-4 h-4 mr-1" />{busy ? 'Updating…' : currentSession.emergency_mode ? 'Deactivate Mode' : 'Activate Mode'}</Button>}
          </div>
          {currentSession.emergency_mode && <div className="p-4 space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3"><div className="font-semibold text-sm text-amber-800 dark:text-amber-200">LIVE ACTIVATION MODE</div><div className="text-xs text-amber-700 dark:text-amber-300 mt-1">This activation is attached to the current live Net Control event.</div></div>
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5"><Label className="font-semibold">Position Assignments</Label><TooltipHint>Track assigned positions, callsigns, scheduled times, and live check-in status during an activation.</TooltipHint></div>
                  <p className="text-xs text-muted-foreground">Add and manage assignments directly in the live activation.</p>
                </div>
                {canManage && <Button size="sm" variant="outline" onClick={addLivePosition}><UserPlus className="w-4 h-4 mr-1" />Add Position<TooltipHint side="right">Add another response or operating position to the live activation.</TooltipHint></Button>}
              </div>
              {emergencyPositions.length > 0 ? (
                <div className="space-y-1.5">
                  {emergencyPositions.map((p) => {
                    const ci = p.callsign ? checkInMap.get(p.callsign.toUpperCase()) : null;
                    const isOverdue = overduePositions.some((o) => o.id === p.id);
                    return (
                      <div key={p.id} className={`grid grid-cols-2 sm:grid-cols-12 gap-2 items-center rounded-lg border p-2 ${isOverdue ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : ''}`}>
                        <Input className="col-span-2 sm:col-span-4" value={p.name || ''} onChange={(e) => updateLivePosition(p.id, 'name', e.target.value)} placeholder="Position name" disabled={!canManage} />
                        <Input className="col-span-2 sm:col-span-3" value={p.callsign || ''} onChange={(e) => updateLivePosition(p.id, 'callsign', e.target.value.toUpperCase())} placeholder="Callsign" disabled={!canManage} />
                        <Input className="col-span-1 sm:col-span-2" type="time" value={p.scheduled_time || ''} onChange={(e) => updateLivePosition(p.id, 'scheduled_time', e.target.value)} disabled={!canManage} />
                        <div className="col-span-1 sm:col-span-2 flex justify-center">{ci ? <Badge className="bg-green-100 text-green-700">In</Badge> : <Badge variant="outline">Pending</Badge>}</div>
                        {canManage && <Button size="icon" variant="ghost" className="col-span-2 sm:col-span-1" onClick={() => removeLivePosition(p.id)}><span className="text-destructive">×</span></Button>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No position assignments yet. Use Add Position to assign stations for this live activation.</p>
              )}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
              <div className="flex items-center gap-1.5"><Input placeholder="Activation title *" title="Give this live activation event a short identifying title." value={activationForm.title} onChange={(e) => setActivationForm((v) => ({ ...v, title: e.target.value }))} /></div>
              <div className="flex items-center gap-1.5"><Input placeholder="Agency / group" title="Optional agency, organization, or group involved in the activation." value={activationForm.agency} onChange={(e) => setActivationForm((v) => ({ ...v, agency: e.target.value }))} /></div>
              <div className="flex items-center gap-1.5"><Input placeholder="Priority" title="Set the priority used to organize this activation event." value={activationForm.priority} onChange={(e) => setActivationForm((v) => ({ ...v, priority: e.target.value }))} /></div>
              <div className="flex items-center gap-1.5"><Input placeholder="Contact / frequency" title="Optional contact information or operating frequency related to the activation." value={activationForm.contact} onChange={(e) => setActivationForm((v) => ({ ...v, contact: e.target.value }))} /></div>
              <Button onClick={addLiveActivation} disabled={!activationForm.title.trim()} title="Save this activation information to the current live net event.">Add to Live Event</Button>
            </div>
            <div className="relative"><TooltipHint className="absolute right-2 top-2 z-10">Record situation details or notes that other connected operators need to see.</TooltipHint><Textarea placeholder="Activation details / situation notes" value={activationForm.details} onChange={(e) => setActivationForm((v) => ({ ...v, details: e.target.value }))} rows={2} /></div>
            {parseJsonArray(currentSession.activation_events).map((item) => <div key={item.id} className="rounded-lg border p-3 flex gap-3"><AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /><div className="flex-1"><div className="font-semibold text-sm">{item.title} <Badge variant="outline" className="ml-1">{item.priority}</Badge></div><div className="text-xs text-muted-foreground mt-1">{item.details}</div><div className="text-[11px] text-muted-foreground mt-1">{item.agency}{item.contact ? ` · ${item.contact}` : ''} · {fmtTime(item.created_at)}</div></div></div>)}
          </div>}
        </Card>

        {/* Quick Add */}
        {canAct && (
          <Card className="rounded-xl shadow-sm overflow-hidden h-full lg:col-span-1">
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
              <UserPlus className="w-4 h-4 text-primary" />
              <div>
                <h2 className="text-sm font-heading font-semibold uppercase tracking-wide flex items-center gap-1.5">Quick Add<TooltipHint>Use Quick Add to place a station on the roster without checking it in.</TooltipHint></h2>
                <p className="text-xs text-muted-foreground">Add a station to the top of the roster without checking them in.</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="relative">
                <Input
                  placeholder="Callsign"
                  title="Enter the station callsign. Member information may be filled automatically."
                  value={quickMember.callsign}
                  onChange={(e) => { setQuickMember({ ...quickMember, callsign: e.target.value.toUpperCase() }); setQuickMemberAutoFilled(false); }}
                />
                {quickMemberLookup && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              <div className="grid gap-2">
                <Input placeholder="Name" title="Optional operator name." value={quickMember.name} onChange={(e) => setQuickMember({ ...quickMember, name: e.target.value })} />
                <Input placeholder="Location" title="Optional station location." value={quickMember.location} onChange={(e) => setQuickMember({ ...quickMember, location: e.target.value })} />
              </div>
              {quickMemberAutoFilled && <p className="text-xs text-success flex items-center gap-1"><Check className="w-3 h-3" />Member info auto-filled from callsign.</p>}
              <Button className="w-full" onClick={doAddMember} disabled={addMemberBusy || !quickMember.callsign.trim()} title="Add this station to the roster without checking them in.">
                {addMemberBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
                Add to Roster
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* View-only banner */}
      {!canAct && (
        <Card className="p-3 border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700">
          <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <Lock className="w-4 h-4" />
            You have view-only access. You can observe the live session but cannot make changes.
          </div>
        </Card>
      )}

      {/* Emergency alerts */}
      {currentSession.emergency_mode && overduePositions.length > 0 && (
        <Card className="p-3 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-medium text-sm">
            <AlertTriangle className="w-4 h-4" />Overdue Assignments
          </div>
          <div className="text-xs mt-1 text-amber-600 dark:text-amber-400">
            {overduePositions.map((p) => `${p.name}: ${p.callsign} (expected ${p.scheduled_time})`).join(', ')}
          </div>
        </Card>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {currentSession.club_id && (
          <Button variant="outline" onClick={syncRoster} disabled={syncing || !canManage}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}Sync
          </Button>
        )}
        <Button variant="outline" onClick={() => setShowScript(!showScript)} title={showScript ? 'Hide the Net Control script.' : 'Open the Net Control script.'}><FileText className="w-4 h-4 mr-1" />Script<TooltipHint side="top">Open the operator script and sync the active section with connected operators.</TooltipHint></Button>
        {canManage && <Button variant="outline" onClick={() => setShowRoster(true)}><Users className="w-4 h-4 mr-1" />Manage Roster<TooltipHint side="top">Edit, reorder, add, or remove stations from the net roster.</TooltipHint></Button>}
      </div>

      {/* Script with section sync */}
      {showScript && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-semibold text-sm flex items-center gap-1.5">Net Control Script<TooltipHint>Click a script section to make it the current shared section for connected operators.</TooltipHint></h3>
            {canAct && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">Click a section to sync with all operators<TooltipHint>Changing the active section updates the shared operator view.</TooltipHint></span>
            )}
          </div>
          {/* Section selector */}
          <div className="flex flex-wrap gap-1.5">
            {SCRIPT_SECTIONS.filter((s) => currentSession[s.key]).map((s) => (
              <button
                key={s.key}
                onClick={() => setScriptSection(s.key)}
                disabled={!canAct}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  activeSection === s.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-accent text-muted-foreground'
                } ${!canAct ? 'cursor-default opacity-70' : ''}`}
              >
                {s.label}
                {activeSection === s.key && <span className="ml-1">●</span>}
              </button>
            ))}
          </div>
          {/* Active section content */}
          {SCRIPT_SECTIONS.filter((s) => s.key === activeSection && currentSession[s.key]).map((s) => (
            <div key={s.key} className="rounded-lg border p-3 bg-muted/30">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">{s.label}</Label>
              <p className="text-sm whitespace-pre-wrap mt-1">{currentSession[s.key]}</p>
            </div>
          ))}
          {/* All sections (collapsible) */}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show all sections<TooltipHint side="right">Expand the complete script so you can review every section.</TooltipHint></summary>
            <div className="space-y-2 mt-2">
              {SCRIPT_SECTIONS.filter((s) => currentSession[s.key] && s.key !== activeSection).map((s) => (
                <div key={s.key}>
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">{s.label}</Label>
                  <p className="text-sm whitespace-pre-wrap mt-1">{currentSession[s.key]}</p>
                </div>
              ))}
            </div>
          </details>
        </Card>
      )}

      {/* Net log + roster, side by side at the bottom */}
      <div className="grid lg:grid-cols-5 gap-3 items-start">
        {/* Net log — left */}
        <Card className="rounded-xl shadow-sm overflow-hidden order-2 lg:order-1 lg:col-span-1">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-heading font-semibold uppercase tracking-wide">Net Log</h2>
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y">
            {activityLog.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">No activity yet.</p>
            ) : (
              activityLog.map((entry) => (
                <div key={entry.id} className="px-4 py-2 text-sm flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className={entry.type === 'in' ? 'text-green-600' : 'text-muted-foreground'}>
                      {entry.type === 'in' ? '✓' : '·'}
                    </span>{' '}
                    <strong>{entry.callsign}</strong> <StaffTag callsign={entry.callsign} compact /> {entry.type === 'in' ? 'checked in' : 'checked out'}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtTime(entry.time)}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Roster check-in list — right */}
        <div className="space-y-2 order-1 lg:order-2 lg:col-span-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search roster…" title="Search the roster by callsign or operator name." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" />Loading roster…</div>
      ) : (
        <>
          {filteredRoster.length === 0 && filteredGuests.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              {roster.length === 0 ? 'No roster. Use Early Check-In to add stations and start tracking check-ins.' : 'No stations match your search.'}
            </Card>
          ) : (
            <>
              {filteredRoster.map((m) => {
                const ci = checkInMap.get(m.callsign?.toUpperCase());
                const isCheckedIn = ci && ci.status === 'checked_in';
                return (
                  <Card key={m.id} className={`p-3 flex items-center gap-3 ${isCheckedIn ? 'border-green-300 dark:border-green-700' : ''}`}>
                    <Button
                      size="sm"
                      variant={isCheckedIn ? 'outline' : 'default'}
                      onClick={async () => {
                        if (!canAct || busy) return;
                        if (isCheckedIn) {
                          await doCheckOut(ci);
                          return;
                        }
                        const created = await doCheckIn(m, '');
                        if (created) openStationDetails(created);
                      }}
                      disabled={!canAct || busy}
                      className="shrink-0"
                      title={isCheckedIn ? 'Check this station out of the net.' : 'Check this station into the net.'}
                    >
                      {isCheckedIn ? 'Check Out' : 'Check In'}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{m.callsign}</span><StaffTag callsign={m.callsign} />
                        {m.name && <span className="text-muted-foreground text-sm">{m.name}</span>}
                        {m.source === 'club' && m.club_role && <Badge variant="outline" className="text-xs">{m.club_role}</Badge>}
                        {m.source === 'custom' && <Badge variant="outline" className="text-xs">Custom</Badge>}
                        {ci?.checked_in_by_name && <Badge variant="outline" className="text-xs text-primary gap-1">by {ci.checked_in_by_name}<StaffTag userId={ci.checked_in_by_user_id} compact /></Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                        {m.location && <span>{m.location}</span>}
                        {m.station_type && <span>· {m.station_type}</span>}
                        {ci && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />In: {fmtTime(ci.check_in_time)}</span>}
                        {ci?.check_out_time && <span className="text-muted-foreground">Out: {fmtTime(ci.check_out_time)}</span>}
                        {ci?.notes && <span className="italic">· <Linkify text={ci.notes} /></span>}
                      </div>
                    </div>
                    {ci && canAct && (
                      <Button size="sm" variant="ghost" onClick={() => openStationDetails(ci)}>
                        <FileText className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </Card>
                );
              })}
              {filteredGuests.map((ci) => (
                <Card key={ci.id} className="p-3 flex items-center gap-3 border-primary/30 bg-primary/5">
                  <Button
                    size="sm"
                    variant={ci.status === 'checked_in' ? 'outline' : 'default'}
                    onClick={async () => {
                      if (!canAct || busy) return;
                      if (ci.status === 'checked_in') {
                        await doCheckOut(ci);
                        return;
                      }
                      const created = await doCheckIn(ci, '');
                      if (created) openStationDetails(created);
                    }}
                    disabled={!canAct || busy}
                    className="shrink-0"
                  >
                    {ci.status === 'checked_in' ? 'Check Out' : 'Check In'}
                  </Button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{ci.callsign}</span><StaffTag callsign={ci.callsign} />
                      {ci.name && <span className="text-muted-foreground text-sm">{ci.name}</span>}
                      <Badge variant="outline" className="text-xs text-primary">Guest</Badge>
                      {ci.checked_in_by_name && <Badge variant="outline" className="text-xs text-primary gap-1">by {ci.checked_in_by_name}<StaffTag userId={ci.checked_in_by_user_id} compact /></Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                      {ci.location && <span>{ci.location}</span>}
                      {ci.station_type && <span>· {ci.station_type}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />In: {fmtTime(ci.check_in_time)}</span>
                      {ci.check_out_time && <span>Out: {fmtTime(ci.check_out_time)}</span>}
                      {ci.notes && <span className="italic">· <Linkify text={ci.notes} /></span>}
                    </div>
                  </div>
                  {canAct && <Button size="sm" variant="ghost" onClick={() => openStationDetails(ci)}><FileText className="w-3.5 h-3.5" /></Button>}
                </Card>
              ))}
            </>
          )}
        </>
          )}
        </div>

        {/* Early Check-In */}
        {canAct && (
          <Card className="rounded-xl shadow-sm overflow-hidden h-full lg:col-span-1 lg:order-3">
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
              <UserCheck className="w-4 h-4 text-primary" />
              <div>
                <h2 className="text-sm font-heading font-semibold uppercase tracking-wide">Early Check-In</h2>
                <p className="text-xs text-muted-foreground">Check a station in now, even if it is not on the roster.</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <Input
                placeholder="Callsign"
                value={earlyCallsign}
                onChange={(e) => setEarlyCallsign(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') doEarlyCheckIn(); }}
              />
              <Button className="w-full" onClick={doEarlyCheckIn} disabled={earlyBusy || !earlyCallsign.trim()}>
                {earlyBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserCheck className="w-4 h-4 mr-1" />}
                Check In
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Manage roster */}
      {showRoster && (
        <BodyPortal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setShowRoster(false)}>
            <Card className="p-4 w-full max-w-lg max-h-[85vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2"><Users className="w-4 h-4" />Roster ({roster.length})</Label>
                <Button size="sm" variant="ghost" onClick={() => setShowRoster(false)}>Close</Button>
              </div>
              <Card className="p-3 space-y-2">
                <div className="grid sm:grid-cols-2 gap-2">
                  <Input placeholder="Callsign *" value={newRosterMember.callsign} onChange={(e) => setNewRosterMember({ ...newRosterMember, callsign: e.target.value })} />
                  <Input placeholder="Name" value={newRosterMember.name} onChange={(e) => setNewRosterMember({ ...newRosterMember, name: e.target.value })} />
                  <Input placeholder="Location" value={newRosterMember.location} onChange={(e) => setNewRosterMember({ ...newRosterMember, location: e.target.value })} />
                  <Input placeholder="Station type" value={newRosterMember.station_type} onChange={(e) => setNewRosterMember({ ...newRosterMember, station_type: e.target.value })} />
                </div>
                <Button size="sm" onClick={addRosterMember} disabled={rosterBusy || !newRosterMember.callsign.trim()}>
                  {rosterBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Add to Roster
                </Button>
              </Card>
              {roster.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No roster members yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {roster.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                      <div className="flex flex-col">
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moveRosterMember(i, -1)} disabled={rosterBusy || i === 0}><ArrowUp className="w-3 h-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moveRosterMember(i, 1)} disabled={rosterBusy || i === roster.length - 1}><ArrowDown className="w-3 h-3" /></Button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{m.callsign}</span><StaffTag callsign={m.callsign} />
                        {m.name && <span className="text-muted-foreground ml-2">{m.name}</span>}
                        {m.location && <span className="text-muted-foreground ml-2 text-xs">· {m.location}</span>}
                        {m.source === 'club' && <Badge variant="outline" className="text-xs ml-2">Club</Badge>}
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeRosterMember(m.id)} disabled={rosterBusy}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </BodyPortal>
      )}


      {/* Notes editor dialog */}
      {editingNotes && (
        <BodyPortal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setEditingNotes(null)}>
            <Card className="p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
              <Label>Station details for {editingNotes.callsign}</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input value={noteName} onChange={(e) => setNoteName(e.target.value)} placeholder="Operator name" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Station type</Label>
                  <Input value={noteStationType} onChange={(e) => setNoteStationType(e.target.value)} placeholder="Base, mobile, handheld…" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Location</Label>
                <Input value={noteLocation} onChange={(e) => setNoteLocation(e.target.value)} placeholder="City, state" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Signal report</Label>
                <div className="flex items-center gap-2 mt-1">
                  <select
                    value={noteSignalReport}
                    onChange={(e) => setNoteSignalReport(e.target.value)}
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm font-mono"
                  >
                    <option value="">Select signal report…</option>
                    {SIGNAL_REPORT_OPTIONS.map((report) => <option key={report} value={report}>{signalTier(report).dot} {report}</option>)}
                  </select>
                  {noteSignalReport && (
                    <span className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-bold font-mono ${signalTier(noteSignalReport).badge}`}>
                      {noteSignalReport}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder="Add station notes…" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setEditingNotes(null)}>Cancel</Button>
                <Button size="sm" onClick={() => saveNote(editingNotes)} disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}Save Note
                </Button>
              </div>
            </Card>
          </div>
        </BodyPortal>
      )}

      {/* Share dialog */}
      <ShareNetControlDialog
        open={showShare}
        onClose={() => setShowShare(false)}
        session={currentSession}
        onShared={() => loadHostInfo()}
      />

      {/* Edit active Net Control */}
      <CreateNetDialog
        open={showEditNet}
        editingNet={currentSession}
        onClose={() => setShowEditNet(false)}
        user={user}
        onCreated={(saved) => {
          setShowEditNet(false);
          if (saved) setCurrentSession((prev) => ({ ...prev, ...saved }));
        }}
      />

      {/* Host management panel */}
      <HostManagementPanel
        open={showHosts}
        onClose={() => setShowHosts(false)}
        session={currentSession}
        user={user}
        onChanged={() => loadHostInfo()}
      />
    </div>
  );
}