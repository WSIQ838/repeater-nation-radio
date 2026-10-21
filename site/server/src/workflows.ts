// Re-creates Base44 "workflows" (automations): each one is a trigger plus one
// "invoke_backend_function" step. Definitions live in base44/workflows/*.json.
import { join } from '@std/path';
import { sql } from './db.ts';
import { base44Dir } from './schema.ts';
import { onEntityEvent, onAuthEvent } from './bus.ts';
import { callFunction, functionExists } from './functions.ts';
import { evalExpr, resolveTemplates } from './expr.ts';
import { parseCron, Cron } from './cron.ts';
import { config } from './config.ts';

interface Workflow { name: string; trigger: any; definition: any }
const workflows: Workflow[] = [];
const running = new Set<string>();

export function loadWorkflows() {
  workflows.length = 0;
  const dir = join(base44Dir, 'workflows');
  for (const f of Deno.readDirSync(dir)) {
    if (!f.name.endsWith('.json')) continue;
    workflows.push(JSON.parse(Deno.readTextFileSync(join(dir, f.name))));
  }
}
export const workflowNames = () => workflows.map((w) => w.name);

async function runSteps(w: Workflow, trigger: Record<string, unknown>) {
  const ctx = { trigger };
  for (const step of w.definition?.do || []) {
    for (const [, def] of Object.entries<any>(step)) {
      if (def.call !== 'invoke_backend_function') {
        console.warn(`[workflow:${w.name}] unsupported step type "${def.call}" skipped`);
        continue;
      }
      const fn = def.with?.function_name;
      if (!functionExists(fn)) throw new Error(`function "${fn}" does not exist`);
      const args = resolveTemplates(def.with?.args ?? {}, ctx);
      const res = await callFunction(fn, args);
      if (res.status >= 400) throw new Error(`${fn} returned ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`);
    }
  }
}

export async function runWorkflow(w: Workflow, trigger: Record<string, unknown>) {
  const cond = w.trigger?.condition;
  if (cond) {
    const expr = String(cond).replace(/^\$\{\s*|\s*\}$/g, '');
    if (!evalExpr(expr, { trigger })) return;
  }
  if (running.has(w.name) && w.trigger?.config?.trigger_type === 'scheduled') {
    console.warn(`[workflow:${w.name}] previous run still going, skipping this tick`);
    return;
  }
  const kind = w.trigger?.config?.trigger_type;
  running.add(w.name);
  const [{ id }] = await sql`INSERT INTO job_runs (workflow, trigger_type, status) VALUES (${w.name}, ${kind}, 'running') RETURNING id`;
  try {
    await runSteps(w, trigger);
    await sql`UPDATE job_runs SET status = 'completed', finished_at = now() WHERE id = ${id}`;
  } catch (e: any) {
    console.error(`[workflow:${w.name}] failed:`, e?.message || e);
    await sql`UPDATE job_runs SET status = 'failed', finished_at = now(), error = ${String(e?.message || e).slice(0, 2000)} WHERE id = ${id}`;
  } finally {
    running.delete(w.name);
  }
}

export async function runWorkflowByName(name: string, trigger: Record<string, unknown> = {}) {
  const w = workflows.find((x) => x.name === name);
  if (!w) return false;
  await runWorkflow(w, { occurred_at: new Date().toISOString(), ...trigger });
  return true;
}

export function startWorkflows() {
  if (!config.schedulerEnabled) { console.log('[workflows] scheduler disabled (SCHEDULER=off)'); return; }

  const scheduled: Array<{ w: Workflow; cron: Cron; last: string }> = [];
  for (const w of workflows) {
    const c = w.trigger?.config || {};
    if (c.trigger_type === 'scheduled') {
      if (c.cron_expression) scheduled.push({ w, cron: parseCron(c.cron_expression), last: '' });
      else console.warn(`[workflows] "${w.name}" has no cron expression; not scheduled`);
    }
  }

  onEntityEvent((e) => {
    for (const w of workflows) {
      const c = w.trigger?.config || {};
      if (c.trigger_type !== 'entity' || c.entity_name !== e.entity || !(c.events || []).includes(e.type)) continue;
      void runWorkflow(w, {
        entity_name: e.entity, entity_id: e.id, event_type: e.type, data: e.data, old_data: e.old_data ?? null, occurred_at: e.timestamp,
      });
    }
  });

  onAuthEvent((e) => {
    for (const w of workflows) {
      const c = w.trigger?.config || {};
      if (c.trigger_type !== 'app_user_auth' || !(c.events || []).includes(e.event_type)) continue;
      void runWorkflow(w, { user_id: e.user_id, event_type: e.event_type, occurred_at: new Date().toISOString() });
    }
  });

  const tick = () => {
    const now = new Date();
    const key = now.toISOString().slice(0, 16);
    for (const s of scheduled) {
      if (s.last === key || !s.cron.test(now)) continue;
      s.last = key;
      void runWorkflow(s.w, { occurred_at: now.toISOString() });
    }
  };
  setInterval(tick, 15_000);
  console.log(`[workflows] ${workflows.length} loaded, ${scheduled.length} scheduled`);
}
