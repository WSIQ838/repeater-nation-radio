// Every Stream Deck action this plugin offers. The plugin id is the manifest UUID prefix.
export const PLUGIN_UUID = "com.repeaternation.radio";
export const BRIDGE_PORT = 34580;

const STATUSES = ["Available", "En Route", "At Scene", "Busy", "Returning", "Out of Service"];

// app: which app the action drives. hold: key down and key up both matter (push to talk).
// numbered: the action needs a number set in its property inspector (slot or index).
export const ACTIONS = [
  // ---- Radio (desktop app) ----
  { id: "ptt", app: "radio", name: "Radio: Push to talk (hold)", tip: "Hold to transmit; release to stop.", hold: true },
  { id: "channel_up", app: "radio", name: "Radio: Channel up", tip: "Next channel in the zone." },
  { id: "channel_down", app: "radio", name: "Radio: Channel down", tip: "Previous channel in the zone." },
  { id: "zone_up", app: "radio", name: "Radio: Zone up", tip: "Next zone." },
  { id: "zone_down", app: "radio", name: "Radio: Zone down", tip: "Previous zone." },
  ...[1, 2, 3, 4, 5].map((n) => ({ id: "p" + n, app: "radio", name: `Radio: One-touch channel P${n}`, tip: `Jump to channel ${n} of the current zone.` })),
  { id: "power", app: "radio", name: "Radio: Power (connect / disconnect)", tip: "Switch the radio on or off." },
  { id: "mute", app: "radio", name: "Radio: Mute speaker", tip: "Mute or unmute the speaker." },
  { id: "volume_up", app: "radio", name: "Radio: Volume up", tip: "Raise the volume." },
  { id: "volume_down", app: "radio", name: "Radio: Volume down", tip: "Lower the volume." },
  { id: "scan", app: "radio", name: "Radio: Scan on / off", tip: "Turn scanning on or off." },
  { id: "replay", app: "radio", name: "Radio: Replay last transmission", tip: "Play back the last transmission heard." },
  ...STATUSES.map((label, i) => ({ id: "status_" + (i + 1), app: "radio", name: `Radio: Status ${label}`, tip: `Set your status to ${label} (press again to clear).`, status: label })),
  { id: "answer", app: "radio", name: "Radio: Answer call", tip: "Answer an incoming direct call." },
  { id: "decline", app: "radio", name: "Radio: Decline call", tip: "Decline an incoming direct call." },
  { id: "end_call", app: "radio", name: "Radio: End call", tip: "End the current direct call." },
  // ---- Dispatch console ----
  { id: "dp_listen", app: "dispatch", name: "Dispatch: Channel listen on / off", tip: "Switch a console channel on or off. Set its number in console order.", numbered: "slot", op: "listen" },
  { id: "dp_ptt", app: "dispatch", name: "Dispatch: Channel push to talk (hold)", tip: "Hold to talk on a console channel. Set its number in console order.", numbered: "slot", op: "ptt", hold: true },
  { id: "dp_general", app: "dispatch", name: "Dispatch: General transmit (hold)", tip: "Hold to talk on every channel that is on.", op: "general", hold: true },
  { id: "dp_tone", app: "dispatch", name: "Dispatch: Send tone", tip: "Send a tone on every channel that is on. Set the tone number.", numbered: "index", op: "tone" },
  { id: "dp_message", app: "dispatch", name: "Dispatch: Play recorded message", tip: "Play a recorded message on every channel that is on. Set the message number.", numbered: "index", op: "message" },
  { id: "dp_alerts", app: "dispatch", name: "Dispatch: Alerts on / off", tip: "Turn the channel alert tones on or off.", op: "alerts" },
];
export const uuidOf = (def) => `${PLUGIN_UUID}.${def.id.replace(/_/g, "-")}`;
