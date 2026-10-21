import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';

// ===== APP-SPECIFIC =====
// Delivery/read receipts for direct messages. Message rows can no longer be
// updated from the browser (a recipient could otherwise rewrite a received
// message's text, and the sender would see the altered version), so the
// only edits members need -- marking messages they RECEIVED as delivered or
// read -- happen here, limited to those two status fields.
//   delivered -- every message to the caller still in status 'sent'
//   read      -- the given message ids, only where the caller is recipient
// ===== END APP-SPECIFIC =====

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));

    if (body.action === 'delivered') {
      await base44.asServiceRole.entities.Message.updateMany(
        { recipient_id: me.id, status: 'sent' },
        { $set: { status: 'delivered' } },
      );
      return Response.json({ ok: true });
    }

    if (body.action === 'read') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean).slice(0, 200);
      if (!ids.length) return Response.json({ ok: true, updated: 0 });
      await base44.asServiceRole.entities.Message.updateMany(
        { id: { $in: ids }, recipient_id: me.id },
        { $set: { read: true, status: 'read' } },
      );
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[message-status]', error?.message || error);
    return Response.json({ error: 'Could not update message status' }, { status: 500 });
  }
}
