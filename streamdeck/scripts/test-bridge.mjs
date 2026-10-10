// Checks the app <-> plugin bridge and the key faces without needing a Stream Deck.
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createBridge } from "../src/bridge.js";
import { faceFor } from "../src/faces.js";
import { ACTIONS } from "../src/defs.js";

const PORT = 34981;
let changes = 0;
const bridge = createBridge({ port: PORT, onChange: () => changes++ });
const open = (origin) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin });
  ws.on("open", () => resolve(ws)); ws.on("error", reject); ws.on("unexpected-response", (_q, r) => reject(new Error("rejected " + r.statusCode)));
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (uri) => decodeURIComponent(uri.split(",")[1]);

// 1. A web page can't connect.
await assert.rejects(() => open("https://evil.example"), /rejected 401|rejected 403/);

// 2. The radio app connects, reports state, and receives commands.
const radio = await open("http://tauri.localhost");
const got = [];
radio.on("message", (m) => got.push(JSON.parse(String(m))));
radio.send(JSON.stringify({ t: "hello", app: "radio", version: "x" }));
radio.send(JSON.stringify({ t: "state", app: "radio", state: { connected: true, tx: false, rx: true, rxName: "W1ABC", channel: "Nation Wide", zone: "ALL", volume: 6, muted: false, scanning: false, status: "Busy", presets: [{ id: "c1", name: "Nation Wide" }], channelId: "c1" } }));
await wait(100);
assert.equal(bridge.connected("radio"), true);
assert.equal(bridge.state("radio").channel, "Nation Wide");
assert.ok(changes >= 2, "state changes notify the plugin");
assert.equal(bridge.send("radio", { action: "ptt", pressed: true }), true);
assert.equal(bridge.send("dispatch", { op: "general", pressed: true }), false, "no dispatch console connected");
await wait(100);
assert.deepEqual(got.at(-1), { t: "cmd", action: "ptt", pressed: true });

// 3. A second connection from the same app replaces the first; state clears on disconnect.
const radio2 = await open(undefined);
radio2.send(JSON.stringify({ t: "hello", app: "radio" }));
await wait(100);
assert.equal(bridge.connected("radio"), true);
radio2.close(); await wait(100);
assert.equal(bridge.connected("radio"), false);
assert.equal(bridge.state("radio"), null);

// 4. Key faces reflect the live state.
const radioState = { connected: true, tx: false, rx: true, rxName: "W1ABC", channel: "Nation Wide", zone: "ALL", volume: 6, muted: true, scanning: true, status: "Busy", presets: [{ id: "c1", name: "Nation Wide" }, { id: "c2", name: "Tech Talk" }], channelId: "c2", ringing: true, caller: "K2XYZ" };
const face = (id, st, settings) => decode(faceFor(ACTIONS.find((a) => a.id === id), st, settings));
assert.match(face("ptt", radioState), /RX/);
assert.match(face("ptt", { ...radioState, rx: false, tx: true }), /TALKING/);
assert.match(face("ptt", { ...radioState, connected: false }), /radio off/);
assert.match(face("mute", radioState), /MUTED/);
assert.match(face("status_4", radioState), /#2e8b57/);   // Busy is the current status: highlighted
assert.doesNotMatch(face("status_1", radioState), /#2e8b57/);
assert.match(face("p2", radioState), /#2e8b57/);          // P2 is the current channel
assert.match(face("answer", radioState), /K2XYZ/);
assert.match(face("ptt", null), /not connected/);
const dstate = { onCount: 2, tx: false, alertsOn: true, tones: [{ id: "a", name: "Alert A" }], messages: [{ id: "m", name: "Evac" }],
  channels: [{ name: "Nation Wide", on: true, people: 3, color: "#14416b" }, { name: "Tech Talk", on: false }, { name: "Skywarn", on: true, rx: true, rxName: "N3DEF" }] };
assert.match(face("dp_listen", dstate, { slot: 1 }), /ON · 3/);
assert.match(face("dp_listen", dstate, { slot: 2 }), /OFF/);
assert.match(face("dp_listen", dstate, { slot: 3 }), /N3DEF/);
assert.match(face("dp_listen", dstate, { slot: 9 }), /no channel/);
assert.match(face("dp_tone", dstate, { index: 1 }), /Alert A/);
assert.match(face("dp_message", dstate, { index: 1 }), /Evac/);
assert.match(face("dp_alerts", dstate), /ALERTS ON/);

// 5. The app's own connection code (src/lib/deck.js) against the real bridge, end to end.
const { startDeck } = await import("../../src/lib/deck.js");
const { WebSocket: NodeWS } = await import("ws");
globalThis.WebSocket = globalThis.WebSocket || NodeWS;
// deck.js connects to its fixed port, so run a second bridge there.
const live = createBridge({ port: 34580 });
const cmds = [];
const deck = startDeck({ app: "dispatch", version: "9.9", onCommand: (m) => cmds.push(m) });
deck.send({ onCount: 1, alertsOn: true, tx: false, tones: [], messages: [], channels: [{ name: "Nation Wide", on: true }] });
await wait(500);
assert.equal(live.connected("dispatch"), true, "app connected");
assert.equal(live.state("dispatch").channels[0].name, "Nation Wide", "state arrived");
deck.send({ onCount: 2, alertsOn: true, tx: true, tones: [], messages: [], channels: [] });
await wait(150);
assert.equal(live.state("dispatch").onCount, 2, "state updates arrive");
live.send("dispatch", { op: "listen", slot: 1, pressed: true });
live.send("dispatch", { op: "general", pressed: false });
await wait(150);
assert.deepEqual(cmds.map((c) => [c.op, c.pressed]), [["listen", true], ["general", false]], "key presses reach the app");
deck.stop();
await wait(150);
assert.equal(live.connected("dispatch"), false, "disconnects cleanly");
await live.close();

await bridge.close();
console.log("all bridge and face checks passed");
process.exit(0);
