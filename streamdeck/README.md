# Repeater Nation Stream Deck plugin

Controls the **Repeater Nation radio** (desktop app) and the **dispatch console** from an Elgato Stream Deck, and shows live state on the keys (channel, who is talking, your status, channel on/off).

## Install

1. Download `com.repeaternation.radio.streamDeckPlugin` from the latest **streamdeck-v…** release and double-click it. The Stream Deck app installs it. Needs Stream Deck 6.9 or newer.
2. In the radio app: **Settings › Stream Deck** on. In the dispatch console: **Settings › Stream Deck** on.
3. In the Stream Deck app, open the **Repeater Nation** category and drag actions onto keys.

The apps connect to the plugin on this computer only (`127.0.0.1:34580`). Stream Deck is off by default in both apps.

## Radio actions
Push to talk (hold), channel up/down, zone up/down, one-touch channels P1–P5, power, mute, volume up/down, scan, replay, status (Available, En Route, At Scene, Busy, Returning, Out of Service), answer / decline / end call. The push-to-talk key turns red while you transmit and white while someone is talking; the status keys light up for your current status.

## Dispatch actions
- **Channel listen on / off** and **Channel push to talk (hold)**: set the key's **channel number** in the Stream Deck inspector. Number 1 is the first channel in the console, in zone order. The key shows that channel's name, on/off, who is talking, and turns red when you transmit.
- **General transmit (hold)**, **Send tone** (tone number), **Play recorded message** (message number), **Alerts on / off**.

## Develop

```
npm install
npm run icons      # writes manifest.json and icons from src/defs.js
npm run build      # bundles bin/plugin.js
npm test           # checks the bridge and key faces without a Stream Deck
npm run validate   # Elgato's manifest validator
npm run pack       # dist/com.repeaternation.radio.streamDeckPlugin
```
Add or rename actions in `src/defs.js`; the manifest and icons are generated from it.

## How it works
`src/bridge.js` is a local WebSocket server. Each app connects to it (`src/lib/deck.js` in the app), sends its state, and receives key presses. Only connections from this computer and from the apps' own windows are accepted.
