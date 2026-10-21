import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from "base44:runtime";

// Meta (Facebook / Instagram) Data Deletion Callback
// Docs: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
//
// Register this URL in your Meta App Dashboard:
//   App Settings → Advanced → Data Deletion Callback URL
//   Value: https://projectgmrs.base44.app/functions/data-deletion-callback

function b64urlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
}

async function verifyMetaSignedRequest(signedRequest, appSecret) {
  if (!signedRequest || !appSecret) return null;
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, encodedSig] = parts;

  // Verify the HMAC-SHA256 signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = Uint8Array.from(b64urlDecode(encodedSig), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(encodedPayload));
  if (!valid) return null;

  try {
    return JSON.parse(b64urlDecode(encodedPayload));
  } catch {
    return null;
  }
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Meta sends signed_request as a form-urlencoded POST body
    const text = await req.text();
    const params = new URLSearchParams(text);
    const signedRequest = params.get("signed_request");

    if (!signedRequest) {
      return Response.json({ error: "missing signed_request" }, { status: 400 });
    }

    // Try both Facebook and Instagram app secrets — Meta sends the same format for both
    const fbSecret = secrets.get("FACEBOOK_CLIENT_SECRET");
    const igSecret = secrets.get("INSTAGRAM_CLIENT_SECRET");

    let payload = null;
    let matchedPlatform = null;

    if (fbSecret) {
      payload = await verifyMetaSignedRequest(signedRequest, fbSecret);
      if (payload) matchedPlatform = "facebook";
    }
    if (!payload && igSecret) {
      payload = await verifyMetaSignedRequest(signedRequest, igSecret);
      if (payload) matchedPlatform = "instagram";
    }

    if (!payload) {
      return Response.json({ error: "invalid signature" }, { status: 403 });
    }

    const platformUserId = payload.user_id;
    if (!platformUserId) {
      return Response.json({ error: "no user_id in payload" }, { status: 400 });
    }

    // Delete all ConnectedAccount records for this platform user.
    // Meta requires deletion of all user data obtained from the platform.
    const accounts = await base44.asServiceRole.entities.ConnectedAccount
      .filter({
        platform: matchedPlatform,
        platform_user_id: platformUserId,
      })
      .catch(() => []);

    const confirmationCode = crypto.randomUUID();

    if (accounts?.length) {
      await Promise.allSettled(
        accounts.map((acc) =>
          base44.asServiceRole.entities.ConnectedAccount.delete(acc.id)
        )
      );
    }

    // Meta requires a URL where the user can check the status of their deletion request
    const appUrl = (req.headers.get("X-Base44-App-Url") || secrets.get("WIX_CHECKOUT_APP_URL") || "").trim();
    const statusUrl = appUrl
      ? `${appUrl}/privacy?deletion_code=${confirmationCode}`
      : `/privacy?deletion_code=${confirmationCode}`;

    console.log(`Data deletion: platform=${matchedPlatform} platform_user_id=${platformUserId} accounts_deleted=${accounts?.length || 0} code=${confirmationCode}`);

    return Response.json({
      url: statusUrl,
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    console.error("data-deletion-callback error", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}