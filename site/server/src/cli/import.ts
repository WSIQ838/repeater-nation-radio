// Imports a Base44 export (the .zip, or the folder it unpacks to) into this server's database.
//
//   deno task import /path/to/base44-export.zip [--skip-media] [--only User,Repeater] [--dry-run]
//
// Safe to re-run: records are upserted by (entity, id). Ids and timestamps are preserved, so
// references between records keep working.
import { join, resolve, dirname, extname } from '@std/path';
import { unzipSync } from 'fflate';
import { sql, migrate } from '../db.ts';
import { config } from '../config.ts';
import { loadSchemas, getSchema } from '../schema.ts';
import { newId } from '../ids.ts';

const args = Deno.args.filter((a) => !a.startsWith('--'));
const flag = (n: string) => Deno.args.includes(`--${n}`);
const opt = (n: string) => Deno.args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const src = args[0];
if (!src) { console.error('Usage: deno task import <export.zip|folder> [--skip-media] [--only A,B] [--dry-run]'); Deno.exit(2); }

const dryRun = flag('dry-run');
const only = opt('only')?.split(',').filter(Boolean);

// ---------- locate the export ----------
async function locateExport(path: string): Promise<string> {
  let root = resolve(path);
  if (path.toLowerCase().endsWith('.zip')) {
    const out = await Deno.makeTempDir({ prefix: 'rn-import-' });
    console.log(`Unzipping ${path} ...`);
    const files = unzipSync(await Deno.readFile(path));
    for (const [name, bytes] of Object.entries(files)) {
      if (name.endsWith('/')) continue;
      const dest = join(out, name);
      if (!resolve(dest).startsWith(out)) continue; // zip-slip guard
      await Deno.mkdir(dirname(dest), { recursive: true });
      await Deno.writeFile(dest, bytes);
    }
    root = out;
  }
  const hasData = async (d: string) => !!(await Deno.stat(join(d, 'data')).catch(() => null));
  if (await hasData(root)) return root;
  for await (const e of Deno.readDir(root)) {
    if (e.isDirectory && await hasData(join(root, e.name))) return join(root, e.name);
  }
  throw new Error('Could not find a "data" folder in the export');
}

const naive = (s: unknown) => {
  if (typeof s !== 'string') return null;
  const d = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : s + 'Z');
  return isNaN(d.getTime()) ? null : d;
};

