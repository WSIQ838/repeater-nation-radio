import { createClient } from "@base44/sdk";
import { config } from "./config";
import { openUrl } from "@tauri-apps/plugin-opener";

// Keep one Base44 client for the lifetime of the desktop app.
// The desktop client must use the public Repeater Nation host for Base44 API
// requests; the website can use same-origin routing, but the Tauri WebView
// cannot. Keeping one client also preserves the in-memory authenticated token.
let base44Client = null;

function client() {
  if (!base44Client) {
    base44Client = createClient({
      appId: config.base44AppId,
      functionsVersion: config.base44FunctionsVersion || undefined,
      serverUrl: config.appUrl,
      requiresAuth: false,
      appBaseUrl: config.base44AppBaseUrl || config.appUrl,
      options: {
        onError: (err) => {
          console.error("[Base44 SDK]", err?.status, err?.message, err);
        },
        actorsTransport: "proxy",
      },
    });
  }
  return base44Client;
}

export async function restoreSession() {
  try {
    const member = await client().auth.me();
    return member ? { member } : null;
  } catch {
    return null;
  }
}

export async function loginWithGoogle() {
  // Google refuses sign-in inside an embedded WebView, so start Base44's Google
  // login in the system browser. Base44 returns the token to the website's
  // /oauth/callback page, which hands it to this app via repeaternation://.
  const base = config.base44AppBaseUrl || config.appUrl;
  const fromUrl = `${config.appUrl}/oauth/callback`;
  const loginUrl = `${base}/api/apps/auth/login?app_id=${encodeURIComponent(config.base44AppId)}&from_url=${encodeURIComponent(fromUrl)}`;
  await openUrl(loginUrl);
  reportAuthStatus("Google sign-in opened in your browser. Finish there, then allow it to open Repeater Nation Radio.");
}

// Sign-in progress for the login screen, so a failed browser hand-off says where it stopped.
export function reportAuthStatus(message, error = false) {
  console[error ? "error" : "info"]("[auth]", message);
  window.dispatchEvent(new CustomEvent("rn-auth-status", { detail: { message, error } }));
}

export async function restoreSessionFromOAuth(url = "") {
  const fromLink = Boolean(url);
  try {
    const raw = url || window.location.href;
    const parsed = new URL(raw);
    const query = new URLSearchParams(parsed.search);
    const hash = new URLSearchParams(String(parsed.hash || "").replace(/^#/, ""));
    const token = query.get("access_token") || hash.get("access_token");
    if (!token) {
      if (fromLink) {
        const keys = [...query.keys(), ...hash.keys()].join(", ") || "none";
        reportAuthStatus(`The sign-in link reached the app without a token (link fields: ${keys}).`, true);
      }
      return null;
    }
    if (fromLink) reportAuthStatus("Sign-in link received. Loading your account…");
    client().auth.setToken(token);
    const member = await client().auth.me();
    if (!member && fromLink) reportAuthStatus("The token was accepted but no account came back.", true);
    return member ? { member } : null;
  } catch (err) {
    if (fromLink) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message || err?.message || String(err);
      reportAuthStatus(`Could not finish sign-in: ${detail}`, true);
    }
    return null;
  }
}

export async function loginWithPassword(email, password) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail || !password) {
    throw new Error("Enter your Repeater Nation email and password.");
  }

  const authClient = client();
  await authClient.auth.loginViaEmailPassword(normalizedEmail, password);

  const member = await authClient.auth.me();
  if (!member) {
    throw new Error("Sign in succeeded, but the account session could not be loaded.");
  }

  return { member };
}

async function invoke(name, payload) {
  try {
    const result = await client().functions.invoke(name, payload);
    return result?.data || result;
  } catch (err) {
    const data = err?.response?.data || err?.data;
    const detail = data?.detail || data?.error || data?.message;
    if (detail) throw new Error(String(detail));
    throw err;
  }
}

export const issueRadioSession = (channelId, zoneId="", channelNumber=null) =>
  invoke("issue-radio-session", {
    channel_id: channelId,
    zone_id: zoneId || "",
    channel_number: channelNumber ?? null,
    session_type: "radio",
  });

export const issueRadioPTT = (channelId, action) =>
  invoke("radio-ptt", { action, channel_id: channelId });

export const radioPresence = () => invoke("radio-presence", {});

export const directCall = (action, payload = {}) =>
  invoke("radio-direct-call", { action, ...payload });

export async function listRadioChannels() {
  const base44 = client();
  const channels = await base44.entities.RadioChannel.filter(
    { enabled: true },
    "number",
    100
  );
  const zones = await base44.entities.RadioZone.filter(
    { enabled: true },
    "display_order",
    20
  );

  const zoneMap = new Map((zones || []).map((z) => [z.id, z.name]));

  const allowedChannels = (channels || []).filter((c) => {
    const zoneName = zoneMap.get(c.zone_id) || "Radio";
    return !/^admin\s*testing$/i.test(String(zoneName)) &&
      !/^admin\s*testing$/i.test(String(c.name || ""));
  });

  return allowedChannels.map((c) => ({
    id: c.id,
    name: c.name,
    number: c.number,
    zoneId: c.zone_id,
    zoneName: zoneMap.get(c.zone_id) || "Radio",
    label: (zoneMap.get(c.zone_id) || "Radio") + " · " + c.name,
  }));
}

export async function clearSession() {
  try {
    await client().auth.logout();
  } catch {
    // Local logout should still complete if the server session is already gone.
  }
  base44Client = null;
}
