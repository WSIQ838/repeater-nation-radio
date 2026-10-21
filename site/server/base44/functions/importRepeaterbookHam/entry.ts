import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin, writeAudit } from '../../shared/adminGuard.ts';
import { listAllByFilter } from '../../shared/filteredPagination.ts';

const US_STATE_IDS = [
  '01','02','04','05','06','08','09','10','11','12','13','15','16','17','18','19','20','21',
  '22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39',
  '40','41','42','44','45','46','47','48','49','50','51','53','54','55','56','72'
];

const REPEATERBOOK_USER_AGENT = 'RepeaterBook Python Client/0.6.0 (+micael@jarniac.dev)';
const str = (v: any) => v == null ? '' : String(v).trim();
const num = (v: any) => { const n = Number.parseFloat(str(v)); return Number.isFinite(n) ? n : null; };
const yes = (v: any) => /^(yes|true|1|y)$/i.test(str(v));

function mode(row: any) {
  const analog = yes(row['FM Analog']) || yes(row['Analog']);
  const digital = ['DMR','D-Star','NXDN','APCO P-25','P-25','M17','Tetra','System Fusion','Yaesu System Fusion'].some((k) => yes(row[k]));
  return analog && digital ? 'Mixed' : digital ? 'Digital' : 'Analog';
}

function status(v: any) {
  const s = str(v).toLowerCase();
  return s.includes('off') || s.includes('down') ? 'Offline' : s.includes('maint') ? 'Maintenance' : 'Online';
}

function buildRecord(row: any) {
  const frequency = num(row['Frequency']);
  const input = num(row['Input Freq']);
  const callsign = str(row['Callsign']).toUpperCase();
  if (!frequency || !callsign) return null;

  const digital = [
    yes(row['DMR']) && 'DMR',
    yes(row['D-Star']) && 'D-Star',
    yes(row['NXDN']) && 'NXDN',
    (yes(row['APCO P-25']) || yes(row['P-25'])) && 'P25',
    yes(row['M17']) && 'M17',
    yes(row['Tetra']) && 'TETRA',
    (yes(row['System Fusion']) || yes(row['Yaesu System Fusion'])) && 'YSF'
  ].filter(Boolean);

  const city = str(row['Nearest City']);
  const state = str(row['State']);
  const country = str(row['Country']);
  const sourceId = str(row['State ID']) && str(row['Rptr ID']) ? `${str(row['State ID'])}:${str(row['Rptr ID'])}` : '';

  return {
    name: [city, state, country].filter(Boolean).join(', ') || callsign,
    callsign,
    frequency,
    offset: input == null ? 0 : Number((input - frequency).toFixed(4)),
    tone: str(row['TSQ']) || str(row['PL']),
    input_tone: str(row['PL']) || str(row['TSQ']),
    mode: mode(row),
    access: /closed|private/i.test(str(row['Use'])) ? 'Closed' : 'Public',
    lat: num(row['Lat']),
    lng: num(row['Long']),
    status: status(row['Operational Status']),
    owner: callsign,
    radio_service: 'HAM',
    verification: 'Pending',
    hidden: false,
    notes: [
      str(row['Notes']),
      str(row['Landmark']) ? `Landmark: ${str(row['Landmark'])}` : '',
      digital.length ? `Digital: ${digital.join(', ')}` : '',
      str(row['Last Update']) ? `Last RepeaterBook update: ${str(row['Last Update'])}` : '',
      sourceId ? `Source: RepeaterBook.com (${sourceId})` : 'Source: RepeaterBook.com'
    ].filter(Boolean).join(' · ')
  };
}

async function fetchState(stateId: string, token: string) {
  const res = await fetch(`https://www.repeaterbook.com/api/export.php?state_id=${encodeURIComponent(stateId)}`, {
    headers: {
      'X-RB-App-Token': token,
      'User-Agent': REPEATERBOOK_USER_AGENT
    }
  });

  const body = await res.text();
  let data: any;
  try { data = JSON.parse(body); } catch { data = null; }

  if (!res.ok) {
    const code = data?.error?.code || data?.code || `HTTP_${res.status}`;
    const retryAfter = res.headers.get('retry-after');
    const error: any = new Error(retryAfter ? `${code} (Retry-After: ${retryAfter})` : code);
    error.status = res.status;
    error.code = code;
    error.retryAfter = retryAfter ? Number.parseFloat(retryAfter) : null;
    throw error;
  }

  return Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
}

