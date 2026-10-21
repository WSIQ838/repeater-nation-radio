import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

// Logs a contact during a SOTA activation and bumps the activation's
// contacts_count in one server round trip (same reasoning as
// pota-log-contact: co-hosts log concurrently). The contact is saved with
// MY_SOTA_REF = the activated summit, plus SOTA_REF when the other station
// was also on a summit (summit-to-summit), so it exports to ADIF and the
// SOTA CSV correctly.
const SUMMIT_RE = /^[A-Z0-9]{1,4}\/[A-Z0-9]{2}-\d{3}$/;

function bandFor(mhz: number | null) {
  if (!mhz) return '';
  const bands: [number, number, string][] = [[1.8, 2, '160m'], [3.5, 4, '80m'], [5.3, 5.41, '60m'], [7, 7.3, '40m'], [10.1, 10.15, '30m'],
    [14, 14.35, '20m'], [18.068, 18.168, '17m'], [21, 21.45, '15m'], [24.89, 24.99, '12m'], [28, 29.7, '10m'], [50, 54, '6m'],
    [144, 148, '2m'], [222, 225, '1.25m'], [420, 450, '70cm']];
  return bands.find(([lo, hi]) => mhz >= lo && mhz <= hi)?.[2] || '';
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const activationId = String(body.activation_id || '');
    const callsign = String(body.callsign || '').trim().toUpperCase();
    if (!activationId || !/^[A-Z0-9/]{3,15}$/.test(callsign)) {
      return Response.json({ error: 'activation_id and a valid callsign are required' }, { status: 400 });
    }
    const theirRef = String(body.sota_ref || '').trim().toUpperCase();
    if (theirRef && !SUMMIT_RE.test(theirRef)) return Response.json({ error: 'Summit references look like W7W/KG-001' }, { status: 400 });

    const activation = await base44.asServiceRole.entities.SotaActivation.get(activationId).catch(() => null);
    if (!activation) return Response.json({ error: 'Activation not found' }, { status: 404 });

    const isHost = activation.created_by_id === caller.id ||
      (activation.co_host_ids || []).includes(caller.id) ||
      activation.club_owner_id === caller.id ||
      caller.role === 'admin' || caller.role === 'super_admin';
    if (!isHost) return Response.json({ error: 'Not authorized to log contacts for this activation' }, { status: 403 });
    if (activation.status !== 'Active') return Response.json({ error: 'Start the activation before logging contacts' }, { status: 409 });

    const frequency = Number(activation.frequency) || null;
    const mode = String(activation.tx_mode || 'SSB');
    const notes = String(body.notes || '').trim();
    const contact = await base44.asServiceRole.entities.ContactLog.create({
      date: new Date().toISOString(),
      callsign,
      contact_name: String(body.contact_name || '').trim(),
      radio_service: 'HAM',
      frequency,
      band: activation.band || bandFor(frequency),
      signal_report: String(body.signal_report || '').trim(),
      notes: [`Mode: ${mode}`, notes].filter(Boolean).join('\n'),
      callsign_used: activation.operator_callsign || '',
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      city: String(body.city || ''),
      state: String(body.state || ''),
      county: String(body.county || ''),
      zip: String(body.zip || ''),
      my_sota_ref: activation.summit_ref || '',
      sota_ref: theirRef,
      sota_activation_id: activationId,
    });

    const contactsCount = (activation.contacts_count || 0) + 1;
    await base44.asServiceRole.entities.SotaActivation.update(activationId, { contacts_count: contactsCount });

    return Response.json({ ok: true, contact, contacts_count: contactsCount });
  } catch (error) {
    console.error('[sota-log-contact] error:', error?.message || error);
    return Response.json({ error: 'Could not log the contact' }, { status: 500 });
  }
}
