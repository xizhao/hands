//! Global hotkey registration for Hands.
//!
//! Registers system-wide shortcuts like Cmd+Shift+H for screen capture.

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Register all global shortcuts for the app
pub fn register_global_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Cmd+Shift+H for screen capture
    // Note: Cmd+H alone is reserved by macOS for "Hide Window"
    let capture_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyH);

    let app_handle = app.clone();
    app.global_shortcut().on_shortcut(capture_shortcut, move |_app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            println!("[hotkey] Capture shortcut triggered");
            trigger_capture(&app_handle);
        }
    })?;

    println!("[hotkeys] Registered Cmd+Shift+H for screen capture");

    Ok(())
}

/// Trigger the screen capture flow
fn trigger_capture(app: &AppHandle) {
    let app = app.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::capture::start_capture(&app).await {
            eprintln!("[hotkey] Failed to start capture: {}", e);
        }
    });
}

/// Unregister all global shortcuts
pub fn unregister_global_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    app.global_shortcut().unregister_all()?;
    println!("[hotkeys] Unregistered all global shortcuts");
    Ok(())
}
