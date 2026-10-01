# Repeater Nation Radio — Changelog

## 0.1.4

- Fixed the desktop Base44 client using same-origin API routing that only works inside the hosted website.
- Desktop authentication and radio-session requests now use the Repeater Nation HTTPS host explicitly.
- Google OAuth continues to return through the installed `repeaternation://` desktop deep link.
- Bumped the desktop app version to 0.1.4.

## Unreleased

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
