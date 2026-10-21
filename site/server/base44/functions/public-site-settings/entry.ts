// Public, read-only site settings for logged-out and unauthenticated pages
// (landing, contact, sidebar footer). Only ever returns the small set of
// fields explicitly listed below — never the whole AdminSetting record,
// which also holds webhook URLs and other admin-only configuration.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const FALLBACK = {
  social_discord_url: 'https://discord.gg/SjNy9jR9ej',
  social_twitter_url: '',
  social_facebook_url: '',
  social_instagram_url: '',
  social_youtube_url: '',
  social_tiktok_url: '',
  donation_url: '',
  // 'stripe' = donate inline via Stripe Checkout, 'link' = external donation
  // link, 'none' = no donation option configured.
  donation_mode: 'none',
  show_bug_report_link: true,
};

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const settings = (await base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1))[0];

    const result = { ...FALLBACK };
    for (const key of Object.keys(FALLBACK)) {
      if (key === 'donation_mode' || key === 'show_bug_report_link') continue;
      if (settings && settings[key]) result[key] = settings[key];
    }

    const stripeReady = !!settings?.donation_stripe_enabled && !!secrets.get('STRIPE_SECRET_KEY');
    result.donation_mode = stripeReady ? 'stripe' : result.donation_url ? 'link' : 'none';
    // Defaults on (like the tool_* kill switches) -- only explicit false hides it.
    result.show_bug_report_link = settings?.show_bug_report_link !== false;

    return Response.json(result);
  } catch (error) {
    console.error('[public-site-settings] error:', error?.message || error);
    return Response.json(FALLBACK);
  }
}
