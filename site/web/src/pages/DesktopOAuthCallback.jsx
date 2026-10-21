import { useEffect, useState } from "react";
import { appParams } from "@/lib/app-params";

export default function DesktopOAuthCallback() {
  // The dispatch console signs in through its own path and link type, so it never opens
  // (or is opened by) the radio app. /oauth/callback keeps working exactly as before.
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const dispatch = path.startsWith("/oauth/dispatch-callback");
  // The feed app (stream your repeater or SDR into the radio) has its own path and link type too.
  const feed = path.startsWith("/oauth/feed-callback");
  // The Repeater Nation phone and tablet app has its own path and link type as well.
  const phoneApp = path.startsWith("/oauth/app-callback");
  const scheme = feed ? "repeaternation-feed" : dispatch ? "repeaternation-dispatch" : phoneApp ? "repeaternation-app" : "repeaternation";
  const appName = feed ? "Repeater Nation Feed" : dispatch ? "Repeater Nation Dispatch" : phoneApp ? "Repeater Nation" : "Repeater Nation Radio";
  const [status, setStatus] = useState(`Returning to ${appName}…`);

  useEffect(() => {
    // app-params strips access_token from the URL (and stores it) when the site
    // loads, before this page runs, so read the token it captured rather than
    // forwarding the now-empty query string.
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
    const token = params.get("access_token") || hash.get("access_token") || appParams.token;
    if (!token) {
      setStatus(`Sign-in did not return a token. Go back to ${appName} and try again.`);
      return;
    }
    const target = `${scheme}://oauth/callback?access_token=${encodeURIComponent(token)}`;
    try {
      window.location.replace(target);
      setStatus(`Returning to ${appName}… You can close this tab once the app opens.`);
    } catch {
      setStatus(`Open ${appName} to finish signing in.`);
    }
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">{appName}</h1>
        <p className="mt-2 text-slate-500">{status}</p>
      </div>
    </main>
  );
}
