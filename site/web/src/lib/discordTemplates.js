// Frontend mirror of base44/shared/discordTemplates.ts — used by the admin
// Discord Webhooks settings UI. Keep the template ids, channel types, and
// default title/description/color text in sync with the backend registry;
// that's what actually renders and sends the messages.

export const DISCORD_CHANNELS = [
  { type: 'pota_submission', field: 'webhook_pota_submissions', label: 'POTA park submissions', emoji: '🌳', defaultUsername: 'WaveSync POTA' },
  { type: 'repeater_submission', field: 'webhook_repeater_submissions', label: 'New repeater submissions', emoji: '📻', defaultUsername: 'WaveSync Repeaters' },
  { type: 'access_request', field: 'webhook_access_requests', label: 'Access requests (repeater & callsign)', emoji: '🔑', defaultUsername: 'WaveSync Access Requests' },
  { type: 'friend_request', field: 'webhook_friend_requests', label: 'Friend requests', emoji: '👥', defaultUsername: 'WaveSync Friend Requests' },
  { type: 'message', field: 'webhook_messages', label: 'Direct messages', emoji: '💬', defaultUsername: 'WaveSync Messages' },
  { type: 'forum_reply', field: 'webhook_forum_replies', label: 'Forum replies', emoji: '🗨️', defaultUsername: 'WaveSync Forums' },
  { type: 'net_host_invite', field: 'webhook_net_host_invites', label: 'Net control host invites', emoji: '📡', defaultUsername: 'WaveSync Net Control' },
  { type: 'club_join', field: 'webhook_club_joins', label: 'Club joins', emoji: '🏛️', defaultUsername: 'WaveSync Clubs' },
  { type: 'badge_award', field: 'webhook_badge_awards', label: 'Badge awards', emoji: '🏆', defaultUsername: 'WaveSync Badges' },
  { type: 'payment', field: 'webhook_payments', label: 'Payments (Stripe & Base44 Payments)', emoji: '💳', defaultUsername: 'WaveSync Payments' },
  { type: 'changelog', field: 'changelog_webhook_url', label: 'Change-log publishes', emoji: '🚀', defaultUsername: 'WaveSync Changelog' },
  { type: 'bug_report', field: 'bug_report_webhook_url', label: 'Bug reports', emoji: '🐛', defaultUsername: 'WaveSync Bug Reports' },
  { type: 'event', field: 'webhook_events', label: 'New events (also added to Discord\'s Events tab when the bot is set up)', emoji: '📅', defaultUsername: 'Repeater Nation Events' },
];

export const DISCORD_TEMPLATES = [
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
