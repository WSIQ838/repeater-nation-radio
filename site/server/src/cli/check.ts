// Loads every backend function and actor to catch import/compile problems before they hit a user.
//   deno task check
import { listFunctions, getHandler } from '../functions.ts';
import { loadSchemas, entityNames } from '../schema.ts';
import { loadWorkflows, workflowNames } from '../workflows.ts';
import { functionExists } from '../functions.ts';
import { join } from '@std/path';
import { base44Dir } from '../schema.ts';

loadSchemas();
loadWorkflows();
let bad = 0;
for (const name of listFunctions()) {
  try { await getHandler(name); } catch (e: any) { bad++; console.error(`FAIL function ${name}: ${e?.message || e}`); }
}
for (const a of Deno.readDirSync(join(base44Dir, 'actors'))) {
  try { const m = await import(new URL(`file://${join(base44Dir, 'actors', a.name, 'entry.ts')}`).href); if (typeof m.default !== 'function') throw new Error('no default class'); }
  catch (e: any) { bad++; console.error(`FAIL actor ${a.name}: ${e?.message || e}`); }
}
// every workflow must point at a function that exists
const wfDir = join(base44Dir, 'workflows');
for (const f of Deno.readDirSync(wfDir)) {
  const w = JSON.parse(Deno.readTextFileSync(join(wfDir, f.name)));
  for (const step of w.definition?.do || []) for (const d of Object.values<any>(step)) {
    const fn = d.with?.function_name;
    if (fn && !functionExists(fn)) { bad++; console.error(`FAIL workflow "${w.name}" calls missing function ${fn}`); }
  }
}
console.log(`${entityNames().length} entities, ${listFunctions().length} functions, ${workflowNames().length} workflows checked: ${bad ? bad + ' problem(s)' : 'all OK'}`);
Deno.exit(bad ? 1 : 0);
