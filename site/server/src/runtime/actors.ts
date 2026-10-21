// Stand-in for `base44:runtime/actors`. An Actor is a stateful, per-room WebSocket service:
// the host (src/actorhost.ts) creates one instance per room id and routes connections to it.
import { sql } from '../db.ts';

export interface Identity { type: 'authenticated' | 'anonymous'; userId?: string; email?: string; role?: string }

export class Connection {
  id: string;
  identity: Identity;
  private socket: WebSocket;
  rejected = false;
  constructor(id: string, identity: Identity, socket: WebSocket) {
    this.id = id; this.identity = identity; this.socket = socket;
  }
  send(msg: unknown) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }
  reject(code: number, reason: string) {
    this.rejected = true;
    try { this.socket.close(code, reason); } catch { /* already closed */ }
  }
  close(code = 1000, reason = '') {
    try { this.socket.close(code, reason); } catch { /* already closed */ }
  }
}

export class Actor {
  roomId = '';
  actorName = '';
  connections = new Map<string, Connection>();
  storage = {
    get: async (key: string) => {
      const [row] = await sql`SELECT value FROM actor_storage WHERE actor = ${this.actorName} AND room = ${this.roomId} AND key = ${key}`;
      return row ? row.value : undefined;
    },
    put: async (key: string, value: unknown) => {
      await sql`INSERT INTO actor_storage (actor, room, key, value) VALUES (${this.actorName}, ${this.roomId}, ${key}, ${sql.json(value as any)})
        ON CONFLICT (actor, room, key) DO UPDATE SET value = EXCLUDED.value`;
    },
    delete: async (key: string) => {
      await sql`DELETE FROM actor_storage WHERE actor = ${this.actorName} AND room = ${this.roomId} AND key = ${key}`;
    },
  };
  getConnections(): Connection[] { return [...this.connections.values()]; }
  broadcast(msg: unknown, except?: string) {
    for (const c of this.connections.values()) if (c.id !== except) c.send(msg);
  }
  async handleStart() {}
  async handleConnect(_conn: Connection) {}
  async handleMessage(_conn: Connection, _msg: any) {}
  async handleClose(_conn: Connection) {}
}