// ---------- media ----------
const MEDIA_RE = /https?:\/\/(?:media\.base44\.com\/[^\s"'<>)\\]+|(?:www\.)?base44\.app\/api\/apps\/[0-9a-f]{24}\/files\/[^\s"'<>)\\]+)/g;
const urlMap = new Map<string, string>();      // old url -> new url
const mediaQueue = new Set<string>();

function noteMedia(text: string) {
  for (const m of text.matchAll(MEDIA_RE)) mediaQueue.add(m[0]);
}
function rewrite(text: string): string {
  if (!urlMap.size) return text;
  return text.replace(MEDIA_RE, (u) => urlMap.get(u) ?? u);
}

async function copyExportedFiles(root: string) {
  const filesDir = join(root, 'files');
  const manifest = await Deno.readTextFile(join(filesDir, '_assets.json')).then(JSON.parse).catch(() => []);
  let n = 0;
  for (const a of manifest) {
    const local = await findLocalFile(filesDir, a.id);
    if (!local || !a.file_url) continue;
    const rel = `migrated/${a.id}_${String(a.file_name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_')}`;
    await store(local, rel);
    urlMap.set(a.file_url, `${config.publicUrl}/uploads/${rel}`);
    n++;
  }
  console.log(`  copied ${n} files shipped in the export`);
}
async function findLocalFile(dir: string, id: string): Promise<string | null> {
  for await (const e of Deno.readDir(dir)) if (e.isFile && e.name.startsWith(id + '_')) return join(dir, e.name);
  return null;
}
async function store(from: string, rel: string) {
  const dest = resolve(config.dataDir, 'uploads', rel);
  await Deno.mkdir(dirname(dest), { recursive: true });
  await Deno.copyFile(from, dest);
}

async function downloadMedia() {
  const urls = [...mediaQueue].filter((u) => !urlMap.has(u));
  if (!urls.length) return;
  console.log(`Downloading ${urls.length} media files still hosted by Base44 ...`);
  let ok = 0, failed: string[] = [];
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const name = decodeURIComponent(new URL(u).pathname.split('/').pop() || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
        const ext = extname(name);
        const rel = `migrated/${newId()}_${name || 'file' + ext}`;
        const dest = resolve(config.dataDir, 'uploads', rel);
        await Deno.mkdir(dirname(dest), { recursive: true });
        await Deno.writeFile(dest, new Uint8Array(await res.arrayBuffer()));
        urlMap.set(u, `${config.publicUrl}/uploads/${rel}`);
        ok++;
      } catch (e: any) {
        failed.push(`${u} (${e?.message || e})`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`  downloaded ${ok}, failed ${failed.length}`);
  if (failed.length) {
    await Deno.mkdir(config.dataDir, { recursive: true });
    await Deno.writeTextFile(join(config.dataDir, 'import-media-failures.txt'), failed.join('\n'));
    console.log(`  failures listed in ${join(config.dataDir, 'import-media-failures.txt')} (those links keep pointing at Base44)`);
  }
}

// ---------- records ----------
const BUILTIN = new Set(['id', 'created_date', 'updated_date', 'created_by', 'created_by_id']);

async function upsert(entity: string, rows: any[]) {
  const batch = rows.map((r) => ({
    entity, id: String(r.id), data: sql.json(r.data) as any,
    created_date: r.created_date, updated_date: r.updated_date, created_by: r.created_by, created_by_id: r.created_by_id,
  }));
  for (let i = 0; i < batch.length; i += 1000) {
    const chunk = batch.slice(i, i + 1000);
    await sql`INSERT INTO records ${sql(chunk)}
      ON CONFLICT (entity, id) DO UPDATE SET data = EXCLUDED.data, created_date = EXCLUDED.created_date,
        updated_date = EXCLUDED.updated_date, created_by = EXCLUDED.created_by, created_by_id = EXCLUDED.created_by_id`;
  }
}

function toRow(rec: any) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) if (!BUILTIN.has(k)) data[k] = v;
  const created = naive(rec.created_date) ?? new Date();
  return { id: rec.id, data, created_date: created, updated_date: naive(rec.updated_date) ?? created, created_by: rec.created_by ?? null, created_by_id: rec.created_by_id ?? null };
}

async function importUsers(root: string) {
  const raw = JSON.parse(await Deno.readTextFile(join(root, 'data', '_users.json')));
  const users = raw.filter((u: any) => !u.is_service && u.email);
  const rows = users.map((u: any) => {
    const { app_id: _a, is_service: _s, collaborator_role: _c, ...rest } = u;
    return toRow(JSON.parse(rewrite(JSON.stringify({ ...rest, email: String(u.email).toLowerCase() }))));
  });
  if (dryRun) return users.length;
  await upsert('User', rows);
  // Existing accounts keep their verified status; no passwords were exported, so they sign in with
  // "Forgot password" or a social provider (the same email address links to the same account).
  const creds = users.map((u: any) => ({ user_id: String(u.id), email: String(u.email).toLowerCase(), email_verified: u.is_verified !== false }));
  for (let i = 0; i < creds.length; i += 500) {
    await sql`INSERT INTO credentials ${sql(creds.slice(i, i + 500))} ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`;
  }
  return users.length;
}

const root = await locateExport(src);
console.log(`Importing from ${root}`);
loadSchemas();
await migrate();

console.log('Scanning for media ...');
const dataDir = join(root, 'data');
const names = [...Deno.readDirSync(dataDir)].filter((f) => f.name.endsWith('.json')).map((f) => f.name.slice(0, -5));
const texts = new Map<string, string>();
for (const n of names) {
  if (n === '_entity_schemas') continue;
  const t = await Deno.readTextFile(join(dataDir, `${n}.json`));
  texts.set(n, t);
  noteMedia(t);
}
if (!dryRun) await copyExportedFiles(root);
if (!flag('skip-media') && !dryRun) await downloadMedia();

const summary: Array<[string, number]> = [];
if (!only || only.includes('User')) summary.push(['User', await importUsers(root)]);

for (const [name, text] of texts) {
  if (name === '_users' || name === 'User') continue;
  if (only && !only.includes(name)) continue;
  if (!getSchema(name)) { console.warn(`  skipping ${name}: no entity definition`); continue; }
  const recs = JSON.parse(rewrite(text));
  if (!Array.isArray(recs) || !recs.length) continue;
  if (!dryRun) await upsert(name, recs.map(toRow));
  summary.push([name, recs.length]);
  console.log(`  ${name.padEnd(26)} ${recs.length}`);
}

console.log(dryRun ? '\nDry run only; nothing was written.' : `\nImported ${summary.reduce((a, [, n]) => a + n, 0)} records across ${summary.length} entities.`);
console.log('Note: exported accounts have no passwords. Members sign in with "Forgot password" or Google/Microsoft/Facebook/Apple using the same email.');
await sql.end();
