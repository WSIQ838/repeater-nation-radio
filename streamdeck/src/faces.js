// The picture on each key, drawn as SVG from the app's live state.
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// Splits a name over up to two lines.
function lines(text, n) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const out = [""];
  for (const w of words) {
    const cur = out[out.length - 1];
    if (!cur) out[out.length - 1] = w;
    else if ((cur + " " + w).length <= n) out[out.length - 1] = cur + " " + w;
    else if (out.length < 2) out.push(w);
    else out[1] = clip(out[1] + " " + w, n);
  }
  return out.map((l) => clip(l, n));
}

export function tile({ bg = "#14416b", fg = "#ffffff", title = "", sub = "", edge = "" }) {
  const t = lines(title, title.length > 12 ? 10 : 9);
  const size = t.length === 1 ? (t[0].length <= 5 ? 34 : 26) : 22;
  const y0 = sub ? 58 : 76;
  const body = t.map((l, i) => `<text x="72" y="${y0 + i * (size + 2)}" font-size="${size}" font-weight="700" text-anchor="middle" fill="${fg}">${esc(l)}</text>`).join("");
  const s = sub ? `<text x="72" y="128" font-size="17" text-anchor="middle" fill="${fg}" opacity="0.85">${esc(clip(sub, 14))}</text>` : "";
  const border = edge ? `<rect x="3" y="3" width="138" height="138" rx="10" fill="none" stroke="${edge}" stroke-width="6"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="Arial, Helvetica, sans-serif"><rect width="144" height="144" rx="12" fill="${bg}"/>${body}${s}${border}</svg>`;
  return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

const shortName = (def) => def.name.replace(/^(Radio|Dispatch): /, "").replace(/\s*\(.*\)/, "");
const GREY = "#3a424c", NAVY = "#14416b", RED = "#c8262f", GREEN = "#2e8b57", AMBER = "#b8860b", WHITE = "#f4f6f8", DARK = "#111111";

function radioFace(def, s, settings) {
  if (!s) return tile({ bg: GREY, title: shortName(def), sub: "not connected" });
  const off = !s.connected;
  switch (def.id) {
    case "ptt":
      if (off) return tile({ bg: GREY, title: "PTT", sub: "radio off" });
      if (s.tx) return tile({ bg: RED, title: "TALKING", sub: s.channel, edge: "#fff" });
      if (s.rx) return tile({ bg: WHITE, fg: DARK, title: "RX", sub: s.rxName || s.channel });
      return tile({ bg: NAVY, title: "PTT", sub: s.channel });
    case "channel_up": return tile({ bg: off ? GREY : NAVY, title: "CH ▲", sub: s.channel });
    case "channel_down": return tile({ bg: off ? GREY : NAVY, title: "CH ▼", sub: s.channel });
    case "zone_up": return tile({ bg: NAVY, title: "ZONE ▲", sub: s.zone });
    case "zone_down": return tile({ bg: NAVY, title: "ZONE ▼", sub: s.zone });
    case "power": return tile({ bg: s.connected ? GREEN : GREY, title: s.connected ? "ON" : "OFF", sub: "RADIO" });
    case "mute": return tile({ bg: s.muted ? RED : NAVY, title: s.muted ? "MUTED" : "SPEAKER", sub: s.muted ? "tap to unmute" : "tap to mute" });
    case "volume_up": return tile({ bg: NAVY, title: "VOL ▲", sub: String(s.volume ?? "") });
    case "volume_down": return tile({ bg: NAVY, title: "VOL ▼", sub: String(s.volume ?? "") });
    case "scan": return tile({ bg: s.scanning ? AMBER : NAVY, title: s.scanning ? "SCAN ON" : "SCAN" });
    case "replay": return tile({ bg: NAVY, title: "REPLAY", sub: "last heard" });
    case "answer": return tile({ bg: s.ringing ? GREEN : GREY, title: "ANSWER", sub: s.ringing ? s.caller : "" });
    case "decline": return tile({ bg: s.ringing ? RED : GREY, title: "DECLINE" });
    case "end_call": return tile({ bg: s.inCall ? RED : GREY, title: "END CALL" });
    default: break;
  }
  if (/^p[1-5]$/.test(def.id)) {
    const p = (s.presets || [])[Number(def.id[1]) - 1];
    const here = p && p.id === s.channelId;
    return tile({ bg: here ? GREEN : p ? NAVY : GREY, title: def.id.toUpperCase(), sub: p?.name || "" });
  }
  if (def.status) return tile({ bg: s.status === def.status ? GREEN : NAVY, title: def.status });
  return tile({ title: def.name });
}

function dispatchFace(def, s, settings) {
  if (!s) return tile({ bg: GREY, title: shortName(def), sub: "not connected" });
  const ch = (n) => (s.channels || [])[(Number(n) || 1) - 1];
  switch (def.id) {
    case "dp_listen":
    case "dp_ptt": {
      const slot = Number(settings?.slot) || 1, c = ch(slot);
      if (!c) return tile({ bg: GREY, title: `SLOT ${slot}`, sub: "no channel" });
      const ptt = def.id === "dp_ptt";
      if (c.tx) return tile({ bg: RED, title: ptt ? "TALKING" : c.name, sub: ptt ? c.name : "transmitting", edge: "#fff" });
      if (c.rx) return tile({ bg: WHITE, fg: DARK, title: ptt ? "RX" : c.name, sub: ptt ? c.name : (c.rxName || "receiving") });
      if (!c.on) return tile({ bg: GREY, title: ptt ? "PTT" : c.name, sub: ptt ? `${c.name} (off)` : "OFF" });
      return tile({ bg: c.color || NAVY, title: ptt ? "PTT" : c.name, sub: ptt ? c.name : `ON · ${c.people ?? 0}`, edge: "#f08a1c" });
    }
    case "dp_general": return tile({ bg: s.tx ? "#e0343d" : "#8a1f26", title: "GENERAL TX", sub: `${s.onCount ?? 0} on` });
    case "dp_tone": { const t = (s.tones || [])[(Number(settings?.index) || 1) - 1]; return tile({ bg: t ? NAVY : GREY, title: t ? "♪ " + t.name : `TONE ${Number(settings?.index) || 1}`, sub: t ? "send" : "none" }); }
    case "dp_message": { const m = (s.messages || [])[(Number(settings?.index) || 1) - 1]; return tile({ bg: m ? NAVY : GREY, title: m ? m.name : `MSG ${Number(settings?.index) || 1}`, sub: m ? "play" : "none" }); }
    case "dp_alerts": return tile({ bg: s.alertsOn ? GREEN : GREY, title: s.alertsOn ? "ALERTS ON" : "ALERTS OFF" });
    default: return tile({ title: def.name });
  }
}

export const faceFor = (def, state, settings) => (def.app === "radio" ? radioFace(def, state, settings) : dispatchFace(def, state, settings));
