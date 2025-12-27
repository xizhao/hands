//! Floating chat window for OpenCode threads
//!
//! A lightweight overlay window that shows a single thread/session.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Open a floating chat window for a session
#[tauri::command]
pub async fn open_floating_chat(
    app: AppHandle,
    session_id: String,
    workbook_dir: String,
) -> Result<String, String> {
    // Use first 8 chars of session ID for window label
    let label = format!("floating_chat_{}", &session_id[..8.min(session_id.len())]);

    // If window already exists, focus it
    if let Some(window) = app.get_webview_window(&label) {
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;
        return Ok(label);
    }

    // Build query params
    let query = format!(
        "floating-chat=true&session-id={}&workbook-dir={}",
        urlencoding::encode(&session_id),
        urlencoding::encode(&workbook_dir)
    );

    let url = format!("overlay.html?{}", query);

    // Window dimensions
    let width = 360.0;
    let height = 480.0;

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("Chat")
        .inner_size(width, height)
        .min_inner_size(280.0, 300.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .shadow(true)
        .build()
        .map_err(|e| format!("Failed to create floating chat: {}", e))?;

    let _ = window.set_focus();

    Ok(label)
}

/// Close a floating chat window
#[tauri::command]
pub async fn close_floating_chat(app: AppHandle, session_id: String) -> Result<(), String> {
    let label = format!("floating_chat_{}", &session_id[..8.min(session_id.len())]);

    if let Some(window) = app.get_webview_window(&label) {
        window
            .close()
            .map_err(|e| format!("Failed to close window: {}", e))?;
    }

    Ok(())
}
