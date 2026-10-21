import nodemailer from 'nodemailer';
import { config } from './config.ts';

let transport: any = null;
function getTransport() {
  if (transport) return transport;
  if (!config.smtp.host) return null;
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transport;
}

export interface MailInput {
  to: string | string[];
  subject: string;
  html?: string;
  body?: string;   // plain text (the Base44 SendEmail integration called this `body`)
  text?: string;
  from_name?: string;
}

export async function sendMail(m: MailInput) {
  const t = getTransport();
  if (!m.to || (Array.isArray(m.to) && !m.to.length)) throw new Error('SendEmail: "to" is required');
  if (!t) {
    // No SMTP configured (local development): show the message in the log instead of failing.
    console.log(`[mail:dev] To: ${m.to}\n[mail:dev] Subject: ${m.subject}\n[mail:dev] ${(m.text || m.body || m.html || '').slice(0, 2000)}`);
    return { sent: false, logged: true };
  }
  const fromAddr = config.smtp.from;
  const from = m.from_name ? fromAddr.replace(/^[^<]*</, `${m.from_name} <`) : fromAddr;
  await t.sendMail({
    from,
    to: m.to,
    subject: m.subject,
    html: m.html,
    text: m.text || m.body || (m.html ? m.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined),
  });
  return { sent: true };
}
