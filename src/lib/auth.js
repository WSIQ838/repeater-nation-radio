import { config } from "./config";

const STORAGE_KEY = "rn_radio_session";

export function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getLoginUrl() {
  if (!config.authUrl) return config.appUrl;
  const callback = window.location.origin;
  const url = new URL(config.authUrl);
  url.searchParams.set("client", "radio");
  url.searchParams.set("redirect_uri", callback);
  return url.toString();
}

export async function restoreSession() {
  const session = getStoredSession();
  if (!session?.token || !config.sessionUrl) return null;

  const response = await fetch(config.sessionUrl, {
    headers: { Authorization: `Bearer ${session.token}` },
  });

  if (!response.ok) {
    clearSession();
    return null;
  }

  const member = await response.json();
  return { ...session, member };
}
