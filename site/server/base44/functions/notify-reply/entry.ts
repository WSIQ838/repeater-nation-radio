import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendUserEmail } from '../../shared/notify.ts';
import { postDiscordNotification } from '../../shared/discordWebhook.ts';
import { getEmailTemplateSettings, renderEmailTemplate } from '../../shared/emailTemplates.ts';

// ===== APP-SPECIFIC =====
// Sends an email notification to a forum post author when their post gets a reply.
// Uses Base44's built-in SendEmail integration (reaches registered app users only),
// which fits here because every forum poster is a registered user.
// ===== END APP-SPECIFIC =====

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { post_id } = body || {};
    const replier_id = String(body?.replier_id || '');
    if (!post_id) {
      return Response.json({ error: 'post_id is required' }, { status: 400 });
    }
    if (!replier_id) {
      return Response.json({ error: 'replier_id is required' }, { status: 400 });
    }

    // Verify a real ForumReply exists for this post by the claimed replier.
    // This prevents anonymous callers from spoofing reply content in the
    // notification email — only an actual reply can trigger a notification.
    const replies = await base44.asServiceRole.entities.ForumReply.filter(
      { post_id, created_by_id: replier_id }, '-created_date', 1
    ).catch(() => []);
    if (!replies || replies.length === 0) {
      return Response.json({ error: 'No matching reply found' }, { status: 403 });
    }
    const reply = replies[0];
    if (reply.notification_sent_at) return Response.json({ skipped: true, reason: 'already_notified' });

    // Use the actual reply data from the database, not client-supplied values.
    const replier_name = reply.author_name || 'Someone';
    const replier_callsign = reply.author_callsign || '';
    const reply_body = String(reply.body || '').slice(0, 1000);

    // Fetch the original forum post (service role — trigger has no user session).
    let post;
    try {
      post = await base44.asServiceRole.entities.ForumPost.get(post_id);
    } catch (err) {
      console.error('[notify-reply] ForumPost not found:', post_id, err?.message || err);
      return Response.json({ skipped: true, reason: 'post_not_found' });
    }
    if (!post) {
      return Response.json({ skipped: true, reason: 'post_not_found' });
    }

    // Don't notify someone for replying to their own post.
    if (post.created_by_id && post.created_by_id === replier_id) {
      return Response.json({ skipped: true, reason: 'self_reply' });
    }

    // Build a link back to the forum thread.
    const origin = new URL(req.url).origin;
    const postUrl = `${origin}/forums/${post_id}`;

    const replierDisplay = `${replier_name || 'Someone'}${replier_callsign ? ` (${replier_callsign})` : ''}`;
    const settings = await getEmailTemplateSettings(base44);
    const rendered = renderEmailTemplate(settings, 'forum_reply', {
      recipient_name: post.author_name || post.author_callsign || 'there',
      replier_display: replierDisplay,
      post_title: post.title,
      reply_body: reply_body || '',
      post_url: postUrl,
    });

    const res = await sendUserEmail(base44, post.created_by_id, 'forum_replies', rendered.subject, rendered.body);

    if (post.created_by_id && post.created_by_id !== replier_id) {
      await base44.asServiceRole.entities.UserNotification.create({
        user_id: post.created_by_id,
        title: 'New Forum Reply',
        message: replierDisplay + ' replied to "' + (post.title || 'your forum post') + '".',
        type: 'forum_reply',
        sender_name: replierDisplay,
        link_url: '/forums/' + post_id,
        link_label: 'View Reply',
        description: 'forum_reply:' + reply.id,
      }).catch((e) => console.error('[notify-reply] in-app notification failed:', e?.message || e));
    }

    await postDiscordNotification(base44, 'forum_reply', 'forum_reply', {
      replier_display: replierDisplay,
      post_title: post.title || '',
    }, {
      fields: [{ name: 'Reply', value: String(reply_body || '').slice(0, 1024) || '—', inline: false }],
    });

    await base44.asServiceRole.entities.ForumReply.update(reply.id, { notification_sent_at: new Date().toISOString() }).catch((e) => console.error('[notify-reply] mark sent failed:', e?.message || e));
    return Response.json(res);
  } catch (error) {
    console.error('[notify-reply] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}