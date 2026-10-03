# Repeater Nation Radio — Changelog

## 0.2.16

**Keypad handheld**, built from Sean's APX R7 photo. It's the fifth radio in the one-at-a-time redo, and it replaces the old keypad portable. A saved choice of the old portable opens this one.

- Every part is placed from the photo's own measurements:
  - the thick stubby antenna with its two rings, darker lower section and base ring
  - the fluted volume knob with its white index line, and the taller fluted channel knob with its index strip and dotted collar
  - the textured housing, the long ridged PTT on the left and the side buttons
  - the brushed name plate, the colour screen, P1 and P2, OK and Back, the four-way nav pad and the 12-key keypad with its letters
  - the speaker grille slots between the key rows
- The antenna's round badge reads RN and the name plate reads REPEATER NATION, in place of the maker's logo and lettering.
- The screen is laid out like the photo's home screen, with live information:
  - signal bars, zone, connection and mute icons, SCAN/TX/RX tags and the battery
  - today's date and the current time
  - the zone and channel in the card, with what's happening under them (Listening, Receiving · callsign, Transmitting)
  - the last station heard with its time, where the photo shows a message (text messages need the server change listed in PR #5)
  - Zones and Contacts softkeys
- What the controls do:
  - On the home screen the nav pad changes channel (up and down) and zone (left and right).
  - OK opens the menu: Zones, Channels, Scan, Who's On, Recent, My Status, Brightness, Radio on/off and Setup. In lists the nav pad moves and OK selects; Back goes back.
  - Type a channel number on the keypad and press # or OK to go to it; * or Back clears it.
  - P1 turns scan on and off. P2 replays the last transmission.
  - The tall knob changes channel and the short knob is volume (scroll, click to mute).
  - Hold the left side PTT to talk.
  - An incoming call shows on the screen with Answer (OK) and Decline (Back), and End Call while it's live.
  - The LED and status bar show RX and TX.
- Version set to 0.2.16 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.15

**Touchscreen handheld**, built from Sean's APX N70 photo. It's the fourth radio in the one-at-a-time redo, and it replaces the old touchscreen portable. A saved choice of the old portable opens this one.

- Every part is placed from the photo's own measurements:
  - the long whip antenna with its band label, which reads GMRS
  - the tall fluted channel knob on its numbered collar, the small top button and the short knurled volume knob
  - the wide head with a round badge and the status LED
  - textured side grips that turn lighter toward the bottom
  - the touch screen, the pill Home key and P1–P6 in two rows
- The top knobs are drawn the way they look in the photo. The flutes slide across the knob as it turns. The collar shows the channel positions on either side of the current one.
- The screen is laid out like the photo's home screen, with live information:
  - the signed-in name in the header
  - the zone and channel in the card, with what's happening under them (Listening, Receiving · callsign, Transmitting)
  - Zone, Contacts and More tabs
  - the last station heard, with Replay and All Recent
  - your status and callsign in the bottom bar
- What the controls do:
  - Tap the zone or Zone to pick a zone. Tap the channel name to pick a channel.
  - The profile icon or the bottom bar sets your status.
  - The toggle icon turns scan on and off, and the icon under it replays the last transmission.
  - Contacts opens Calls.
  - More lists Who's On, Recent, My Status, Brightness, Radio on/off and Setup.
  - The tall knob changes channel (click or scroll). The short knob is volume (scroll, click to mute).
  - P1–P5 go to channels 1–5 and P6 mutes.
  - Home returns to the home screen.
  - Hold the left side grip to talk.
  - The LED and status bar show RX and TX, and an incoming call shows on the card with Answer and Decline.
- The badge reads RN in place of the maker's logo.
- The radio's page now passes the signed-in name to the radio faces.
- Version set to 0.2.15 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.14

**Slim mobile head**, built from Sean's APX 8500 E5 photo. It's the third radio in the one-at-a-time redo, and it replaces the old wide mobile head.

- Every part is placed from the photo's own measurements:
  - power in its well, three LEDs, a screw and the round mic jack on the left
  - the knurled volume knob, the star brightness key and the round P key
  - the display with five softkeys under it
  - the knurled channel knob over a four-petal nav diamond
  - the orange emergency button in its guard, the small blue LED, a screw and the round yellow Home key on the right
- The display matches the photo: a status icon row, the zone over the channel in large type, a blue status bar (green while receiving, red while transmitting), and Call, RSSI, Zone, Chan and Scan labels.
- What the controls do:
  - Call opens Calls.
  - RSSI shows the connection's signal quality.
  - Zone steps the zone.
  - Chan opens channel entry: type the number on the keypad, then #.
  - Scan turns scan on and off.
  - P shows Recent.
  - The left knob is volume (click to mute) and the right knob is channel.
  - The nav diamond changes channel (left and right) and zone (up and down).
  - The emergency button stays inert.
- The engraved maker's name reads REPEATER NATION.
- Version set to 0.2.14 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.13

**Dash mount head**, built from Sean's APX Mobile photo. It's the second radio in the one-at-a-time redo, and it replaces the old compact mobile head.

- Every part is placed from the photo's own measurements, as on the dispatch control head:
  - the heatsink top with its center bracket
  - a left module with power, three LEDs, the brightness key, a small round key and the round mic jack
  - the display with four softkeys under it
  - the ridged knob over a four-petal nav diamond
  - the keypad, with letters beside each digit, and the yellow Home and laptop keys under it
  - a right module with the orange emergency button and a small round key
- The display matches the photo: a status icon row, the zone over the channel in capitals, and Zone, Chan, Call and Next labels. The green banner shows only while something is happening (receiving, transmitting, a call or a message).
- What the controls do:
  - Zone steps the zone.
  - Chan opens channel entry: type the number on the keypad, then #.
  - Call opens Calls.
  - Next pages to Scan, Recent and Who, then back.
  - The knob is volume: scroll to change it, click to mute.
  - The nav diamond changes channel (left and right) and zone (up and down).
  - The laptop key shows Who's On, and the star key steps the display brightness.
  - The two unlabeled round keys and the emergency button stay inert.
- The engraved maker's name reads REPEATER NATION, and the logos on the heatsink and front are left off.
- In a window narrower than the head, the wide heads zoom down to fit instead of running off the side.
- Version set to 0.2.13 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.12

**Old radios removed.** The wide mobile head, compact mobile head, keypad portable, touchscreen portable, classic portable and rugged green portable are gone from the radio picker, so only the dispatch control head redone from Sean's O7 photo is left.

- Each radio comes back one at a time, rebuilt from the picture Sean sends for it.
- The shared radio logic (`useFace` and `FaceDisplay` in `ControlHead.jsx`) stays, so each new radio only needs its own layout.
- If one of the removed radios was chosen, the app opens on the dispatch control head.
- Version set to 0.2.12 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.11

**Dispatch control head redone from Sean's O7 photo**, the first radio in the one-at-a-time redo.

- Every key, knob and screen area is placed from the photo's own measurements, so the layout matches it: horn and Manual keys, the three siren keys, the 0–3 mode knob on its collar, the light-bar key, the orange emergency button in its corner guard, the two alley-light keys and PA along the top; power, three LEDs, the brightness rocker, day/night and backlight keys down the left; five softkeys above and below the screen; the badge, keypad, rectangular nav pad and the laptop key on the right; volume knob, P1–P5, the yellow home key and the channel knob along the bottom.
- The screen copies the photo's layout: a two-line label row on top, the status icon row, the zone and channel in large bold type, the green banner and a bottom label row. The bottom labels match the photo (Channel, Scan, Page, Contacts, Recent). The top row holds status keys (At Scene, En Route, Busy, Returning, Available) where the photo has At Scene and the vehicle keys; pressing the lit one again clears it.
- The badge reads REPEATER NATION where the photo has the maker's logo.
- What each control does:
  - Channel opens channel entry: type the number on the keypad, then #.
  - Page opens Calls and Contacts opens Who's On.
  - The nav pad changes channel (left and right) and zone (up and down).
  - The laptop key shows Who's On on the screen.
  - The day/night key switches the screen to night colors, and the backlight key turns the screen fully dim and back.
  - The siren, horn, light, PA and emergency keys are vehicle controls and stay inert.
- The other six radios are unchanged until their own photos come in.
- Version set to 0.2.11 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.10

**Fresh checkouts run on every platform.**

- `src-tauri/icons/icon.png` is now committed (512×512, made from `icon.svg`). Without it, `npx tauri dev` from a fresh clone failed to compile on Linux and Mac with "failed to open icon icons/icon.png". Windows was not affected, since it takes the window icon from `icon.ico`.
- Version set to 0.2.10 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.9

**Two more radios** from Sean's pictures.

- **Classic portable**: a small gray-green display with three softkeys run by the three dot buttons under it, a home key, a phone key (answers an incoming call, otherwise opens Contacts), nav pad and keypad.
- **Rugged portable (green)**: a high-visibility green body with two softkeys on the dot buttons, a back key, a menu key that pages through the softkey menu, nav pad and keypad.
- Seven radios in the picker now. All of them run the same radio and mapped buttons.
- Version set to 0.2.9 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.8

**Radios from Sean's re-uploaded pictures.**

- New **Wide mobile head** (slim dash head): power button and mic jack, a volume knob with brightness and P buttons, a wide display with five softkeys (P switches between the two softkey menus), a channel knob, nav diamond, home key and the orange emergency key (drawn only).
- **Keypad portable** restyled: a color screen with status icons, date and time, a zone/channel card and a message card (who is talking, a call, or the last transmission heard), and the two blue menu items above P1/P2.
- The touchscreen portable without P keys is removed (it was dropped from the pictures); anyone who chose it now gets the touchscreen portable with P1–P6, now just called "Touchscreen portable".
- Radios in the picker: Dispatch control head, Wide mobile head, Compact mobile head, Keypad portable, Touchscreen portable.
- Version set to 0.2.8 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.7

**Radios from Sean's pictures.** The radio picker now has the radios Sean asked for (the two placeholder radios from 0.2.6 are replaced; a saved choice moves to the closest new one).

- **Compact mobile head**: a wide, short dash-mount head with power and brightness buttons, display with four softkeys (••• pages the menu), a round volume knob, nav pad, 1–3 one-touch channel buttons and a keypad with home and back.
- **Keypad portable**: a display with two menu items, P1/P2 run those two items, OK pages the menu, back/home, nav pad, keypad, top volume and channel knobs and a side PTT.
- **Touchscreen portable**: a touch screen like a smart radio's home screen: My Status (tap to change, same as the status buttons), a zone/channel card with up/down and live activity, Scan / Contacts / More tiles, and the last heard transmission with Replay. Incoming calls show Answer / Decline. More opens Who's On (with each member's status), Recent, radio on/off and Setup.
- **Touchscreen portable with P keys**: the same screen plus P1–P5 one-touch channels and P6 mute.
- The dispatch control head stays. All radios run the same radio and mapped buttons, and the names stay generic.
- Version set to 0.2.7 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.6

**Change radios.** Pick which radio the app looks like; every radio works the same.

- Three radios: **Dispatch control head** (the current one), **Portable handheld** (top channel and volume knobs, a side PTT button you can hold with the mouse, three softkeys that page through the menu with the ☰ key, nav pad and keypad) and **GMRS mobile** (wide amber display with a big channel number, VOL and CH knobs, F1–F4 keys for the display's menu, and MON, SCAN, ZONE, WHO, RCNT and CALL buttons).
- Choose from Programming › Radio on the radio page, or Settings › Radio. The choice is remembered.
- All radios share the same display logic, softkey menus, keypad channel entry and mapped buttons, so new radios are quick to add.
- Version set to 0.2.6 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.5

Radio features, part 6: **Status buttons**.

- Status buttons on the radio page (under Programming): Available, En Route, At Scene, Busy, Returning, Out of Service. Tap one to set it, tap it again to clear it. It is remembered and re-applied every time you connect or change channel.
- Every member's status shows as a colored tag next to their name in Who's On.
- Each status can be mapped to a button (Settings › Button mapping › Status).
- **Needs a radio-server change to reach other radios**: the server must allow the app to update its own participant attributes (`canUpdateOwnMetadata`). Until then your status shows only on your own radio, and the radio says so under the buttons. Nothing else changes once the server allows it.
- Version set to 0.2.5 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.4

Radio features, part 5: **Traffic recorder and playback log**.

- Every transmission is recorded on your PC: your selected channel, scanned channels, console channels, and your own transmissions. Blips under 0.4 s are skipped.
- New **Log** page (left menu): recordings newest first, grouped by day, with time, who (your own show as "You"), zone and channel, and length. Play / stop any recording through your chosen speaker, delete one, or Clear all.
- Filter by channel, search by callsign or name, and "Play continuously" to keep playing forward in time from the one you start.
- "Record all traffic" (on by default) and "Keep" 1, 7 (default), 30 or 90 days. Recordings older than that are removed, and the oldest are removed once the log passes 300 MB.
- Recordings are stored in the app's own storage on this PC only; nothing is uploaded.
- Version set to 0.2.4 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.3

Radio features, part 4: **Monitor console** (dispatch style).

- New **Console** page (left menu): a tile for your selected channel plus every channel on the console list, each showing zone, channel, who is talking now, and who was last heard and when.
- **Monitor all** plays every console channel at the same time, like a dispatch console, instead of scan's one-at-a-time. Each tile has its own volume slider (shared with that channel's volume on the radio) and mute.
- PTT (the console's PTT button, the palm mic, or any mapped button) always talks on the selected (TX) tile. "Select" on any tile makes it the TX channel; the old one keeps being monitored.
- Monitored channels stay audible while you transmit.
- "Edit channels" picks up to 10 channels from any zone. Until you change it, the list is your current zone. It is saved on your PC.
- Scan and the console share the listening connections, so turning one on turns the other off.
- Changing channel no longer makes scan or the console leave and rejoin every listened channel; they stay joined (silenced) through the switch.
- Notifications for "someone is talking" now cover console channels too.
- New mappable action: Monitor console on / off.
- Version set to 0.2.3 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.2

Radio features, part 3: **Mini radio, tray icon and notifications**.

- **Mini radio**: the new "Mini" button (top right), the tray menu or a mapped button shrinks the radio to a small window that stays on top of other windows. It shows the zone, channel, signal bars and who is talking or being scanned, with PTT, channel up/down, power, mute and volume. Incoming calls can be answered or declined from it. The expand button puts the full radio back at its old size.
- The radio stays connected while switching between full and mini; nothing reconnects.
- **Tray icon** (Windows, Mac, and Linux desktops with AppIndicator): click it to bring the radio up; its menu has Show radio, Mini radio on / off, Mute / unmute speaker and Quit. Hovering it shows the current channel, and "(off)" or "(muted)".
- Settings › Radio features › "Close button keeps the radio running in the tray": when on, closing the window hides it to the tray and keeps listening (Quit from the tray menu exits). Off by default, and only offered when the tray icon is available.
- **Notifications** while the radio is behind other windows or hidden in the tray: incoming calls (on by default), and optionally "someone is talking" on your channel or a scanned channel (off by default, at most once a minute per person and channel).
- New mappable action: Mini radio on / off.
- Linux builds need `libayatana-appindicator3-dev` (added to the Linux workflow). Without AppIndicator installed the app runs without a tray icon instead of failing.
- Version set to 0.2.2 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.1

Radio features, part 2: **Scan**.

- The Scan softkey (top row, where Calls was; Contacts is still on the bottom row) turns scan on and off. The display shows SCAN, and the banner shows "Scan · channel" with the zone and talker while it is stopped on a scanned channel.
- Scan joins every channel on the scan list as a listener, at the same time as your selected channel, and plays whichever has someone talking. Up to 10 channels. Your selected channel always wins, and scan goes quiet while you transmit.
- After a scanned transmission ends, scan stays on that channel for 3 seconds (hang time) so you hear the reply.
- **Priority channel**: activity there interrupts any other scanned channel.
- **Nuisance delete** (the "Nuis Del" softkey while scan is stopped on a channel, or a mapped button) skips that channel until scan is turned off.
- Settings › Scan list: tick channels in any zone and pick the priority channel. Until you change it, the list is your current zone's channels. It is saved on your PC.
- A scanned channel that can't be joined, or drops, is retried every 5 seconds and marked "(can't join)" in the list.
- PTT always talks on your selected channel, not the scanned one.
- New mappable actions: Scan on / off and Nuisance delete.
- Note: while scanning, other members see you in Who's On for each scanned channel. Hiding scanners needs a radio-server change (see the backend list in the PR).
- Version set to 0.2.1 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.2.0

Radio features, part 1 (all in the app, no server changes; same on Windows, macOS and Linux):

- **Talk-permit tone** when the floor is granted, and a **busy tone** when the channel is busy or you can't transmit. The palm mic also lets go by itself when the floor is refused.
- **Roger beep** (courtesy tone) when someone else's transmission ends. Blips under 0.3 s don't beep, and it is silent while muted.
- **Time-out timer**: Off, 30 s, 60 s (default), 2 min or 3 min. It beeps 5 s before the limit, then keys you off and shows "Time-out timer".
- **Receive display**: the banner shows "Receiving" with the talker's callsign, the RX light only lights while someone is talking, and Who's On marks the talker as "Transmitting". A transmission is a member's mic being published or unmuted while they hold the floor.
- **Last heard** panel on the Radio tab with time and length of the last 10 transmissions, plus a **Recent** softkey view on the display.
- **Instant replay** of each received transmission: Replay in Last heard, the Replay softkey in the Recent view, or a mapped button. It records with the system's MediaRecorder and stays on your PC only until the app closes. Where the WebView has no MediaRecorder, the Replay button is greyed out.
- **Signal bars** now show the real connection quality from the voice server: 4 excellent, 3 good, 1 poor, 0 lost.
- **Volume knob with levels 0–10**, remembered per channel (default 7). Scroll the knob to change it, click to mute. The level flashes on the display.
- **Voice announcement** of channel changes ("ALL channel 3, US-East"), off by default, where the system has speech.
- Settings › Radio features has switches for each tone, the time-out timer, the tone volume and announcements.
- New mappable actions: Volume up, Volume down, Recent and Replay last transmission.
- Bottom softkeys are now Chan −, Chan +, Zone, Recent, Contacts (Home stays on its own key).
- Version set to 0.2.0 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.1.20

- Fixed a 0.1.19 bug that would have made every PTT after the first one silent. The radio server (`radio-ptt`) takes away publish permission on every release, which makes LiveKit unpublish the mic and, by default, stop it. 0.1.19 then only unmuted that stopped track. Now the room keeps the mic track open when it is unpublished (`stopLocalTrackOnUnpublish: false`), and the next PTT unmutes it and publishes it again if the server removed it. Later PTTs still skip opening the microphone and the Bluetooth profile switch. The track is only stopped on disconnect, on channel change or when you pick another microphone.
- Version set to 0.1.20 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.1.19

- The radio now starts in the ALL zone on its first channel. The zone list is just the real zones (ALL, GMRS, HAM, in the order set on the website); the extra "All Zones" entry, which showed every zone's channels mixed together and didn't auto-connect, is gone.
- Zones are ordered by their website display order instead of by whichever zone's channel came first.
- Less PTT lag: after the first transmit, the microphone stays published but muted while you listen, so the next PTT only unmutes it. Before, every PTT opened the mic and set up a new audio track with the voice server, and on Bluetooth headsets switched audio profiles each time. Keying up now takes only the floor request to the radio server. The mic is closed when you disconnect, change channel or pick another microphone. (While connected, Windows shows the microphone as in use after your first transmit.)
- Profiled the interface at 6× CPU slowdown: the production build answers a knob, PTT or keypad press in about 56 ms (about 10 ms on a normal PC), with no background work while idle. `npx tauri dev` runs React's development mode, which measured about 6× slower (360 ms), so judge speed on a built app.
- Version set to 0.1.19 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.1.18

- Fixed the update check saying "OFFLINE / Could not check GitHub" while online. The cause is that `WSIQ838/repeater-nation-radio` is a private repository, and GitHub answers 404 to apps that aren't signed in to it. Every failure used to be shown as offline.
- The update check now says what actually went wrong: offline (no response), "Updates can't be checked" (release page not public, 404), "Too many update checks" with the time GitHub's hourly limit resets (403/429), or the error code.
- The update panel in Settings is styled again (its CSS was missing, so the text ran together) and shows the installed version.
- Version set to 0.1.18 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.1.17

- Button mapping. Settings › Button mapping lists every radio action: push to talk, channel up/down, zone up/down, P1–P5, power, mute, Home, Who's On, display brighter/dimmer, answer/decline/end call, all ten softkeys and the whole keypad (0–9, *, #). Each action can have several buttons. Click "+ Add" and press any keyboard key, media or volume key, Bluetooth hand mic button, USB hand mic button, mouse middle/side button or gamepad button. Esc cancels. "×" removes a button and "Reset to defaults" goes back to Space and Num 0 for PTT.
- Each mapped button is either "App only" or "Anywhere". Anywhere buttons work while another window is in front (Windows for keys and mouse buttons; every OS for gamepads and Bluetooth buttons). Typing keys start as App only; hand mic, media, Bluetooth, mouse and gamepad buttons start as Anywhere.
- Mapping a button that is already used by another action moves it, and says so.
- Channel, zone, P1–P5, power, mute and call actions work from any tab. Face-only actions (softkeys, keypad, Who's On, brightness) switch to the Radio tab first.
- On Windows the default Space and Num 0 PTT keys now go through the same hook, still only while the app is focused.
- The single PTT button learned in 0.1.15/0.1.16 is carried over into the new map.
- The Programming panel's PTT row lists all PTT buttons, with "Add PTT button" and "Edit".
- The Bluetooth section only shows in the desktop app.
- Version set to 0.1.17 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.1.16

- Bluetooth PTT mics. Settings now has a Bluetooth PTT section: "Find Bluetooth button" lists nearby Bluetooth LE devices, "Use" connects to one, and Learn PTT button then learns its button. This is for buttons that report on their own Bluetooth service instead of as a key. The app reconnects to the button on every launch and after it drops or powers off. "Forget" disconnects it.
- Bluetooth mics that send their button as a media key (Play/Pause, the usual headset button) or as a Bluetooth keyboard key already work with Learn PTT button from 0.1.15, including with the window unfocused on Windows.
- A Bluetooth headset mic and speaker ("Hands-Free" in Windows) is now also picked automatically the first time it appears, like a USB hand mic.
- macOS: added the Bluetooth and microphone permission descriptions (`src-tauri/Info.plist`) that macOS requires.
- `linux.yml` now also installs `libdbus-1-dev` (needed for Bluetooth on Linux).
- Version set to 0.1.16 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.1.15

- Hand mic and hardware PTT support. "Learn PTT button" (in Programming and in Settings) waits for you to press the PTT button on a USB hand mic, foot switch or gamepad, then that button keys the radio. It is saved and restored on the next launch. Clear or Change it from the same place. Esc cancels learning.
- On Windows the learned button works even when the app is not the focused window. It can be a keyboard key, a media or volume key (what many USB hand mics send), the middle or side mouse buttons, or a joystick/gamepad button. Only the learned button is passed to the app; other keystrokes are not.
- If the learned button is a media or volume key (Play/Pause, Mute, Volume) or F13–F24, the app keeps it from also reaching Windows, so keying up doesn't pause music or change the PC volume. Normal typing keys still reach other apps.
- On macOS and Linux the learned button works while the app is focused (keyboard keys) and from any joystick/gamepad button.
- New Speaker picker next to Microphone. Radio and direct-call audio play on the chosen speaker (Windows).
- The microphone and speaker choices are remembered. The first time a device named like a hand mic (for example "KST vHMIC010") appears, it is picked for both automatically. Choosing "System default" yourself is kept.
- The device list refreshes when a device is plugged in or unplugged, and after the first transmit (Windows only shows device names after mic permission).
- PTT presses from the palm mic, Space / Num 0 and the hardware button at the same time key the radio once and release once.
- The palm mic hint shows the learned button.
- Linux build dependencies in `linux.yml` now include `libudev-dev` (needed for gamepad input).
- Version set to 0.1.15 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.1.14

- Selecting a zone or channel now tunes the radio and connects to it automatically. This covers the zone and channel knobs, the nav pad, keypad entry, P1–P5, the softkeys and the Programming dropdowns. The radio waits 350 ms after the last change, so spinning a knob joins only the channel it stops on. Mute stays as it was. Choosing "All Zones" keeps the current channel and does not reconnect.
- A connect that finishes after you have already switched channels is dropped instead of taking over. A stale room's disconnect event no longer clears the active room.
- Faster startup: the voice library (`livekit-client`) loads after sign-in instead of at launch. Startup JavaScript went from 965 KB to 406 KB. The login screen appeared in 405 ms instead of 505 ms at 4× CPU throttling (median of 6 runs).
- The connection to the voice server (DNS and TLS) is set up while the radio screen opens, so the first connect is quicker.
- Channel switches no longer make a "release PTT" server call unless you actually asked for the floor. That removes one round trip from every zone or channel change.
- Channels and zones now load in parallel instead of one after the other.
- Removed the unused `@livekit/components-react` and `@livekit/components-styles` packages. The app's CSS went from 39 KB to 19.5 KB, and the radio face looks the same.
- Release builds now use Tauri's size-optimized profile: LTO, a single codegen unit, `opt-level = "s"`, stripped symbols and abort on panic. On Linux the app binary went from 25.2 MB to 9.2 MB and the `.deb` from 7.2 MB to 3.7 MB.
- Pressing PTT now opens the microphone while the floor request is still going to the server, instead of after the floor is granted. Keying up takes about as long as the slower of the two instead of both added together (300 ms instead of 500 ms in a test with a 300 ms server and a 200 ms microphone). If the floor is denied, the request fails, or PTT is released first, the microphone is closed again and nothing is sent.
- The online-member and direct-call check that runs every 3 seconds now asks for both lists at once, never starts a new check while one is still running, and only updates the screen when something changed. Before, it re-drew the whole radio every 3 seconds even when nothing had changed.
- Production JavaScript now targets the WebView engines Tauri 2 supports (ES2022) instead of older browsers.
- Version set to 0.1.14 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## 0.1.13

- Version set to 0.1.13 in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, past the existing `radio-v0.1.12` tag (main had been reset to a 0.1.3 backup).
- Redesigned the radio tab as an APX O7-style control head with a palm-mic PTT.
- Scrolling a control-head knob now turns it one channel or zone per notch without also scrolling the page.
- Touch PTT on the palm mic no longer re-keys from the synthetic mouse click that follows a tap.
- Choosing "All Zones" keeps the current channel instead of clearing it.
- Restored the sign-in fixes from 0.1.4 to 0.1.12 that were lost when main was reset to the 0.1.3 backup. The Base44 client again calls `https://repeaternation.com` instead of the WebView's own origin, which made email and Google sign-in fail. Google sign-in opens Base44's Google login in the system browser and returns through the website's `/oauth/callback` page to the `repeaternation://` link (the v0.1.12 `?rn_desktop=1` bridge does not exist on the website). Channels in the "Admin Testing" zone are hidden again.
- The sign-in screen now shows each step of the Google hand-off. It also shows why sign-in failed: a link with no token, an account lookup error, or an unexpected link.
- The app now listens for the `repeaternation://` sign-in link before checking the launch link. Before, a failed launch-link check left it unable to receive the sign-in link.
- `npx tauri dev` no longer crashes on Windows with `EBUSY ... src-tauri\target\debug\deps\*.dll`: Vite's dev server now ignores `src-tauri/` instead of watching Cargo's build output.
- The in-app update check now reads releases from `WSIQ838/repeater-nation-radio`, where the Windows build publishes them; it was pointed at `jamessterlinglive/repeater-nation-radio`.
- "Install update" downloads the `.exe` only on Windows; macOS and Linux open the release page instead of a Windows installer.
- Muting now also silences members whose audio starts after you mute (new tracks used a stale mute value).
- If the voice server drops the connection, the radio stops renewing the PTT floor and clears the member list instead of looking connected.
- Fixed the in-app update check never finding a release: the tag pattern had doubled backslashes, so no `radio-v*` tag ever matched.
- The update check now reads the app version from `package.json` at build time instead of a hard-coded `0.1.3`.
- Google sign-in now completes in an already-running app on Windows and Linux (single-instance plugin forwards the `repeaternation://` link and focuses the window).
- Radio sessions now always send the selected zone and channel number, even when channels load after startup.
- macOS Intel builds use the `macos-15-intel` runner; `macos-13` is retired.
- Added a `.gitignore` for `node_modules`, `dist`, Tauri build output and CI-generated icons.

## 0.1.3

- Fixed Google sign-in for the Windows desktop app by routing the OAuth callback through the installed app using the Repeater Nation deep-link protocol.
- Added desktop OAuth callback handling for both a newly launched app instance and an already-running app.

- Fixed desktop update checks by using Tauri’s native HTTP client for GitHub instead of the WebView network layer.
- Added the GitHub API URL to the desktop HTTP permission scope.
- Added dedicated Zone selection to the radio controls; channel choices now follow the selected zone.

## Next — Zone selection

- Added a dedicated Zone selector to the desktop radio controls.
- Channel choices now follow the selected zone, making it easier to move between radio channel groups without scrolling through every channel.
- Changing zones or channels safely disconnects the current radio session before switching selections.

## Next — Website radio parity

- Reworked the desktop radio face to follow the Repeater Nation website radio widget layout and status presentation.
- Added zone/channel metadata to desktop radio-session requests so the same server-side channel validation and stale-selection fallback used by the website is available to the desktop app.
- Kept the existing LiveKit transport and PTT flow while improving the desktop radio display.


## Next — Google sign-in

- Added a Continue with Google option to the desktop sign-in screen.
- Added OAuth callback handling so Google sign-in can return to the desktop app with the authenticated Repeater Nation session.
- Existing email/password sign-in remains available.


## 0.1.2 — Radio audio and PTT reliability fix

- Fixed a PTT release race where releasing the mouse, touch control, Space, or Numpad 0 before the server finished granting transmit could leave the microphone keyed.
- Added transmit-request cancellation so an outdated PTT grant cannot publish a microphone after the user has already released the control.
- Fixed PTT cleanup so the local microphone is always unpublished and the server is sent a release request when transmit ends.
- Removed duplicate radio track event handling that could cause remote audio to be attached more than once.
- Kept direct-call audio isolated from the main radio audio path.
- Bumped the desktop app version from 0.1.1 to 0.1.2.

## 0.1.1 — Desktop authentication and packaging fix

- Fixed the Windows desktop app startup flow so it always presents the Repeater Nation sign-in screen instead of silently restoring an old desktop session.
- Fixed the sign-in flow to keep one Base44 client for the authenticated session.
- Added a clear Sign out / switch account action in Radio Settings.
- Improved radio channel loading and connection error handling.
- Added Windows icon generation before bundling so the installer has the required platform assets.
- Bumped the desktop app version from 0.1.0 to 0.1.1.
- Existing Repeater Nation website code was not changed by this desktop-app release.

## 0.1.0

- Initial Repeater Nation Radio desktop release.
