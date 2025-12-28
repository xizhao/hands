//! Floating chat toolbar
//!
//! The primary UI - a persistent floating chat window with all threads.
//! Opens on app launch, workbook browser opens on demand.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const FLOATING_CHAT_LABEL: &str = "floating_chat";

/// Open or focus the floating chat window
#[tauri::command]
pub async fn open_floating_chat(
    app: AppHandle,
    workbook_dir: String,
) -> Result<String, String> {
    // If window already exists, show and focus it
    if let Some(window) = app.get_webview_window(FLOATING_CHAT_LABEL) {
        window
            .show()
            .map_err(|e| format!("Failed to show window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;
        return Ok(FLOATING_CHAT_LABEL.to_string());
    }

    // Build query params
    let query = format!(
        "floating-chat=true&workbook-dir={}",
        urlencoding::encode(&workbook_dir)
    );

    let url = format!("overlay.html?{}", query);

    // Window dimensions - compact chat toolbar
    let width = 380.0;
    let height = 500.0;

    let window = WebviewWindowBuilder::new(&app, FLOATING_CHAT_LABEL, WebviewUrl::App(url.into()))
        .title("Hands")
        .inner_size(width, height)
        .min_inner_size(300.0, 350.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .shadow(true)
        .skip_taskbar(false) // Show in taskbar/dock
        .build()
        .map_err(|e| format!("Failed to create floating chat: {}", e))?;

    let _ = window.set_focus();

    Ok(FLOATING_CHAT_LABEL.to_string())
}

/// Hide the floating chat window (doesn't destroy it)
#[tauri::command]
pub async fn hide_floating_chat(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(FLOATING_CHAT_LABEL) {
        window
            .hide()
            .map_err(|e| format!("Failed to hide window: {}", e))?;
    }
    Ok(())
}

/// Show the floating chat window
#[tauri::command]
pub async fn show_floating_chat(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(FLOATING_CHAT_LABEL) {
        window
            .show()
            .map_err(|e| format!("Failed to show window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;
    }
    Ok(())
}

/// Toggle floating chat visibility
#[tauri::command]
pub async fn toggle_floating_chat(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window(FLOATING_CHAT_LABEL) {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            window.hide().map_err(|e| format!("Failed to hide: {}", e))?;
            Ok(false)
        } else {
            window.show().map_err(|e| format!("Failed to show: {}", e))?;
            window.set_focus().map_err(|e| format!("Failed to focus: {}", e))?;
            Ok(true)
        }
    } else {
        Ok(false)
    }
}
