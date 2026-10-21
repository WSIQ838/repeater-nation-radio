import { secrets } from "base44:runtime";

export const PLATFORMS = ["discord", "facebook", "youtube", "twitch", "instagram", "x"];

export const PLATFORM_LABELS = {
  discord: "Discord",
  facebook: "Facebook",
  youtube: "YouTube",
  twitch: "Twitch",
  instagram: "Instagram",
  x: "X (Twitter)",
};

export const PLATFORM_CONFIG = {
  discord: {
    authUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    profileUrl: "https://discord.com/api/users/@me",
    scope: "identify",
    clientIdKey: "DISCORD_CLIENT_ID",
    clientSecretKey: "DISCORD_CLIENT_SECRET",
  },
  facebook: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    profileUrl: "https://graph.facebook.com/v19.0/me",
    scope: "public_profile",
    clientIdKey: "FACEBOOK_CLIENT_ID",
    clientSecretKey: "FACEBOOK_CLIENT_SECRET",
  },
  instagram: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    profileUrl: "https://graph.instagram.com/me",
    scope: "instagram_basic instagram_graph_user_profile",
    clientIdKey: "INSTAGRAM_CLIENT_ID",
    clientSecretKey: "INSTAGRAM_CLIENT_SECRET",
  },
  youtube: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://www.googleapis.com/youtube/v3/channels",
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    clientIdKey: "YOUTUBE_CLIENT_ID",
    clientSecretKey: "YOUTUBE_CLIENT_SECRET",
  },
  twitch: {
    authUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    profileUrl: "https://api.twitch.tv/helix/users",
    scope: "user:read:email",
    clientIdKey: "TWITCH_CLIENT_ID",
    clientSecretKey: "TWITCH_CLIENT_SECRET",
  },
  x: {
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    profileUrl: "https://api.twitter.com/2/users/me",
    scope: "users.read tweet.read offline.access",
    clientIdKey: "X_CLIENT_ID",
    clientSecretKey: "X_CLIENT_SECRET",
    pkce: true,
  },
};

export function getConfig(platform) {
  return PLATFORM_CONFIG[platform];
}

export function isPlatformConfigured(platform) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) return false;
  const clientId = (secrets.get(config.clientIdKey) || "").trim();
  const clientSecret = (secrets.get(config.clientSecretKey) || "").trim();
  return !!(clientId && clientSecret);
}

export function getMissingSecrets(platform) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) return [];
  const missing = [];
  if (!(secrets.get(config.clientIdKey) || "").trim()) missing.push(config.clientIdKey);
  if (!(secrets.get(config.clientSecretKey) || "").trim()) missing.push(config.clientSecretKey);
  return missing;
}

// --- State signing (HMAC-SHA256) ---

function b64url(input) {
  let str;
  if (input instanceof Uint8Array) {
    str = String.fromCharCode(...input);
  } else {
    str = input;
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
}

async function hmacSign(data) {
  const secret = secrets.get("SOCIAL_CONNECT_STATE_SECRET") || "fallback-dev-key";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return b64url(new Uint8Array(sig));
}

export async function createState(userId, platform, extra) {
  const payload = {
    uid: userId,
    plat: platform,
    ts: Date.now(),
    nonce: crypto.randomUUID(),
    ...(extra || {}),
  };
  const encoded = b64url(JSON.stringify(payload));
  const sig = await hmacSign(encoded);
  return `${encoded}.${sig}`;
}

export async function verifyState(state) {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = await hmacSign(encoded);
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(b64urlDecode(encoded));
  } catch {
    return null;
  }
}

// --- PKCE (for X/Twitter) ---

export function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return b64url(array);
}

export async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return b64url(new Uint8Array(data));
}

// --- Auth URL ---

