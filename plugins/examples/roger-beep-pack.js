// ==RepeaterNationPlugin==
// @id          roger-beep-pack
// @name        Roger beep pack
// @version     1.0
// @author      Repeater Nation
// @description Adds three extra roger beeps to Settings › Radio features.
// @permissions sounds
// ==/RepeaterNationPlugin==

// A beep is a list of [frequency in Hz, milliseconds] pairs. Frequency 0 is a short gap.
rn.addRogerBeep("three-up", "Three notes up", [[880, 70], [0, 20], [1175, 70], [0, 20], [1480, 110]]);
rn.addRogerBeep("chirp-down", "Falling chirp", [[2200, 30], [1900, 30], [1600, 30], [1300, 30], [1000, 40]]);
rn.addRogerBeep("long-low", "Long low tone", [[520, 320]]);
