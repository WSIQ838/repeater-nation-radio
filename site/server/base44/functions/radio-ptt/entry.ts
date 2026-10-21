import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { RoomServiceClient } from 'npm:livekit-server-sdk@2';
import { secrets } from 'base44:runtime';
import { getByIdWithFallback } from '../../shared/adminGuard.ts';
import { findRadioRecord, findRadioChannelByNumber } from '../../shared/radioLookup.ts';
import { callRadioGateway, createRadioGatewayAssertion } from '../../shared/radioGateway.ts';

// ===== APP-SPECIFIC =====
// Stateless, server-authoritative floor control for the web radio, replacing
// the RadioChannel Base44 Actor (which never delivered any response to any
// message once deployed -- confirmed via direct testing: connects fine at
// every transport layer, but the actor's own message handling never
// produces a reply, with zero trace anywhere client-visible; a platform-
// level issue outside what's fixable from application code). This function
// does the exact same job -- decide who's allowed to transmit right now --
// without relying on that broken mechanism, using only already-proven-
// working primitives: a plain HTTP function and normal entity writes/
// realtime subscriptions (the same mechanism NetControlCheckIn already uses
// successfully elsewhere in this app).
//
// Every permission check here is re-derived from the caller's real account
// on every single call (never trusted from the client) -- the same
// verified-callsign + per-channel role checks issue-radio-session already
// used are just repeated per action instead of once into a signed token,
// since there's no longer a persistent per-connection identity to attach a
// token to.
//
// Floor control: RadioFloorState holds at most one live row per channel.
// A grant is only valid for HOLD_TTL_MS since its last renewal -- the
// holder's client calls action:'renew' every few seconds while
// transmitting (see useRadioSession.js), so a crashed/closed tab frees the
// channel automatically within one TTL window instead of jamming it
// indefinitely, without needing any persistent connection-close detection.
// ===== END APP-SPECIFIC =====

const STAFF_ROLES = ['admin', 'super_admin'];
const MODERATE_ROLES = ['admin', 'super_admin', 'moderator'];
const HOLD_TTL_MS = 30_000;
const MIRROR_WAIT_MS = 1_000;