export function buildAuthUrl(platform, redirectUri, state, codeChallenge) {
  const config = PLATFORM_CONFIG[platform];
  const clientId = secrets.get(config.clientIdKey);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scope,
    state,
  });

  if (config.pkce && codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  return `${config.authUrl}?${params.toString()}`;
}

// --- Token exchange ---

export async function exchangeCode(platform, code, redirectUri, codeVerifier) {
  const config = PLATFORM_CONFIG[platform];
  const clientId = secrets.get(config.clientIdKey);
  const clientSecret = secrets.get(config.clientSecretKey);

  const body = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };

  const headers = { "Content-Type": "application/x-www-form-urlencoded" };

  if (platform === "x") {
    // X uses Basic auth, no client_secret in body
    headers["Authorization"] = "Basic " + btoa(`${clientId}:${clientSecret}`);
    if (codeVerifier) body.code_verifier = codeVerifier;
  } else {
    body.client_id = clientId;
    body.client_secret = clientSecret;
  }

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

// --- Profile fetching ---

export async function fetchProfile(platform, tokenData) {
  const config = PLATFORM_CONFIG[platform];
  const accessToken = tokenData.access_token;

  switch (platform) {
    case "discord": {
      const res = await fetch(config.profileUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Discord profile fetch failed (${res.status})`);
      const d = await res.json();
      return {
        platform_user_id: d.id,
        username: d.username,
        display_name: d.global_name || d.username,
        avatar_url: d.avatar
          ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png?size=128`
          : "",
        profile_url: "",
      };
    }
    case "facebook": {
      const res = await fetch(
        `${config.profileUrl}?fields=id,name,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) throw new Error(`Facebook profile fetch failed (${res.status})`);
      const d = await res.json();
      return {
        platform_user_id: d.id,
        username: d.name,
        display_name: d.name,
        avatar_url: d.picture?.data?.url || "",
        profile_url: `https://facebook.com/${d.id}`,
      };
    }
    case "instagram": {
      const res = await fetch(
        `${config.profileUrl}?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) throw new Error(`Instagram profile fetch failed (${res.status})`);
      const d = await res.json();
      return {
        platform_user_id: d.id,
        username: d.username,
        display_name: d.username,
        avatar_url: d.profile_picture_url || "",
        profile_url: `https://instagram.com/${d.username}`,
      };
    }
    case "youtube": {
      const res = await fetch(`${config.profileUrl}?part=snippet&mine=true`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`YouTube profile fetch failed (${res.status})`);
      const d = await res.json();
      const ch = d.items?.[0];
      if (!ch) throw new Error("No YouTube channel found for this account");
      return {
        platform_user_id: ch.id,
        username: ch.snippet?.customUrl || ch.snippet?.title || "",
        display_name: ch.snippet?.title || "",
        avatar_url: ch.snippet?.thumbnails?.default?.url || "",
        profile_url: ch.snippet?.customUrl
          ? `https://youtube.com/@${ch.snippet.customUrl}`
          : `https://youtube.com/channel/${ch.id}`,
      };
    }
    case "twitch": {
      const clientId = secrets.get(config.clientIdKey);
      const res = await fetch(config.profileUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-Id": clientId,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Twitch profile fetch failed (${res.status})`);
      const d = await res.json();
      const u = d.data?.[0];
      if (!u) throw new Error("No Twitch user found");
      return {
        platform_user_id: u.id,
        username: u.login,
        display_name: u.display_name,
        avatar_url: u.profile_image_url || "",
        profile_url: `https://twitch.tv/${u.login}`,
      };
    }
    case "x": {
      const res = await fetch(`${config.profileUrl}?user.fields=profile_image_url`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`X profile fetch failed (${res.status})`);
      const d = await res.json();
      const u = d.data;
      if (!u) throw new Error("No X user found");
      return {
        platform_user_id: u.id,
        username: u.username,
        display_name: u.name,
        avatar_url: u.profile_image_url || "",
        profile_url: `https://x.com/${u.username}`,
      };
    }
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}