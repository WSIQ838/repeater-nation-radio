import { join, normalize, resolve } from '@std/path';
import { config } from './config.ts';
import { sql } from './db.ts';
import { newId } from './ids.ts';
import { HttpError } from './errors.ts';

const MAX_BYTES = 25 * 1024 * 1024;
export const uploadsDir = () => resolve(config.dataDir, 'uploads');

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm',
  txt: 'text/plain', csv: 'text/csv', json: 'application/json', adi: 'text/plain', adif: 'text/plain',
};
// Types a browser would execute if served from our origin.
const ACTIVE = new Set(['html', 'htm', 'xhtml', 'js', 'mjs', 'xml', 'svg']);

export const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);

export async function saveUpload(file: File, ownerId: string | null) {
  if (!file || typeof (file as any).arrayBuffer !== 'function') throw new HttpError(400, 'No file provided');
  if (file.size > MAX_BYTES) throw new HttpError(413, 'File is too large (25 MB max)');
  const id = newId();
  const ext = extOf(file.name || '');
  const safeName = (file.name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';
  const rel = `${id.slice(0, 4)}/${id}_${safeName}`;
  const abs = join(uploadsDir(), rel);
  await Deno.mkdir(join(uploadsDir(), id.slice(0, 4)), { recursive: true });
  await Deno.writeFile(abs, new Uint8Array(await file.arrayBuffer()));
  await sql`INSERT INTO files (id, name, path, content_type, size, owner_id) VALUES (${id}, ${file.name || safeName}, ${rel}, ${file.type || MIME[ext] || 'application/octet-stream'}, ${file.size}, ${ownerId})`;
  return { file_url: `${config.publicUrl}/uploads/${rel}`, file_id: id };
}

export async function serveUpload(relPath: string): Promise<Response> {
  const rel = normalize(decodeURIComponent(relPath)).replace(/^(\.\.[/\\])+/, '');
  const abs = resolve(uploadsDir(), rel);
  if (!abs.startsWith(uploadsDir() + '/')) throw new HttpError(404, 'Not found');
  try {
    const data = await Deno.readFile(abs);
    const ext = extOf(abs);
    // Anything that could run script is downloaded, not rendered, so an uploaded file can't act as the site.
    const headers: Record<string, string> = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    };
    if (ACTIVE.has(ext) && ext !== 'svg') headers['content-disposition'] = 'attachment';
    return new Response(data, { headers });
  } catch {
    throw new HttpError(404, 'Not found');
  }
}
