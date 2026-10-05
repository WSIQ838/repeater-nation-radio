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

Use `aarch64.dmg` for Apple Silicon Macs and `x64.dmg` for Intel Macs. The app isn't signed, so the first time, right-click it and choose **Open**.
