//! Hardware button mapping: any radio action (PTT, channel/zone, mute, softkeys…) can be
//! bound to one or more buttons on a USB or Bluetooth hand mic, foot switch, keyboard,
//! mouse or gamepad. Bindings marked `global` work while the app window isn't focused.
//!
//! Inputs come from a Windows low-level keyboard/mouse hook (keyboard keys, media and
//! volume keys that HID and Bluetooth mics send, middle and side mouse buttons), from
//! gilrs (joystick/gamepad buttons, every desktop OS) and from Bluetooth LE buttons
//! (`ble.rs`). Only bound buttons ever reach the web view: other input is dropped here.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Binding {
    pub action: String,
    pub kind: String,
    pub code: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub global: bool,
}

#[derive(Clone, Serialize)]
struct Learned {
    kind: String,
    code: String,
    label: String,
}

#[derive(Clone, Serialize)]
struct Action {
    action: String,
    pressed: bool,
    global: bool,
}

struct State {
    bindings: Vec<Binding>,
    learning: bool,
    /// Inputs currently held, with the actions their press fired, so the release
    /// reaches the same actions and keyboard auto-repeat is dropped.
    held: Option<HashMap<String, Vec<(String, bool)>>>,
}

static STATE: Mutex<State> = Mutex::new(State { bindings: Vec::new(), learning: false, held: None });

fn state() -> std::sync::MutexGuard<'static, State> {
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

/// Called for every press/release from any hardware source.
fn input(app: &AppHandle, kind: &str, code: String, label: String, pressed: bool) {
    let mut s = state();
    if s.learning {
        if !pressed {
            return;
        }
        s.learning = false;
        apply_native(&s.bindings);
        drop(s);
        // Esc cancels learning instead of being learned.
        if kind == "key" && code == "27" {
            let _ = app.emit("hw-learn-cancel", ());
        } else {
            let _ = app.emit("hw-learned", Learned { kind: kind.into(), code, label });
        }
        return;
    }
    let id = format!("{kind}:{code}");
    let held = s.held.get_or_insert_with(HashMap::new);
    let fired = if pressed {
        if held.contains_key(&id) {
            return; // auto-repeat
        }
        let focused = app_focused();
        let fired: Vec<(String, bool)> = s
            .bindings
            .iter()
            .filter(|b| b.kind == kind && b.code == code && (b.global || focused))
            .map(|b| (b.action.clone(), b.global))
            .collect();
        if fired.is_empty() {
            return;
        }
        s.held.get_or_insert_with(HashMap::new).insert(id, fired.clone());
        fired
    } else {
        match held.remove(&id) {
            Some(fired) => fired,
            None => return,
        }
    };
    drop(s);
    for (action, global) in fired {
        let _ = app.emit("hw-action", Action { action, pressed, global });
    }
}

/// A notification from a Bluetooth LE button. A learned press is a characteristic plus
/// the value it sends on press; any other value on that characteristic releases it.
pub(crate) fn input_ble(app: &AppHandle, device: &str, characteristic: &str, value: &[u8]) {
    let hex: String = value.iter().map(|b| format!("{b:02x}")).collect();
    let me = format!("{characteristic}={hex}");
    let codes: Vec<String> = {
        let s = state();
        if s.learning {
            drop(s);
            return input(app, "ble", me, format!("{device} button"), true);
        }
        let mut codes: Vec<String> = s
            .bindings
            .iter()
            .filter(|b| b.kind == "ble" && b.code.split_once('=').map(|(c, _)| c) == Some(characteristic))
            .map(|b| b.code.clone())
            .collect();
        codes.sort();
        codes.dedup();
        codes
    };
    for code in codes {
        let pressed = code == me;
        input(app, "ble", code, String::new(), pressed);
    }
}

#[tauri::command]
pub fn hw_set_bindings(bindings: Vec<Binding>) {
    let mut s = state();
    s.bindings = bindings;
    s.held = None;
    apply_native(&s.bindings);
}

#[tauri::command]
pub fn hw_learn(on: bool) {
    let mut s = state();
    s.learning = on;
    // Let bound keys through while learning so they can be learned again.
    apply_native(if on { &[] } else { &s.bindings });
}

#[derive(Serialize)]
pub struct Capabilities {
    global_keys: bool,
    gamepads: bool,
}

#[tauri::command]
pub fn hw_capabilities() -> Capabilities {
    Capabilities { global_keys: cfg!(windows), gamepads: true }
}

/// Whether this app's window is in front. Off Windows the web view filters non-global
/// actions itself, so report focused here.
#[cfg(not(windows))]
fn app_focused() -> bool {
    true
}

#[cfg(windows)]
fn app_focused() -> bool {
    win::app_focused()
}

pub fn start(app: AppHandle) {
    #[cfg(windows)]
    win::start(app.clone());
    start_gamepads(app);
}

fn start_gamepads(app: AppHandle) {
    std::thread::spawn(move || {
        let Ok(mut gilrs) = gilrs::Gilrs::new() else { return };
        loop {
            while let Some(ev) = gilrs.next_event_blocking(None) {
                let (pressed, code) = match ev.event {
                    gilrs::EventType::ButtonPressed(_, code) => (true, code),
                    gilrs::EventType::ButtonReleased(_, code) => (false, code),
                    _ => continue,
                };
                let name = gilrs.gamepad(ev.id).name().to_string();
                let label = format!("{name} button {}", code.into_u32());
                input(&app, "pad", format!("{name}#{code}"), label, pressed);
            }
        }
    });
}

#[cfg(not(windows))]
fn apply_native(_bindings: &[Binding]) {}

