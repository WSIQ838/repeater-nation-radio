// Runs the Base44 backend functions (base44/functions/<name>/entry.ts) unchanged. They import
// `npm:@base44/sdk` and `base44:runtime`, which deno.json maps to the local shims.
import { join, toFileUrl } from '@std/path';
import { base44Dir } from './schema.ts';
import { config } from './config.ts';
import { HttpError } from './errors.ts';
import { AUTOMATION_HEADER, AUTOMATION_KEY } from './internal.ts';

type Handler = (req: Request) => Promise<Response> | Response;
const FUNCTIONS_DIR = join(base44Dir, 'functions');
const NAME = /^[A-Za-z0-9_-]+$/;

const handlers = new Map<string, Promise<Handler>>();

// Three legacy functions call Deno.serve() at module level instead of exporting a handler.
// While one is loading, capture that handler rather than opening a second server.
let loadQueue: Promise<unknown> = Promise.resolve();
function loadModule(name: string): Promise<Handler> {
  const run = async (): Promise<Handler> => {
    let captured: Handler | null = null;
    const realServe = Deno.serve;
    (Deno as any).serve = (a: any, b?: any) => {
      captured = (typeof a === 'function' ? a : b ?? a?.handler) as Handler;
      return { finished: Promise.resolve(), shutdown: async () => {}, addr: { port: 0 } };
    };
    try {
      const mod = await import(toFileUrl(join(FUNCTIONS_DIR, name, 'entry.ts')).href);
      const h = (mod.default ?? captured) as Handler | null;
      if (typeof h !== 'function') throw new Error(`function ${name} does not export a default handler`);
      return h;
    } finally {
      (Deno as any).serve = realServe;
    }
  };
  const p = loadQueue.then(run, run);
  loadQueue = p.catch(() => {});
  return p;
}

export function functionExists(name: string): boolean {
  if (!NAME.test(name)) return false;
  try { return Deno.statSync(join(FUNCTIONS_DIR, name, 'entry.ts')).isFile; } catch { return false; }
}
export function listFunctions(): string[] {
  return [...Deno.readDirSync(FUNCTIONS_DIR)].filter((d) => d.isDirectory).map((d) => d.name).sort();
}

export async function getHandler(name: string): Promise<Handler> {
  if (!functionExists(name)) throw new HttpError(404, `Function ${name} not found`);
  let p = handlers.get(name);
  if (!p) {
    p = loadModule(name);
    handlers.set(name, p);
    p.catch(() => handlers.delete(name)); // retry a failed load next time
  }
  return p;
}

// Functions were given the app's public URL by the platform; they use it for redirects and e-mail links.
function withAppUrl(req: Request): Request {
  const headers = new Headers(req.headers);
  headers.set('X-Base44-App-Url', config.publicUrl);
  // Never trust this header from the outside; only callFunction() below adds the real key.
  if (headers.get(AUTOMATION_HEADER) !== AUTOMATION_KEY) headers.delete(AUTOMATION_HEADER);
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  return new Request(req.url, { method: req.method, headers, body: hasBody ? req.body : undefined, ...(hasBody ? { duplex: 'half' } : {}) } as any);
}

export async function invokeFunction(name: string, req: Request): Promise<Response> {
  const handler = await getHandler(name);
  try {
    const res = await handler(withAppUrl(req));
    if (res instanceof Response) return res;
    return Response.json(res ?? {});
  } catch (e: any) {
    if (e instanceof HttpError) return Response.json(e.data, { status: e.status });
    console.error(`[function:${name}] unhandled error:`, e?.stack || e);
    return Response.json({ error: e?.message || 'Function failed' }, { status: 500 });
  }
}

// Used by the workflow engine: run a function with a JSON body and no user session.
export async function callFunction(name: string, args: unknown): Promise<{ status: number; body: any }> {
  const req = new Request(`${config.publicUrl}/api/functions/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [AUTOMATION_HEADER]: AUTOMATION_KEY },
    body: JSON.stringify(args ?? {}),
  });
  const res = await invokeFunction(name, req);
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body };
}
