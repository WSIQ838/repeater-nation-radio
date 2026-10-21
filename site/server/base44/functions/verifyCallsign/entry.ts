// FCC ULS callsign verification. Delegates the lookup to the shared fcc module
// so the admin FCC tools reuse the exact same implementation.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { ulsLookup } from '../../shared/fcc.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch {}
    const callsign = String(body.callsign || '').trim().toUpperCase();

    if (!callsign) {
      return Response.json({ valid: false, verified: false, message: 'A callsign is required.' }, { status: 200 });
    }

    const result = await ulsLookup(base44, callsign);
    return Response.json(result);
  } catch (error) {
    console.error('verifyCallsign error:', error);
    return Response.json({ valid: false, verified: false, message: error.message || 'Verification failed.' }, { status: 500 });
  }
}