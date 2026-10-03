//! Bluetooth LE PTT buttons that report on their own (vendor) GATT service instead of
//! as a key. The app connects to the chosen device, subscribes to every characteristic
//! that notifies, and hands each notification to the PTT matcher in `ptt.rs`.
//! Bluetooth PTT mics that send a media key or a keyboard key are handled by the
//! keyboard hook in `ptt.rs` and need none of this.

use btleplug::api::{Central, CharPropFlags, Manager as _, Peripheral as _, ScanFilter};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::StreamExt;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

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

async fn adapter() -> Result<Adapter, String> {
    let manager = Manager::new().await.map_err(|e| e.to_string())?;
    manager
        .adapters()
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "No Bluetooth adapter found. Turn Bluetooth on and try again.".to_string())
}

fn peripheral_id(p: &Peripheral) -> String {
    format!("{:?}", p.id())
}

#[tauri::command]
pub async fn ble_scan() -> Result<Vec<BleDevice>, String> {
    let adapter = adapter().await?;
    adapter.start_scan(ScanFilter::default()).await.map_err(|e| e.to_string())?;
    tokio::time::sleep(Duration::from_secs(5)).await;
    let _ = adapter.stop_scan().await;
    let mut devices = Vec::new();
    for p in adapter.peripherals().await.map_err(|e| e.to_string())? {
        let Ok(Some(props)) = p.properties().await else { continue };
        let Some(name) = props.local_name.filter(|n| !n.trim().is_empty()) else { continue };
        devices.push(BleDevice { id: peripheral_id(&p), name, rssi: props.rssi });
    }
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
pub fn ble_disconnect(app: AppHandle) {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    status(&app, "off", "", "");
}

async fn find(adapter: &Adapter, id: &str) -> Result<Peripheral, String> {
    let lookup = || async {
        adapter.peripherals().await.ok()?.into_iter().find(|p| peripheral_id(p) == id)
    };
    if let Some(p) = lookup().await {
        return Ok(p);
    }
    adapter.start_scan(ScanFilter::default()).await.map_err(|e| e.to_string())?;
    for _ in 0..20 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if let Some(p) = lookup().await {
            let _ = adapter.stop_scan().await;
            return Ok(p);
        }
    }
    let _ = adapter.stop_scan().await;
    Err("Bluetooth PTT button not found. Make sure it is on and nearby.".into())
}

async fn run(app: &AppHandle, id: &str, name: &str, generation: u64) -> Result<(), String> {
    let adapter = adapter().await?;
    let p = find(&adapter, id).await?;
    if !p.is_connected().await.unwrap_or(false) {
        p.connect().await.map_err(|e| e.to_string())?;
    }
    p.discover_services().await.map_err(|e| e.to_string())?;
    let mut subscribed = 0;
    for c in p.characteristics() {
        let notifies = c.properties.intersects(CharPropFlags::NOTIFY | CharPropFlags::INDICATE);
        if notifies && !IGNORED.contains(&c.uuid.to_string().as_str()) && p.subscribe(&c).await.is_ok() {
            subscribed += 1;
        }
    }
    if subscribed == 0 {
        let _ = p.disconnect().await;
        return Err(format!("{name} has no button service the app can read. If it pairs as a headset, use Learn PTT button instead."));
    }
    let mut notifications = p.notifications().await.map_err(|e| e.to_string())?;
    status(app, "connected", name, "");
    let mut tick = tokio::time::interval(Duration::from_secs(1));
    loop {
        tokio::select! {
            n = notifications.next() => match n {
                Some(n) => crate::ptt::input_ble(app, name, &n.uuid.to_string(), &n.value),
                None => return Ok(()),
            },
            _ = tick.tick() => {
                if GENERATION.load(Ordering::SeqCst) != generation {
                    let _ = p.disconnect().await;
                    return Ok(());
                }
                if !p.is_connected().await.unwrap_or(false) {
                    return Ok(());
                }
            }
        }
    }
}
