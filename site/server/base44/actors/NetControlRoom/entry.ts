// Real-time Net Control room — tracks connected operators (presence) and
// broadcasts actions to all authorized hosts working the same shared session.
// The room id IS the NetControlSession id. The actor is for presence and
// live notifications only; all data operations go through backend functions
// and sync via entity realtime subscriptions.
import { Actor } from 'base44:runtime/actors';

const MAX_OPERATORS = 10;

export default class NetControlRoom extends Actor {
  operators = new Map(); // conn.id -> { userId, userName, callsign, permission, isPrimary, joinedAt }

  async handleStart() {
    const saved = await this.storage.get('operators');
    if (saved) this.operators = new Map(saved);
    // Reconcile: remove operators whose connections are gone (hibernation wake)
    const live = new Set(this.getConnections().map((c) => c.id));
    for (const id of this.operators.keys()) {
      if (!live.has(id)) this.operators.delete(id);
    }
    await this.saveOperators();
  }

  async handleConnect(conn) {
    if (!conn.identity || conn.identity.type !== 'authenticated') {
      conn.reject(4001, 'Authentication required');
      return;
    }
    if (!this.operators.has(conn.id) && this.operators.size >= MAX_OPERATORS) {
      conn.reject(4002, 'Too many operators connected');
      return;
    }
    // Send current operator list to the new connection
    conn.send({ type: 'presence', operators: this.getOperatorList() });
  }

  async handleMessage(conn, msg) {
    if (typeof msg !== 'object' || msg === null) return;
    const op = this.operators.get(conn.id);

    if (msg.type === 'join') {
      const userId = String(msg.userId || '').slice(0, 64);
      const userName = String(msg.userName || '').slice(0, 100);
      const callsign = String(msg.callsign || '').slice(0, 20);
      const permission = ['full', 'checkin', 'view'].includes(msg.permission) ? msg.permission : 'view';
      const isPrimary = !!msg.isPrimary;

      this.operators.set(conn.id, {
        userId, userName, callsign, permission, isPrimary,
        joinedAt: new Date().toISOString(),
      });
      await this.saveOperators();
      this.broadcastPresence();
    } else if (msg.type === 'action' && op) {
      // Broadcast an action notification (e.g. "Sean checked in WSIQ838")
      this.broadcast({
        type: 'action',
        action: String(msg.action || '').slice(0, 50),
        callsign: String(msg.callsign || '').slice(0, 20),
        by: op.userName,
        byCallsign: op.callsign,
        timestamp: new Date().toISOString(),
      });
    } else if (msg.type === 'script_section' && op) {
      // Broadcast script section change
      this.broadcast({
        type: 'script_section',
        section: String(msg.section || '').slice(0, 50),
        by: op.userName,
        timestamp: new Date().toISOString(),
      });
    } else if (msg.type === 'status_change' && op) {
      // Broadcast net status change (start/end)
      this.broadcast({
        type: 'status_change',
        status: String(msg.status || '').slice(0, 20),
        by: op.userName,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async handleClose(conn) {
    this.operators.delete(conn.id);
    await this.saveOperators();
    this.broadcastPresence();
  }

  saveOperators() {
    return this.storage.put('operators', [...this.operators.entries()]);
  }

  getOperatorList() {
    return [...this.operators.values()].map((op) => ({
      userId: op.userId,
      userName: op.userName,
      callsign: op.callsign,
      permission: op.permission,
      isPrimary: op.isPrimary,
    }));
  }

  broadcastPresence() {
    this.broadcast({
      type: 'presence',
      operators: this.getOperatorList(),
    });
  }
}