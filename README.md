# Repeater Nation Radio

Standalone desktop radio client for Repeater Nation.

## Current integration

- Uses the existing Repeater Nation Base44 account/session.
- Requests server-issued radio sessions from `issue-radio-session`.
- Uses the existing `voice.repeaternation.com` LiveKit service.
- Loads the existing RadioChannel and RadioZone records.
- Uses the existing server-authoritative `radio-ptt` floor control.
- Shows LiveKit channel presence with callsign/display metadata.
- Supports push-to-talk microphone publishing.
- Supports shared Repeater Nation direct calls through `radio-direct-call`.
- Uses the same verified-callsign transmit authorization as the website.
- Does not create a second member/account system.

## Plugins

Anyone can write a plugin (one `.js` file) and install it from Settings › Plugins. See [docs/plugins.md](docs/plugins.md) and the examples in `plugins/examples`.

## Development

```bash
npm install
npm run dev
```

For Tauri development:

```bash
npm run tauri:dev
```

## Configuration

Copy `.env.example` when local overrides are needed.

- `VITE_REPEATER_NATION_APP_URL` — Repeater Nation web app
- `VITE_BASE44_APP_ID` — Repeater Nation Base44 application ID
- `VITE_BASE44_APP_BASE_URL` — optional Base44 app base URL
- `VITE_BASE44_FUNCTIONS_VERSION` — optional functions version
- `VITE_LIVEKIT_URL` — LiveKit WebSocket endpoint
- `VITE_RADIO_CHANNEL_ID` — default RadioChannel record
- `VITE_RADIO_CHANNEL_NAME` — default display name

## Authentication note

The desktop client uses the Base44 access-token flow rather than storing a separate radio password. The login flow returns the access token to the client, which then uses the existing Repeater Nation account for radio-session authorization.

## Next desktop-specific work

- Windows installer bundles (NSIS/MSI) enabled
- Microphone/speaker device discovery
- Persistent radio DSP presets
- Keyboard PTT (Space / Numpad 0)
- Direct-call UI polish and notifications
- Tray/PiP behavior
