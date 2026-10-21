import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, ConnectionState, DisconnectReason } from 'livekit-client';
import { base44 } from '@/api/base44Client';
import { errMsg } from '@/lib/utils';
import { createRadioVoiceChain, createRadioTransmitChain, playRogerBeep, setRogerBeepVolume, ROGER_BEEP_DEFAULT } from '@/lib/radioAudioEffect';

// Drives one web-radio channel connection end to end: fetches a fresh,
// server-verified session (issue-radio-session -- see that function for why
// nothing here is trusted from the client alone), joins the LiveKit room for
// audio, and tracks floor control (who's allowed to transmit right now) via
// radio-ptt + a RadioFloorState entity subscription rather than a Base44
// Actor. An Actor was the original design here, but it turned out to accept
// WebSocket connections fine while never delivering a response to any
// message sent to it -- confirmed by direct testing at every transport
// layer, with nothing visible client-side to explain why. That's a
// platform-level dead end for this app, not something fixable from
// application code, so floor control was rebuilt entirely on primitives
// already proven to work elsewhere in this codebase: a plain HTTP function
// (radio-ptt) for grant/release/moderate, and entity realtime subscriptions
// (the same mechanism NetControlCheckIn already uses) for broadcasting the
// result to everyone. Presence (who's connected) comes straight from
// LiveKit's own participant list + metadata, needing no separate system.
//
// PTT never publishes a mic track until radio-ptt has actually granted the
// floor (see requestPTT), and every remote track is a listener LiveKit
// itself already told us is a legitimate room participant.
//
const HOLD_TTL_MS = 30_000; // must match radio-ptt's HOLD_TTL_MS
const RENEW_MS = 8_000; // comfortably inside HOLD_TTL_MS
const SESSION_REFRESH_MS = 4 * 60 * 1000; // LiveKit token TTL is 5m
// A floor row for this user that shows up this soon after the PTT button was
// let go is a late grant from a quick tap, not a real transmission.
const LATE_GRANT_WINDOW_MS = 10_000;
// Like a real radio's time-out timer: a stuck key can't hold a channel forever.
const MAX_TRANSMIT_MS = 3 * 60 * 1000;
// Renew failures (network blips) tolerated before giving up the floor; the
// server keeps the grant for HOLD_TTL_MS, so 2 misses still fits inside it.
const MAX_RENEW_FAILURES = 2;
// Auto-reconnect backoff after LiveKit gives up: 1.5s, 3s, 6s ... capped at
// 30s. The count resets once a connection has stayed up this long.
const RETRY_BASE_MS = 1500;
const RETRY_MAX_MS = 30_000;
const RETRY_STABLE_MS = 30_000;

function parseParticipantMeta(p) {
  try {
    const m = JSON.parse(p?.metadata || '{}');
    return {
      callsign: m.callsign || null,
      displayName: m.displayName || p?.name || p?.identity || 'Member',
      canTransmit: !!m.canTransmit,
      canModerate: !!m.canModerate,
      userId: m.userId || p?.identity || null,
      sessionType: m.sessionType || 'radio',
    };
  } catch {
    return { callsign: null, displayName: p?.name || p?.identity || 'Member', canTransmit: false, canModerate: false, userId: p?.identity || null, sessionType: 'radio' };
  }
}

