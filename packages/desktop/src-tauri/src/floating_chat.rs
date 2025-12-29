//! Floating chat drawer
//!
//! A left-edge anchored drawer that slides in/out.
//! Collapsed: Shows only Hands icon as a vertical tab
//! Expanded: Full chat interface
//!
//! The drawer never hides - it just collapses to the icon.

use tauri::{AppHandle, Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder, LogicalPosition, LogicalSize};

const FLOATING_CHAT_LABEL: &str = "floating_chat";
const COLLAPSED_WIDTH: f64 = 64.0;  // Just the icon
const EXPANDED_WIDTH: f64 = 400.0;  // Full chat width

/// Open or focus the floating chat window (anchored to left edge)
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

    // Get screen dimensions to position on left edge
    // Use the primary monitor's position and size
    let monitors = app.available_monitors().map_err(|e| format!("Failed to get monitors: {}", e))?;
    let primary = monitors.into_iter().next().ok_or("No monitor found")?;
    let scale = primary.scale_factor();

    // Convert physical to logical for consistent positioning
    let screen_height = primary.size().height as f64 / scale;

    // Start COLLAPSED on the left edge
    let x = 0.0;
    let y = 0.0;
    let height = screen_height;

    println!("[floating_chat] Creating window: x={}, y={}, width={}, height={}, scale={}",
             x, y, COLLAPSED_WIDTH, height, scale);

    let window = WebviewWindowBuilder::new(&app, FLOATING_CHAT_LABEL, WebviewUrl::App(url.into()))
        .title("Hands")
        .position(x, y)
        .inner_size(COLLAPSED_WIDTH, height)
        .min_inner_size(COLLAPSED_WIDTH, 200.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(false)  // We control size via expand/collapse
        .shadow(false)
        .skip_taskbar(false)  // Show in dock so user can find it
        .visible(false)  // Start hidden to avoid black flash
        .build()
        .map_err(|e| format!("Failed to create floating chat: {}", e))?;

    // Listen for ready signal from frontend to show window (avoids black flash)
    // Using once() instead of listen() since we only need to show once and it auto-unregisters
    let window_clone = window.clone();
    app.once("floating-chat-ready", move |_| {
        let _ = window_clone.show();
    });

    // Open devtools in debug mode
    #[cfg(debug_assertions)]
    {
        window.open_devtools();
    }

    Ok(FLOATING_CHAT_LABEL.to_string())
}

/// Expand the drawer - just widen from left edge, keep same position/height
#[tauri::command]
pub async fn expand_floating_chat(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(FLOATING_CHAT_LABEL) {
        // Get current position and size
        let pos = window.outer_position().map_err(|e| format!("{}", e))?;
        let current_size = window.outer_size().map_err(|e| format!("{}", e))?;
        let monitors = app.available_monitors().map_err(|e| format!("{}", e))?;
        let primary = monitors.into_iter().next().ok_or("No monitor")?;
        let scale = primary.scale_factor();
        let height = current_size.height as f64 / scale;
        let y = pos.y as f64 / scale;

        // Expand width from left edge (x stays at 0)
        window.set_position(LogicalPosition::new(0.0, y))
            .map_err(|e| format!("{}", e))?;
        window.set_size(LogicalSize::new(EXPANDED_WIDTH, height))
            .map_err(|e| format!("{}", e))?;

        let _ = window.set_focus();
        let _ = app.emit("floating-chat-expanded", ());
    }
    Ok(())
}

/// Collapse the drawer - just narrow to left edge, keep same position/height
#[tauri::command]
pub async fn collapse_floating_chat(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(FLOATING_CHAT_LABEL) {
        // Get current position and size
        let pos = window.outer_position().map_err(|e| format!("{}", e))?;
        let current_size = window.outer_size().map_err(|e| format!("{}", e))?;
        let monitors = app.available_monitors().map_err(|e| format!("{}", e))?;
        let primary = monitors.into_iter().next().ok_or("No monitor")?;
        let scale = primary.scale_factor();
        let height = current_size.height as f64 / scale;
        let y = pos.y as f64 / scale;

        // Collapse width to left edge (x stays at 0)
        window.set_position(LogicalPosition::new(0.0, y))
            .map_err(|e| format!("{}", e))?;
        window.set_size(LogicalSize::new(COLLAPSED_WIDTH, height))
            .map_err(|e| format!("{}", e))?;

        let _ = app.emit("floating-chat-collapsed", ());
    }
    Ok(())
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

/// Open floating chat and start a new thread with the given prompt
#[tauri::command]
pub async fn open_floating_chat_with_prompt(
    app: AppHandle,
    workbook_dir: String,
    prompt: String,
) -> Result<String, String> {
    // First open/focus the floating chat
    let label = open_floating_chat(app.clone(), workbook_dir).await?;

    // Wait a moment for the window to be ready, then emit the prompt
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Emit event with the prompt - FloatingChat will pick this up and start a new thread
    app.emit("floating-chat-prompt", &prompt)
        .map_err(|e| format!("Failed to emit prompt: {}", e))?;

    // Also expand the chat
    expand_floating_chat(app).await?;

    Ok(label)
}