function liveKitClient() {
  const url = secrets.get('LIVEKIT_URL');
  const apiKey = secrets.get('LIVEKIT_API_KEY');
  const apiSecret = secrets.get('LIVEKIT_API_SECRET');
  if (!url || !apiKey || !apiSecret) return null;
  // RoomServiceClient wants an https(s) URL, not the wss(s) one clients connect with.
  const httpUrl = url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
  return new RoomServiceClient(httpUrl, apiKey, apiSecret);
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const channelId = String(body.channel_id || '').trim();
    const zoneId = String(body.zone_id || '').trim();
    const channelNumber = Number(body.channel_number);

    // Each Base44 read can take seconds when the platform is slow, and the desktop
    // radio gives a PTT press 8 s, so reads that don't depend on each other run
    // together: the caller, the radio switch and the channel.
    // findRadioRecord retries and falls back to the caller's own read, so a
    // failed service-role read no longer turns into "Channel not found".
    const [caller, settingsRows, channelById] = await Promise.all([
      base44.auth.me().catch(() => null),
      base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1).catch(() => []),
      channelId ? findRadioRecord(base44, 'RadioChannel', channelId, 'number') : Promise.resolve(null),
    ]);
    if (!caller) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (caller.account_status && ['suspended', 'banned', 'investigation', 'deleted'].includes(caller.account_status)) {
      return Response.json({ error: 'Your account cannot use the radio right now' }, { status: 403 });
    }
    if (!channelId) return Response.json({ error: 'channel_id required' }, { status: 400 });

    const settings = (settingsRows || [])[0];
    if (settings && settings.radio_enabled === false) {
      return Response.json({ error: 'The web radio is currently disabled' }, { status: 403 });
    }

    let channel = channelById;
    // Recover an older/stale browser selection from the current zone and
    // channel number instead of returning a misleading Channel not found.
    if (!channel && zoneId && Number.isFinite(channelNumber)) {
      channel = await findRadioChannelByNumber(base44, zoneId, channelNumber);
    }
    if (!channel || channel.enabled === false) {
      return Response.json({ error: 'Channel not found' }, { status: 404 });
    }
    // The mute check only needs the channel, so it runs alongside the zone lookup.
    const mutedPromise: Promise<boolean> = (action === 'request' || action === 'renew')
      ? base44.asServiceRole.entities.RadioMute.filter(
          { channel_id: channel.id, user_id: caller.id }, '-created_date', 1
        ).then((rows: any) => !!rows?.length).catch(() => false)
      : Promise.resolve(false);
    const zone = channel.zone_id
      ? await findRadioRecord(base44, 'RadioZone', channel.zone_id, 'display_order')
      : null;
    if (!zone || zone.enabled === false) {
      return Response.json({ error: 'Zone not found' }, { status: 404 });
    }

    const role = caller.role || 'user';
    const isStaff = STAFF_ROLES.includes(role);
    const isModerator = MODERATE_ROLES.includes(role);
    const roleRank: Record<string, number> = { user: 0, moderator: 1, admin: 2, super_admin: 2 };
    if ((roleRank[zone.min_role] || 0) > (roleRank[role] || 0)) {
      return Response.json({ error: 'You do not have access to this zone' }, { status: 403 });
    }
    if (channel.admin_only && !isStaff) {
      return Response.json({ error: 'This channel is restricted to admins' }, { status: 403 });
    }

    const callsign = String(caller.callsign || '').trim().toUpperCase();
    const callerId = String(caller.id || '').trim();
    const suppliedRadioSessionId = String(body.radio_session_id || '').trim();
    const radioCallsign = String(body.radio_callsign || '').trim().toUpperCase();
    const expectedSessionPrefix = radioCallsign ? `${radioCallsign}-` : `rn-radio-${callerId}-`;
    // Backward compatibility for a still-open/previously published client:
    // new clients send a unique rn-radio-* session id, while older clients
    // may have no radio_session_id at all. Let those clients continue using
    // the account identity until they receive the refreshed session code.
    const radioSessionId = suppliedRadioSessionId || callerId;
    if (suppliedRadioSessionId && (!suppliedRadioSessionId.startsWith(expectedSessionPrefix) || suppliedRadioSessionId.length <= expectedSessionPrefix.length + 32)) {
      return Response.json({ error: 'A valid radio session is required. Reconnect the radio and try again.' }, { status: 400 });
    }
    const sameUser = (a: any, b: any) => String(a || '').trim() === String(b || '').trim();
    const sameSession = (a: any, b: any) => String(a || '').trim() === String(b || '').trim();
    const sameLease = (row: any, userId: string, sessionId: string) =>
      sameUser(row?.holder_user_id, userId) && sameSession(row?.holder_session_id, sessionId);
    const hasVerifiedCallsign = caller.callsign_verified === true && !!callsign;
    let canTransmit = hasVerifiedCallsign;
    if (canTransmit && channel.moderator_only && !isModerator) canTransmit = false;
    if (canTransmit && channel.admin_only && !isStaff) canTransmit = false;
    // Listen-only channels (and every channel in a listen-only zone) carry audio feeds: nobody keys up on them.
    const listenOnly = channel.listen_only === true || zone.listen_only === true;
    if (listenOnly) canTransmit = false;
    const canModerate = isModerator;
    const displayName = caller.full_name || caller.email || 'Member';
    const canonicalChannelId = channel.id;
    const roomName = `radio-${canonicalChannelId}`;

    // All transmit-floor decisions are made by the shared Radio Gateway.
    // This keeps installed desktop builds and the website on one authority
    // while they continue to use the authenticated Base44 function interface.
    if (action === 'request' || action === 'renew' || action === 'release') {
      const isMuted = await mutedPromise;
      if (action === 'request' && listenOnly) return Response.json({ ok: true, granted: false, reason: 'listen_only' });
      if (action === 'request' && !canTransmit) return Response.json({ ok: true, granted: false, reason: 'not_authorized' });
      if (action === 'request' && isMuted) return Response.json({ ok: true, granted: false, reason: 'muted' });

      const liveKitApiKey = secrets.get('LIVEKIT_API_KEY');
      const liveKitApiSecret = secrets.get('LIVEKIT_API_SECRET');
      const liveKitUrl = secrets.get('LIVEKIT_URL');
      if (!liveKitApiKey || !liveKitApiSecret || !liveKitUrl) return Response.json({ ok: false, error: 'Voice provider is not configured.' }, { status: 503 });

      const assertion = await createRadioGatewayAssertion({
        apiKey: liveKitApiKey,
        apiSecret: liveKitApiSecret,
        roomName,
        identity: radioSessionId,
        displayName,
        ttl: '30s',
        metadata: {
          callsign: callsign || null,
          radioCallsign: radioCallsign || callsign || null,
          displayName,
          canTransmit: canTransmit && !isMuted,
          canModerate,
          userId: callerId,
          radioSessionId,
          sessionType: 'radio',
        },
      });

      let gatewayResult: any;
      try {
        gatewayResult = await callRadioGateway(liveKitUrl, 'floor', { action, session_assertion: assertion });
      } catch (error: any) {
        const status = Number(error?.status) || 503;
        const detail = status === 401 ? 'Radio session expired. Reconnect and try again.' : 'Radio Gateway is temporarily unavailable.';
        return Response.json({ ok: false, error: detail, reason: error?.data?.reason }, { status: status >= 400 && status < 600 ? status : 503 });
      }

      // RadioFloorState only mirrors the gateway's decision for the website's
      // "who's talking" display. Answer the radio without waiting more than
      // MIRROR_WAIT_MS for it: a slow Base44 must not make a granted PTT time out.
      const mirror = (async () => {
      const floorRows = await base44.asServiceRole.entities.RadioFloorState.filter(
        { channel_id: canonicalChannelId }, '-created_date', 50
      ).catch(() => []);
      const ourRows = (floorRows || []).filter((row: any) => sameLease(row, callerId, radioSessionId));
      const since = String(gatewayResult.since || new Date().toISOString());

      if (action === 'request' && gatewayResult.granted) {
        for (const row of floorRows || []) {
          if (!sameLease(row, callerId, radioSessionId)) await base44.asServiceRole.entities.RadioFloorState.delete(row.id).catch(() => {});
        }
        const primary = ourRows[0];
        if (primary?.id) {
          await base44.asServiceRole.entities.RadioFloorState.update(primary.id, {
            holder_callsign: radioCallsign || callsign,
            holder_display_name: displayName,
            since,
          }).catch((error: any) => console.error('[radio-ptt] gateway floor mirror update failed:', error?.message || error));
          for (const extra of ourRows.slice(1)) await base44.asServiceRole.entities.RadioFloorState.delete(extra.id).catch(() => {});
        } else {
          await base44.asServiceRole.entities.RadioFloorState.create({
            channel_id: canonicalChannelId,
            holder_user_id: callerId,
            holder_session_id: radioSessionId,
            holder_callsign: radioCallsign || callsign,
            holder_display_name: displayName,
            since,
          }).catch((error: any) => console.error('[radio-ptt] gateway floor mirror create failed:', error?.message || error));
        }
      } else if (action === 'renew' && gatewayResult.renewed) {
        if (ourRows[0]?.id) {
          await base44.asServiceRole.entities.RadioFloorState.update(ourRows[0].id, { since }).catch((error: any) => console.error('[radio-ptt] gateway floor mirror renew failed:', error?.message || error));
          for (const extra of ourRows.slice(1)) await base44.asServiceRole.entities.RadioFloorState.delete(extra.id).catch(() => {});
        } else {
          await base44.asServiceRole.entities.RadioFloorState.create({
            channel_id: canonicalChannelId,
            holder_user_id: callerId,
            holder_session_id: radioSessionId,
            holder_callsign: radioCallsign || callsign,
            holder_display_name: displayName,
            since,
          }).catch((error: any) => console.error('[radio-ptt] gateway floor mirror recover failed:', error?.message || error));
        }
      } else if (action === 'release' || action === 'renew') {
        for (const row of ourRows) {
          if (action === 'release') await base44.asServiceRole.entities.RadioFloorState.update(row.id, { since: '2000-01-01T00:00:00.000Z' }).catch(() => {});
          await base44.asServiceRole.entities.RadioFloorState.delete(row.id).catch(() => {});
        }
      }
      })().catch((error: any) => console.error('[radio-ptt] gateway floor mirror failed:', error?.message || error));
      await Promise.race([mirror, new Promise((resolve) => setTimeout(resolve, MIRROR_WAIT_MS))]);

      if (action === 'request' && !gatewayResult.granted && gatewayResult.reason === 'busy') {
        return Response.json({ ...gatewayResult, holder: { userId: null, callsign: gatewayResult.callsign || null, displayName: null } });
      }
      return Response.json({ ...gatewayResult, callsign: gatewayResult.callsign || radioCallsign || callsign, displayName });
    }

    const svc = liveKitClient();
    const updatePublishPermission = async (canPublish, identity = radioSessionId) => {
      if (!svc) return;
      await svc.updateParticipant(roomName, identity, { permission: { canSubscribe: true, canPublish, canPublishData: false } }).catch(() => {});
    };

    const silencePublishedAudio = async (identity = radioSessionId) => {
      if (!svc || !identity) return;
      try {
        const participants = await svc.listParticipants(roomName);
        const target = participants.find((p: any) => sameUser(p.identity, identity));
        for (const t of target?.tracks || []) {
          if (t.type === 0 && t.sid) {
            await svc.mutePublishedTrack(roomName, identity, t.sid, true).catch(() => {});
          }
        }
      } catch {
        // Best-effort cleanup; floor state remains authoritative.
      }
    };

    // RELEASE IS THE ABSOLUTE FAST-PATH: clear the database floor BEFORE
    // doing any LiveKit work. Key-up must release the authoritative lease
    // even when RoomService is slow or temporarily unavailable.
    if (action === 'release') {
      const ownedRows = await base44.asServiceRole.entities.RadioFloorState.filter(
        { channel_id: canonicalChannelId, holder_user_id: callerId, holder_session_id: radioSessionId }, '-created_date', 50
      ).catch(() => []);

      // Expire first so every listener will stop showing TX immediately,
      // even if a delete is delayed. Deleting after expiry also makes a
      // concurrent late renew fail instead of reviving the lease.
      const expiredSince = '2000-01-01T00:00:00.000Z';
      let releasedRows = 0;
      for (const row of ownedRows || []) {
        await base44.asServiceRole.entities.RadioFloorState.update(row.id, { since: expiredSince }).catch(() => {});
        await base44.asServiceRole.entities.RadioFloorState.delete(row.id).then(() => {
          releasedRows += 1;
        }).catch(() => {});
      }

      // LiveKit cleanup is best-effort and deliberately happens AFTER the
      // authoritative floor state is cleared.
      await updatePublishPermission(false, radioSessionId);
      await silencePublishedAudio(radioSessionId);

      return Response.json({ ok: true, releasedRows });
    }

    // Read the current floor. The request path below uses a short-lived
    // deterministic lock row to serialize competing claims as far as the
    // entity API allows. We also re-check the floor immediately after the
    // claim, before granting LiveKit publish permission.
    const readFloor = async (preferredUserId = '', preferredSessionId = '', allowUnpublishedSessionId = '') => {
      const rows = await base44.asServiceRole.entities.RadioFloorState.filter(
        { channel_id: canonicalChannelId }, '-created_date', 5
      ).catch(() => []);
      const now = Date.now();
      // rows are newest-first. Normally there is one live claim; when
      // duplicates exist, active LiveKit audio is used to identify the real
      // transmitter before removing redundant floor rows.
      const liveRows = rows
        .map((r: any) => ({ ...r, _sinceMs: Date.parse(r.since || "") }))
        .filter((r: any) =>
          r.holder_user_id &&
          Number.isFinite(r._sinceMs) &&
          r._sinceMs <= now &&
          now - r._sinceMs < HOLD_TTL_MS
        )
        .sort((a: any, b: any) => b._sinceMs - a._sinceMs);

      // The most recently renewed live lease is authoritative. When every
      // live duplicate belongs to this caller, prefer that caller's newest
      // lease; otherwise never let a stale/self-owned row override another
      // member's newer active lease.
      const sameCallerRows = preferredUserId
        ? liveRows.filter((r: any) => sameLease(r, preferredUserId, preferredSessionId || r.holder_session_id || preferredUserId))
        : [];
      let live = sameCallerRows.length === liveRows.length && sameCallerRows.length
        ? sameCallerRows[0]
        : liveRows[0];

      // A live lease is only a real "busy" condition when the holder is
      // actually present in this LiveKit room with an audio publication.
      // The caller's just-created claim is exempt because the client has not
      // published its microphone yet; that claim must survive long enough for
      // requestPTT to finish publishing.
      const preferredLease = preferredUserId ? sameLease(live, preferredUserId, preferredSessionId || live?.holder_session_id || preferredUserId) : false;
      const isUnpublishedCandidate = !!allowUnpublishedSessionId && sameSession(live?.holder_session_id, allowUnpublishedSessionId);
      if (live && svc) {
        try {
          const participants = await svc.listParticipants(roomName);
          const isPublishing = (row: any) => {
            const holderIdentity = row?.holder_session_id || row?.holder_user_id;
            const holder = participants.find((p: any) => sameUser(p.identity, holderIdentity));
            return holder?.permission?.canPublish === true && (holder?.tracks || []).some(
              (t: any) => t.type === 0 && t.muted !== true
            );
          };

          // A just-created candidate has no mic publication yet. It is only
          // allowed to win when no other live floor row has an active audio
          // publication. This prevents a new request from stealing the floor
          // from a member who is already transmitting merely because the
          // candidate row was created a few milliseconds later.
          const activeOtherRows = liveRows
            .filter((r: any) => !allowUnpublishedSessionId || !sameSession(r.holder_session_id, allowUnpublishedSessionId))
            .filter((r: any) => isPublishing(r));
          if (isUnpublishedCandidate) {
            if (activeOtherRows.length) live = activeOtherRows[0];
          } else if (!preferredLease && !isPublishing(live)) {
            live = null;
          }
        } catch {
          // If LiveKit cannot be checked, keep the database lease as the
          // conservative fallback rather than allowing two transmitters.
        }
      }

      // Clean expired, stale, and duplicate rows so they cannot accumulate
      // and interfere with a later request.
      for (const r of rows) {
        if (r.id !== live?.id) await base44.asServiceRole.entities.RadioFloorState.delete(r.id).catch(() => {});
      }
      return live || null;
    };
    let live = await readFloor(callerId, radioSessionId);

    if (action === 'request') {
      if (!canTransmit) return Response.json({ ok: true, granted: false, reason: 'not_authorized' });

      const mutedRows = await base44.asServiceRole.entities.RadioMute.filter(
        { channel_id: canonicalChannelId, user_id: caller.id }, '-created_date', 1
      ).catch(() => []);
      if (mutedRows?.length) return Response.json({ ok: true, granted: false, reason: 'muted' });

      if (live && !sameLease(live, callerId, radioSessionId)) {
        live = await readFloor(callerId, radioSessionId);
        if (live && !sameLease(live, callerId, radioSessionId)) {
          await silencePublishedAudio(radioSessionId);
          return Response.json({
            ok: true,
            granted: false,
            reason: 'busy',
            holder: {
              userId: live.holder_user_id,
              callsign: live.holder_callsign,
              displayName: live.holder_display_name,
            },
          });
        }
      }

      // Re-read immediately before creating a new claim. This narrows the
      // race window and, critically, we verify ownership again after create
      // instead of assuming our write won a concurrent request.
      const latest = await readFloor(callerId, radioSessionId);
      if (latest && !sameLease(latest, callerId, radioSessionId)) {
        await silencePublishedAudio(radioSessionId);
        return Response.json({
          ok: true,
          granted: false,
          reason: 'busy',
          holder: {
            userId: latest.holder_user_id,
            callsign: latest.holder_callsign,
            displayName: latest.holder_display_name,
          },
        });
      }

      const nowIso = new Date().toISOString();
      if (latest && sameLease(latest, callerId, radioSessionId)) {
        live = latest;
        await updatePublishPermission(true, radioSessionId);
        await base44.asServiceRole.entities.RadioFloorState.update(live.id, { since: nowIso });
      } else {
        // Keep the floor row payload minimal and explicit. The callsign/name
        // are useful display metadata, but channel_id + holder_user_id are
        // the only required fields and should never prevent PTT from working.
        const created = await base44.asServiceRole.entities.RadioFloorState.create({
          channel_id: canonicalChannelId,
          holder_user_id: caller.id,
          holder_session_id: radioSessionId,
          holder_callsign: radioCallsign || callsign,
          holder_display_name: displayName,
          since: nowIso,
        });
        if (!created?.id) throw new Error('Radio floor state could not be created');

        // Never grant publish permission until we have re-read the floor and
        // confirmed this exact caller owns the live claim. If another request
        // won a concurrent claim, this request is rejected and its permission
        // is explicitly revoked.
        // Give the entity write a moment to become visible before the
        // ownership check. Prefer this caller's exact claim when duplicates
        // are present so our own valid claim is never mistaken for a busy
        // result from another stale row.
        await new Promise((resolve) => setTimeout(resolve, 75));
        // After creating a candidate claim, determine the winner globally.
        // Never prefer this caller's own row here: concurrent PTT presses can
        // otherwise each see their own claim and both receive a grant.
        const winner = await readFloor('', '', radioSessionId);
        if (!winner || !sameUser(winner.id, created.id)) {
          await updatePublishPermission(false, radioSessionId);
          await silencePublishedAudio(radioSessionId);
          return Response.json({
            ok: true,
            granted: false,
            reason: 'busy',
            holder: {
              userId: winner?.holder_user_id || null,
              callsign: winner?.holder_callsign || null,
              displayName: winner?.holder_display_name || null,
            },
          });
        }
        live = winner;
        await updatePublishPermission(true, radioSessionId);
      }
      return Response.json({ ok: true, granted: true, callsign, displayName });
    }

    if (action === 'renew') {
      // Renew is an owner-only lease heartbeat. Do NOT run readFloor() here:
      // that routine is intentionally allowed to reconcile competing users
      // and inspect LiveKit, which is exactly the wrong thing to do on a
      // healthy holder's 5-second heartbeat. A temporary RoomService view,
      // duplicate row, or another listener's stale state must never make the
      // current owner lose its own lease.
      const ownedLiveRows = await base44.asServiceRole.entities.RadioFloorState.filter(
        { channel_id: canonicalChannelId, holder_user_id: callerId, holder_session_id: radioSessionId }, '-created_date', 20
      ).catch(() => []);

      const now = Date.now();
      const ownedLiveRowsParsed = (ownedLiveRows || [])
        .map((r: any) => ({ ...r, _sinceMs: Date.parse(r.since || '') }))
        .filter((r: any) =>
          Number.isFinite(r._sinceMs) &&
          r._sinceMs <= now &&
          now - r._sinceMs < HOLD_TTL_MS
        )
        .sort((a: any, b: any) => b._sinceMs - a._sinceMs);

      if (!ownedLiveRowsParsed.length) {
        await updatePublishPermission(false, radioSessionId);
        return Response.json({ ok: false, error: 'You do not currently hold the floor on this channel.' }, { status: 409 });
      }

      const primary = ownedLiveRowsParsed[0];
      const nowIso = new Date().toISOString();
      try {
        await base44.asServiceRole.entities.RadioFloorState.update(primary.id, { since: nowIso });
        // Concurrent taps/tabs of the same account can create duplicate rows.
        // Keep only the newest owner row so later reads cannot see two grants.
        for (const extra of ownedLiveRowsParsed.slice(1)) {
          await base44.asServiceRole.entities.RadioFloorState.delete(extra.id).catch(() => {});
        }
      } catch {
        await updatePublishPermission(false, radioSessionId);
        return Response.json({ ok: false, error: 'The radio floor could not be renewed.' }, { status: 409 });
      }
      return Response.json({ ok: true });
    }

    if (action === 'moderate') {
      if (!canModerate) return Response.json({ error: 'Not authorized to moderate' }, { status: 403 });
      const modAction = String(body.mod_action || '');
      const releaseGatewayFloor = async () => {
        const liveKitApiKey = secrets.get('LIVEKIT_API_KEY');
        const liveKitApiSecret = secrets.get('LIVEKIT_API_SECRET');
        const liveKitUrl = secrets.get('LIVEKIT_URL');
        if (!liveKitApiKey || !liveKitApiSecret || !liveKitUrl) throw new Error('Voice provider is not configured.');
        const assertion = await createRadioGatewayAssertion({
          apiKey: liveKitApiKey,
          apiSecret: liveKitApiSecret,
          roomName,
          identity: radioSessionId,
          displayName,
          ttl: '30s',
          metadata: { callsign: callsign || null, radioCallsign: radioCallsign || callsign || null, displayName, canTransmit: false, canModerate: true, userId: callerId, radioSessionId, sessionType: 'radio' },
        });
        return await callRadioGateway(liveKitUrl, 'floor', { action: 'force-release', session_assertion: assertion });
      };

      if (modAction === 'force_release') {
        try { await releaseGatewayFloor(); }
        catch (error: any) { return Response.json({ error: error?.message || 'Radio Gateway could not release the floor.' }, { status: Number(error?.status) || 503 }); }
        if (live) {
          await updatePublishPermission(false, live.holder_session_id || live.holder_user_id);
          await base44.asServiceRole.entities.RadioFloorState.delete(live.id).catch(() => {});
        }
        return Response.json({ ok: true });
      }

      const targetUserId = String(body.target_user_id || '').trim();
      if (!targetUserId) return Response.json({ error: 'target_user_id required' }, { status: 400 });

      if (modAction === 'mute') {
        await base44.asServiceRole.entities.RadioMute.create({
          channel_id: canonicalChannelId, user_id: targetUserId, muted_by_name: displayName, muted_at: new Date().toISOString(),
        }).catch(() => {});
        if (live && live.holder_user_id === targetUserId) {
          try { await releaseGatewayFloor(); }
          catch (error: any) { return Response.json({ error: error?.message || 'Radio Gateway could not release the muted transmitter.' }, { status: Number(error?.status) || 503 }); }
          await updatePublishPermission(false, live?.holder_session_id || targetUserId);
          await base44.asServiceRole.entities.RadioFloorState.delete(live.id).catch(() => {});
        }
        // Best-effort: also silence their currently-published mic track live,
        // not just block their next request. Never fail the moderation action
        // over this -- the RadioMute row above is what actually enforces it.
        try {
          const svc = liveKitClient();
          if (svc) {
            const participants = await svc.listParticipants(roomName);
            const targetIdentity = live?.holder_session_id || targetUserId;
            const target = participants.find((p: any) => p.identity === targetIdentity);
            for (const t of target?.tracks || []) {
              if (t.type === 0 && t.sid) await svc.mutePublishedTrack(roomName, targetIdentity, t.sid, true);
            }
          }
        } catch { /* best-effort only */ }
        return Response.json({ ok: true });
      }

      if (modAction === 'unmute') {
        const muteRows = await base44.asServiceRole.entities.RadioMute.filter(
          { channel_id: channelId, user_id: targetUserId }
        ).catch(() => []);
        for (const r of muteRows || []) await base44.asServiceRole.entities.RadioMute.delete(r.id).catch(() => {});
        return Response.json({ ok: true });
      }

      if (modAction === 'kick') {
        if (live && live.holder_user_id === targetUserId) {
          try { await releaseGatewayFloor(); }
          catch (error: any) { return Response.json({ error: error?.message || 'Radio Gateway could not release the transmitter.' }, { status: Number(error?.status) || 503 }); }
          await base44.asServiceRole.entities.RadioFloorState.delete(live.id).catch(() => {});
        }
        try {
          const svc = liveKitClient();
          if (svc) {
            const participants = await svc.listParticipants(roomName);
            const targetIdentities = participants
              .filter((p: any) => {
                try { return JSON.parse(p.metadata || '{}').userId === targetUserId; } catch { return false; }
              })
              .map((p: any) => p.identity);
            for (const identity of targetIdentities) await svc.removeParticipant(roomName, identity).catch(() => {});
          }
        } catch { /* best-effort -- they'll still show connected until they notice */ }
        return Response.json({ ok: true });
      }

      return Response.json({ error: 'Unknown moderation action' }, { status: 400 });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error?.message || String(error) || 'Unknown radio server error';
    console.error('[radio-ptt] error:', message, error);
    return Response.json({ error: message }, { status: 500 });
  }
}