export default function useRadioSession(channelId, audioOptions = {}) {
  const [status, setStatus] = useState('idle'); // idle|connecting|listening|receiving|transmitting|busy|disconnected|error
  const [participants, setParticipants] = useState([]);
  const [pttHolder, setPttHolder] = useState(null);
  const [session, setSession] = useState(null); // { userId, callsign, displayName, canTransmit, canModerate, sessionType }
  const [error, setError] = useState('');
  const retryCountRef = useRef(0);
  const lastConnectedAtRef = useRef(0);

  const liveKitRoomRef = useRef(null);
  const audioElsRef = useRef(new Map()); // participantIdentity -> { trackSid, el, filter, setVolume, disconnect }
  const audioCtxRef = useRef(null);
  const audioUnlockCleanupRef = useRef(null);
  const settingsVolumeRef = useRef(80);
  const speakerDeviceIdRef = useRef(audioOptions.speakerDeviceId || ''); // read inside TrackSubscribed, which is only (re)registered per connection
  const radioDspRef = useRef(audioOptions.radioDsp);
  const txDspChainRef = useRef(null);
  const txRawStreamRef = useRef(null);
  const txPublishedTrackRef = useRef(null);
  // Incremented on every PTT press/release boundary. Any async grant, mic
  // startup, or LiveKit publish that belongs to an older generation is stale
  // and must clean itself up instead of re-keying the radio after the user
  // already let go.
  const pttGenerationRef = useRef(0);
  const rogerBeepRef = useRef({ enabled: audioOptions.rogerBeepEnabled !== false, style: audioOptions.rogerBeepStyle || ROGER_BEEP_DEFAULT, customUrl: audioOptions.rogerBeepCustomUrl || null });
  const localHoldingRef = useRef(false);
  const pttRequestInFlightRef = useRef(false); // prevents a quick re-press racing a grant still being cancelled
  const sessionRef = useRef(null); // latest session, for callbacks that shouldn't re-subscribe on every refresh
  const radioSessionIdRef = useRef(''); // unique LiveKit connection identity for this radio session
  const pttInvoke = useCallback((payload = {}) => base44.functions.invoke('radio-ptt', {
    radio_session_id: radioSessionIdRef.current || sessionRef.current?.radioSessionId || '',
    radio_callsign: sessionRef.current?.radioCallsign || '',
    ...payload,
  }), []);
  const renewIntervalRef = useRef(null);
  const sessionRefreshIntervalRef = useRef(null);
  const floorUnsubRef = useRef(null);
  const floorPollIntervalRef = useRef(null);
  const mutedUserIdsRef = useRef(new Set());
  const hadHolderRef = useRef(false); // for detecting the "someone just released" transition (roger beep)
  const floorRowIdRef = useRef(null); // this channel's live RadioFloorState row id, if any -- see the 'delete' event handling below
  const floorHolderIdRef = useRef(null); // mirrors pttHolder.userId, read synchronously by the poll fallback below
  const lastReleasedRowIdRef = useRef(null); // most recently superseded row id -- see applyFloorRow's grant branch below
  const releasePTTRef = useRef(() => {}); // lets requestPTT's renew loop call releasePTT, which is defined after it
  const reconnectTimerRef = useRef(null);
  const reconnectInFlightRef = useRef(false);
  const refreshAfterTransmitRef = useRef(false);
  const lastLocalReleaseAtRef = useRef(0); // when the PTT button/key last went up -- see applyFloorRow's late-grant check
  const connectedChannelIdRef = useRef(null);
  const resolvedChannelIdRef = useRef(channelId); // which channel a live room connection is actually for -- read by cleanup() below to release the floor server-side if the widget closes (or the channel changes) mid-transmission

  const clearRenew = useCallback(() => {
    if (renewIntervalRef.current) { clearInterval(renewIntervalRef.current); renewIntervalRef.current = null; }
  }, []);

  const cleanup = useCallback(() => {
    pttGenerationRef.current += 1;
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    reconnectInFlightRef.current = false;
    refreshAfterTransmitRef.current = false;
    clearRenew();
    if (sessionRefreshIntervalRef.current) { clearInterval(sessionRefreshIntervalRef.current); sessionRefreshIntervalRef.current = null; }
    if (floorPollIntervalRef.current) { clearInterval(floorPollIntervalRef.current); floorPollIntervalRef.current = null; }
    try { floorUnsubRef.current?.(); } catch { /* noop */ }
    floorUnsubRef.current = null;
    // Disconnecting the LiveKit room already stops the local mic track (no
    // more audio actually leaves the browser), but the SERVER still thinks
    // this participant holds the floor until its 30s TTL lapses on its own
    // -- if this cleanup runs mid-transmission (closing the widget, or the
    // channel changing, while PTT is held), tell it explicitly instead of
    // leaving the channel showing "busy" to everyone else for up to 30
    // more seconds after this browser has already stopped sending audio.
    if (localHoldingRef.current && connectedChannelIdRef.current) {
      pttInvoke({ action: 'release', channel_id: connectedChannelIdRef.current, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null }).catch(() => {});
    }
    try { liveKitRoomRef.current?.disconnect(); } catch { /* noop */ }
    liveKitRoomRef.current = null;
    try { audioUnlockCleanupRef.current?.(); } catch { /* noop */ }
    audioUnlockCleanupRef.current = null;
    for (const entry of audioElsRef.current.values()) {
      try { entry.disconnect(); } catch { /* noop */ }

    }
    audioElsRef.current.clear();
    try { txDspChainRef.current?.disconnect(); } catch { /* noop */ }
    txDspChainRef.current = null;
    try { txRawStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    txRawStreamRef.current = null;
    txPublishedTrackRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* noop */ }
    audioCtxRef.current = null;
    localHoldingRef.current = false;
    hadHolderRef.current = false;
    floorRowIdRef.current = null;
    floorHolderIdRef.current = null;
    lastReleasedRowIdRef.current = null;
    connectedChannelIdRef.current = null;
  }, [clearRenew, pttInvoke]);

  const refreshMutes = useCallback(async () => {
    if (!channelId) return;
    try {
      const rows = await base44.entities.RadioMute.filter({ channel_id: resolvedChannelIdRef.current || channelId }, '-created_date', 200);
      mutedUserIdsRef.current = new Set((rows || []).map((r) => r.user_id));
    } catch { /* keep the previous set on failure */ }
  }, [channelId]);

  const refreshParticipants = useCallback(() => {
    const room = liveKitRoomRef.current;
    if (!room) return;
    const list = [];
    if (room.localParticipant) {
      const meta = parseParticipantMeta(room.localParticipant);
      if (meta.sessionType !== 'monitor') list.push({ userId: meta.userId || room.localParticipant.identity, ...meta, muted: mutedUserIdsRef.current.has(room.localParticipant.identity) });
    }
    for (const rp of room.remoteParticipants.values()) {
      const meta = parseParticipantMeta(rp);
      if (meta.sessionType !== 'monitor') list.push({ userId: meta.userId || rp.identity, ...meta, muted: mutedUserIdsRef.current.has(rp.identity) });
    }
    setParticipants(list);
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    return ctx;
  }, []);

  // Browser autoplay policy can reject a LiveKit audio element if the room
  // connects after the click that opened the radio. Install the unlock
  // listener before connecting so a user interaction can unlock both
  // Web Audio and LiveKit playback, and retry any tracks already subscribed.
  useEffect(() => {
    const unlockRadioAudio = () => {
      const ctx = ensureAudioContext();
      if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
      const room = liveKitRoomRef.current;
      if (room?.startAudio) room.startAudio().catch(() => {});
      for (const entry of audioElsRef.current.values()) {
        if (entry.el?.play) entry.el.play().catch(() => {});
      }
    };
    document.addEventListener('click', unlockRadioAudio);
    document.addEventListener('keydown', unlockRadioAudio);
    return () => {
      document.removeEventListener('click', unlockRadioAudio);
      document.removeEventListener('keydown', unlockRadioAudio);
    };
  }, [ensureAudioContext]);

  // Fires once per actual "someone just released the floor" transition --
  // callers gate this on hadHolderRef so the many places that can observe
  // a release (the realtime subscription, the poll fallback, the talker's
  // own optimistic releasePTT) don't each play their own copy of it.
  const triggerRogerBeep = useCallback(() => {
    if (!rogerBeepRef.current.enabled) return;
    const ctx = ensureAudioContext();
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    playRogerBeep(ctx, settingsVolumeRef.current, rogerBeepRef.current.style, rogerBeepRef.current.customUrl);
  }, [ensureAudioContext]);

  // Lets the Settings dialog preview a style (built-in or a specific
  // admin-uploaded beep's URL) on demand, bypassing the enabled toggle --
  // an explicit "Test" press should always be audible.
  const previewRogerBeep = useCallback((style, customUrl) => {
    const ctx = ensureAudioContext();
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    playRogerBeep(ctx, settingsVolumeRef.current, style || rogerBeepRef.current.style, customUrl || null);
  }, [ensureAudioContext]);

  useEffect(() => {
    radioDspRef.current = audioOptions.radioDsp;
  }, [audioOptions.radioDsp]);

  useEffect(() => {
    rogerBeepRef.current = {
      enabled: audioOptions.rogerBeepEnabled !== false,
      style: audioOptions.rogerBeepStyle || ROGER_BEEP_DEFAULT,
      customUrl: audioOptions.rogerBeepCustomUrl || null,
    };
  }, [audioOptions.rogerBeepEnabled, audioOptions.rogerBeepStyle, audioOptions.rogerBeepCustomUrl]);

  useEffect(() => {
    speakerDeviceIdRef.current = audioOptions.speakerDeviceId || '';
    // Re-route already-connected audio (not just new TrackSubscribed
    // elements below) so picking a different output device takes effect
    // immediately instead of only on the next reconnect.
    if (!audioOptions.speakerDeviceId) return;
    for (const entry of audioElsRef.current.values()) {
      if (typeof entry.el.setSinkId === 'function') entry.el.setSinkId(audioOptions.speakerDeviceId).catch(() => {});
    }
  }, [audioOptions.speakerDeviceId]);

  useEffect(() => {
    if (!channelId) { cleanup(); setStatus('idle'); return undefined; }
    let cancelled = false;
    setStatus('connecting');
    setError('');
    hadHolderRef.current = false;

    (async () => {
      try {
        radioSessionIdRef.current = '';
        const res = await base44.functions.invoke('issue-radio-session', { channel_id: channelId, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null, radio_session_id: '', session_type: audioOptions.monitorMode ? 'monitor' : 'radio' });
        const data = res?.data || res;
        if (!data?.ok) throw new Error(data?.error || 'Could not start radio session');
        if (cancelled) return;
        resolvedChannelIdRef.current = data.channelId || channelId;
        radioSessionIdRef.current = data.radioSessionId || '';
        const sessionData = { userId: data.userId, radioSessionId: data.radioSessionId || '', radioCallsign: data.radioCallsign || '', callsign: data.callsign, displayName: data.displayName, canTransmit: data.canTransmit, canModerate: data.canModerate, sessionType: data.sessionType || (audioOptions.monitorMode ? 'monitor' : 'radio') };
        sessionRef.current = sessionData;
        setSession(sessionData);

        await refreshMutes();
        if (cancelled) return;

        // --- LiveKit (audio transport + presence) ---
        const lkRoom = new Room({ adaptiveStream: true, dynacast: true });
        let reconnectRoom = async () => false;

        lkRoom.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind !== Track.Kind.Audio) return;

          // Never play our own transmitted track back through the speakers.
          // This is especially important when the page has a monitor/second
          // radio session open: speaker -> microphone -> LiveKit would create
          // an acoustic/digital feedback loop.
          if (radioSessionIdRef.current && participant.identity === radioSessionIdRef.current) {
            try { track.detach(); } catch { /* noop */ }
            return;
          }

          // Defensive: if this participant somehow already has a chain (a
          // resubscribe without a matching unsubscribe in between -- seen
          // with WebRTC reconnects), tear the old one down first. Two
          // overlapping processed chains for the same remote track would
          // layer into a warbling, tone-like combined sound instead of
          // clean audio.
          const trackSid = track.sid || track.name || track.mediaStreamTrack?.id || 'audio';
          const existingEntry = audioElsRef.current.get(participant.identity);

          // LiveKit can surface the same publication more than once around a
          // reconnect. Do not create a second HTMLMediaElement for the same
          // track. If it is a genuinely new track, replace the old one.
          if (existingEntry?.trackSid === trackSid) return;
          if (existingEntry) {
            existingEntry.disconnect();
            audioElsRef.current.delete(participant.identity);
          }

          // Keep LiveKit's proven HTMLMediaElement playback path, but insert
          // the radio EQ/compressor/saturation in the media element's audio
          // chain. This avoids the ringing artifact seen with direct
          // MediaStreamTrack routing.
          const el = track.attach();
          el.autoplay = true;
          el.playsInline = true;
          el.volume = 1;
          el.style.display = 'none';
          document.body.appendChild(el);
          // setSinkId is Chromium-only (unsupported in Firefox/Safari) --
          // feature-detected here so this is a no-op, not an error, where
          // it doesn't exist.
          if (speakerDeviceIdRef.current && typeof el.setSinkId === 'function') {
            el.setSinkId(speakerDeviceIdRef.current).catch(() => {});
          }

          const useFilter = audioOptions.radioFilter !== false;
          const ctx = useFilter ? ensureAudioContext() : null;
          let filter = null;
          if (ctx) {
            try {
              filter = createRadioVoiceChain(ctx, el, radioDspRef.current);
              filter?.setVolume(settingsVolumeRef.current ?? 80);
            } catch (e) {
              console.warn('[radio] voice filter unavailable; using native audio', e);
            }
          }

          const entry = {
            trackSid,
            el,
            filter,
            setVolume(value0to100) {
              if (filter) filter.setVolume(value0to100);
              else el.volume = Math.max(0, Math.min(1, value0to100 / 100));
            },
            disconnect() {
              try { filter?.disconnect(); } catch { /* noop */ }
              try { track.detach(el); } catch { /* already detached */ }
              try { el.pause(); } catch { /* noop */ }
              try { el.remove(); } catch { /* noop */ }
            },
          };
          audioElsRef.current.set(participant.identity, entry);

          // Always apply the user's current speaker volume to newly
          // subscribed LiveKit tracks. Receive-side DSP may be disabled
          // because the transmitter already applied the shared radio DSP,
          // but speaker volume must still be enforced on the media element.
          entry.setVolume(settingsVolumeRef.current ?? 80);

          if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
          el.play().catch(() => {
            setError('Tap or click anywhere on the page to enable radio audio.');
            const retry = () => {
              ctx?.resume().catch(() => {});
              el.play().then(() => setError((prev) => (prev.startsWith('Tap or click') ? '' : prev))).catch(() => {});
            };
            document.addEventListener('click', retry, { once: true });
            document.addEventListener('keydown', retry, { once: true });
          });
        });
        lkRoom.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
          if (track.kind !== Track.Kind.Audio) return;
          const entry = audioElsRef.current.get(participant.identity);
          // An old TrackUnsubscribed event can arrive after a replacement
          // TrackSubscribed event. Only remove the element that belongs to
          // this exact track; never tear down the newer transmission.
          const trackSid = track.sid || track.name || track.mediaStreamTrack?.id || 'audio';
          if (entry && entry.trackSid === trackSid) {
            entry.disconnect();
            audioElsRef.current.delete(participant.identity);
          }
        });
        lkRoom.on(RoomEvent.ParticipantConnected, refreshParticipants);
        lkRoom.on(RoomEvent.ParticipantDisconnected, refreshParticipants);
        lkRoom.on(RoomEvent.ParticipantMetadataChanged, refreshParticipants);
        lkRoom.on(RoomEvent.Reconnecting, () => setStatus('connecting'));
        lkRoom.on(RoomEvent.Reconnected, () => { refreshParticipants(); setStatus(floorHolderIdRef.current === sessionRef.current?.userId && localHoldingRef.current ? 'transmitting' : floorHolderIdRef.current ? 'receiving' : 'listening'); });
        lkRoom.on(RoomEvent.Disconnected, (reason) => {
          if (cancelled) return;
          setStatus('disconnected');
          // Some disconnects are deliberate and must NOT auto-rejoin:
          // a moderator kick would be undone in 1.5s, and two tabs of the
          // same account (same LiveKit identity) would keep knocking each
          // other off forever. Closing and reopening the radio (or changing
          // channel) reconnects on purpose.
          if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
            setError('You were removed from this channel by a moderator.');
            return;
          }
          if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
            setError('This radio session was replaced by another connection. Reconnect the radio to get a new session.');
            return;
          }
          if (reason === DisconnectReason.CLIENT_INITIATED) return;
          if (localHoldingRef.current) releasePTTRef.current();
          setError('Radio connection lost. Reconnecting…');
          if (Date.now() - lastConnectedAtRef.current > RETRY_STABLE_MS) retryCountRef.current = 0;
          const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** retryCountRef.current);
          retryCountRef.current += 1;
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            if (!cancelled) reconnectRoom().catch(() => {});
          }, delay);
        });

        reconnectRoom = async () => {
          if (cancelled || reconnectInFlightRef.current) return false;
          reconnectInFlightRef.current = true;
          try {
            setStatus('connecting');
            const res = await base44.functions.invoke('issue-radio-session', {
              channel_id: channelId,
              zone_id: audioOptions.zoneId || '',
              channel_number: audioOptions.channelNumber ?? null,
              radio_session_id: radioSessionIdRef.current || data.radioSessionId || '',
              session_type: audioOptions.monitorMode ? 'monitor' : 'radio',
            });
            const fresh = res?.data || res;
            if (!fresh?.ok) throw new Error(fresh?.error || 'Could not refresh the radio connection');
            if (cancelled) return false;

            radioSessionIdRef.current = fresh.radioSessionId || radioSessionIdRef.current;
            const next = {
              userId: fresh.userId,
              radioSessionId: radioSessionIdRef.current,
              radioCallsign: fresh.radioCallsign || sessionRef.current?.radioCallsign || '',
              callsign: fresh.callsign,
              displayName: fresh.displayName,
              canTransmit: fresh.canTransmit,
              canModerate: fresh.canModerate,
              sessionType: fresh.sessionType || (audioOptions.monitorMode ? 'monitor' : 'radio'),
            };
            sessionRef.current = next;
            setSession(next);

            for (const entry of audioElsRef.current.values()) {
              try { entry.disconnect(); } catch { /* noop */ }
            }
            audioElsRef.current.clear();

            if (lkRoom.state !== ConnectionState.Disconnected) {
              try { await lkRoom.disconnect(); } catch { /* noop */ }
            }
            await lkRoom.connect(fresh.liveKitUrl, fresh.liveKitToken);
            if (cancelled) { try { await lkRoom.disconnect(); } catch { /* noop */ } return false; }
            liveKitRoomRef.current = lkRoom;
            connectedChannelIdRef.current = fresh.channelId || channelId;
            lastConnectedAtRef.current = Date.now();
            retryCountRef.current = 0;
            setError('');
            refreshParticipants();
            return true;
          } catch (e) {
            if (!cancelled) {
              setStatus('disconnected');
              setError('Radio connection lost. Retrying…');
              const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** retryCountRef.current);
              retryCountRef.current += 1;
              if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = window.setTimeout(() => {
                reconnectTimerRef.current = null;
                if (!cancelled) reconnectRoom().catch(() => {});
              }, delay);
            }
            return false;
          } finally {
            reconnectInFlightRef.current = false;
          }
        };

        await lkRoom.connect(data.liveKitUrl, data.liveKitToken);
        if (cancelled) { lkRoom.disconnect(); return; }
        liveKitRoomRef.current = lkRoom;
        lastConnectedAtRef.current = Date.now();
        setError((prev) => (prev.startsWith('Radio connection lost') ? '' : prev));
        connectedChannelIdRef.current = resolvedChannelIdRef.current;
        refreshParticipants();

        // The LiveKit token is only good for ~5 minutes and this widget is
        // routinely left open and idle far longer than that -- keep both
        // the token and the permission snapshot (canTransmit can change
        // mid-session, e.g. a callsign getting verified) fresh.
        sessionRefreshIntervalRef.current = setInterval(async () => {
          try {
            const r = await base44.functions.invoke('issue-radio-session', { channel_id: channelId, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null, radio_session_id: radioSessionIdRef.current || '', session_type: audioOptions.monitorMode ? 'monitor' : 'radio' });
            const d = r?.data || r;
            if (d?.ok) {
              radioSessionIdRef.current = d.radioSessionId || radioSessionIdRef.current;
              const next = { userId: d.userId, radioSessionId: radioSessionIdRef.current, radioCallsign: d.radioCallsign || sessionRef.current?.radioCallsign || '', callsign: d.callsign, displayName: d.displayName, canTransmit: d.canTransmit, canModerate: d.canModerate, sessionType: d.sessionType || (audioOptions.monitorMode ? 'monitor' : 'radio') };
              sessionRef.current = next;
              setSession(next);
            }
          } catch { /* the next refresh cycle will retry */ }
        }, SESSION_REFRESH_MS);

        // --- Floor control (who's transmitting) ---
        const applyFloorRow = (row) => {
          const holderId = row?.holder_user_id || null;
          const incomingRowId = row?.id || null;
          if (holderId) {
            // A grant/renew event for a row already known to be superseded
            // (we've already processed its release) is a stale, out-of-
            // order realtime delivery -- e.g. a renew's own "still holding"
            // update arriving after that same row's delete. Applying it
            // would briefly revive the old holder, which then gets
            // corrected again and fires a second, spurious roger beep on
            // what was really a single release. Row ids are never reused
            // (release deletes the row; the next grant creates a new one),
            // so this only ever filters genuinely stale events.
            if (incomingRowId && incomingRowId === lastReleasedRowIdRef.current) return;
            const isMine = holderId === sessionRef.current?.userId;
            // A quick tap: the button went up while radio-ptt was still
            // deciding, so the server created this row after our release
            // already ran. requestPTT releases the late grant too, but this
            // row's realtime event can still land here -- and if the matching
            // delete event is dropped, the radio would sit on TRANSMITTING.
            // Treat it as already released instead of adopting it.
            if (isMine && !localHoldingRef.current && Date.now() - lastLocalReleaseAtRef.current < LATE_GRANT_WINDOW_MS) {
              if (incomingRowId) lastReleasedRowIdRef.current = incomingRowId;
              pttInvoke({ action: 'release', channel_id: resolvedChannelIdRef.current || channelId, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null }).catch(() => {});
              return;
            }
            floorRowIdRef.current = incomingRowId;
            floorHolderIdRef.current = holderId;
            hadHolderRef.current = true;
            setPttHolder({ userId: holderId, callsign: row.holder_callsign, displayName: row.holder_display_name });
            // Only this browser's own live press is TRANSMITTING; the same
            // account keyed up in another tab reads as RECEIVING here.
            const isMe = isMine && localHoldingRef.current;
            setStatus(isMe ? 'transmitting' : 'receiving');
            if (!isMe && txPublishedTrackRef.current) {
              liveKitRoomRef.current?.localParticipant?.unpublishTrack(txPublishedTrackRef.current, true).catch(() => {});
              try { txDspChainRef.current?.disconnect(); } catch { /* noop */ }
              txDspChainRef.current = null;
              try { txRawStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
              txRawStreamRef.current = null;
              txPublishedTrackRef.current = null;
            }
          } else {
            // Only overwrite when there's an actual row id to record --
            // releasePTT may have already cleared floorRowIdRef.current
            // (and set lastReleasedRowIdRef.current itself) before this
            // same release's delete confirmation arrives here; clobbering
            // it back to null would reopen the race it exists to close.
            if (floorRowIdRef.current) lastReleasedRowIdRef.current = floorRowIdRef.current;
            floorRowIdRef.current = null;
            floorHolderIdRef.current = null;
            setPttHolder(null);
            localHoldingRef.current = false;
            clearRenew();
            if (txPublishedTrackRef.current) {
              liveKitRoomRef.current?.localParticipant?.unpublishTrack(txPublishedTrackRef.current, true).catch(() => {});
            }
            try { txDspChainRef.current?.disconnect(); } catch { /* noop */ }
            txDspChainRef.current = null;
            try { txRawStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
            txRawStreamRef.current = null;
            txPublishedTrackRef.current = null;
            if (hadHolderRef.current) triggerRogerBeep();
            hadHolderRef.current = false;
            setStatus('listening');
          }
        };

        try {
          const rows = await base44.entities.RadioFloorState.filter({ channel_id: resolvedChannelIdRef.current || channelId }, '-created_date', 1);
          if (cancelled) return;
          const row = rows?.[0];
          const isLive = row && Date.now() - new Date(row.since || 0).getTime() < HOLD_TTL_MS;
          applyFloorRow(isLive ? row : null);
        } catch {
          // Floor-state fetch itself failed -- still move off 'connecting'
          // so the widget doesn't hang there forever; applyFloorRow already
          // handles every other case (including a fetch that succeeded but
          // found nothing).
          setStatus('listening');
        }
        // The channel may have changed while the floor state was loading;
        // cleanup() already ran, so don't register listeners it can't remove.
        if (cancelled) return;

        floorUnsubRef.current = base44.entities.RadioFloorState.subscribe((event) => {
          if (cancelled) return;
          if (event.type === 'delete') {
            // Releases on every channel reach every open radio. While this
            // channel shows nobody holding the floor, a release can't change
            // what's displayed, so skip the read (the poll below still runs).
            if (!floorHolderIdRef.current) return;
            // Delete events do not carry channel_id. Instead of relying only
            // on the locally remembered row id (which can be stale when
            // multiple claim/release events overlap), immediately reconcile
            // the current channel from the authoritative entity state.
            base44.entities.RadioFloorState.filter(
              { channel_id: resolvedChannelIdRef.current || channelId }, '-created_date', 1
            ).then((rows) => {
              if (cancelled) return;
              const row = rows?.[0];
              const isLive = row && Date.now() - new Date(row.since || 0).getTime() < HOLD_TTL_MS;
              applyFloorRow(isLive ? row : null);
            }).catch(() => {
              // The 2.5-second poll below will reconcile if this read fails.
              if (event.id && event.id === floorRowIdRef.current) applyFloorRow(null);
            });
            return;
          }
          const row = event.data;
          if (!row || row.channel_id !== (resolvedChannelIdRef.current || channelId)) return;
          // Realtime updates can arrive for an already-expired floor row.
          // Never let an old claim make the channel look busy until the next
          // 15-second poll catches up.
          const isLive = Date.now() - new Date(row.since || 0).getTime() < HOLD_TTL_MS;
          applyFloorRow(isLive ? row : null);
        });

        // Safety net alongside the subscription above, not a replacement
        // for it: a stale display (still showing someone's callsign and the
        // transmitting/receiving ring well after they actually released)
        // was traced to a release's realtime 'delete' event not reliably
        // reaching every listener -- unconfirmed exactly why, but this
        // guarantees the display self-corrects within a few seconds
        // regardless, rather than staying wrong indefinitely if a delete
        // event is ever dropped, delayed, or never sent for a given write.
        //
        // Every member tuned in runs this, around the clock, so it reads the
        // floor every 2.5s only while someone is shown holding it (a missed
        // release then clears within a few seconds, as before) and every 10s
        // while the channel is quiet. Audio itself never waits on this.
        let lastFloorPoll = 0;
        floorPollIntervalRef.current = setInterval(async () => {
          if (cancelled) return;
          if (!floorHolderIdRef.current && Date.now() - lastFloorPoll < 10000) return;
          lastFloorPoll = Date.now();
          try {
            const rows = await base44.entities.RadioFloorState.filter({ channel_id: resolvedChannelIdRef.current || channelId }, '-created_date', 1);
            const row = rows?.[0];
            const isLive = row && Date.now() - new Date(row.since || 0).getTime() < HOLD_TTL_MS;
            const holderId = isLive ? row.holder_user_id : null;
            // Only apply when it actually disagrees with what's currently
            // shown -- avoids fighting a just-granted optimistic update
            // from requestPTT with a poll result that hasn't caught up yet.
            if (holderId !== floorHolderIdRef.current) applyFloorRow(isLive ? row : null);
          } catch { /* try again next cycle */ }
        }, 2500);
      } catch (e) {
        if (cancelled) return;
        setError(errMsg(e) || e?.message || 'Could not connect to the radio');
        setStatus('error');
      }
    })();

    return () => { cancelled = true; cleanup(); };
  }, [channelId, cleanup, refreshMutes, refreshParticipants, ensureAudioContext, triggerRogerBeep, audioOptions.radioFilter, audioOptions.monitorMode]);

  // Shared radio DSP is applied BEFORE a microphone track enters LiveKit.
  // Updating the admin-controlled EQ therefore changes the active transmit
  // chain immediately, while every listener receives the same processed
  // signal. We intentionally do not re-process received tracks here: doing
  // so would double-EQ an already processed transmission.
  useEffect(() => {
    const dsp = audioOptions.radioDsp;
    radioDspRef.current = dsp;
    if (!dsp) return;
    try { txDspChainRef.current?.update?.(dsp); } catch (e) { console.warn('[radio] transmit DSP update failed', e); }
  }, [audioOptions.radioDsp]);

  const requestPTT = useCallback(async () => {
    if (localHoldingRef.current || pttRequestInFlightRef.current) return;
    const pttGeneration = ++pttGenerationRef.current;
    const s = sessionRef.current;
    // Surface *why* nothing happened instead of a silent no-op -- a press
    // that visibly does nothing (no beep, no status change) reads as a
    // broken keybind even when it's actually working exactly as designed
    // (e.g. blocked because the account has no verified callsign yet).
    const room = liveKitRoomRef.current;
    if (!room || !s || room.state !== ConnectionState.Connected) {
      setError('Still connecting to the radio — try again in a moment.');
      return;
    }
    if (!s.canTransmit) { setError('You are not authorized to transmit on this channel.'); return; }
    localHoldingRef.current = true;
    pttRequestInFlightRef.current = true;
    setError('');
    try {
      const res = await pttInvoke({ action: 'request', channel_id: resolvedChannelIdRef.current || channelId, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null });
      const data = res?.data || res;
      // The user may release PTT while the server is deciding. A generation
      // mismatch is stronger than a boolean because a fast re-press can
      // happen after the original release.
      if (pttGenerationRef.current !== pttGeneration) {
        if (data?.granted) await pttInvoke({ action: 'release', channel_id: resolvedChannelIdRef.current || channelId, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null }).catch(() => {});
        return;
      }
      // The user may release PTT while the server is deciding whether to grant
      // the floor. A late grant must be released again after it arrives.
      if (!localHoldingRef.current) {
        if (data?.granted) await pttInvoke({ action: 'release', channel_id: resolvedChannelIdRef.current || channelId, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null }).catch(() => {});
        return;
      }
      if (!data?.ok) throw new Error(data?.error || 'Could not reach the radio server.');
      if (!data.granted) {
        localHoldingRef.current = false;
        clearRenew();

        // A busy response can race with a previous grant/release or a
        // realtime floor update. Never leave an old local mic publication
        // alive just because this particular request was denied; that makes
        // the web radio continue to display TRANSMITTING while another radio
        // is correctly reported as holding the floor.
        lastLocalReleaseAtRef.current = Date.now();
        if (floorRowIdRef.current) lastReleasedRowIdRef.current = floorRowIdRef.current;
        floorRowIdRef.current = null;
        floorHolderIdRef.current = null;
        try {
          if (txPublishedTrackRef.current) {
            await liveKitRoomRef.current?.localParticipant?.unpublishTrack(txPublishedTrackRef.current, true);
          }
        } catch { /* noop */ }
        try { txDspChainRef.current?.disconnect(); } catch { /* noop */ }
        txDspChainRef.current = null;
        try { txRawStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
        txRawStreamRef.current = null;
        txPublishedTrackRef.current = null;
        setPttHolder(null);
        setStatus('listening');

        // Idempotent server cleanup removes any orphaned floor row owned by
        // this caller without touching the actual holder named in the busy
        // response.
        await pttInvoke({
          action: 'release',
          channel_id: resolvedChannelIdRef.current || channelId,
          zone_id: audioOptions.zoneId || '',
          channel_number: audioOptions.channelNumber ?? null,
        }).catch(() => {});

        setError(
          data.reason === 'busy'
            ? data.holder?.displayName
              ? `Channel is busy — ${data.holder.displayName} is transmitting.`
              : data.holder?.callsign
                ? `Channel is busy — ${data.holder.callsign} is transmitting.`
                : 'Channel is busy — someone else is transmitting.'
            : data.reason === 'muted' ? 'You are muted on this channel.'
            : 'You are not authorized to transmit on this channel.'
        );
        return;
      }
      // Granted -- capture the mic, run it through the shared site-wide
      // radio DSP, and publish the processed MediaStreamTrack to LiveKit.
      // The DSP settings are identical for every transmitter, so everyone
      // hears the same radio processing. The receive side deliberately does
      // not apply the DSP again.
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: audioOptions.echoCancellation !== false,
            noiseSuppression: audioOptions.noiseSuppression !== false,
            autoGainControl: audioOptions.autoGainControl !== false,
            ...(audioOptions.micDeviceId ? { deviceId: { exact: audioOptions.micDeviceId } } : {}),
          },
        });
        txRawStreamRef.current = micStream;
        if (pttGenerationRef.current !== pttGeneration || !localHoldingRef.current) {
          micStream.getTracks().forEach((t) => t.stop());
          txRawStreamRef.current = null;
          pttInvoke({ action: 'release', channel_id: resolvedChannelIdRef.current || channelId, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null }).catch(() => {});
          return;
        }
        const ctx = ensureAudioContext();
        if (ctx?.state === 'suspended') await ctx.resume().catch(() => {});
        txDspChainRef.current = ctx ? createRadioTransmitChain(ctx, micStream, radioDspRef.current) : null;
        const outgoingTrack = txDspChainRef.current?.outputTrack || micStream.getAudioTracks()[0];
        if (!outgoingTrack) throw new Error('No microphone audio track was created');

        // The room may have disconnected while the microphone was being
        // opened/processed. Never call publishTrack against a LiveKit room
        // whose engine is not actually connected.
        if (pttGenerationRef.current !== pttGeneration || !localHoldingRef.current) {
          try { txDspChainRef.current?.disconnect(); } catch { /* noop */ }
          txDspChainRef.current = null;
          try { txRawStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
          txRawStreamRef.current = null;
          pttInvoke({ action: 'release', channel_id: resolvedChannelIdRef.current || channelId, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null }).catch(() => {});
          return;
        }
        const publishRoom = liveKitRoomRef.current;
        if (!publishRoom || publishRoom.state !== ConnectionState.Connected) {
          throw new Error('Radio connection was lost before the microphone could be published. Please try PTT again.');
        }

        await publishRoom.localParticipant.publishTrack(outgoingTrack, {
          name: 'radio-microphone',
          source: Track.Source.Microphone,
          dtx: true,
          red: true,
        });
        // A release can happen while LiveKit is publishing. Remove that late
        // track immediately and free the server floor instead of sticking in TX.
        if (pttGenerationRef.current !== pttGeneration || !localHoldingRef.current) {
          try { await publishRoom.localParticipant.unpublishTrack(outgoingTrack, true); } catch { /* noop */ }
          try { txDspChainRef.current?.disconnect(); } catch { /* noop */ }
          txDspChainRef.current = null;
          try { txRawStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
          txRawStreamRef.current = null;
          txPublishedTrackRef.current = null;
          floorHolderIdRef.current = null;
          pttInvoke({ action: 'release', channel_id: resolvedChannelIdRef.current || channelId, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null }).catch(() => {});
          return;
        }
        txPublishedTrackRef.current = outgoingTrack;
        setPttHolder({ userId: s.userId, callsign: data.callsign, displayName: data.displayName });
        floorHolderIdRef.current = s.userId;
        hadHolderRef.current = true;
        setStatus('transmitting');
      } catch (e) {
        try {
          if (txPublishedTrackRef.current) await liveKitRoomRef.current?.localParticipant?.unpublishTrack(txPublishedTrackRef.current, true);
        } catch { /* noop */ }
        try { txDspChainRef.current?.disconnect(); } catch { /* noop */ }
        txDspChainRef.current = null;
        try { txRawStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
        txRawStreamRef.current = null;
        txPublishedTrackRef.current = null;
        if (localHoldingRef.current) setError('Microphone access failed: ' + (e?.message || 'permission denied'));
        localHoldingRef.current = false;
        floorHolderIdRef.current = null;
        pttInvoke({ action: 'release', channel_id: resolvedChannelIdRef.current || channelId, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null }).catch(() => {});
        setStatus('listening');
        setPttHolder(null);
        return;
      }
      clearRenew();
      const transmitStartedAt = Date.now();
      let renewFailures = 0;
      renewIntervalRef.current = setInterval(async () => {
        if (!localHoldingRef.current) { clearRenew(); return; }
        if (Date.now() - transmitStartedAt >= MAX_TRANSMIT_MS) {
          releasePTTRef.current();
          setError(`Transmit time limit reached (${MAX_TRANSMIT_MS / 60000} minutes). Release and press PTT again to keep talking.`);
          return;
        }
        try {
          const r = await pttInvoke({ action: 'renew', channel_id: resolvedChannelIdRef.current || channelId, zone_id: audioOptions.zoneId || '', channel_number: audioOptions.channelNumber ?? null });
          const d = r?.data || r;
          if (!d?.ok) throw new Error('lost floor');
          renewFailures = 0;
        } catch (e) {
          // A network blip isn't losing the floor -- the server holds the
          // grant for HOLD_TTL_MS, so ride out a couple of failed renews.
          // An explicit rejection (409/403, or ok:false) means it's gone.
          const httpStatus = e?.response?.status || e?.status;
          const rejected = e?.message === 'lost floor' || (httpStatus >= 400 && httpStatus < 500);
          if (!rejected && ++renewFailures <= MAX_RENEW_FAILURES) return;
          if (!localHoldingRef.current) return;
          // The server no longer thinks we hold the floor (force-released,
          // muted mid-transmission, ...) -- stop locally instead of
          // continuing to "transmit" into a track no one is listening for.
          localHoldingRef.current = false;
          floorHolderIdRef.current = null;
          clearRenew();
          try {
            if (txPublishedTrackRef.current) await liveKitRoomRef.current?.localParticipant?.unpublishTrack(txPublishedTrackRef.current, true);
          } catch { /* noop */ }
          try { txDspChainRef.current?.disconnect(); } catch { /* noop */ }
          txDspChainRef.current = null;
          try { txRawStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
          txRawStreamRef.current = null;
          txPublishedTrackRef.current = null;
          setStatus('listening');
          setPttHolder(null);
        }
      }, RENEW_MS);
    } catch (e) {
      const wasHolding = localHoldingRef.current;
      localHoldingRef.current = false;
      if (wasHolding) setError(errMsg(e) || e?.message || 'Could not reach the radio server.');
    } finally {
      pttRequestInFlightRef.current = false;
    }
  }, [channelId, clearRenew, audioOptions.echoCancellation, audioOptions.noiseSuppression, audioOptions.autoGainControl, audioOptions.micDeviceId]);

  const releasePTT = useCallback(() => {
    // Always advance the generation, even when the server grant has not
    // arrived yet. This is what prevents a late grant from keying the mic
    // after the physical key/button has already been released.
    pttGenerationRef.current += 1;
    lastLocalReleaseAtRef.current = Date.now();
    // A release can happen before the floor request finishes, after
    // the local floor state has already cleared, or while LiveKit is cleaning
    // up a microphone track. The server-side release is caller-scoped and
    // idempotent, so always send it. This removes every local-ref-dependent
    // branch that could otherwise skip the authoritative release.
    if (!localHoldingRef.current) {
      if (txPublishedTrackRef.current) {
        try { liveKitRoomRef.current?.localParticipant?.unpublishTrack(txPublishedTrackRef.current, true).catch(() => {}); } catch { /* noop */ }
        txPublishedTrackRef.current = null;
      }
      pttInvoke({
        action: 'release',
        channel_id: resolvedChannelIdRef.current || channelId,
        zone_id: audioOptions.zoneId || '',
        channel_number: audioOptions.channelNumber ?? null
      }).catch(() => {});
      return;
    }
    localHoldingRef.current = false;
    floorHolderIdRef.current = null;
    // Mark this row as superseded immediately, not only once the server's
    // delete confirmation arrives -- a stale renew/grant event for it can
    // otherwise land in between and briefly revive the old holder (see
    // applyFloorRow), which then gets corrected again and fires a second,
    // spurious roger beep for what was really a single release.
    lastReleasedRowIdRef.current = floorRowIdRef.current;
    floorRowIdRef.current = null;
    clearRenew();
    if (txPublishedTrackRef.current) {
      liveKitRoomRef.current?.localParticipant?.unpublishTrack(txPublishedTrackRef.current, true).catch(() => {});
    }
    try { txDspChainRef.current?.disconnect(); } catch { /* noop */ }
    txDspChainRef.current = null;
    try { txRawStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    txRawStreamRef.current = null;
    txPublishedTrackRef.current = null;
    setStatus('listening');
    setPttHolder(null);

    // The main radio session owns the local release beep. The release
    // transition is then marked handled so the realtime delete cannot
    // produce a second copy.
    if (hadHolderRef.current) triggerRogerBeep();
    hadHolderRef.current = false;

    pttInvoke({
      action: 'release',
      channel_id: resolvedChannelIdRef.current || channelId,
      zone_id: audioOptions.zoneId || '',
      channel_number: audioOptions.channelNumber ?? null
    }).catch(() => {});
  }, [channelId, clearRenew, triggerRogerBeep]);
  releasePTTRef.current = releasePTT;

  const moderate = useCallback(async (action, targetUserId) => {
    if (!sessionRef.current?.canModerate) return;
    try {
      const res = await pttInvoke({ action: 'moderate', channel_id: resolvedChannelIdRef.current || channelId, mod_action: action, target_user_id: targetUserId });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.error || 'Moderation action failed.');
      await refreshMutes();
      refreshParticipants();
    } catch (e) {
      setError(errMsg(e) || e?.message || 'Moderation action failed.');
    }
  }, [channelId, refreshMutes, refreshParticipants]);

  const setLocalVolume = useCallback((volume0to100) => {
    const v = Math.max(0, Math.min(100, Number(volume0to100) || 0));
    settingsVolumeRef.current = v;
    for (const entry of audioElsRef.current.values()) entry.setVolume?.(v);
    // Roger beep is part of the radio speaker output, so it follows the
    // same volume control as live transmissions.
    if (audioCtxRef.current) setRogerBeepVolume(audioCtxRef.current, v);
  }, []);

  return { status, participants, pttHolder, session, error, setError, requestPTT, releasePTT, moderate, setLocalVolume, previewRogerBeep };
}