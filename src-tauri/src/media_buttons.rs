//! PTT from Bluetooth speaker-mics made for Zello (Abbree, which shows up as
//! KST_vHMIC010, and similar). They pair as a headset and send PTT as remote-control
//! (AVRCP) commands: Fast Forward when the button goes down, Rewind when it comes up.
//! Windows never turns those into key presses; it hands them to the media controls of
//! the app that holds the current media session. So the app keeps a media session of
//! its own and treats Fast Forward / Rewind as PTT down / up, with nothing to learn.
//! The session is only held while a speaker-mic is plugged in or paired (the page
//! calls `hw_mic_buttons`), so a keyboard's Play/Pause still reaches music apps.
//! Other platforms deliver the same commands to the web view (see App.jsx).

#[cfg(windows)]
pub fn start(app: &tauri::AppHandle) {
    if let Err(e) = imp::start(app) {
        eprintln!("media controls unavailable: {e}");
    }
}

#[cfg(not(windows))]
pub fn start(_app: &tauri::AppHandle) {}

/// Hold the media session (a speaker-mic is present) or let it go.
#[tauri::command]
pub fn hw_mic_buttons(on: bool) {
    #[cfg(windows)]
    imp::set_on(on);
    #[cfg(not(windows))]
    let _ = on;
}

#[cfg(windows)]
mod imp {
    use tauri::{AppHandle, Manager};
    use windows::core::{factory, Ref, HSTRING};
    use windows::Foundation::TypedEventHandler;
    use windows::Media::{
        MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls, SystemMediaTransportControlsButton,
        SystemMediaTransportControlsButtonPressedEventArgs,
    };
    use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;
    use std::sync::Mutex;

    static CONTROLS: Mutex<Option<SystemMediaTransportControls>> = Mutex::new(None);

    pub fn set_on(on: bool) {
        let controls = CONTROLS.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(c) = controls.as_ref() {
            let _ = c.SetIsEnabled(on);
            // Windows sends the buttons to the session that is playing.
            let _ = c.SetPlaybackStatus(if on { MediaPlaybackStatus::Playing } else { MediaPlaybackStatus::Closed });
        }
    }

    pub fn start(app: &AppHandle) -> windows::core::Result<()> {
        let Some(window) = app.get_webview_window("main") else { return Ok(()) };
        let Ok(hwnd) = window.hwnd() else { return Ok(()) };
        let interop = factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()?;
        let controls: SystemMediaTransportControls = unsafe { interop.GetForWindow(hwnd)? };
        // Only Fast Forward and Rewind: play/pause and track buttons stay with music apps.
        controls.SetIsEnabled(false)?;
        controls.SetIsFastForwardEnabled(true)?;
        controls.SetIsRewindEnabled(true)?;
        let display = controls.DisplayUpdater()?;
        display.SetType(MediaPlaybackType::Music)?;
        display.MusicProperties()?.SetTitle(&HSTRING::from("Repeater Nation Radio"))?;
        display.Update()?;
        controls.SetPlaybackStatus(MediaPlaybackStatus::Closed)?;
        let app = app.clone();
        controls.ButtonPressed(&TypedEventHandler::new(
            move |_: Ref<SystemMediaTransportControls>, args: Ref<SystemMediaTransportControlsButtonPressedEventArgs>| {
                let button = args.ok()?.Button()?;
                let pressed = if button == SystemMediaTransportControlsButton::FastForward {
                    true
                } else if button == SystemMediaTransportControlsButton::Rewind {
                    false
                } else {
                    return Ok(());
                };
                crate::ptt::mic_ptt(&app, pressed);
                Ok(())
            },
        ))?;
        // The controls and their handler live as long as the app.
        *CONTROLS.lock().unwrap_or_else(|e| e.into_inner()) = Some(controls);
        Ok(())
    }
}
