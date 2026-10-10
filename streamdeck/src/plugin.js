import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import { ACTIONS, BRIDGE_PORT, uuidOf } from "./defs.js";
import { createBridge } from "./bridge.js";
import { faceFor } from "./faces.js";

const log = (m) => streamDeck.logger.info(m);
const instances = [];
const settingsOf = new Map(); // action context id -> settings

const bridge = createBridge({ port: BRIDGE_PORT, log, onChange: () => refreshAll() });

function paint(inst, action) {
  const def = inst.def;
  action.setImage?.(faceFor(def, bridge.state(def.app), settingsOf.get(action.id) || {})).catch?.(() => {});
}
function refreshAll() {
  for (const inst of instances) inst.actions.forEach((a) => paint(inst, a));
}

class DeckAction extends SingletonAction {
  constructor(def) { super(); this.def = def; this.manifestId = uuidOf(def); }

  onWillAppear(ev) { settingsOf.set(ev.action.id, ev.payload?.settings || {}); paint(this, ev.action); }
  onWillDisappear(ev) { settingsOf.delete(ev.action.id); }
  onDidReceiveSettings(ev) { settingsOf.set(ev.action.id, ev.payload?.settings || {}); paint(this, ev.action); }

  command(pressed, settings) {
    const d = this.def;
    if (d.app === "radio") return bridge.send("radio", { action: d.id, pressed });
    const base = { op: d.op, pressed };
    if (d.numbered === "slot") base.slot = Number(settings?.slot) || 1;
    if (d.numbered === "index") base.index = Number(settings?.index) || 1;
    return bridge.send("dispatch", base);
  }
  async onKeyDown(ev) {
    const ok = this.command(true, ev.payload?.settings || settingsOf.get(ev.action.id));
    if (!ok) await ev.action.showAlert();
  }
  onKeyUp(ev) {
    // Only push to talk style keys care when the key is released.
    if (this.def.hold) this.command(false, ev.payload?.settings || settingsOf.get(ev.action.id));
  }
}

for (const def of ACTIONS) {
  const inst = new DeckAction(def);
  instances.push(inst);
  streamDeck.actions.registerAction(inst);
}
streamDeck.connect();
