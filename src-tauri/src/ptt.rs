//! Hardware push-to-talk: a learnable PTT button (USB hand mic, foot switch, gamepad)
//! that keys the radio even when the app window is not focused.
//!
//! Inputs come from a Windows low-level keyboard/mouse hook (keyboard keys, media and
//! volume keys that HID hand mics send, middle and side mouse buttons) and from gilrs
//! (joystick/gamepad buttons, on every desktop OS). Only the bound button ever reaches
//! the web view: other keystrokes are compared here and dropped.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Binding {
    pub kind: String,
    pub code: String,
    pub label: String,
}

struct State {
    binding: Option<Binding>,
    learning: bool,
    down: bool,
}

static STATE: Mutex<State> = Mutex::new(State { binding: None, learning: false, down: false });

fn state() -> std::sync::MutexGuard<'static, State> {
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

/// Called for every press/release from any hardware source.
fn input(app: &AppHandle, kind: &str, code: String, label: String, pressed: bool) {
    let mut s = state();
    if s.learning {
        // Esc cancels learning instead of becoming the PTT button.
        if kind == "key" && code == "27" {
            if pressed {
                s.learning = false;
                apply_native(&s.binding);
                drop(s);
                let _ = app.emit("ptt-learn-cancel", ());
            }
            return;
        }
        if pressed {
            let binding = Binding { kind: kind.into(), code, label };
            s.learning = false;
            s.down = false;
            s.binding = Some(binding.clone());
            apply_native(&s.binding);
            drop(s);
            let _ = app.emit("ptt-learned", binding);
        }
        return;
    }
    let hit = matches!(&s.binding, Some(b) if b.kind == kind && b.code == code);
    // `down == pressed` also drops keyboard auto-repeat while the button is held.
    if !hit || s.down == pressed {
        return;
    }
    s.down = pressed;
    drop(s);
    let _ = app.emit("ptt-hw", pressed);
}

#[tauri::command]
pub fn ptt_set_binding(binding: Option<Binding>) {
    let mut s = state();
    s.binding = binding;
    s.down = false;
    apply_native(&s.binding);
}

#[tauri::command]
pub fn ptt_learn(on: bool) {
    let mut s = state();
    s.learning = on;
    // Let the bound key through while learning so it can be learned again.
    apply_native(if on { &None } else { &s.binding });
}

#[derive(Serialize)]
pub struct Capabilities {
    global_keys: bool,
    gamepads: bool,
}

#[tauri::command]
pub fn ptt_capabilities() -> Capabilities {
    Capabilities { global_keys: cfg!(windows), gamepads: true }
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
fn apply_native(_binding: &Option<Binding>) {}

#[cfg(windows)]
fn apply_native(binding: &Option<Binding>) {
    use std::sync::atomic::Ordering;
    let vk = match binding {
        Some(b) if b.kind == "key" => b.code.parse::<u32>().unwrap_or(0),
        _ => 0,
    };
    // Swallow only keys nobody types with: F13–F24 and the media/volume keys hand
    // mics send. Otherwise a hand mic's Play/Pause or Mute PTT would also pause
    // music or mute the PC. Normal keys (Space, letters) still reach other apps.
    let swallow = matches!(vk, 0x7C..=0x87 | 0xA6..=0xB7);
    win::SWALLOW_VK.store(if swallow { vk } else { 0 }, Ordering::Relaxed);
}

#[cfg(windows)]
mod win {
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{mpsc, OnceLock};
    use tauri::AppHandle;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT,
        WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_SYSKEYDOWN,
        WM_SYSKEYUP, WM_XBUTTONDOWN, WM_XBUTTONUP,
    };

    pub static SWALLOW_VK: AtomicU32 = AtomicU32::new(0);
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
                let swallow = SWALLOW_VK.load(Ordering::Relaxed);
                if swallow != 0 && swallow == k.vkCode {
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
