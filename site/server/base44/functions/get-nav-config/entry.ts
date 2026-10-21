// Public endpoint: returns the saved sidebar tab order. Reads the
// AdminSetting record as service role and projects only the nav_order array
// so non-admin users get the configured tab order without exposing settings.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  let nav_order: string[] = [];
  try {
    const base44 = createClientFromRequest(req);
    let settings: any = (await base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1))[0];
    if (settings?.nav_order) {
      try {
        const parsed = JSON.parse(settings.nav_order);
        if (Array.isArray(parsed)) nav_order = parsed.filter((s) => typeof s === 'string');

        // Keep the account-management tabs together in the intended order.
        // Older saved admin navigation settings may still have Profile before
        // My Callsign, so normalize that pair at the server-config level.
        const callsignPath = '/callsign-management';
        const profilePath = '/profile';
        const withoutAccountTabs = nav_order.filter((p) => p !== callsignPath && p !== profilePath);
        const firstAccountIndex = nav_order.findIndex((p) => p === callsignPath || p === profilePath);
        const insertAt = firstAccountIndex >= 0
          ? Math.min(firstAccountIndex, withoutAccountTabs.length)
          : withoutAccountTabs.length;
        withoutAccountTabs.splice(insertAt, 0, callsignPath, profilePath);
        nav_order = withoutAccountTabs;
      } catch { /* ignore malformed JSON */ }
    }
  } catch (error) {
    console.error('[get-nav-config] error:', error?.message || error);
  }
  return Response.json({ nav_order });
}