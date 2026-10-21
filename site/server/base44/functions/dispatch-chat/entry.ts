import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';

// Dispatcher-only text chat. Staff accounts (admin / super_admin) only.
//   poll  { since? }  marks the caller online, returns new messages and who is online
//   send  { text }    posts a message to every dispatcher
const STAFF = ['admin', 'super_admin', 'moderator'];
const bad = ['suspended', 'banned', 'investigation', 'deleted'];
const ONLINE_MS = 25 * 1000;
const KEEP = 200;

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (!STAFF.includes(String(me.role || '')) || bad.includes(me.account_status)) {
      return Response.json({ error: 'Control access required' }, { status: 403 });
    }
    const db = base44.asServiceRole.entities;
    const name = String(me.full_name || me.email || 'Dispatcher').slice(0, 60);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'send') {
      const text = String(body.text || '').trim().slice(0, 500);
      if (!text) return Response.json({ error: 'Type a message first' }, { status: 400 });
      const m = await db.DispatchChat.create({ user_id: me.id, name, text, sent_at: new Date().toISOString() });
      return Response.json({ ok: true, id: m.id });
    }

    if (action === 'poll') {
      const now = new Date().toISOString();
      const mine = (await db.DispatchPresence.filter({ user_id: me.id }, undefined, 1).catch(() => []))?.[0];
      if (mine) await db.DispatchPresence.update(mine.id, { name, last_seen: now }).catch(() => {});
      else await db.DispatchPresence.create({ user_id: me.id, name, last_seen: now }).catch(() => {});
      const rows = (await db.DispatchChat.list('-sent_at', KEEP).catch(() => [])) || [];
      const since = Date.parse(String(body.since || '')) || 0;
      const messages = rows.filter((r: any) => Date.parse(r.sent_at || r.created_date || '') > since).reverse()
        .map((r: any) => ({ id: r.id, userId: r.user_id, name: r.name || 'Dispatcher', text: r.text, at: r.sent_at || r.created_date }));
      const cutoff = Date.now() - ONLINE_MS;
      const people = ((await db.DispatchPresence.list('-last_seen', 100).catch(() => [])) || [])
        .filter((r: any) => Date.parse(r.last_seen || '') >= cutoff)
        .map((r: any) => ({ userId: r.user_id, name: r.name || 'Dispatcher' }));
      return Response.json({ ok: true, messages, online: people });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[dispatch-chat]', e?.message || e);
    return Response.json({ error: e?.message || 'Chat request failed' }, { status: 500 });
  }
}
