//! Bluetooth LE PTT buttons on Android and iPhone, through the blec plugin (btleplug
//! needs its own Java side on Android, which blec ships). Same commands and events as
//! `ble.rs` on desktop: connect to the chosen device, subscribe to every characteristic
//! that notifies, and hand each notification to the PTT matcher in `ptt.rs`.

use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_blec::models::{CharProps, ScanFilter};
use tauri_plugin_blec::OnDisconnectHandler;

/// Bumped on every connect/disconnect so an older connection loop stops.
static GENERATION: AtomicU64 = AtomicU64::new(0);

// Standard characteristics that notify on their own and must never be learned as PTT.
const IGNORED: &[&str] = &[
    "00002a19-0000-1000-8000-00805f9b34fb", // Battery Level
    "00002a05-0000-1000-8000-00805f9b34fb", // Service Changed
];

#[derive(Serialize, Clone)]
pub struct BleDevice {
    id: String,
    name: String,
    rssi: Option<i16>,
}

#[derive(Serialize, Clone)]
struct Status {
    state: &'static str,
    name: String,
    message: String,
}

fn status(app: &AppHandle, state: &'static str, name: &str, message: impl Into<String>) {
    let _ = app.emit("ble-status", Status { state, name: name.into(), message: message.into() });
}

async fn handler() -> Result<&'static tauri_plugin_blec::Handler, String> {
    if !tauri_plugin_blec::check_permissions(true).await.unwrap_or(false) {
        return Err("Bluetooth permission is off. Allow Nearby devices / Bluetooth for Repeater Nation Radio in the phone's settings.".into());
    }
    tauri_plugin_blec::get_handler().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ble_scan() -> Result<Vec<BleDevice>, String> {
    let h = handler().await?;
    let (tx, mut rx) = tokio::sync::mpsc::channel(16);
    h.discover(Some(tx), 5000, ScanFilter::None, false).await.map_err(|e| e.to_string())?;
    let mut latest = Vec::new();
    let deadline = tokio::time::sleep(Duration::from_millis(5500));
    tokio::pin!(deadline);
    loop {
        tokio::select! {
            list = rx.recv() => match list { Some(list) => latest = list, None => break },
            _ = &mut deadline => break,
        }
    }
    let mut devices: Vec<BleDevice> = latest
        .into_iter()
        .filter(|d| !d.name.trim().is_empty())
        .map(|d| BleDevice { id: d.address, name: d.name, rssi: d.rssi })
        .collect();
    devices.sort_by_key(|d| std::cmp::Reverse(d.rssi.unwrap_or(i16::MIN)));
    Ok(devices)
}

#[tauri::command]
pub fn ble_connect(app: AppHandle, id: String, name: String) {
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        // Keep the button connected: reconnect after it drops or powers off.
        while GENERATION.load(Ordering::SeqCst) == generation {
            status(&app, "connecting", &name, "");
            let result = run(&app, &id, &name, generation).await;
            if GENERATION.load(Ordering::SeqCst) != generation {
                break;
            }
            match result {
                Ok(()) => status(&app, "disconnected", &name, "Connection lost, retrying"),
                Err(e) => status(&app, "error", &name, e),
            }
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    });
}

#[tauri::command]
pub async fn ble_disconnect(app: AppHandle) {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Ok(h) = tauri_plugin_blec::get_handler() {
        let _ = h.disconnect().await;
    }
    status(&app, "off", "", "");
}

async fn run(app: &AppHandle, id: &str, name: &str, generation: u64) -> Result<(), String> {
    let h = handler().await?;
    if !h.is_connected() {
        h.connect(id, OnDisconnectHandler::None, false).await.map_err(|e| e.to_string())?;
    }
    let services = h.discover_services(id).await.map_err(|e| e.to_string())?;
    let mut subscribed = 0;
    for service in services {
        for c in service.characteristics {
            let uuid = c.uuid.to_string();
            let notifies = c.properties.contains(CharProps::Notify) || c.properties.contains(CharProps::Indicate);
            if !notifies || IGNORED.contains(&uuid.as_str()) {
                continue;
            }
            let (app2, device) = (app.clone(), name.to_string());
            let callback = move |value: Vec<u8>| crate::ptt::input_ble(&app2, &device, &uuid, &value);
            if h.subscribe(c.uuid, Some(service.uuid), callback).await.is_ok() {
                subscribed += 1;
            }
        }
    }
    if subscribed == 0 {
        let _ = h.disconnect().await;
        return Err(format!("{name} has no button service the app can read. If it pairs as a headset, use Learn PTT button instead."));
    }
    status(app, "connected", name, "");
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if GENERATION.load(Ordering::SeqCst) != generation {
            let _ = h.disconnect().await;
            return Ok(());
        }
        if !h.is_connected() {
            return Ok(());
        }
    }
}
