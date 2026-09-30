# Repeater Nation Radio

Standalone desktop radio client for Repeater Nation.

## Direction

- Existing Repeater Nation account
- Existing LiveKit voice infrastructure
- Windows desktop application
- Radio-first interface
- No duplicate member/account system

## Development

```bash
npm install
npm run dev
```

For Tauri development:

```bash
npm run tauri:dev
```

Environment:

- `VITE_REPEATER_NATION_APP_URL` — Repeater Nation web app
- `VITE_LIVEKIT_URL` — LiveKit WebSocket endpoint

The current UI is the application shell. Authentication/session exchange, LiveKit room connection, device routing, presence, calls, and persistent radio settings are intentionally isolated as the next implementation layer.