async function getActiveSync(base44: any) {
  const rows = await base44.asServiceRole.entities.RepeaterBookSync.filter({ service: 'HAM', status: { $in: ['active', 'paused'] } }, '-created_date', 10);
  return rows?.[0] || null;
}

function responseFor(sync: any) {
  return {
    success: true,
    sync_id: sync.id,
    status: sync.status,
    current_index: Number(sync.current_index || 0),
    states_total: Number(sync.states_total || US_STATE_IDS.length),
    states_completed: Number(sync.states_completed || 0),
    fetched: Number(sync.fetched || 0),
    created: Number(sync.created || 0),
    updated: Number(sync.updated || 0),
    skipped: Number(sync.skipped || 0),
    errors: Array.isArray(sync.errors) ? sync.errors : [],
    last_error: sync.last_error || '',
    pause_reason: sync.pause_reason || null,
    next_retry_at: sync.next_retry_at || null,
    complete: sync.status === 'completed',
    paused: sync.status === 'paused'
  };
}

function isRetryDue(sync: any, explicit = false) {
  if (sync.status !== 'paused') return false;
  // Authentication failures cannot be fixed by waiting. Only an explicit
  // admin "start" action should clear an auth pause and retry the request.
  if (sync.pause_reason === 'auth') return explicit;
  if (!sync.next_retry_at) return true;
  const retryAt = new Date(sync.next_retry_at).getTime();
  return !Number.isFinite(retryAt) || retryAt <= Date.now();
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  const { caller, error } = await requireAdmin(base44);
  if (error) return error;

  const token = str(Deno.env.get('REPEATERBOOK_API_TOKEN'));
  if (!token) return Response.json({ error: 'REPEATERBOOK_API_TOKEN is not available to the server function.' }, { status: 500 });

  try {
    const body = await req.json().catch(() => ({}));
    const action = str(body?.action || 'step');

    if (action === 'start') {
      const active = await getActiveSync(base44);
      if (active) {
        if (isRetryDue(active, true)) {
          const resumed = await base44.asServiceRole.entities.RepeaterBookSync.update(active.id, {
            status: 'active',
            pause_reason: null,
            next_retry_at: null
          });
          return Response.json(responseFor(resumed));
        }
        return Response.json(responseFor(active));
      }

      const sync = await base44.asServiceRole.entities.RepeaterBookSync.create({
        service: 'HAM',
        status: 'active',
        current_index: 0,
        states_total: US_STATE_IDS.length,
        states_completed: 0,
        fetched: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        started_by: caller.id,
        started_at: new Date().toISOString()
      });

      return Response.json(responseFor(sync));
    }

    let sync = await getActiveSync(base44);
    if (!sync) {
      const rows = await base44.asServiceRole.entities.RepeaterBookSync.filter({ service: 'HAM', status: 'completed' }, '-created_date', 1);
      sync = rows?.[0] || null;
    }
    if (!sync) return Response.json({ error: 'No HAM sync exists. Start a new sync first.' }, { status: 400 });

    if (action === 'status') return Response.json(responseFor(sync));

    if (sync.status === 'paused') {
      if (!isRetryDue(sync, false)) return Response.json(responseFor(sync));
      sync = await base44.asServiceRole.entities.RepeaterBookSync.update(sync.id, { status: 'active', pause_reason: null, next_retry_at: null });
    }

    if (sync.status === 'completed') return Response.json(responseFor(sync));

    const index = Number(sync.current_index || 0);
    if (index >= US_STATE_IDS.length) {
      sync = await base44.asServiceRole.entities.RepeaterBookSync.update(sync.id, {
        status: 'completed',
        completed_at: new Date().toISOString()
      });
      return Response.json(responseFor(sync));
    }

    const stateId = US_STATE_IDS[index];

    let rows: any[];
    try {
      rows = await fetchState(stateId, token);
    } catch (e: any) {
      const message = e?.message || String(e);
      const isRateLimit = e?.status === 429 || /rate_limited|rate limit|HTTP_429/i.test(message);
      const isAuthError = e?.status === 401 || e?.status === 403 || /HTTP_401|HTTP_403|unauthorized|forbidden|invalid.*token/i.test(message);
      const pauseReason = isRateLimit ? 'rate_limit' : isAuthError ? 'auth' : 'error';
      // Only rate limits get an automatic cooldown; auth/other failures won't
      // resolve by waiting, so they stay paused until an admin retries manually.
      const retryAt = isRateLimit
        ? new Date(Date.now() + Math.max(60, Number.isFinite(e?.retryAfter) ? e.retryAfter : 300) * 1000).toISOString()
        : null;
      const nextErrors = [...(Array.isArray(sync.errors) ? sync.errors : []), { state_id: stateId, error: message, at: new Date().toISOString() }];

      sync = await base44.asServiceRole.entities.RepeaterBookSync.update(sync.id, {
        status: 'paused',
        pause_reason: pauseReason,
        last_error: message,
        next_retry_at: retryAt,
        errors: nextErrors
      });

      return Response.json(responseFor(sync));
    }

    const existing = await listAllByFilter(base44.asServiceRole.entities.Repeater, { radio_service: 'HAM' }, { sort: '-created_date', fields: ['callsign', 'frequency'] });
    const byKey = new Map<string, any>();
    for (const r of existing) {
      byKey.set(`${str(r.callsign).toUpperCase()}|${num(r.frequency)}`, r);
    }

    let fetched = rows.length;
    let created = 0, updated = 0, skipped = 0;

    const toCreate: any[] = [];
    const toUpdate: { id: string; data: any }[] = [];

    for (const row of rows) {
      if (/gmrs/i.test(str(row['Service Type']))) {
        skipped++;
        continue;
      }

      const record = buildRecord(row);
      if (!record) {
        skipped++;
        continue;
      }

      const key = `${record.callsign}|${record.frequency}`;
      const current = byKey.get(key);

      if (current) {
        toUpdate.push({ id: current.id, data: record });
        updated++;
      } else {
        toCreate.push(record);
        byKey.set(key, record);
        created++;
      }
    }

    // Batch the writes instead of one API call per repeater.
    if (toCreate.length) {
      await base44.asServiceRole.entities.Repeater.bulkCreate(toCreate);
    }
    if (toUpdate.length) {
      await base44.asServiceRole.entities.Repeater.bulkUpdate(toUpdate);
    }

    const nextIndex = index + 1;
    const next = {
      status: nextIndex >= US_STATE_IDS.length ? 'completed' : 'active',
      current_index: nextIndex,
      states_completed: nextIndex,
      fetched: Number(sync.fetched || 0) + fetched,
      created: Number(sync.created || 0) + created,
      updated: Number(sync.updated || 0) + updated,
      skipped: Number(sync.skipped || 0) + skipped,
      last_error: '',
      pause_reason: null,
      next_retry_at: null,
      ...(nextIndex >= US_STATE_IDS.length ? { completed_at: new Date().toISOString() } : {})
    };

    sync = await base44.asServiceRole.entities.RepeaterBookSync.update(sync.id, next);

    await writeAudit(base44, {
      admin_id: caller.id,
      admin_name: caller.name || caller.email || '',
      action: 'repeaterbook_ham_sync_state',
      category: 'repeaters',
      target_type: 'RepeaterBookSync',
      target_id: sync.id,
      target_label: `HAM RepeaterBook Sync — state ${stateId}`,
      meta: { state_id: stateId, fetched, created, updated, skipped, current_index: nextIndex }
    });

    return Response.json(responseFor(sync));
  } catch (e: any) {
    console.error('[importRepeaterbookHam] error:', e?.message || e);
    return Response.json({ error: e?.message || 'unexpected error' }, { status: 500 });
  }
}