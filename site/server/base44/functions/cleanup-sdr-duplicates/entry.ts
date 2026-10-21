import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';


const SOURCE_NAME = 'rx-tx.info';
const CONFIRM = 'DELETE_RXTX_DUPLICATES';

export default async function(req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);

  try {
    const suppliedSecret =
      req.headers.get('X-RN-SDR-Secret') ||
      req.headers.get('x-rn-sdr-secret') ||
      '';

    const configuredSecret =
      Deno.env.get('RXT_TX_IMPORT_SECRET') ||
      '';

    if (!configuredSecret || !suppliedSecret || suppliedSecret !== configuredSecret) {
      return Response.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;
    const confirm = String(body?.confirm || '');

    const sleep = (ms: number) =>
      new Promise(resolve => setTimeout(resolve, ms));

    // Optional externally-audited delete list. This avoids another large
    // database read inside the function, which can itself hit rate limits.
    const requestedIds = Array.isArray(body?.deleteIds)
      ? body.deleteIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    if (requestedIds.length > 0) {
      if (dryRun) {
        return Response.json({
          ok: true,
          source: SOURCE_NAME,
          dryRun: true,
          requestedDeleteIds: requestedIds.length,
          deleteIds: requestedIds,
        });
      }

      if (confirm !== CONFIRM) {
        return Response.json({
          ok: false,
          error: 'Deletion not performed. Set confirm to the required value.',
        }, { status: 400 });
      }

      let deleted = 0;
      const errors: Array<{ id: string; error: string }> = [];
      const pauseMs = Math.max(5000, Math.min(Number(body?.pauseMs) || 5000, 15000));
      const maxAttempts = Math.max(1, Math.min(Number(body?.maxAttempts) || 8, 10));
      const retryBaseMs = Math.max(5000, Math.min(Number(body?.retryBaseMs) || 5000, 15000));

      for (let i = 0; i < requestedIds.length; i++) {
        const id = requestedIds[i];
        let success = false;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await base44.asServiceRole.entities.SdrStream.delete(id);
            deleted++;
            success = true;
            break;
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            const isRateLimit =
              message.toLowerCase().includes('rate limit') ||
              message.toLowerCase().includes('too many requests') ||
              message.includes('429');

            if (!isRateLimit || attempt >= maxAttempts) {
              errors.push({ id, error: message });
              break;
            }

            await sleep(Math.min(retryBaseMs * Math.pow(2, attempt - 1), 60000));
          }
        }

        if (i + 1 < requestedIds.length) await sleep(pauseMs);
      }

      return Response.json({
        ok: true,
        source: SOURCE_NAME,
        dryRun: false,
        requestedDeleteIds: requestedIds.length,
        deleted,
        failed: errors.length,
        errors: errors.slice(0, 25),
      });
    }

    return Response.json({
      ok: false,
      error: 'No deleteIds supplied. Run the external RX-TX duplicate audit first.',
    }, { status: 400 });

    return Response.json({
      ok: false,
      error: 'No deleteIds supplied. Run the external RX-TX duplicate audit first.',
    }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('cleanup-sdr-duplicates:', e);
    return Response.json({ error: message }, { status: 500 });
  }
}
