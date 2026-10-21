// Entity change feed over a WebSocket (what `entity.subscribe(cb)` uses in the browser).
// Every event is filtered through the same read rules as a normal query.
import { onEntityEvent } from './bus.ts';
import { canRead } from './entities.ts';
import { userFromToken } from './auth.ts';
import { getSchema } from './schema.ts';
import { HttpError } from './errors.ts';

interface Client { socket: WebSocket; user: any | null; entities: Set<string> }
const clients = new Set<Client>();

export function startRealtime() {
  onEntityEvent((e) => {
    for (const c of clients) {
      if (!c.entities.has(e.entity) || c.socket.readyState !== WebSocket.OPEN) continue;
      let ok = false;
      try { ok = canRead(e.entity, { user: c.user, service: false }, e.data); } catch { ok = false; }
      if (!ok) continue;
      c.socket.send(JSON.stringify({ type: 'event', entity: e.entity, event: { id: e.id, type: e.type, data: e.data, timestamp: e.timestamp } }));
    }
  });
}

export async function realtimeSocket(req: Request, url: URL): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'WebSocket upgrade required');
  const user = await userFromToken(url.searchParams.get('token'));
  const { socket, response } = Deno.upgradeWebSocket(req, { idleTimeout: 60 });
  const client: Client = { socket, user, entities: new Set() };
  socket.onopen = () => { clients.add(client); socket.send(JSON.stringify({ type: 'ready' })); };
  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === 'subscribe' && typeof msg.entity === 'string' && getSchema(msg.entity)) client.entities.add(msg.entity);
      else if (msg.type === 'unsubscribe') client.entities.delete(msg.entity);
      else if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
    } catch { /* ignore malformed frames */ }
  };
  socket.onclose = () => clients.delete(client);
  socket.onerror = () => clients.delete(client);
  return response;
}
