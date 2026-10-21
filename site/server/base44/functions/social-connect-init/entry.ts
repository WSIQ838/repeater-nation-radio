import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from "base44:runtime";
import {
  PLATFORM_CONFIG, buildAuthUrl, createState, isPlatformConfigured,
  getMissingSecrets, generateCodeVerifier, generateCodeChallenge
} from "../../shared/socialOauth.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const platform = body.platform;

    if (!PLATFORM_CONFIG[platform]) {
      return Response.json({ error: "Unknown platform" }, { status: 400 });
    }

    if (!isPlatformConfigured(platform)) {
      return Response.json({
        not_configured: true,
        missing: getMissingSecrets(platform),
      });
    }

    const appUrl = (req.headers.get("X-Base44-App-Url") || secrets.get("WIX_CHECKOUT_APP_URL") || "").trim();
    if (!appUrl) {
      return Response.json({ error: "Could not determine app URL" }, { status: 500 });
    }
    const redirectUri = `${appUrl}/functions/social-connect-callback`;

    let codeVerifier = null;
    let codeChallenge = null;
    if (PLATFORM_CONFIG[platform].pkce) {
      codeVerifier = generateCodeVerifier();
      codeChallenge = await generateCodeChallenge(codeVerifier);
    }

    const state = await createState(user.id, platform, codeVerifier ? { cv: codeVerifier } : {});
    const authUrl = buildAuthUrl(platform, redirectUri, state, codeChallenge);

    return Response.json({ authUrl });
  } catch (error) {
    console.error("social-connect-init error", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}