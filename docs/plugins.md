# Writing a Repeater Nation Radio plugin

A plugin is **one `.js` file**. People install it in the desktop app from
**Settings › Plugins › Install plugin from file…**, and can turn it off or remove it there.
Three examples are in [`plugins/examples`](../plugins/examples) and can be tried from the
"Try an example…" list in the same place.

## Your first plugin in 5 steps

1. Copy [`plugins/examples/starter.js`](../plugins/examples/starter.js) and save it as `my-plugin.js`.
   It shows every part of a plugin with notes beside each line.
2. Open it in any text editor (Notepad works). Change `@id`, `@name` and `@author` at the top.
3. Change what it does, using the `rn` list below. Delete what you don't need, and remove those
   words from `@permissions`.
4. In the radio app: **Settings › Plugins › Install plugin from file…**, pick your file, press
   **Install**. Its panel shows under the radio on the Radio page.
5. Changed the file? Install it again: the same `@id` replaces the old one.

If something's wrong, Settings › Plugins shows "Plugin problem: …" under it with what went wrong.

## The header

Every plugin starts with this block. The app reads it before installing and shows the person
what the plugin is asking for.

```js
// ==RepeaterNationPlugin==
// @id          my-plugin            (2–41 lowercase letters, numbers or dashes; installing the same id again updates it)
// @name        My plugin
// @version     1.0
// @author      N0CALL
// @description One line saying what it does
// @permissions radio, sounds
// ==/RepeaterNationPlugin==
```

## Permissions

Ask only for what you need. Anything not asked for is refused.

| Permission  | Lets the plugin |
|-------------|-----------------|
| `radio`     | get `channel`, `power` and `transmit` events, and the zone/channel/on/transmitting parts of `rn.state()` |
| `callsigns` | get `talk-start`, `talk-end` and `call` events (who is talking, who is calling) |
| `sounds`    | `rn.playTones()` and `rn.addRogerBeep()` |
| `display`   | `rn.show()` a short message on the radio's screen |
| `panel`     | `rn.setPanel()` a small panel with buttons under the radio |
| `buttons`   | `rn.press()` channel up/down, zone up/down, volume up/down, mute and scan |
| `internet`  | `fetch()` and WebSocket to `https://` addresses |

No permission exists for push to talk, the microphone, power, calls, recordings, the sign-in
or the app's settings. Plugins can't do those.

## Where plugins run

Each plugin runs in its own sandboxed, invisible frame. It has no access to the app's page,
storage, sign-in, microphone or the desktop app's own commands, and without `internet` it can't
reach the network at all. It talks to the radio only through the `rn` object below. Plugins
start when the radio screen opens (after sign-in) and stop at sign-out.

## The `rn` object

```js
rn.on(event, handler)              // listen for an event (list below)
rn.state()                         // Promise → { on, transmitting, zone, channel, number, talking }
rn.playTones(steps)                // play a beep now                      (sounds)
rn.addRogerBeep(id, label, steps)  // add a roger beep to Settings › Radio features   (sounds)
rn.show(text)                      // show up to 40 characters on the radio's screen   (display)
rn.setPanel({ title, lines, buttons })  // draw / update your panel; setPanel(null) hides it (panel)
rn.press(action)                   // "channel_up", "channel_down", "zone_up", "zone_down",
                                   // "volume_up", "volume_down", "mute", "scan"        (buttons)
rn.storage.get()                   // Promise → whatever you last saved (or null)
rn.storage.set(value)              // save up to 64 KB of JSON for next time
rn.log(...things)                  // write to the app's developer console
rn.permissions                     // the permissions this plugin was given
```

**A beep** (`steps`) is a list of `[frequency in Hz, milliseconds]` pairs. Frequency `0` is a
gap. Up to 64 steps, 0–4000 Hz, 3 seconds in total. Example: `[[1200, 80], [0, 30], [1600, 120]]`.

**A panel** has a `title` (40 characters), up to 6 `lines` of text (120 characters each) and
up to 8 `buttons` like `{ id: "reset", label: "Start new net" }`. The app draws it in its own
style. A click arrives as a `button` event with the button's `id`.

## Events

| Event        | Data | Needs |
|--------------|------|-------|
| `channel`    | `{ zone, channel, number }` when the selected channel changes | `radio` |
| `power`      | `{ on }` when the radio connects or disconnects | `radio` |
| `transmit`   | `{ on }` when you start or stop transmitting | `radio` |
| `talk-start` | `{ name, zone, channel }` when someone starts talking | `callsigns` |
| `talk-end`   | `{ name, zone, channel, seconds }` when they stop | `callsigns` |
| `call`       | `{ from }` when someone calls you directly | `callsigns` |
| `button`     | the button `id` when your panel's button is clicked | `panel` |

Events that happen while the plugin is still starting are missed, so call `rn.state()` once
at the start if you need to know where the radio is.

## When something goes wrong

Errors your plugin throws show under it in Settings › Plugins as "Plugin problem: …", and so
does using something it has no permission for. `rn.log()` goes to the developer console only.

## Not yet

Plugins currently run in the desktop app only (Windows, Mac, Linux), not the phone apps.
Plugins can't draw new radio faces yet.
