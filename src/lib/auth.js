import { createClient } from "@base44/sdk";
import { config } from "./config";

const TOKEN_KEY = "rn_radio_access_token";
let accessToken = null;

function readAccessToken() {
  if (accessToken) return accessToken;
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("access_token");
  if (fromUrl) {
    accessToken = fromUrl;
    localStorage.setItem(TOKEN_KEY, fromUrl);
    params.delete("access_token");
    const next = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
    window.history.replaceState({}, document.title, next);
    return accessToken;
  }
  accessToken = localStorage.getItem(TOKEN_KEY) || "";
  return accessToken || null;
}

function client() {
  return createClient({
    appId: config.base44AppId,
    token: readAccessToken() || undefined,
    functionsVersion: config.base44FunctionsVersion || undefined,
    serverUrl: "",
    requiresAuth: false,
    appBaseUrl: config.base44AppBaseUrl || undefined,
  });
}

export function getStoredToken() { return readAccessToken(); }

export async function restoreSession() {
  const token = readAccessToken();
  if (!token) return null;
  try {
    const base44 = client();
    const member = await base44.auth.me();
    if (!member) return null;
    return { token, member };
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    accessToken = null;
    return null;
  }
}

export function beginLogin() {
  client().auth.redirectToLogin(window.location.href);
}

export async function issueRadioSession(channelId) {
  const result = await client().functions.invoke("issue-radio-session", {channel_id: channelId, session_type: "radio"});
  return result?.data || result;
}

export async function issueRadioPTT(channelId, action) {
  const result = await client().functions.invoke("radio-ptt", {action, channel_id: channelId});
  return result?.data || result;
}

export async function listRadioChannels() {
  const base44 = client();
  const channels = await base44.entities.RadioChannel.filter({enabled: true}, "number", 100);
  const zones = await base44.entities.RadioZone.filter({enabled: true}, "display_order", 20);
  const zoneMap = new Map((zones || []).map(z => [z.id, z.name]));
  return (channels || []).map(channel => ({
    id: channel.id,
    name: channel.name,
    number: channel.number,
    zoneId: channel.zone_id,
    zoneName: zoneMap.get(channel.zone_id) || "Radio",
    label: (zoneMap.get(channel.zone_id) || "Radio") + " · " + channel.name,
  }));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  accessToken = null;
}