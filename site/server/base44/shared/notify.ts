// Shared email-notification helper. Respects per-user email preferences stored
// on the User entity before sending. Used by backend functions that fire
// automated event emails (forum replies, messages, access requests, etc.).
//
// category must be one of: announcements | forum_replies | messages | access_requests

import { sendBrandedEmail } from './emailTemplates.ts';

const PREF_FIELD: Record<string, string> = {
  announcements: 'email_announcements',
  forum_replies: 'email_forum_replies',
  messages: 'email_messages',
  access_requests: 'email_access_requests',
};

export async function sendUserEmail(base44: any, userId: string, category: string, subject: string, body: string) {
  if (!userId) return { sent: false, reason: 'no_user' };
  let user: any;
  try {
    user = await base44.asServiceRole.entities.User.get(userId);
  } catch (e) {
    return { sent: false, reason: 'user_fetch_failed' };
  }
  if (!user) return { sent: false, reason: 'no_user' };
  if (user.account_status === 'suspended') return { sent: false, reason: 'suspended' };
  if (user.account_status === 'investigation') return { sent: false, reason: 'investigation' };
  if (user.email_notifications === false) return { sent: false, reason: 'master_off' };
  const prefKey = PREF_FIELD[category];
  if (prefKey && user[prefKey] === false) return { sent: false, reason: 'pref_off' };
  if (!user.email) return { sent: false, reason: 'no_email' };
  const result = await sendBrandedEmail(base44.asServiceRole, { to: user.email, subject, body });
  if (!result.sent) {
    console.error(`[notify] send failed (${category}):`, result.error?.message || result.error);
    return { sent: false, reason: 'send_failed' };
  }
  return { sent: true, to: user.email };
}