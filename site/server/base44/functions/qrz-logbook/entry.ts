import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';

// ===== APP-SPECIFIC =====
// Pass-through to the QRZ Logbook API (https://logbook.qrz.com/api) for the
// QRZ Logbook sync tool. Each member supplies their own QRZ Logbook API key,
// which stays in their browser; it is sent with each request, forwarded to
// QRZ, and never stored or logged here. Signed-in members only, so this
// can't be used as an open proxy.
//   status -- logbook summary (QRZ subscription required)
//   fetch  -- one page (max 250) of QSOs as ADIF (subscription required)
//   insert -- add one QSO (free for all QRZ members)
// QRZ requires an identifiable User-Agent on every request.
// ===== END APP-SPECIFIC =====

const API = 'https://logbook.qrz.com/api';
const UA = 'RepeaterNation/1.0 (+https://repeaternation.com)';

// QRZ replies are name=value pairs joined by '&', with the ADIF value
// HTML-escaped, so only split on '&' that starts a new NAME= pair.
function parseReply(text: string) {
  const out: Record<string, string> = {};
  for (const part of text.trim().split(/&(?=[A-Z_]+=)/)) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1).trim();
  }
  if (out.ADIF) {
    out.ADIF = out.ADIF.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }
  return out;
}

async function qrz(params: Record<string, string>) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new Error(`QRZ returned HTTP ${res.status}`);
  return parseReply(await res.text());
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Sign in to sync with QRZ.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const key = String(body.key || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(key)) {
      return Response.json({ error: 'Enter your QRZ Logbook API key (format XXXX-XXXX-XXXX-XXXX).' }, { status: 400 });
    }
    const action = String(body.action || '');

    if (action === 'status') {
      const r = await qrz({ KEY: key, ACTION: 'STATUS' });
      if (r.RESULT !== 'OK') return Response.json({ ok: false, error: r.REASON || 'QRZ rejected the request.' });
      const data: Record<string, string> = {};
      for (const kv of String(r.DATA || '').split('&')) {
        const i = kv.indexOf('=');
        if (i > 0) data[kv.slice(0, i)] = kv.slice(i + 1);
      }
      return Response.json({ ok: true, status: data });
    }

    if (action === 'fetch') {
      const after = Math.max(0, Math.floor(Number(body.afterLogId) || 0));
      const r = await qrz({ KEY: key, ACTION: 'FETCH', OPTION: `MAX:250,AFTERLOGID:${after}` });
      if (r.RESULT !== 'OK') {
        // "no records" comes back as FAIL with COUNT=0
        if (Number(r.COUNT) === 0) return Response.json({ ok: true, adif: '', count: 0 });
        return Response.json({ ok: false, error: r.REASON || 'QRZ rejected the request.' });
      }
      return Response.json({ ok: true, adif: r.ADIF || '', count: Number(r.COUNT) || 0 });
    }

    if (action === 'insert') {
      const adif = String(body.adif || '');
      if (!/<eor>/i.test(adif) || adif.length > 5000) return Response.json({ error: 'Invalid QSO record.' }, { status: 400 });
      const r = await qrz({ KEY: key, ACTION: 'INSERT', ADIF: adif });
      if (r.RESULT === 'OK' || r.RESULT === 'REPLACE') return Response.json({ ok: true, logId: r.LOGID || null });
      const duplicate = /duplicate/i.test(r.REASON || '');
      return Response.json({ ok: false, duplicate, error: r.REASON || 'QRZ rejected the QSO.' });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[qrz-logbook]', error?.message || error);
    return Response.json({ error: 'Could not reach QRZ right now. Try again shortly.' }, { status: 502 });
  }
}
