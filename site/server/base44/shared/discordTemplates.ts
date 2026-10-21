// Central registry of Discord message templates (title/description/color) and
// bot usernames per notification channel. Admins can override any of these
// from Admin Settings; overrides are stored as JSON on AdminSetting
// (`discord_message_templates`, `discord_bot_usernames`). Call sites pass a
// flat `vars` object of already-formatted strings — the renderer only does
// literal {{key}} substitution, no conditional logic, so any conditional
// wording (e.g. an optional callsign suffix) must be pre-formatted by the
// caller into a single var before being passed in.

export interface DiscordTemplate {
  id: string;
  channelType: string;
  label: string;
  vars: string[];
  defaultTitle: string;
  defaultDescription: string;
  defaultColor: string; // hex, e.g. "#22C55E"
}

export const DISCORD_TEMPLATES: DiscordTemplate[] = [
  {
    id: 'pota_submission', channelType: 'pota_submission', label: 'POTA park submission',
    vars: ['submitted_by_name', 'park_name', 'park_number', 'location', 'verification_status'],
    defaultTitle: '🌳 POTA Park Submission',
    defaultDescription: '**{{submitted_by_name}}** submitted a new POTA park for review.',
    defaultColor: '#22C55E',
  },
  {
    id: 'repeater_submission', channelType: 'repeater_submission', label: 'New repeater submission',
    vars: ['repeater_name', 'callsign', 'frequency', 'verification'],
    defaultTitle: '📻 New Repeater Submission',
    defaultDescription: 'A new repeater was submitted: **{{repeater_name}}**.',
    defaultColor: '#F97316',
  },
  {
    id: 'access_request_repeater', channelType: 'access_request', label: 'Repeater access request',
    vars: ['requester_display', 'repeater_name', 'repeater_frequency'],
    defaultTitle: '🔑 Repeater Access Request',
    defaultDescription: '**{{requester_display}}** requested access to **{{repeater_name}}** ({{repeater_frequency}} MHz).',
    defaultColor: '#F97316',
  },
  {
    id: 'access_request_callsign', channelType: 'access_request', label: 'Callsign access request',
    vars: ['requester_name', 'callsign', 'primary_holder_name'],
    defaultTitle: '🔑 Callsign Access Request',
    defaultDescription: '**{{requester_name}}** requested access to use callsign **{{callsign}}**.',
    defaultColor: '#F97316',
  },
  {
    id: 'friend_request', channelType: 'friend_request', label: 'Friend request',
    vars: ['requester_name'],
    defaultTitle: '👥 Friend Request',
    defaultDescription: '**{{requester_name}}** sent a friend request.',
    defaultColor: '#3B82F6',
  },
  {
    id: 'message', channelType: 'message', label: 'Direct message',
    vars: ['sender_name'],
    defaultTitle: '💬 New Direct Message',
    defaultDescription: '**{{sender_name}}** sent a message.',
    defaultColor: '#22C55E',
  },
  {
    id: 'forum_reply', channelType: 'forum_reply', label: 'Forum reply',
    vars: ['replier_display', 'post_title'],
    defaultTitle: '🗨️ Forum Reply',
    defaultDescription: '**{{replier_display}}** replied to **{{post_title}}**.',
    defaultColor: '#8B5CF6',
  },
  {
    id: 'badge_award', channelType: 'badge_award', label: 'Badge awarded',
    vars: ['member_name', 'badge_name', 'badge_rarity_suffix'],
    defaultTitle: '🏆 Badge Awarded: {{badge_name}}',
    defaultDescription: '**{{member_name}}** earned the **{{badge_name}}** badge{{badge_rarity_suffix}}.',
    defaultColor: '#F59E0B',
  },
  {
    id: 'club_join', channelType: 'club_join', label: 'Club join',
    vars: ['member_name', 'club_name'],
    defaultTitle: '🏛️ Club Join',
    defaultDescription: '**{{member_name}}** joined **{{club_name}}**.',
    defaultColor: '#22C55E',
  },
  {
    id: 'net_host_invite', channelType: 'net_host_invite', label: 'Net control co-host invite',
    vars: ['inviter_name', 'invitee_display', 'net_name', 'permission_level'],
    defaultTitle: '📡 Net Control Co-Host Invitation',
    defaultDescription: '**{{inviter_name}}** invited **{{invitee_display}}** to co-host the **{{net_name}}** net ({{permission_level}} access).',
    defaultColor: '#F97316',
  },
  {
    id: 'payment_received', channelType: 'payment', label: 'Payment received',
    vars: ['member_name', 'club_name', 'amount', 'fee_period', 'provider'],
    defaultTitle: '💳 Payment Received',
    defaultDescription: '**{{member_name}}** paid for **{{club_name}}** membership.',
    defaultColor: '#22C55E',
  },
  {
    id: 'merch_order', channelType: 'payment', label: 'Merch order paid',
    vars: ['buyer_name', 'order_number', 'amount', 'items'],
    defaultTitle: '🛍️ New Merch Order',
    defaultDescription: '**{{buyer_name}}** placed order **{{order_number}}** ({{amount}}).',
    defaultColor: '#F97316',
  },
  {
    id: 'subscription_ended', channelType: 'payment', label: 'Subscription ended / canceled',
    vars: ['club_name', 'provider'],
    defaultTitle: '❌ Subscription Ended',
    defaultDescription: 'A subscription ended and membership was revoked.',
    defaultColor: '#EF4444',
  },
  {
    id: 'changelog_publish', channelType: 'changelog', label: 'Change-log publish',
    vars: ['visibility', 'published_at', 'entries_count', 'entries', 'launch_suffix'],
    defaultTitle: '🚀 Website Published{{launch_suffix}}',
    defaultDescription: '{{entries}}',
    defaultColor: '#F97316',
  },
  {
    id: 'new_event', channelType: 'event', label: 'New event',
    vars: ['title', 'kind', 'when', 'location', 'organizer'],
    defaultTitle: '📅 {{title}}',
    defaultDescription: 'New {{kind}} on Repeater Nation\n🕒 {{when}}\n📍 {{location}}',
    defaultColor: '#3B82F6',
  },
  {
    id: 'bug_report', channelType: 'bug_report', label: 'Bug report',
    vars: ['bug_title', 'reporter', 'category', 'severity', 'page', 'description'],
    defaultTitle: '🐛 {{bug_title}}',
    defaultDescription: '{{description}}',
    defaultColor: '#F97316',
  },
];

