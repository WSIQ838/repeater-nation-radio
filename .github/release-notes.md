## Windows

Download the `x64-setup.exe` (or the `.msi`) and run it.

**"Windows protected your PC"**: the app isn't signed, so Windows shows this for new versions. Click **More info**, then **Run anyway**.

**If the app disappears or Windows Security says it's a virus**: it's a false alarm.

1. Get it back: open **Windows Security**, go to **Virus & threat protection**, then **Protection history**. Click the Repeater Nation Radio entry, choose **Actions**, then **Restore**.
2. Stop it happening again: open **PowerShell as administrator** (right-click it, then Run as administrator) and paste:

   ```
   Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\Repeater Nation Radio"
   ```

## Linux

- **AppImage**: works on any distro. Run `chmod +x` on it, then run it.
- **.deb** (Ubuntu, Debian, Mint): `sudo apt install ./<file>.deb`
- **.rpm** (Fedora, openSUSE): `sudo dnf install ./<file>.rpm`

## Mac

Use `aarch64.dmg` for Apple Silicon Macs and `x64.dmg` for Intel Macs. Drag the app into **Applications**.

The app isn't signed by an Apple developer account, so the first time macOS says it can't check it. Click **Done**, open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.

**If macOS says the app "is damaged"** (older downloads): it isn't. Open **Terminal** and paste:

```
xattr -cr "/Applications/Repeater Nation Radio.app"
```

Then open the app again.

## iPhone

Download the `unsigned.ipa`. Without an Apple developer account it is installed from a Windows PC with Sideloadly and your Apple ID, and has to be reinstalled every 7 days. The steps are on the [iPhone test build](https://github.com/WSIQ838/repeater-nation-radio/releases/tag/ios-test) page.
