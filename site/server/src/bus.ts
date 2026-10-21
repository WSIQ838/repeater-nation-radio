// In-process event bus. Entity writes publish here; realtime sockets and the
// workflow engine subscribe. (One app replica — see docs for scaling notes.)
export interface EntityEvent {
  entity: string;
  type: 'create' | 'update' | 'delete';
  id: string;
  data: any;        // the record after the change (or before, for deletes)
  old_data?: any;
  timestamp: string;
  actor_id?: string | null;
}

type Listener = (e: EntityEvent) => void | Promise<void>;
const listeners = new Set<Listener>();

export function onEntityEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitEntityEvent(e: EntityEvent) {
  for (const fn of listeners) {
    try {
      const r = fn(e);
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch((err) => console.error('[bus] listener failed:', err));
    } catch (err) {
      console.error('[bus] listener failed:', err);
    }
  }
}

// Sign-up / login events, consumed by workflows that used the "app user auth" trigger.
export interface AuthEvent { event_type: 'signup' | 'login'; user_id: string; user: any }
const authListeners = new Set<(e: AuthEvent) => void | Promise<void>>();
export function onAuthEvent(fn: (e: AuthEvent) => void | Promise<void>) { authListeners.add(fn); }
export function emitAuthEvent(e: AuthEvent) {
  for (const fn of authListeners) {
    Promise.resolve().then(() => fn(e)).catch((err) => console.error('[bus] auth listener failed:', err));
  }
}
