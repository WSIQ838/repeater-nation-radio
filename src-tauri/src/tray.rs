//! Tray icon and close-to-tray. The tray menu shows the radio, switches to the mini
//! radio, mutes the speaker or quits; the page handles mini and mute (`tray-action`).

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, Window, WindowEvent};

const TRAY_ID: &str = "radio";
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
static HAS_TRAY: AtomicBool = AtomicBool::new(false);
static QUITTING: AtomicBool = AtomicBool::new(false);

/// Quit after giving the page a moment to leave the radio channel and hand back a held
/// PTT floor; otherwise the server keeps the channel busy for everyone else for 30 s.
/// The page hears "quit" as a tray action. A second quit request goes straight through.
pub fn quit_gracefully<R: Runtime>(app: &AppHandle<R>) -> bool {
    if QUITTING.swap(true, Ordering::SeqCst) {
        return false;
    }
    let _ = app.emit("tray-action", "quit".to_string());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(700));
        app.exit(0);
    });
    true
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// Linux draws tray icons through libayatana-appindicator (or libappindicator), loaded
// at runtime; without either the tray would abort the app, so skip it there.
#[cfg(target_os = "linux")]
fn tray_supported() -> bool {
    ["libayatana-appindicator3.so.1", "libappindicator3.so.1"].iter().any(|name| {
        let c = std::ffi::CString::new(*name).unwrap();
        // SAFETY: dlopen with a valid C string; the handle is kept open for the tray.
        !unsafe { libc::dlopen(c.as_ptr(), libc::RTLD_LAZY) }.is_null()
    })
}
#[cfg(not(target_os = "linux"))]
fn tray_supported() -> bool {
    true
}

pub fn start<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if !tray_supported() {
        return Ok(());
    }
    let show = MenuItem::with_id(app, "show", "Show radio", true, None::<&str>)?;
    let mini = MenuItem::with_id(app, "mini", "Mini radio on / off", true, None::<&str>)?;
    let mute = MenuItem::with_id(app, "mute", "Mute / unmute speaker", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &mini, &mute, &PredefinedMenuItem::separator(app)?, &quit])?;
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Repeater Nation Radio")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "quit" => {
                quit_gracefully(app);
            }
            action => {
                if action == "mini" {
                    show_main(app);
                }
                let _ = app.emit("tray-action", action.to_string());
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    HAS_TRAY.store(true, Ordering::SeqCst);
    Ok(())
}

/// The page sets the tray tooltip (current channel) and whether closing hides to the tray.
#[tauri::command]
pub fn tray_set<R: Runtime>(app: AppHandle<R>, tooltip: String, close_to_tray: bool) -> bool {
    CLOSE_TO_TRAY.store(close_to_tray, Ordering::SeqCst);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tooltip));
    }
    HAS_TRAY.load(Ordering::SeqCst)
}

pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if window.label() != "main" {
            return;
        }
        if CLOSE_TO_TRAY.load(Ordering::SeqCst) && HAS_TRAY.load(Ordering::SeqCst) {
            api.prevent_close();
            let _ = window.hide();
        } else if quit_gracefully(window.app_handle()) {
            api.prevent_close();
        }
    }
}
