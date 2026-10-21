// Drop-in replacement for `npm:@base44/sdk`'s server API (createClientFromRequest), backed by the
// local Postgres instead of the Base44 cloud. The 130 backend functions import this via deno.json.
import * as entities from '../entities.ts';
import { HttpError } from '../errors.ts';
import { bearer, userFromToken, inviteUser as inviteUserHandler } from '../auth.ts';
import { sendMail } from '../mail.ts';
import { Caller } from '../rls.ts';
import { saveUpload } from '../files.ts';
import { AUTOMATION_HEADER, AUTOMATION_KEY } from '../internal.ts';

const ANON: Caller = { user: null, service: false };

export function sdkError(e: any) {
  // Mirror the shape the real SDK's errors had so existing catch blocks keep working.
  if (e instanceof HttpError) {
    (e as any).response = { status: e.status, data: e.data };
    (e as any).originalError = { response: { status: e.status, data: e.data } };
  }
  return e;
}
const wrap = <T>(p: Promise<T>): Promise<T> => p.catch((e) => { throw sdkError(e); });

function entityHandle(entity: string, callerOf: () => Promise<Caller>) {
  const c = callerOf;
  return {
    list: async (sort?: string, limit?: number, skip?: number, fields?: string[]) =>
      wrap(entities.query(entity, await c(), {}, { sort, limit, skip, fields }).then((r) => r.items)),
    filter: async (q: any = {}, sortOrOpts?: any, limit?: number, skip?: number, fields?: string[]) => {
      const caller = await c();
      if (sortOrOpts && typeof sortOrOpts === 'object') {
        // Options form -> cursor page: { items, next_cursor, has_more }
        return wrap(entities.query(entity, caller, q, sortOrOpts));
      }
      return wrap(entities.query(entity, caller, q, { sort: sortOrOpts, limit, skip, fields }).then((r) => r.items));
    },
    get: async (id: string) => wrap(entities.get(entity, await c(), id)),
    create: async (data: any) => wrap(entities.create(entity, await c(), data)),
    bulkCreate: async (items: any[]) => wrap(entities.bulkCreate(entity, await c(), items)),
    update: async (id: string, data: any) => wrap(entities.update(entity, await c(), id, data)),
    bulkUpdate: async (items: any[]) => wrap(entities.bulkUpdate(entity, await c(), items)),
    updateMany: async (q: any, data: any) => wrap(entities.updateMany(entity, await c(), q, data)),
    delete: async (id: string) => wrap(entities.remove(entity, await c(), id)),
    deleteMany: async (q: any) => wrap(entities.deleteMany(entity, await c(), q)),
    count: async (q: any = {}) => wrap(entities.count(entity, await c(), q)),
  };
}

function entitiesProxy(callerOf: () => Promise<Caller>) {
  const cache = new Map<string, any>();
  return new Proxy({}, {
    get(_t, name) {
      if (typeof name !== 'string') return undefined;
      if (!cache.has(name)) cache.set(name, entityHandle(name, callerOf));
      return cache.get(name);
    },
  }) as Record<string, ReturnType<typeof entityHandle>>;
}

const integrations = {
  Core: {
    SendEmail: (m: any) => sendMail(m),
    UploadFile: async ({ file }: { file: File | Blob }) => saveUpload(file as File, null),
    UploadPublicFile: async ({ file }: { file: File | Blob }) => saveUpload(file as File, null),
  },
};

export function createClientFromRequest(req: Request) {
  const token = bearer(req);
  let userP: Promise<any | null> | null = null;
  const currentUser = () => (userP ??= userFromToken(token));
  // Workflow-triggered calls carry no session; they run with app-level access like the hosted platform's automations.
  const automation = req.headers.get(AUTOMATION_HEADER) === AUTOMATION_KEY;
  const userCaller = async (): Promise<Caller> => {
    const user = await currentUser();
    return { user, service: automation && !user };
  };
  const serviceCaller = async (): Promise<Caller> => ({ user: null, service: true });

  const auth = {
    me: async () => {
      const u = await currentUser();
      if (!u) throw sdkError(new HttpError(401, 'Authentication required'));
      return { ...u, _app_role: u._app_role ?? u.role };
    },
    isAuthenticated: async () => !!(await currentUser()),
    updateMe: async (data: any) => {
      const u = await currentUser();
      if (!u) throw sdkError(new HttpError(401, 'Authentication required'));
      return wrap(entities.update('User', { user: u, service: false }, u.id, data));
    },
    inviteUser: async (email: string, role?: string) => {
      const u = await currentUser();
      const res = await inviteUserHandler(u, { email, role });
      return res.json();
    },
  };

  return {
    auth,
    entities: entitiesProxy(userCaller),
    integrations,
    asServiceRole: {
      entities: entitiesProxy(serviceCaller),
      integrations,
      auth: { ...auth, me: auth.me },
    },
  };
}

// Same API for code that builds a client without a request (scheduled work, scripts).
export function createClient(_opts?: any) {
  return createClientFromRequest(new Request('http://localhost/'));
}

export { ANON };
