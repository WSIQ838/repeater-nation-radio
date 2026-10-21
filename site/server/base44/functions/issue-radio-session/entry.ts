import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { AccessToken } from 'npm:livekit-server-sdk@2';
import { secrets } from 'base44:runtime';
import { getByIdWithFallback } from '../../shared/adminGuard.ts';
import { callRadioGateway } from '../../shared/radioGateway.ts';
import { findRadioRecord, findRadioChannelByNumber, readRadioRows } from '../../shared/radioLookup.ts';

// ===== APP-SPECIFIC =====
// Issues everything a member's browser needs to join a web-radio channel:
// a LiveKit room token (the actual audio transport, also carrying the
// caller's verified callsign/display name/canModerate as participant
// metadata so every client can build a live roster straight from LiveKit's
// own participant list -- no separate presence system needed). This is the
// ONLY place that decides whether someone can join a channel at all; PTT
// grant/release/moderation are re-checked per action by radio-ptt, since
// there's no persistent per-connection identity to hand a token to (see
// that function's own comment for why -- it replaces a Base44 Actor that
// turned out to accept connections but never deliver any response, a
// platform-level dead end for this app). A fresh call is required roughly
// every 5 minutes (the LiveKit token's TTL) or whenever the member changes
// channel; see useRadioSession.js's periodic refresh.
//
// canTransmit requires BOTH: the member's account has a currently verified
// callsign (User.callsign_verified === true -- the same flag every other
// protected feature in this app already gates on), AND their role clears
// whatever this specific channel requires (moderator_only/admin_only).
// A member with no verified callsign can still join and listen.
// ===== END APP-SPECIFIC =====

const STAFF_ROLES = ['admin', 'super_admin'];
const MODERATE_ROLES = ['admin', 'super_admin', 'moderator'];

