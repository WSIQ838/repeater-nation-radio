import { createClientFromRequest } from 'npm:@base44/sdk';

export default async function(req: Request): Promise<Response> {
  // The public homepage reads the verified PublicSiteStats cache.
  // Keep this scheduled endpoint harmless until a supported privileged
  // server-side recount path is available; never overwrite good stats with
  // a failed anonymous/service-role query.
  const base44 = createClientFromRequest(req);
  const stats = (await base44.entities.PublicSiteStats.list('-updated_date', 1).catch(() => []))[0] || null;
  return Response.json({ ok: true, skipped: true, stats });
}