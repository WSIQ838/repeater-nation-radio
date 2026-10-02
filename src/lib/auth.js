import { createClient } from "@base44/sdk";
import { config } from "./config";

// Keep one Base44 client for the lifetime of the desktop app.
// Base44's external SDK manages the authenticated token on the client.
// Recreating the client after login was dropping the in-memory session,
// which made the radio look signed in but caused subsequent calls to fail.
let base44Client = null;

function client() {
  if (!base44Client) {
    base44Client = createClient({
      appId: config.base44AppId,
      functionsVersion: config.base44FunctionsVersion || undefined,
      serverUrl: "",
      requiresAuth: false,
      appBaseUrl: config.base44AppBaseUrl || undefined,
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
  const authClient = client();
  // OAuth must return to the installed desktop app, not the Tauri WebView.
  // The deep-link plugin routes this URL back into Repeater Nation Radio.
  return authClient.auth.loginWithProvider("google", "repeaternation://oauth/callback");
}

export async function restoreSessionFromOAuth(url = "") {
  try {
    const raw = url || window.location.href;
    const parsed = new URL(raw);
    const query = new URLSearchParams(parsed.search);
    const hash = new URLSearchParams(String(parsed.hash || "").replace(/^#/, ""));
    const token = query.get("access_token") || hash.get("access_token");
    if (!token) return null;
    client().auth.setToken(token);
    const member = await client().auth.me();
    return member ? { member } : null;
  } catch {
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

  return (channels || []).map((c) => ({
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