export default async function(req: Request): Promise<Response> {
  let stage = 'startup';
  try {
    stage = 'create-client';
    const base44 = createClientFromRequest(req);
    stage = 'authenticate';
    const caller = await base44.auth.me().catch(() => null);
    stage = 'parse-request';
    const body = await req.json().catch(() => ({}));
    const sessionType = body.session_type === 'monitor' ? 'monitor' : 'radio';
    if (!caller && sessionType !== 'monitor') return Response.json({ error: 'Authentication required' }, { status: 401 });
    const requestedRadioSessionId = String(body.radio_session_id || '').trim();
    if (caller?.account_status && ['suspended', 'banned', 'investigation', 'deleted'].includes(caller.account_status)) {
      return Response.json({ error: 'Your account cannot use the radio right now' }, { status: 403 });
    }

    const channelId = String(body.channel_id || '').trim();
    const zoneId = String(body.zone_id || '').trim();
    const channelNumber = Number(body.channel_number);
    if (!channelId) return Response.json({ error: 'channel_id required' }, { status: 400 });

    const settings = (await base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1).catch(() => []))[0];
    if (settings && settings.radio_enabled === false) {
      return Response.json({ error: 'The web radio is currently disabled' }, { status: 403 });
    }

    stage = 'load-channel';
    // findRadioRecord retries and falls back to the caller's own read, so a
    // failed service-role read no longer turns into "Channel not found".
    let channel = await findRadioRecord(base44, 'RadioChannel', channelId, 'number');
    // Recover an older/stale browser selection from the current zone and
    // channel number instead of returning a misleading Channel not found.
    if (!channel && zoneId && Number.isFinite(channelNumber)) {
      channel = await findRadioChannelByNumber(base44, zoneId, channelNumber);
    }
    if (!channel || channel.enabled === false) {
      return Response.json({ error: 'Channel not found' }, { status: 404 });
    }
    stage = 'load-zone';
    const zone = channel.zone_id
      ? await findRadioRecord(base44, 'RadioZone', channel.zone_id, 'display_order')
      : null;
    if (!zone || zone.enabled === false) {
      return Response.json({ error: 'Zone not found' }, { status: 404 });
    }

    const role = caller?.role || 'user';
    const isStaff = STAFF_ROLES.includes(role);
    const isModerator = MODERATE_ROLES.includes(role);

    const roleRank: Record<string, number> = { user: 0, moderator: 1, admin: 2, super_admin: 2 };
    const requiredRole = roleRank[zone.min_role] || 0;
    if (sessionType === 'monitor' && !caller) {
      // Anonymous monitor sessions are intentionally limited to the exact
      // channels selected by administrators for the public monitor grid.
      const monitorConfigs = await base44.asServiceRole.entities.RadioMonitorConfig.list('-updated_date', 1).catch(() => []);
      const configuredIds = new Set(Array.isArray(monitorConfigs?.[0]?.slots) ? monitorConfigs[0].slots.filter(Boolean) : []);
      if (!configuredIds.has(channel.id)) return Response.json({ error: 'This channel is not available on the public monitor' }, { status: 403 });
      if (requiredRole > 0 || channel.admin_only) return Response.json({ error: 'This channel is not available on the public monitor' }, { status: 403 });
    } else {
      if (requiredRole > (roleRank[role] || 0)) {
        return Response.json({ error: 'You do not have access to this zone' }, { status: 403 });
      }
      if (channel.admin_only && !isStaff) {
        return Response.json({ error: 'This channel is restricted to admins' }, { status: 403 });
      }
    }

    // Same verified-callsign source used everywhere else in this app --
    // never trust a self-reported callsign for something broadcast live.
    const callsign = String(caller?.callsign || '').trim().toUpperCase();
    const hasVerifiedCallsign = caller?.callsign_verified === true && !!callsign;

    let canTransmit = hasVerifiedCallsign;
    if (canTransmit && channel.moderator_only && !isModerator) canTransmit = false;
    if (canTransmit && channel.admin_only && !isStaff) canTransmit = false;
    // Listen-only channels (and every channel in a listen-only zone) carry audio feeds: nobody keys up on them.
    const listenOnly = channel.listen_only === true || zone.listen_only === true;
    if (listenOnly) canTransmit = false;

    const canModerate = isModerator;
    const displayName = caller?.full_name || caller?.email || 'Monitor';

    stage = 'load-voice-config';
    const liveKitApiKey = secrets.get('LIVEKIT_API_KEY');
    const liveKitApiSecret = secrets.get('LIVEKIT_API_SECRET');
    const liveKitUrl = secrets.get('LIVEKIT_URL');
    if (!liveKitApiKey || !liveKitApiSecret || !liveKitUrl) {
      return Response.json({ error: 'Voice provider is not configured yet' }, { status: 503 });
    }

    const canonicalChannelId = channel.id;
    const roomName = `radio-${canonicalChannelId}`;

    // Stable radio callsign: primary account gets 1-CALLSIGN, additional
    // accounts sharing that FCC callsign get 2-CALLSIGN, 3-CALLSIGN, etc.
    // The stable radio_callsign is what the radio/floor roster displays.
    // LiveKit still gets a per-connection suffix so two sessions from the
    // same account never collide.
    let radioCallsign = callsign || '';
    if (caller && callsign) {
      // readRadioRows returns null when the database couldn't be read. A new
      // identity is only created when every read it depends on answered;
      // otherwise this session uses a best-guess radio callsign and writes
      // nothing (failed reads used to create a duplicate on every refresh).
      const existingRows = await readRadioRows(base44, 'RadioIdentity', { user_id: caller.id, normalized_callsign: callsign }, '-assigned_at', 5);
      const existingIdentity = existingRows?.[0];
      if (existingIdentity?.radio_callsign) {
        radioCallsign = String(existingIdentity.radio_callsign);
      } else {
        const primaryRows = existingRows ? await readRadioRows(base44, 'Callsign', { normalized_callsign: callsign }, '-created_date', 5) : null;
        const primaryUserId = primaryRows?.[0]?.primary_user_id || '';
        let radioNumber = 1;
        let known = !!existingRows && !!primaryRows;
        if (primaryUserId && primaryUserId !== caller.id) {
          const identities = await readRadioRows(base44, 'RadioIdentity', { normalized_callsign: callsign }, 'radio_number', 100);
          if (!identities) known = false;
          const used = new Set((identities || []).map((r: any) => Number(r.radio_number)).filter((n: number) => Number.isFinite(n) && n > 0));
          radioNumber = 2;
          while (used.has(radioNumber)) radioNumber++;
        }
        radioCallsign = `${radioNumber}-${callsign}`;
        if (known) await base44.asServiceRole.entities.RadioIdentity.create({
          user_id: caller.id,
          normalized_callsign: callsign,
          display_callsign: callsign,
          radio_number: radioNumber,
          radio_callsign: radioCallsign,
          assigned_at: new Date().toISOString(),
          active: true,
        }).catch(() => {});
      }
    }

    // A LiveKit identity is a CONNECTION identity, not an account identity.
    // Reusing caller.id lets a desktop app and browser tab disconnect one
    // another as DUPLICATE_IDENTITY. Keep the same session id across token
    // refreshes, but mint a new one for a new radio connection.
    const radioSessionPrefix = radioCallsign ? `${radioCallsign}-` : `rn-radio-${caller?.id || 'monitor'}-`;
    const radioSessionId = sessionType === 'monitor'
      ? `rn-monitor-${canonicalChannelId}-${crypto.randomUUID()}`
      : (requestedRadioSessionId.startsWith(radioSessionPrefix) && requestedRadioSessionId.length > radioSessionPrefix.length + 32
          ? requestedRadioSessionId
          : `${radioSessionPrefix}${crypto.randomUUID()}`);
    // canPublish reflects overall eligibility for this channel; WHEN the
    // client actually publishes a track is gated live by radio-ptt's floor
    // grant, not by re-issuing a token on every press. metadata rides along
    // on the LiveKit participant object itself, so every connected client
    // can read every other participant's callsign/display name/moderator
    // status straight off LiveKit's own participant list -- the presence
    // roster needs nothing beyond what LiveKit already tracks.
    stage = 'create-livekit-token';
    const at = new AccessToken(liveKitApiKey, liveKitApiSecret, {
      identity: radioSessionId,
      name: displayName,
      ttl: '5m',
      metadata: JSON.stringify({ callsign: callsign || null, radioCallsign: radioCallsign || null, displayName, canTransmit, canModerate, userId: caller?.id || null, radioSessionId, sessionType, maxUsers: Number(channel.max_users) > 0 ? Math.floor(Number(channel.max_users)) : 0 }),
    });
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: false,
      canPublishData: false,
      canSubscribe: true,
    });
    stage = 'sign-livekit-token';
    const sessionAssertion = await at.toJwt();

    stage = 'gateway-session';
    const gatewaySession = await callRadioGateway(liveKitUrl, 'session', { session_assertion: sessionAssertion });
    if (!gatewaySession?.liveKitToken || gatewaySession.roomName !== roomName || gatewaySession.radioSessionId !== radioSessionId) {
      return Response.json({ error: 'Radio Gateway returned an invalid session.' }, { status: 503 });
    }

    return Response.json({
      ok: true,
      userId: caller?.id || null,
      radioSessionId,
      sessionType,
      liveKitToken: gatewaySession.liveKitToken,
      liveKitUrl: gatewaySession.liveKitUrl,
      roomName,
      channelId: canonicalChannelId,
      zoneId: channel.zone_id,
      channelNumber: channel.number,
      callsign: callsign || null,
      radioCallsign: radioCallsign || null,
      displayName,
      canTransmit,
      listenOnly,
      canModerate,
    });
  } catch (error) {
    const message = error?.message || String(error) || 'Unknown radio server error';
    console.error('[issue-radio-session] error:', stage, message, error);
    return Response.json({ error: `Radio session failed at ${stage}: ${message}`, code: stage, detail: message }, { status: 500 });
  }
}
