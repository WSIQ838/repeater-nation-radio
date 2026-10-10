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

const TOKEN_KEYS = ["base44_access_token", "token"];
function savedToken() {
  try {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }
  } catch {
    // Storage can be unavailable; then there is nothing saved to restore.
  }
  return "";
}

// Sign back in with the token saved on this computer or phone by the last sign-in, so
// people stay signed in between launches. Returns { member } when the saved sign-in still
// works, null when there is none or the server refused it, and { offline: true } when the
// server couldn't be reached (the saved sign-in is kept so it can be tried again).
export async function restoreSession() {
  const token = savedToken();
  if (!token) return null;
  try {
    client().auth.setToken(token);
    let timer;
    const member = await Promise.race([
      client().auth.me(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 15000); }),
    ]).finally(() => clearTimeout(timer));
    return member ? { member } : null;
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    if (status === 401 || status === 403) {
      await clearSession();
      return null;
    }
    return { offline: true };
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

// Neither the Base44 SDK nor axios time out on their own, so a request sent on a dead
// connection (after sleep or a Wi-Fi change) could otherwise wait for minutes.
const INVOKE_TIMEOUT_MS = 20000;

// A 401 from a radio function can be a lapsed sign-in or a passing hiccup on the server's
// side. Check once with the account call; only a refused sign-in there sends the app back
// to the login screen (RadioApp listens for "rn-auth-expired").
let authCheck = null;
function checkSignIn() {
  if (authCheck || !base44Client) return;
  authCheck = (async () => {
    let timer;
    try {
      await Promise.race([
        client().auth.me(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 10000); }),
      ]);
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      if (status === 401 || status === 403) window.dispatchEvent(new CustomEvent("rn-auth-expired"));
    } finally {
      clearTimeout(timer);
      setTimeout(() => { authCheck = null; }, 30000);
    }
  })();
}

async function invoke(name, payload, timeoutMs = INVOKE_TIMEOUT_MS) {
  let timer;
  try {
    const result = await Promise.race([
      client().functions.invoke(name, payload),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Repeater Nation is not responding. Try again in a moment."), { timedOut: true })), timeoutMs);
      }),
    ]);
    return result?.data || result;
  } catch (err) {
    if (err?.timedOut) throw err;
    // Keep the HTTP status so callers can tell "not allowed" (401/403/404) from a hiccup.
    const status = err?.response?.status ?? err?.status;
    if (status === 401) checkSignIn();
    const data = err?.response?.data || err?.data;
    // "error" carries the server's own wording (and which step failed); "detail" is the raw cause.
    const detail = data?.error || data?.message || data?.detail;
    if (detail) throw Object.assign(new Error(String(detail)), { status });
    if (!err?.response && /network error/i.test(err?.message || "")) {
      throw Object.assign(new Error("Can't reach Repeater Nation. Check the internet connection."), { network: true });
    }
    if (status != null && err && typeof err === "object" && err.status == null) err.status = status;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// The radio server answers "Channel not found" (or "Zone not found") whenever its own
// database lookup fails for a moment: it can't tell a slow or refused lookup from a missing
// channel. The channel list comes from that same database, so for a listed channel this is
// a passing hiccup worth trying again, not a channel that is gone.
export const lookupHiccup = (err) =>
  err?.status === 404 && /^(channel|zone) not found\.?$/i.test(String(err?.message || "").trim());

// sessionType "monitor" is a receive-only pass with its own LiveKit identity (scan and
// the console); "radio" is the main radio. The server gives each radio connection its own
// identity (radioSessionId), which PTT calls then name.
export const issueRadioSession = (channelId, zoneId="", channelNumber=null, sessionType="radio", radioSessionId="") =>
  invoke("issue-radio-session", {
    channel_id: channelId,
    zone_id: zoneId || "",
    channel_number: channelNumber ?? null,
    radio_session_id: radioSessionId || "",
    session_type: sessionType,
  });

// Sends the zone and channel number too, as the website does, so the server resolves the
// same channel the radio pass was issued for. radioSessionId and radioCallsign come from
// the radio pass; the server unlocks talking for that connection, not just the account.
export const issueRadioPTT = (channelId, action, zoneId="", channelNumber=null, radioSessionId="", radioCallsign="") =>
  invoke("radio-ptt", { action, channel_id: channelId, zone_id: zoneId || "", channel_number: channelNumber ?? null, radio_session_id: radioSessionId || "", radio_callsign: radioCallsign || "" });

export const radioPresence = () => invoke("radio-presence", {});

// Location sharing is opt-in: a position is only sent while the member has it switched on.
export const reportLocation = (fix) => invoke("radio-location", { action: "report", ...fix });
// Other members who chose to show their location (blurred to about 100 m). Only answers while you are showing yours too.
export const memberLocations = () => invoke("radio-location", { action: "members" });
export const stopLocation = () => invoke("radio-location", { action: "stop" });

export const directCall = (action, payload = {}) =>
  invoke("radio-direct-call", { action, ...payload });

export async function listRadioChannels() {
  const base44 = client();
  const [channels, zones] = await Promise.all([
    base44.entities.RadioChannel.filter({ enabled: true }, "number", 100),
    base44.entities.RadioZone.filter({ enabled: true }, "display_order", 20),
  ]);

  const zoneMap = new Map((zones || []).map((z) => [z.id, z.name]));
  const zoneOrder = new Map((zones || []).map((z, i) => [z.id, z.display_order ?? i]));

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
    zoneOrder: zoneOrder.get(c.zone_id) ?? 999,
    label: (zoneMap.get(c.zone_id) || "Radio") + " · " + c.name,
  }));
}

export async function clearSession() {
  // The SDK's auth.logout() also sends the window to the website's logout page, which
  // would replace this app's own screen. Forget the saved token here instead.
  try {
    localStorage.removeItem("base44_access_token");
    localStorage.removeItem("token");
  } catch {
    // Storage can be unavailable; the client below is dropped either way.
  }
  try {
    base44Client?.cleanup?.();
  } catch {
    // Nothing to stop.
  }
  base44Client = null;
}
