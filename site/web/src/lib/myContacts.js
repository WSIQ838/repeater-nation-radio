import { base44 } from '@/api/base44Client';

// Every contact in the signed-in member's logbook, newest first. Pages
// through 500 at a time; used by the ADIF, QSL, Awards and Contest tools.
export async function loadAllContacts(userId) {
  const rows = [];
  for (let skip = 0; skip < 20000; skip += 500) {
    const batch = await base44.entities.ContactLog.filter({ created_by_id: userId }, '-date', 500, skip);
    rows.push(...(batch || []));
    if (!batch || batch.length < 500) break;
  }
  return rows;
}

// Updates contacts a few at a time with a pause between groups so a bulk
// edit (e.g. marking 100 QSLs sent) stays well inside the app's rate limit.
export async function updateContactsGently(ids, patch, onProgress) {
  const GROUP = 5;
  const PAUSE_MS = 1500;
  let done = 0;
  const failed = [];
  for (let i = 0; i < ids.length; i += GROUP) {
    const group = ids.slice(i, i + GROUP);
    const results = await Promise.allSettled(group.map((id) => base44.entities.ContactLog.update(id, patch)));
    results.forEach((r, j) => { if (r.status === 'rejected') failed.push(group[j]); });
    done += group.length;
    onProgress?.(done, ids.length);
    if (i + GROUP < ids.length) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  return { updated: ids.length - failed.length, failed };
}

// Creates contacts in small, spaced batches. Every new ContactLog row runs
// the badge workflow (several database calls), so a bulk import would
// otherwise hit the app's shared rate limit for every member. Rate-limit
// errors back off 30 s and retry the same batch up to 5 times.
export const IMPORT_BATCH_SIZE = 10;
export const IMPORT_BATCH_PAUSE_MS = 4000;
export const MAX_IMPORT = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function importContactsGently(list, { onProgress, isCancelled } = {}) {
  let created = 0; let failed = 0; let rateLimitWaits = 0;
  for (let i = 0; i < list.length; i += IMPORT_BATCH_SIZE) {
    if (isCancelled?.()) break;
    const batch = list.slice(i, i + IMPORT_BATCH_SIZE);
    try {
      await base44.entities.ContactLog.bulkCreate(batch);
      created += batch.length;
      rateLimitWaits = 0;
    } catch (e) {
      if (/rate limit|429/i.test(String(e?.message || e)) && rateLimitWaits < 5) {
        rateLimitWaits += 1; await sleep(30000); i -= IMPORT_BATCH_SIZE; continue;
      }
      failed += batch.length;
    }
    onProgress?.(Math.min(list.length, i + batch.length), list.length);
    if (i + IMPORT_BATCH_SIZE < list.length) await sleep(IMPORT_BATCH_PAUSE_MS);
  }
  return { created, failed, cancelled: !!isCancelled?.() };
}

// Same callsign within 2 minutes = the same contact.
export function isDuplicateContact(contact, existing, windowMs = 2 * 60 * 1000) {
  const t = Date.parse(contact.date);
  const call = String(contact.callsign || '').toUpperCase();
  return existing.some((e) => String(e.callsign || '').toUpperCase() === call && Math.abs(Date.parse(e.date) - t) <= windowMs);
}
