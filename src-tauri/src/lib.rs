mod ble;
mod ptt;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // On Windows and Linux an OAuth deep link launches a second app process.
    // Single-instance (with its deep-link feature) forwards that URL to the
    // running app so onOpenUrl fires there, then focuses the existing window.
    // It must be registered before the deep-link plugin.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tray::show_main(app);
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(tray::on_window_event)
        .invoke_handler(tauri::generate_handler![ptt::hw_set_bindings, ptt::hw_learn, ptt::hw_capabilities, ble::ble_scan, ble::ble_connect, ble::ble_disconnect, tray::tray_set])
        .setup(|_app| {
            ptt::start(_app.handle().clone());
            if let Err(e) = tray::start(_app.handle()) {
                eprintln!("tray icon unavailable: {e}");
            }
            // AppImage and dev builds have no installer to register the
            // repeaternation:// scheme, so register it at runtime there.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = _app.deep_link().register_all();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Repeater Nation Radio");
}
