//! Hardware button mapping: any radio action (PTT, channel/zone, mute, softkeys…) can be
//! bound to one or more buttons on a USB or Bluetooth hand mic, foot switch, keyboard,
//! mouse or gamepad. Bindings marked `global` work while the app window isn't focused.
//!
//! Inputs come from a Windows low-level keyboard/mouse hook (keyboard keys, media and
//! volume keys that HID and Bluetooth mics send, middle and side mouse buttons), from
//! gilrs (joystick/gamepad buttons, every desktop OS) and from Bluetooth LE buttons
//! (`ble.rs`). Only bound buttons ever reach the web view: other input is dropped here.
//!
//! Typing keys (letters, Space, Num 0…) are read by the page itself while the app is
//! in front, like any app reads its keyboard, so they work even if Windows drops the
//! hook; the hook only adds them while another window is in front (bindings set to
//! "Anywhere"). Keys nobody types with (F13–F24, media and volume keys from hand mics)
//! always come from the hook.
//!
//! The hook is only installed while something needs it: a binding set to "Anywhere", a
//! non-typing key, a mouse button, or learning a new button. With the default Space and
//! Num 0 PTT keys the app never hooks the keyboard at all, so antivirus tools that flag
//! any keyboard hook as a keylogger have nothing to see.

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
        apply_native(&s.bindings, false);
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
        // The page handles typing keys while the app is in front.
        if focused && kind == "key" && code.parse::<u32>().map_or(false, |vk| !native_only(vk)) {
            return;
        }
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
    apply_native(&s.bindings, s.learning);
}

#[tauri::command]
pub fn hw_learn(on: bool) {
    let mut s = state();
    s.learning = on;
    // Let bound keys through while learning so they can be learned again.
    apply_native(if on { &[] } else { &s.bindings }, on);
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

/// Keys nobody types with: F13–F24 and the browser, media and volume keys hand mics
/// send. Only the hook sees these reliably, so they are never left to the page.
pub(crate) fn native_only(vk: u32) -> bool {
    matches!(vk, 0x7C..=0x87 | 0xA6..=0xB7)
}

/// Whether any binding needs the low-level hook: mouse buttons, keys nobody types
/// with, and keys set to work while another window is in front.
#[cfg(windows)]
fn needs_hook(bindings: &[Binding]) -> bool {
    bindings.iter().any(|b| match b.kind.as_str() {
        "mouse" => true,
        "key" => b.global || b.code.parse::<u32>().map_or(false, native_only),
        _ => false,
    })
}

#[cfg(not(windows))]
fn apply_native(_bindings: &[Binding], _learning: bool) {}

#[cfg(windows)]
fn apply_native(bindings: &[Binding], learning: bool) {
    win::set_hooked(learning || needs_hook(bindings));
    // Swallow only keys nobody types with: F13–F24 and the media/volume keys hand
    // mics send. Otherwise a mic's Play/Pause or Mute button would also pause music
    // or mute the PC. Normal keys (Space, letters) still reach other apps.
    let swallow = bindings
        .iter()
        .filter(|b| b.kind == "key")
        .filter_map(|b| b.code.parse::<u32>().ok().map(|vk| (vk, b.global)))
        .filter(|(vk, _)| native_only(*vk))
        .collect();
    *win::SWALLOW.lock().unwrap_or_else(|e| e.into_inner()) = swallow;
}

#[cfg(windows)]
mod win {
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::sync::{mpsc, Mutex, OnceLock};
    use tauri::AppHandle;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::{GetCurrentProcessId, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId, SetTimer, SetWindowsHookExW, UnhookWindowsHookEx, HC_ACTION,
        HHOOK, PeekMessageW, PostThreadMessageW, PM_NOREMOVE, WM_APP, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_MBUTTONDOWN, WM_MBUTTONUP,
        WM_SYSKEYDOWN, WM_SYSKEYUP, WM_TIMER, WM_XBUTTONDOWN, WM_XBUTTONUP,
    };

    /// Bound non-typing keys to keep from other apps: (virtual key, binding is global).
    pub static SWALLOW: Mutex<Vec<(u32, bool)>> = Mutex::new(Vec::new());

    /// Whether the hooks should be installed, and the hook thread to tell when it changes.
    static WANTED: AtomicBool = AtomicBool::new(false);
    static HOOK_THREAD: AtomicU32 = AtomicU32::new(0);

    pub fn set_hooked(on: bool) {
        if WANTED.swap(on, Ordering::SeqCst) != on {
            let thread = HOOK_THREAD.load(Ordering::SeqCst);
            if thread != 0 {
                unsafe { PostThreadMessageW(thread, WM_APP, 0, 0) };
            }
        }
    }

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
            // Create this thread's message queue before others can post to it.
            let mut msg: MSG = std::mem::zeroed();
            PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
            HOOK_THREAD.store(GetCurrentThreadId(), Ordering::SeqCst);
            let module = GetModuleHandleW(std::ptr::null());
            let mut keys: HHOOK = std::ptr::null_mut();
            let mut mice: HHOOK = std::ptr::null_mut();
            // Windows silently drops a low-level hook that is ever slow to answer (a
            // busy PC, waking from sleep), after which no button works until restart.
            // So the hooks are set up again every 20 s: the new one is in place before
            // the old one goes, and no event can arrive in between because both
            // happen on this thread, which is what delivers them.
            let mut rehook = || {
                if !WANTED.load(Ordering::SeqCst) {
                    if !keys.is_null() {
                        UnhookWindowsHookEx(keys);
                        keys = std::ptr::null_mut();
                    }
                    if !mice.is_null() {
                        UnhookWindowsHookEx(mice);
                        mice = std::ptr::null_mut();
                    }
                    return;
                }
                let k = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard), module, 0);
                if !k.is_null() {
                    if !keys.is_null() {
                        UnhookWindowsHookEx(keys);
                    }
                    keys = k;
                }
                let m = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse), module, 0);
                if !m.is_null() {
                    if !mice.is_null() {
                        UnhookWindowsHookEx(mice);
                    }
                    mice = m;
                }
            };
            rehook();
            SetTimer(std::ptr::null_mut(), 0, 20_000, None);
            // Low-level hooks are called on this thread's message loop. WM_APP means
            // the bindings changed whether the hooks are wanted.
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                if msg.message == WM_TIMER || msg.message == WM_APP {
                    rehook();
                }
            }
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
