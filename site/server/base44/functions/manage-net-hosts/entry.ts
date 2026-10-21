// Collaborative Net Control host management — invite, accept, decline, remove,
// change permissions, transfer primary control, and list shared nets.
// All operations run as service role after verifying the caller's identity.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { canManageHosts } from '../../shared/netHostPermissions.ts';
import { postDiscordNotification } from '../../shared/discordWebhook.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // Authenticate caller
    let caller;
    try {
      caller = await base44.auth.me();
    } catch {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!caller?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });

    // ── LIST: return all hosts for a session ──
    if (action === 'list') {
      const sessionId = String(body.session_id || '');
      if (!sessionId) return Response.json({ error: 'session_id required' }, { status: 400 });
      const session = await base44.asServiceRole.entities.NetControlSession.get(sessionId).catch(() => null);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      // Verify access. Treat an accepted host record as authoritative as well as
      // the session's cached host_user_ids list, because older sessions can have
      // a stale host_user_ids array even though the co-host invitation is valid.
      const isPrimary = session.primary_user_id === caller.id || session.created_by_id === caller.id;
      const hosts = await base44.asServiceRole.entities.NetControlHost.filter({ session_id: sessionId }, '-created_date', 100);
      const myHost = (hosts || []).find((h: any) => h.user_id === caller.id && h.status === 'accepted');
      const isHost = !!myHost || (session.host_user_ids || []).includes(caller.id);
      const isAdmin = caller.role === 'admin' || caller.role === 'super_admin';
      if (!isPrimary && !isHost && !isAdmin) {
        return Response.json({ error: 'Not authorized' }, { status: 403 });
      }
      return Response.json({
        hosts: hosts || [],
        isPrimary,
        myPermission: isPrimary ? 'full' : (myHost?.permission_level || null),
      });
    }

    // ── SEARCH_USERS: find users by name or callsign ──
    if (action === 'search_users') {
      const query = String(body.query || '').toLowerCase().trim();
      if (query.length < 1) return Response.json({ users: [] });
      const profiles = await base44.asServiceRole.entities.Profile.list('-updated_date', 500);
      const results = (profiles || [])
        .filter((p: any) => {
          const cs = (p.callsign || '').toLowerCase();
          const dn = (p.display_name || '').toLowerCase();
          return cs.includes(query) || dn.includes(query);
        })
        .slice(0, 20)
        .map((p: any) => ({
          user_id: p.created_by_id || '',
          display_name: p.display_name || '',
          callsign: p.callsign || '',
          avatar_url: p.avatar_url || '',
        }))
        .filter((r: any) => r.user_id);
      return Response.json({ users: results });
    }

    // ── MY_SHARED_NETS: nets where I'm a co-host + pending invitations ──
    if (action === 'my_shared_nets') {
      const [accepted, pending] = await Promise.all([
        base44.asServiceRole.entities.NetControlHost.filter({ user_id: caller.id, status: 'accepted' }, '-updated_date', 200),
        base44.asServiceRole.entities.NetControlHost.filter({ user_id: caller.id, status: 'invited' }, '-updated_date', 50),
      ]);
      const acceptedSessions = await Promise.all(
        (accepted || []).map((h: any) => base44.asServiceRole.entities.NetControlSession.get(h.session_id).catch(() => null))
      );
      const pendingSessions = await Promise.all(
        (pending || []).map((h: any) => base44.asServiceRole.entities.NetControlSession.get(h.session_id).catch(() => null))
      );
      const nets = (acceptedSessions || []).filter(Boolean).map((s: any) => {
        const host = (accepted || []).find((h: any) => h.session_id === s.id);
        return { ...s, host_permission: host?.permission_level || 'view' };
      });
      const invitations = (pendingSessions || []).filter(Boolean).map((s: any) => {
        const host = (pending || []).find((h: any) => h.session_id === s.id);
        return {
          ...s,
          invitation_id: host?.id,
          invited_by_name: host?.invited_by_name,
          permission_level: host?.permission_level,
        };
      });
      return Response.json({ nets, invitations });
    }

    // ── INVITE: add a co-host (primary only) ──
    if (action === 'invite') {
      const sessionId = String(body.session_id || '');
      const session = await base44.asServiceRole.entities.NetControlSession.get(sessionId).catch(() => null);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });
      const isPrimary = session.primary_user_id === caller.id || session.created_by_id === caller.id;
      if (!canManageHosts(isPrimary)) return Response.json({ error: 'Only the primary operator can invite' }, { status: 403 });

      const userId = String(body.user_id || '');
      const userName = String(body.user_name || '');
      const userCallsign = String(body.user_callsign || '');
      const permissionLevel = ['full', 'checkin', 'view'].includes(body.permission_level) ? body.permission_level : 'view';
      const autoAccept = body.auto_accept === true;
      if (!userId) return Response.json({ error: 'user_id required' }, { status: 400 });
      if (userId === (session.primary_user_id || session.created_by_id)) {
        return Response.json({ error: 'Cannot invite the primary operator' }, { status: 400 });
      }

      // Check for existing host record
      const existing = await base44.asServiceRole.entities.NetControlHost.filter({ session_id: sessionId, user_id: userId }, '-updated_date', 5);
      const existingHost = (existing || [])[0];
      if (existingHost && existingHost.status === 'accepted' && autoAccept) {
        const hostIds = new Set(session.host_user_ids || []);
        hostIds.add(userId);
        await base44.asServiceRole.entities.NetControlSession.update(session.id, { host_user_ids: [...hostIds] });
        await base44.asServiceRole.entities.NetControlHost.update(existingHost.id, {
          status: 'accepted',
          permission_level: permissionLevel,
          user_name: userName,
          user_callsign: userCallsign,
        });
        return Response.json({ ok: true, autoAccepted: true });
      }
      if (existingHost && existingHost.status !== 'removed' && existingHost.status !== 'declined') {
        return Response.json({ error: 'User already has a pending or active invitation' }, { status: 409 });
      }

      const now = new Date().toISOString();
      if (existingHost) {
        await base44.asServiceRole.entities.NetControlHost.update(existingHost.id, {
          status: autoAccept ? 'accepted' : 'invited', permission_level: permissionLevel,
          invited_by_id: caller.id, invited_by_name: caller.full_name || '',
          invited_at: now, accepted_at: null,
          user_name: userName, user_callsign: userCallsign,
        });
      } else {
        await base44.asServiceRole.entities.NetControlHost.create({
          session_id: sessionId, user_id: userId, user_name: userName, user_callsign: userCallsign,
          permission_level: permissionLevel, is_primary: false, status: autoAccept ? 'accepted' : 'invited',
          invited_by_id: caller.id, invited_by_name: caller.full_name || '',
          invited_at: now, session_owner_id: session.created_by_id || session.primary_user_id || '',
        });
      }

      if (autoAccept) {
        const hostIds = new Set(session.host_user_ids || []);
        hostIds.add(userId);
        await base44.asServiceRole.entities.NetControlSession.update(session.id, { host_user_ids: [...hostIds] });
        return Response.json({ ok: true, autoAccepted: true });
      }

      // Send in-app notification
      await base44.asServiceRole.entities.UserNotification.create({
        user_id: userId,
        title: 'Net Control Invitation',
        message: `${caller.full_name || 'A net operator'} invited you to co-host the "${session.name}" net with ${permissionLevel} access.`,
        type: 'system',
        sender_name: caller.full_name || 'Net Control',
        link_url: '/tools/net-control',
        link_label: 'View Invitations',
      }).catch(() => {});

      await postDiscordNotification(base44, 'net_host_invite', 'net_host_invite', {
        inviter_name: caller.full_name || 'A net operator',
        invitee_display: `${userName || 'a member'}${userCallsign ? ` (${userCallsign})` : ''}`,
        net_name: session.name,
        permission_level: permissionLevel,
      });

      return Response.json({ ok: true });
    }

    // ── ACCEPT: accept an invitation ──
    if (action === 'accept') {
      const hostId = String(body.host_id || '');
      const host = await base44.asServiceRole.entities.NetControlHost.get(hostId).catch(() => null);
      if (!host) return Response.json({ error: 'Invitation not found' }, { status: 404 });
      if (host.user_id !== caller.id) return Response.json({ error: 'Not your invitation' }, { status: 403 });
      if (host.status !== 'invited') return Response.json({ error: 'Invitation is no longer pending' }, { status: 400 });

      await base44.asServiceRole.entities.NetControlHost.update(hostId, {
        status: 'accepted', accepted_at: new Date().toISOString(),
      });

      // Add to session host_user_ids
      const session = await base44.asServiceRole.entities.NetControlSession.get(host.session_id).catch(() => null);
      if (session) {
        const hostIds = new Set(session.host_user_ids || []);
        hostIds.add(caller.id);
        await base44.asServiceRole.entities.NetControlSession.update(session.id, {
          host_user_ids: [...hostIds],
        });
        if (host.invited_by_id && host.invited_by_id !== caller.id) {
          await base44.asServiceRole.entities.UserNotification.create({
            user_id: host.invited_by_id,
            title: 'Net Control Invitation Accepted',
            message: `${caller.full_name || host.user_name || 'A member'} accepted your invitation to co-host "${session.name}".`,
            type: 'system',
            sender_name: caller.full_name || host.user_name || 'Net Control',
            link_url: '/tools/net-control',
            link_label: 'View Net Control',
            description: `net_host:${host.id}:accepted`,
          }).catch(() => {});
        }
      }
      return Response.json({ ok: true });
    }

    // ── DECLINE: decline an invitation ──
    if (action === 'decline') {
      const hostId = String(body.host_id || '');
      const host = await base44.asServiceRole.entities.NetControlHost.get(hostId).catch(() => null);
      if (!host) return Response.json({ error: 'Invitation not found' }, { status: 404 });
      if (host.user_id !== caller.id) return Response.json({ error: 'Not your invitation' }, { status: 403 });
      await base44.asServiceRole.entities.NetControlHost.update(hostId, { status: 'declined' });
      return Response.json({ ok: true });
    }

    // ── REMOVE: remove a co-host (primary only) ──
    if (action === 'remove') {
      const hostId = String(body.host_id || '');
      const host = await base44.asServiceRole.entities.NetControlHost.get(hostId).catch(() => null);
      if (!host) return Response.json({ error: 'Host not found' }, { status: 404 });
      const session = await base44.asServiceRole.entities.NetControlSession.get(host.session_id).catch(() => null);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });
      const isPrimary = session.primary_user_id === caller.id || session.created_by_id === caller.id;
      if (!canManageHosts(isPrimary)) return Response.json({ error: 'Only the primary can remove hosts' }, { status: 403 });

      await base44.asServiceRole.entities.NetControlHost.update(hostId, { status: 'removed' });

      // Remove from session host_user_ids
      const hostIds = (session.host_user_ids || []).filter((id: string) => id !== host.user_id);
      await base44.asServiceRole.entities.NetControlSession.update(session.id, { host_user_ids: hostIds });
      await base44.asServiceRole.entities.UserNotification.create({
        user_id: host.user_id,
        title: 'Removed from Net Control',
        message: `You were removed as a co-host from "${session.name}".`,
        type: 'alert',
        sender_name: caller.full_name || 'Net Control',
        link_url: '/tools/net-control',
        link_label: 'View Net Control',
        description: `net_host:${host.id}:removed`,
      }).catch(() => {});
      return Response.json({ ok: true });
    }

    // ── UPDATE_PERMISSION: change a co-host's permission (primary only) ──
    if (action === 'update_permission') {
      const hostId = String(body.host_id || '');
      const permissionLevel = ['full', 'checkin', 'view'].includes(body.permission_level) ? body.permission_level : 'view';
      const host = await base44.asServiceRole.entities.NetControlHost.get(hostId).catch(() => null);
      if (!host) return Response.json({ error: 'Host not found' }, { status: 404 });
      const session = await base44.asServiceRole.entities.NetControlSession.get(host.session_id).catch(() => null);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });
      const isPrimary = session.primary_user_id === caller.id || session.created_by_id === caller.id;
      if (!canManageHosts(isPrimary)) return Response.json({ error: 'Only the primary can change permissions' }, { status: 403 });
      if (host.is_primary) return Response.json({ error: 'Cannot change primary permission' }, { status: 400 });

      await base44.asServiceRole.entities.NetControlHost.update(hostId, { permission_level: permissionLevel });
      return Response.json({ ok: true });
    }

    // ── TRANSFER: transfer primary control to a co-host ──
    if (action === 'transfer') {
      const sessionId = String(body.session_id || '');
      const newPrimaryUserId = String(body.new_primary_user_id || '');
      const session = await base44.asServiceRole.entities.NetControlSession.get(sessionId).catch(() => null);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });
      const isPrimary = session.primary_user_id === caller.id || session.created_by_id === caller.id;
      if (!canManageHosts(isPrimary)) return Response.json({ error: 'Only the primary can transfer' }, { status: 403 });
      if (!newPrimaryUserId) return Response.json({ error: 'new_primary_user_id required' }, { status: 400 });

      // Find the new primary's host record
      const hosts = await base44.asServiceRole.entities.NetControlHost.filter({ session_id: sessionId, user_id: newPrimaryUserId, status: 'accepted' }, '-updated_date', 5);
      const newHost = (hosts || [])[0];
      if (!newHost) return Response.json({ error: 'Target user is not an accepted co-host' }, { status: 400 });

      // Get new primary's display info
      const newPrimaryProfile = await base44.asServiceRole.entities.Profile.filter({ created_by_id: newPrimaryUserId }, '-updated_date', 1);
      const newPrimaryName = (newPrimaryProfile || [])[0]?.display_name || newHost.user_name || '';

      // Update session primary
      await base44.asServiceRole.entities.NetControlSession.update(sessionId, {
        primary_user_id: newPrimaryUserId,
        primary_user_name: newPrimaryName,
      });

      // Demote old primary to full co-host
      const oldPrimaryHosts = await base44.asServiceRole.entities.NetControlHost.filter({ session_id: sessionId, user_id: caller.id }, '-updated_date', 5);
      if ((oldPrimaryHosts || []).length > 0) {
        await base44.asServiceRole.entities.NetControlHost.update(oldPrimaryHosts[0].id, {
          is_primary: false, permission_level: 'full',
        });
      } else {
        const callerProfile = await base44.asServiceRole.entities.Profile.filter({ created_by_id: caller.id }, '-updated_date', 1);
        await base44.asServiceRole.entities.NetControlHost.create({
          session_id: sessionId, user_id: caller.id,
          user_name: (callerProfile || [])[0]?.display_name || caller.full_name || '',
          user_callsign: (callerProfile || [])[0]?.callsign || '',
          permission_level: 'full', is_primary: false, status: 'accepted',
          session_owner_id: session.created_by_id || '',
        });
      }

      // Promote new primary
      await base44.asServiceRole.entities.NetControlHost.update(newHost.id, {
        is_primary: true, permission_level: 'full',
      });

      // Notify the new primary
      await base44.asServiceRole.entities.UserNotification.create({
        user_id: newPrimaryUserId,
        title: 'Primary Net Control Transferred',
        message: `${caller.full_name || 'The previous primary'} transferred primary Net Control of "${session.name}" to you.`,
        type: 'system', sender_name: caller.full_name || 'Net Control',
      }).catch(() => {});

      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    console.error('[manage-net-hosts] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}