#[cfg(windows)]
fn apply_native(bindings: &[Binding]) {
    // Swallow only keys nobody types with: F13–F24 and the media/volume keys hand
    // mics send. Otherwise a mic's Play/Pause or Mute button would also pause music
    // or mute the PC. Normal keys (Space, letters) still reach other apps.
    let swallow = bindings
        .iter()
        .filter(|b| b.kind == "key")
        .filter_map(|b| b.code.parse::<u32>().ok().map(|vk| (vk, b.global)))
        .filter(|(vk, _)| matches!(vk, 0x7C..=0x87 | 0xA6..=0xB7))
        .collect();
    *win::SWALLOW.lock().unwrap_or_else(|e| e.into_inner()) = swallow;
}

#[cfg(windows)]
mod win {
    use std::sync::{mpsc, Mutex, OnceLock};
    use tauri::AppHandle;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT,
        WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_SYSKEYDOWN,
        WM_SYSKEYUP, WM_XBUTTONDOWN, WM_XBUTTONUP,
    };

    /// Bound non-typing keys to keep from other apps: (virtual key, binding is global).
    pub static SWALLOW: Mutex<Vec<(u32, bool)>> = Mutex::new(Vec::new());

    pub fn app_focused() -> bool {
        unsafe {
            let window = GetForegroundWindow();
            if window.is_null() {
                return false;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(window, &mut pid);
            pid == GetCurrentProcessId()
        }
    }
    static TX: OnceLock<mpsc::Sender<(&'static str, u32, bool)>> = OnceLock::new();

    fn send(kind: &'static str, code: u32, pressed: bool) {
        if let Some(tx) = TX.get() {
            let _ = tx.send((kind, code, pressed));
        }
    }

    // Hook callbacks must return quickly, so they only queue the event.
    unsafe extern "system" fn keyboard(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
        if code == HC_ACTION as i32 {
            let k = &*(l as *const KBDLLHOOKSTRUCT);
            let msg = w as u32;
            let pressed = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
            if pressed || msg == WM_KEYUP || msg == WM_SYSKEYUP {
                send("key", k.vkCode, pressed);
                let swallow = SWALLOW
                    .lock()
                    .map(|list| list.iter().any(|&(vk, global)| vk == k.vkCode && (global || app_focused())))
                    .unwrap_or(false);
                if swallow {
                    return 1;
                }
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, w, l)
    }

    unsafe extern "system" fn mouse(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
        if code == HC_ACTION as i32 {
            let m = &*(l as *const MSLLHOOKSTRUCT);
            match w as u32 {
                WM_MBUTTONDOWN => send("mouse", 3, true),
                WM_MBUTTONUP => send("mouse", 3, false),
                WM_XBUTTONDOWN => send("mouse", 3 + (m.mouseData >> 16), true),
                WM_XBUTTONUP => send("mouse", 3 + (m.mouseData >> 16), false),
                _ => {}
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, w, l)
    }

    pub fn start(app: AppHandle) {
        let (tx, rx) = mpsc::channel::<(&'static str, u32, bool)>();
        if TX.set(tx).is_err() {
            return;
        }
        std::thread::spawn(move || {
            for (kind, code, pressed) in rx {
                super::input(&app, kind, code.to_string(), label(kind, code), pressed);
            }
        });
        std::thread::spawn(|| unsafe {
            let module = GetModuleHandleW(std::ptr::null());
            SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard), module, 0);
            SetWindowsHookExW(WH_MOUSE_LL, Some(mouse), module, 0);
            // Low-level hooks are called on this thread's message loop.
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {}
        });
    }

    fn label(kind: &str, code: u32) -> String {
        if kind == "mouse" {
            return match code {
                3 => "Middle mouse button".into(),
                4 => "Mouse side button 1".into(),
                5 => "Mouse side button 2".into(),
                _ => format!("Mouse button {code}"),
            };
        }
        match code {
            0x08 => "Backspace".into(),
            0x09 => "Tab".into(),
            0x0D => "Enter".into(),
            0x10 | 0xA0 | 0xA1 => "Shift".into(),
            0x11 | 0xA2 | 0xA3 => "Ctrl".into(),
            0x12 | 0xA4 | 0xA5 => "Alt".into(),
            0x13 => "Pause".into(),
            0x14 => "Caps Lock".into(),
            0x1B => "Esc".into(),
            0x20 => "Space".into(),
            0x21 => "Page Up".into(),
            0x22 => "Page Down".into(),
            0x23 => "End".into(),
            0x24 => "Home".into(),
            0x25 => "Left".into(),
            0x26 => "Up".into(),
            0x27 => "Right".into(),
            0x28 => "Down".into(),
            0x2C => "Print Screen".into(),
            0x2D => "Insert".into(),
            0x2E => "Delete".into(),
            0x30..=0x39 | 0x41..=0x5A => char::from_u32(code).map(String::from).unwrap_or_default(),
            0x60..=0x69 => format!("Num {}", code - 0x60),
            0x70..=0x87 => format!("F{}", code - 0x6F),
            0x91 => "Scroll Lock".into(),
            0xA6 => "Browser Back".into(),
            0xA7 => "Browser Forward".into(),
            0xAD => "Mute key".into(),
            0xAE => "Volume Down key".into(),
            0xAF => "Volume Up key".into(),
            0xB0 => "Next Track key".into(),
            0xB1 => "Previous Track key".into(),
            0xB2 => "Stop key".into(),
            0xB3 => "Play/Pause key".into(),
            _ => format!("Key {code}"),
        }
    }
}
