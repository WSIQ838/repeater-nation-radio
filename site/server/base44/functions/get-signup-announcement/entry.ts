// Public endpoint: returns the pre-signup announcement popup content, if an
// admin has enabled one. Deliberately separate from the general Announcements
// system (AdminNotification) shown elsewhere in the app -- this is a single,
// independently editable notice meant only for the registration page.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const settings: any = (await base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1))[0];
    const enabled = !!(settings?.signup_announcement_enabled && settings?.signup_announcement_title && settings?.signup_announcement_body);
    return Response.json({
      enabled,
      title: enabled ? settings.signup_announcement_title : '',
      body: enabled ? settings.signup_announcement_body : '',
    });
  } catch (error) {
    console.error('[get-signup-announcement] error:', (error as any)?.message || error);
    return Response.json({ enabled: false, title: '', body: '' });
  }
}
