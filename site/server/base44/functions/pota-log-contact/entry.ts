import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

// Logs a POTA contact and bumps the activation's contacts_count together,
// server-side. PotaContactDialog used to do these as two separate client
// calls, reading contacts_count from its own (possibly stale) props -- fine
// for a single operator, but the app explicitly supports multiple co-hosts
// logging contacts on the same activation concurrently, and two co-hosts
// submitting within the same window would both read the same count and one
// increment would silently overwrite the other. Doing the read-and-increment
// in one server round trip shrinks that race window from "as long as a form
// take to fill out" to a single fast request.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const activationId = String(body.activation_id || '');
    const callsign = String(body.callsign || '').trim().toUpperCase();
    if (!activationId || !callsign) {
      return Response.json({ error: 'activation_id and callsign required' }, { status: 400 });
    }

    const activation = await base44.asServiceRole.entities.PotaActivation.get(activationId).catch(() => null);
    if (!activation) return Response.json({ error: 'Activation not found' }, { status: 404 });

    const isHost = activation.created_by_id === caller.id ||
      (activation.co_host_ids || []).includes(caller.id) ||
      activation.club_owner_id === caller.id ||
      caller.role === 'admin' || caller.role === 'super_admin';
    if (!isHost) {
      return Response.json({ error: 'Not authorized to log contacts for this activation' }, { status: 403 });
    }

    const contact = await base44.asServiceRole.entities.ContactLog.create({
      date: new Date().toISOString(),
      callsign,
      contact_name: String(body.contact_name || '').trim(),
      frequency: activation.frequency || null,
      channel: activation.channel || '',
      mode: activation.mode || 'Simplex',
      signal_report: String(body.signal_report || '').trim(),
      notes: String(body.notes || '').trim(),
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      city: String(body.city || ''),
      state: String(body.state || ''),
      county: String(body.county || ''),
      zip: String(body.zip || ''),
      pota_activation_id: activationId,
      pota_park_name: activation.park_name || '',
    });

    const contactsCount = (activation.contacts_count || 0) + 1;
    await base44.asServiceRole.entities.PotaActivation.update(activationId, { contacts_count: contactsCount });

    return Response.json({ ok: true, contact, contacts_count: contactsCount });
  } catch (error) {
    console.error('[pota-log-contact] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}
