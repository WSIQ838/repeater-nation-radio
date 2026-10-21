import { join, toFileUrl } from '@std/path';
import { base44Dir } from './schema.ts';
import { Actor, Connection } from './runtime/actors.ts';
import { userFromToken } from './auth.ts';
import { HttpError } from './errors.ts';

const NAME = /^[A-Za-z0-9_-]+$/;
const classes = new Map<string, Promise<new () => Actor>>();
const rooms = new Map<string, Promise<Actor>>();

function loadClass(name: string) {
  if (!NAME.test(name)) throw new HttpError(404, 'Unknown actor');
  let p = classes.get(name);
  if (!p) {
    p = import(toFileUrl(join(base44Dir, 'actors', name, 'entry.ts')).href)
      .then((m) => m.default as new () => Actor)
      .catch(() => { classes.delete(name); throw new HttpError(404, 'Unknown actor'); });
    classes.set(name, p);
  }
  return p;
}

function getRoom(name: string, roomId: string): Promise<Actor> {
  const key = `${name}/${roomId}`;
  let p = rooms.get(key);
  if (!p) {
    p = (async () => {
      const Cls = await loadClass(name);
      const actor = new Cls();
      actor.actorName = name;
      actor.roomId = roomId;
      await actor.handleStart();
      return actor;
    })();
    rooms.set(key, p);
    p.catch(() => rooms.delete(key));
  }
  return p;
}

export async function actorSocket(req: Request, name: string, roomId: string, url: URL): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'WebSocket upgrade required');
  await loadClass(name);
  const user = await userFromToken(url.searchParams.get('token'));
  const connId = (url.searchParams.get('id') || crypto.randomUUID()).slice(0, 80);
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = async () => {
    const actor = await getRoom(name, roomId);
    const identity = user
      ? { type: 'authenticated' as const, userId: user.id, email: user.email, role: user.role }
      : { type: 'anonymous' as const };
    const conn = new Connection(connId, identity, socket);
    actor.connections.get(connId)?.close(4000, 'Replaced by a newer connection');
    actor.connections.set(connId, conn);
    try {
      await actor.handleConnect(conn);
    } catch (e) {
      console.error(`[actor:${name}] handleConnect failed:`, e);
      conn.reject(1011, 'Internal error');
    }
    if (conn.rejected) { if (actor.connections.get(connId) === conn) actor.connections.delete(connId); return; }

    socket.onmessage = async (ev) => {
      let msg: any;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      try { await actor.handleMessage(conn, msg); } catch (e) { console.error(`[actor:${name}] handleMessage failed:`, e); }
    };
    socket.onclose = async () => {
      if (actor.connections.get(connId) !== conn) return; // already replaced
      actor.connections.delete(connId);
      try { await actor.handleClose(conn); } catch (e) { console.error(`[actor:${name}] handleClose failed:`, e); }
      if (!actor.connections.size) setTimeout(() => { if (!actor.connections.size) rooms.delete(`${name}/${roomId}`); }, 60_000);
    };
  };
  return response;
}