export const DEFAULT_USERNAMES: Record<string, string> = {
  pota_submission: 'WaveSync POTA',
  repeater_submission: 'WaveSync Repeaters',
  access_request: 'WaveSync Access Requests',
  friend_request: 'WaveSync Friend Requests',
  message: 'WaveSync Messages',
  forum_reply: 'WaveSync Forums',
  net_host_invite: 'WaveSync Net Control',
  club_join: 'WaveSync Clubs',
  badge_award: 'WaveSync Badges',
  payment: 'WaveSync Payments',
  changelog: 'WaveSync Changelog',
  bug_report: 'WaveSync Bug Reports',
  event: 'Repeater Nation Events',
};

// Sample values for each template's vars, used by the admin "Send test"
// button so a test message renders exactly like the real thing would.
export const SAMPLE_VARS: Record<string, Record<string, string>> = {
  pota_submission: { submitted_by_name: 'W1AW (Test)', park_name: 'Test State Park', park_number: 'US-1234', location: 'Testville, ST', verification_status: 'pending' },
  repeater_submission: { repeater_name: 'Test Repeater', callsign: 'W1AW', frequency: '146.940 MHz', verification: 'Pending' },
  access_request_repeater: { requester_display: 'W1AW (Test Member)', repeater_name: 'Test Repeater', repeater_frequency: '146.940' },
  access_request_callsign: { requester_name: 'Test Member', callsign: 'W1AW', primary_holder_name: 'Original Holder' },
  friend_request: { requester_name: 'Test Member' },
  message: { sender_name: 'Test Member' },
  forum_reply: { replier_display: 'Test Member (W1AW)', post_title: 'Test Forum Post' },
  badge_award: { member_name: 'Test Member', badge_name: 'Test Badge', badge_rarity_suffix: ' (Rare)' },
  club_join: { member_name: 'Test Member', club_name: 'Test Radio Club' },
  net_host_invite: { inviter_name: 'Test Operator', invitee_display: 'Test Member (W1AW)', net_name: 'Test Net', permission_level: 'full' },
  payment_received: { member_name: 'Test Member', club_name: 'Test Radio Club', amount: '$25.00', fee_period: 'Monthly', provider: 'Test Provider' },
  merch_order: { buyer_name: 'Test Member', order_number: 'RN-4F2A9C', amount: '$31.98', items: '1× Logo Tee (Black / L), 1× Sticker' },
  subscription_ended: { club_name: 'Test Radio Club', provider: 'Test Provider' },
  changelog_publish: { visibility: 'Public', published_at: new Date().toISOString(), entries_count: '2', entries: '**v1.2.0**\nSample changelog notes for this test.', launch_suffix: '' },
  new_event: { title: 'Test Club Meetup', kind: 'club event', when: '<t:1893520800:F> (<t:1893520800:R>)', location: 'Testville Community Center', organizer: 'W1AW' },
  bug_report: { bug_title: 'Test Bug Report', reporter: 'Test Reporter', category: 'General', severity: 'Medium', page: '/test', description: 'This is a sample bug report description used for testing.' },
};

export function renderTemplate(str: string, vars: Record<string, any>): string {
  return String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
    const v = vars ? vars[key] : undefined;
    return v === null || v === undefined ? '' : String(v);
  });
}

export function parseJsonMap(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function hexToInt(hex: string | undefined, fallbackHex: string): number {
  const clean = String(hex || fallbackHex || '#000000').replace('#', '');
  const n = parseInt(clean, 16);
  if (Number.isFinite(n)) return n;
  return parseInt(String(fallbackHex || '000000').replace('#', ''), 16);
}

// Resolves the effective title/description/color for a template id, applying
// any admin override stored on AdminSetting.discord_message_templates, then
// substituting `vars` into the result.
export function renderDiscordTemplate(settings: any, templateId: string, vars: Record<string, any> = {}) {
  const tmpl = DISCORD_TEMPLATES.find((t) => t.id === templateId);
  if (!tmpl) return null;
  const overrides = parseJsonMap(settings?.discord_message_templates)[templateId] || {};
  const title = renderTemplate(overrides.title || tmpl.defaultTitle, vars);
  const description = renderTemplate(overrides.description || tmpl.defaultDescription, vars);
  const color = hexToInt(overrides.color, tmpl.defaultColor);
  return { title, description, color };
}

export function resolveDiscordUsername(settings: any, channelType: string): string {
  const overrides = parseJsonMap(settings?.discord_bot_usernames);
  return overrides[channelType] || DEFAULT_USERNAMES[channelType] || 'WaveSync GMRS';
}