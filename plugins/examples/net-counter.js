// ==RepeaterNationPlugin==
// @id          net-counter
// @name        Net check-in counter
// @version     1.0
// @author      Repeater Nation
// @description Counts who has talked on the channel, for running a net. Shows a panel under the radio.
// @permissions radio, callsigns, display, panel
// ==/RepeaterNationPlugin==

let heard = {};        // callsign -> number of times they talked
let channel = "";

function draw() {
  const names = Object.keys(heard).sort((a, b) => heard[b] - heard[a]);
  rn.setPanel({
    title: "Net check-ins" + (channel ? " · " + channel : ""),
    lines: names.length
      ? [names.length + " stations heard"].concat(names.slice(0, 5).map(n => n + " — " + heard[n] + "×"))
      : ["Nobody heard yet."],
    buttons: [{ id: "reset", label: "Start new net" }],
  });
}

// Pick up where we left off if the app was closed.
rn.storage.get().then(saved => {
  if (saved) { heard = saved.heard || {}; channel = saved.channel || ""; }
  draw();
});

rn.on("talk-end", t => {
  if (t.seconds < 1) return;          // ignore kerchunks
  heard[t.name] = (heard[t.name] || 0) + 1;
  if (heard[t.name] === 1) rn.show("New: " + t.name);
  rn.storage.set({ heard, channel });
  draw();
});

rn.on("channel", c => { channel = c.channel; draw(); });

rn.on("button", id => {
  if (id === "reset") { heard = {}; rn.storage.set({ heard, channel }); rn.show("New net started"); draw(); }
});
