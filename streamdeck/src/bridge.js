import { WebSocketServer } from "ws";

// The apps (radio and dispatch console) connect to this local server and keep the plugin up to date.
// Messages from an app: { t: "hello", app } then { t: "state", app, state }.
// Messages to an app: { t: "cmd", ... } (press or release of a key).
// Only this computer can connect (127.0.0.1), and only the apps' own windows (not web pages).
const OK_ORIGINS = new Set([undefined, "", "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]);

export function createBridge({ port, onChange = () => {}, log = () => {} }) {
  const clients = new Map();            // app -> socket
  const states = { radio: null, dispatch: null };
  const wss = new WebSocketServer({ host: "127.0.0.1", port, verifyClient: (info) => OK_ORIGINS.has(info.origin) });
  wss.on("error", (err) => log(`bridge error: ${err?.message || err}`));
  wss.on("connection", (ws) => {
    let app = null;
    ws.on("message", (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (m?.t === "hello" && (m.app === "radio" || m.app === "dispatch")) {
        app = m.app;
        const old = clients.get(app);
        clients.set(app, ws);
        if (old && old !== ws) { try { old.close(); } catch { /* already closed */ } }
        log(`${app} connected`);
        onChange();
      } else if (m?.t === "state" && app && m.app === app && m.state && typeof m.state === "object") {
        states[app] = m.state;
        onChange();
      }
    });
    ws.on("close", () => {
      if (app && clients.get(app) === ws) { clients.delete(app); states[app] = null; log(`${app} disconnected`); onChange(); }
    });
    ws.on("error", () => {});
  });
  return {
    send(app, cmd) { const ws = clients.get(app); if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ t: "cmd", ...cmd })); return true; } return false; },
    state: (app) => states[app],
    connected: (app) => clients.has(app),
    close: () => new Promise((resolve) => { for (const ws of clients.values()) { try { ws.close(); } catch { /* ignore */ } } wss.close(() => resolve()); }),
  };
}
