// Writes manifest.json and the icon files from src/defs.js, so ids stay in one place.
import { writeFileSync, mkdirSync } from "node:fs";
import { ACTIONS, PLUGIN_UUID, uuidOf } from "../src/defs.js";
import sharp from "sharp";

const ROOT = new URL("../com.repeaternation.radio.sdPlugin/", import.meta.url).pathname;
mkdirSync(ROOT + "imgs/actions", { recursive: true });

const icon = (bg, glyph, size = 144) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 144 144"><rect width="144" height="144" rx="22" fill="${bg}"/>${glyph}</svg>`;
const bolt = `<path d="M82 22 40 78h28l-8 44 44-60H76z" fill="#fff"/>`;
const text = (t) => `<text x="72" y="92" font-size="48" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif">${t}</text>`;
const GLYPH = {
  ptt: bolt, dp_ptt: bolt, dp_general: bolt,
  channel_up: text("CH▲"), channel_down: text("CH▼"), zone_up: text("Z▲"), zone_down: text("Z▼"),
  power: text("⏻"), mute: text("🔇"), volume_up: text("V▲"), volume_down: text("V▼"), scan: text("SCN"), replay: text("↺"),
  answer: text("✔"), decline: text("✖"), end_call: text("END"),
  dp_listen: text("ON"), dp_tone: text("♪"), dp_message: text("MSG"), dp_alerts: text("🔔"),
};
const glyphFor = (d) => GLYPH[d.id] || (/^p[1-5]$/.test(d.id) ? text(d.id.toUpperCase()) : d.status ? text(d.status[0]) : bolt);

const actions = ACTIONS.map((d) => {
  const img = `imgs/actions/${d.id}`;
  writeFileSync(`${ROOT}${img}.svg`, icon(d.app === "dispatch" ? "#8a1f26" : "#14416b", glyphFor(d)));
  const a = {
    Name: d.name, UUID: uuidOf(d), Icon: img, Tooltip: d.tip, Controllers: ["Keypad"],
    States: [{ Image: img, ShowTitle: false }],
  };
  if (d.numbered) a.PropertyInspectorPath = `ui/${d.numbered}.html`;
  return a;
});

const manifest = {
  $schema: "https://schemas.elgato.com/streamdeck/plugins/manifest.json",
  Name: "Repeater Nation",
  Version: "1.0.0.0",
  Author: "Repeater Nation",
  Description: "Control the Repeater Nation radio and the dispatch console from a Stream Deck: push to talk, channels, status, tones and live channel state on the keys.",
  UUID: PLUGIN_UUID,
  Icon: "imgs/plugin",
  Category: "Repeater Nation",
  CategoryIcon: "imgs/category",
  SDKVersion: 3,
  Software: { MinimumVersion: "6.9" },
  OS: [{ Platform: "windows", MinimumVersion: "10" }, { Platform: "mac", MinimumVersion: "12" }],
  Nodejs: { Version: "20", Debug: "enabled" },
  CodePath: "bin/plugin.js",
  Actions: actions,
};
writeFileSync(ROOT + "manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const base = icon("#14416b", bolt, 288).replace(/width="288" height="288"/, 'width="288" height="288"');
writeFileSync(ROOT + "imgs/category.svg", icon("#14416b", bolt, 28));
for (const [name, size] of [["plugin", 256], ["plugin@2x", 512]]) {
  await sharp(Buffer.from(icon("#14416b", bolt, size))).resize(size, size).png().toFile(`${ROOT}imgs/${name}.png`);
}
console.log(`manifest with ${actions.length} actions, icons written`);
