// Central registry of outbound "system" email templates (subject/body) sent
// to members for account/community events. Admins can override any
// template's subject/body from Admin → Email; overrides are stored as JSON
// on AdminSetting.email_message_templates. Call sites pass a flat `vars`
// object of already-formatted strings — the renderer only does literal
// {{key}} substitution, no conditional logic, so any conditional wording
// must be pre-formatted by the caller into a single var before being passed
// in (mirrors the Discord template registry in discordTemplates.ts).

import { renderTemplate, parseJsonMap } from './discordTemplates.ts';

export interface EmailTemplateDef {
  id: string;
  label: string;
  description: string;
  vars: string[];
  defaultSubject: string;
  defaultBody: string;
}

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    id: 'new_message',
    label: 'New direct message',
    description: 'Sent to a member when someone sends them a direct message.',
    vars: ['sender_name', 'message_body'],
    defaultSubject: 'New message from {{sender_name}}',
    defaultBody: [
      'Hi,',
      '',
      '{{sender_name}} sent you a message:',
      '"{{message_body}}"',
      '',
      'Reply in the Messages page.',
      '— Repeater Nation',
    ].join('\n'),
  },
  {
    id: 'forum_reply',
    label: 'Forum post reply',
    description: 'Sent to a forum post author when someone replies to their post.',
    vars: ['recipient_name', 'replier_display', 'post_title', 'reply_body', 'post_url'],
    defaultSubject: 'New reply to your forum post: {{post_title}}',
    defaultBody: [
      'Hi {{recipient_name}},',
      '',
      '{{replier_display}} just replied to your forum post "{{post_title}}".',
      '',
      'Their reply:',
      '"{{reply_body}}"',
      '',
      'View the full discussion here:',
      '{{post_url}}',
      '',
      '— Repeater Nation',
    ].join('\n'),
  },
  {
    id: 'access_request',
    label: 'Repeater access request',
    description: 'Sent to a repeater owner when a member requests access to their closed repeater.',
    vars: ['requester_display', 'repeater_name', 'repeater_frequency', 'details_block'],
    defaultSubject: 'New access request for {{repeater_name}}',
    defaultBody: [
      'Hi,',
      '',
      '{{requester_display}} has requested access to your repeater "{{repeater_name}}" ({{repeater_frequency}} MHz).',
      '{{details_block}}',
      'Review and respond in My Repeaters.',
      '— Repeater Nation',
    ].join('\n'),
  },
  {
    id: 'callsign_access_request',
    label: 'Callsign access request',
    description: 'Sent to a callsign\'s primary account holder when another member requests authorized access to use it.',
    vars: ['requester_display', 'callsign'],
    defaultSubject: 'New access request for callsign {{callsign}}',
    defaultBody: [
      'Hi,',
      '',
      '{{requester_display}} has requested authorized access to use your callsign {{callsign}}.',
      '',
      'Review and respond from Callsign Management.',
      'https://repeaternation.com/callsign-management',
      '',
      '— Repeater Nation',
    ].join('\n'),
  },
  {
    id: 'callsign_verification_reminder',
    label: 'Callsign verification reminder',
    description: 'Default subject/body an admin sends a member about a missing or unverified callsign. Admins can still tweak the message per-send from Users.',
    vars: ['member_name'],
    defaultSubject: 'Action Required: Verify Your Repeater Nation Callsign',
    defaultBody: [
      'Hi {{member_name}},',
      '',
      'Your Repeater Nation account currently does not have a valid, verified active GMRS or amateur radio (HAM) callsign on file.',
      '',
      'Please update your callsign and complete FCC verification from the Callsign Management page:',
      'https://repeaternation.com/callsign-management',
      '',
      'Until your GMRS callsign is verified, your account may be limited to profile and callsign-management features.',
      '',
      'If you believe your callsign is already valid, please re-check the information you entered or contact the Repeater Nation administration team.',
      '',
      'Thank you,',
      'Repeater Nation Administration',
    ].join('\n'),
  },
];

// Sample values for each template's vars, used by the admin "Send test"
// button so a test email renders exactly like the real thing would.
export const SAMPLE_VARS: Record<string, Record<string, string>> = {
  new_message: { sender_name: 'W1AW (Test)', message_body: 'Hey, are you on the net tonight?' },
  forum_reply: {
    recipient_name: 'Test Member', replier_display: 'W1AW (Test)',
    post_title: 'Best mobile antenna for GMRS?', reply_body: 'I run a Comet SBB-5 and love it.',
    post_url: 'https://example.com/forums/test',
  },
  access_request: {
    requester_display: 'W1AW (Test Member)', repeater_name: 'Test Repeater',
    repeater_frequency: '146.940', details_block: 'Usage: Weekend travel',
  },
  callsign_verification_reminder: { member_name: 'Test Member' },
  callsign_access_request: { requester_display: 'W1AW (Test Member)', callsign: 'WRAB123' },
};

