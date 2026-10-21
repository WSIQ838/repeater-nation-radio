import { secrets } from 'base44:runtime';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { listAll } from '../../shared/adminGuard.ts';

const SOURCE_NAME = 'rx-tx.info';
const MAX_POINTS = 1000;

function clean(v: unknown, max = 1000): string {
  return String(v ?? '').trim().slice(0, max);
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default async function(req: Request): Promise<Response> {
  const expected = String(secrets.get('RXT_TX_IMPORT_SECRET') || '').trim();
  if (!expected) {
    return Response.json({ error: 'RXT_TX_IMPORT_SECRET is not configured.' }, { status: 503 });
  }

  const supplied = String(
    req.headers.get('x-rn-sdr-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim();

  if (!supplied || supplied !== expected) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json();
    const points = Array.isArray(body?.points) ? body.points : [];

    if (points.length > MAX_POINTS) {
      return Response.json({ error: `Too many points. Maximum is ${MAX_POINTS} per request.` }, { status: 413 });
    }

    const existing = await listAll(base44.asServiceRole.entities.SdrStream, '-created_date');
    const byUrl = new Map<string, any>();
    for (const row of existing || []) {
      if (String(row?.source_name || '').toLowerCase() === SOURCE_NAME) {
        const key = clean(row.stream_url, 2000).toLowerCase();
        if (key) byUrl.set(key, row);
      }
    }

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const toCreate: Record<string, unknown>[] = [];
    const toUpdate: Record<string, unknown>[] = [];

    for (const raw of points) {
      const url = clean(raw?.url, 2000);
      const name = clean(raw?.name, 500);
      const lat = num(raw?.lat);
      const lng = num(raw?.lng);

      if (!url || !name || lat === null || lng === null) {
        skipped++;
        continue;
      }

      const record = {
        name,
        stream_url: url,
        description: clean(raw?.description || (raw?.type ? `${clean(raw.type, 100)} receiver. Imported from ${SOURCE_NAME}.` : `Imported from ${SOURCE_NAME}.`), 2000),
        frequency_info: clean(raw?.frequency_info, 500),
        location: clean(raw?.location, 500),
        city: clean(raw?.city, 200),
        state: clean(raw?.state, 100),
        lat,
        lng,
        radio_service: ['GMRS', 'HAM', 'Both', 'Other'].includes(String(raw?.radio_service || 'Other')) ? String(raw.radio_service) : 'Other',
        verification_status: 'approved',
        review_notes: '',
        submitted_by_name: `${SOURCE_NAME} import`,
        submitted_at: now,
        source_name: SOURCE_NAME,
        source_url: 'https://rx-tx.info/map-sdr-points'
      };

      const key = url.toLowerCase();
      const current = byUrl.get(key);

      if (current?.id) {
        toUpdate.push({ id: current.id, ...record });
      } else {
        toCreate.push(record);
      }
    }

    // Write in batches to avoid one database request per SDR point.
    for (let i = 0; i < toCreate.length; i += 500) {
      const batch = toCreate.slice(i, i + 500);
      await base44.asServiceRole.entities.SdrStream.bulkCreate(batch);
      created += batch.length;
    }

    for (let i = 0; i < toUpdate.length; i += 500) {
      const batch = toUpdate.slice(i, i + 500);
      await base44.asServiceRole.entities.SdrStream.bulkUpdate(batch);
      updated += batch.length;
    }

    return Response.json({
      ok: true,
      received: points.length,
      created,
      updated,
      skipped,
      source: SOURCE_NAME
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('ingest-sdr-streams:', e);
    return Response.json({ error: message }, { status: 500 });
  }
}
