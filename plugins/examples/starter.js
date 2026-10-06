// ==RepeaterNationPlugin==
// @id          my-first-plugin
// @name        My first plugin
// @version     1.0
// @author      N0CALL
// @description A starting point that shows every part of a plugin. Copy it and change it.
// @permissions radio, callsigns, sounds, display, panel, buttons
// ==/RepeaterNationPlugin==

// Everything a plugin does goes through "rn". Lines starting with // are notes and are ignored.
// Delete the parts you don't need, and remove their word from @permissions above.

// 1. Remember things between runs (always allowed).
let presses = 0;
rn.storage.get().then(saved => {
  if (saved) presses = saved.presses || 0;
  drawPanel();
});

// 2. A panel under the radio with your own buttons (needs "panel").
function drawPanel() {
  rn.setPanel({
    title: "My first plugin",
    lines: ["Beep button pressed " + presses + " times"],
    buttons: [
      { id: "beep", label: "Beep" },
      { id: "next", label: "Next channel" },
    ],
  });
}

// 3. React when a panel button is clicked.
rn.on("button", id => {
  if (id === "beep") {
    rn.playTones([[1000, 100], [0, 50], [1500, 100]]);   // needs "sounds"
    presses = presses + 1;
    rn.storage.set({ presses });
    drawPanel();
  }
  if (id === "next") rn.press("channel_up");             // needs "buttons"
});

// 4. React to the radio (needs "radio").
rn.on("channel", c => rn.show("CH " + c.number + " " + c.channel));   // show needs "display"
rn.on("power", p => rn.log("Radio is now " + (p.on ? "on" : "off")));

// 5. React to people talking (needs "callsigns").
rn.on("talk-end", t => {
  if (t.seconds > 30) rn.show(t.name + " talked " + Math.round(t.seconds) + "s");
});

// 6. Add your own roger beep to Settings › Radio features (needs "sounds").
rn.addRogerBeep("my-beep", "My beep", [[900, 80], [0, 30], [1300, 120]]);