let cachedSettings: any = null;
let cachedAt = 0;

export async function getEmailTemplateSettings(base44: any) {
  const now = Date.now();
  if (cachedSettings && now - cachedAt < 30000) return cachedSettings;
  try {
    const list = await base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1);
    cachedSettings = (list && list[0]) || {};
  } catch (e) {
    console.error('[emailTemplates] AdminSetting read failed:', e?.message || e);
    cachedSettings = {};
  }
  cachedAt = now;
  return cachedSettings;
}

// Resolves the effective subject/body for a template id, applying any admin
// override stored on AdminSetting.email_message_templates, then substituting
// `vars` into the result.
export function renderEmailTemplate(settings: any, templateId: string, vars: Record<string, any> = {}) {
  const tmpl = EMAIL_TEMPLATES.find((t) => t.id === templateId);
  if (!tmpl) return null;
  const overrides = parseJsonMap(settings?.email_message_templates)[templateId] || {};
  const subject = renderTemplate(overrides.subject || tmpl.defaultSubject, vars);
  const body = renderTemplate(overrides.body || tmpl.defaultBody, vars);
  return { subject, body };
}

// ===== Branded HTML shell =====
// Wraps a plain-text email body (the format admins edit) in a professional
// branded HTML shell — logo header, accent bar, card body, muted footer —
// so every outbound member email renders consistently across mail clients
// while admins keep editing simple plain text, not raw HTML.

const LOGO_URL = 'https://repeaternation.com/branding/logo-badge-192.png?v=2';
const BRAND_NAME = 'Repeater Nation';
const BRAND_ACCENT = '#FF8000';
const BRAND_DARK = '#1C1C1C';
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function escapeHtml(str: string): string {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Splits a plain-text body into HTML paragraphs (blank line = new paragraph,
// single newline = <br>), auto-links bare URLs, and drops a trailing
// "— Repeater Nation" signature line since the branded footer already
// carries that attribution.
function bodyToHtml(text: string): string {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  while (lines.length && /^—\s*Repeater Nation\s*$/.test(lines[lines.length - 1].trim())) lines.pop();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (current.length) { paragraphs.push(current.join('<br>')); current = []; }
    } else {
      const linked = escapeHtml(line).replace(
        /(https?:\/\/[^\s]+)/g,
        (url) => `<a href="${url}" style="color:${BRAND_ACCENT};text-decoration:underline;">${url}</a>`
      );
      current.push(linked);
    }
  }
  if (current.length) paragraphs.push(current.join('<br>'));

  return paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#27272a;">${p}</p>`).join('\n');
}

export function wrapEmailHtml(subject: string, plainBody: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:${FONT_STACK};">
    <span style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(subject)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr><td style="background:${BRAND_DARK};padding:24px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:10px;"><img src="${LOGO_URL}" width="32" height="32" alt="${BRAND_NAME}" style="display:block;border-radius:50%;" /></td>
              <td style="font-size:17px;font-weight:700;color:#ffffff;font-family:${FONT_STACK};">${BRAND_NAME}</td>
            </tr></table>
          </td></tr>
          <tr><td style="height:4px;background:${BRAND_ACCENT};line-height:0;font-size:0;">&nbsp;</td></tr>
          <tr><td style="padding:32px;">
            ${bodyToHtml(plainBody)}
          </td></tr>
          <tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #eeeeee;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">You're receiving this email because you have an account at ${BRAND_NAME}. Manage your notification preferences from your Profile.</p>
            <p style="margin:8px 0 0;font-size:12px;color:#a1a1aa;">© ${year} ${BRAND_NAME}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// Sends a branded HTML email with a resilient fallback: Base44's documented
// SendEmail contract only guarantees `to`/`subject`/`body` (plain text) —
// `html` isn't in the published SDK type, so a platform/provider rejection
// of that field must never take down the whole send. If the HTML attempt
// throws, retry once with plain text only so the email still goes out.
export async function sendBrandedEmail(
  client: any,
  { to, subject, body }: { to: string; subject: string; body: string }
): Promise<{ sent: true; html: true } | { sent: true; html: false; htmlError: string } | { sent: false; error: any }> {
  const html = wrapEmailHtml(subject, body);
  try {
    // SendEmail rejects a call that passes both `body` and `html` together
    // ("accepts only one of 'body' or 'html', not both") — send html-only
    // for the styled attempt.
    await client.integrations.Core.SendEmail({ to, subject, html });
    return { sent: true, html: true };
  } catch (e) {
    const htmlError = (e as any)?.message || String(e);
    console.error('[emailTemplates] HTML send failed, retrying plain text:', htmlError);
    try {
      await client.integrations.Core.SendEmail({ to, subject, body });
      return { sent: true, html: false, htmlError };
    } catch (e2) {
      console.error('[emailTemplates] plain-text retry also failed:', (e2 as any)?.message || e2);
      return { sent: false, error: e2 };
    }
  }
}
