import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from "base44:runtime";
import { verifyState, exchangeCode, fetchProfile } from "../../shared/socialOauth.ts";

export default async function(req: Request): Promise<Response> {
  let appUrl = (req.headers.get("X-Base44-App-Url") || secrets.get("WIX_CHECKOUT_APP_URL") || "").trim();
  const profilePath = appUrl
    ? `${appUrl}/profile?section=connected`
    : "/profile?section=connected";

  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) {
      return Response.redirect(`${profilePath}&social_error=${encodeURIComponent(oauthError)}`, 302);
    }
    if (!code || !state) {
      return Response.redirect(`${profilePath}&social_error=missing_params`, 302);
    }

    const stateData = await verifyState(state);
    if (!stateData) {
      return Response.redirect(`${profilePath}&social_error=invalid_state`, 302);
    }
    // State expires after 10 minutes
    if (Date.now() - stateData.ts > 600000) {
      return Response.redirect(`${profilePath}&social_error=expired_state`, 302);
    }

    const platform = stateData.plat;
    const userId = stateData.uid;
    const codeVerifier = stateData.cv;

    if (!appUrl) {
      return Response.redirect(`${profilePath}&social_error=no_app_url`, 302);
    }
    const redirectUri = `${appUrl}/functions/social-connect-callback`;

    // Exchange the authorization code for an access token (server-side, secret never exposed)
    const tokenData = await exchangeCode(platform, code, redirectUri, codeVerifier);

    // Fetch the user's verified profile info from the platform
    const profileInfo = await fetchProfile(platform, tokenData);

    // Store the connection (service role bypasses RLS; user_id is set from the signed state)
    const existing = await base44.asServiceRole.entities.ConnectedAccount
      .filter({ user_id: userId, platform })
      .catch(() => []);

    if (existing?.length) {
      await base44.asServiceRole.entities.ConnectedAccount.update(existing[0].id, {
        platform_user_id: profileInfo.platform_user_id,
        username: profileInfo.username,
        display_name: profileInfo.display_name,
        avatar_url: profileInfo.avatar_url,
        profile_url: profileInfo.profile_url,
      });
    } else {
      await base44.asServiceRole.entities.ConnectedAccount.create({
        user_id: userId,
        platform,
        platform_user_id: profileInfo.platform_user_id,
        username: profileInfo.username,
        display_name: profileInfo.display_name,
        avatar_url: profileInfo.avatar_url,
        profile_url: profileInfo.profile_url,
        is_public: false,
      });
    }

    return Response.redirect(`${profilePath}&social_connected=${platform}`, 302);
  } catch (error) {
    console.error("social-connect-callback error", error);
    return Response.redirect(`${profilePath}&social_error=${encodeURIComponent(error.message || "unknown")}`, 302);
  }
}