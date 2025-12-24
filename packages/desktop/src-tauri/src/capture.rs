//! Screen capture functionality using native macOS screencapture.
//!
//! Uses the native Cmd+Shift+4 style region selection.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use std::process::Command;
use std::fs::File;
use std::io::Read;

#[cfg(target_os = "macos")]
use objc2_app_kit::NSEvent;
#[cfg(target_os = "macos")]
use objc2::MainThreadMarker;

/// Get current mouse position and screen scale factor on macOS
#[cfg(target_os = "macos")]
fn get_mouse_position_and_scale() -> (i32, i32, f64) {
    let point = NSEvent::mouseLocation();
    // NSEvent returns screen coordinates with origin at bottom-left
    // We need to flip Y for window positioning (origin at top-left)
    // Try to get main thread marker for NSScreen access
    if let Some(mtm) = MainThreadMarker::new() {
        if let Some(screen) = objc2_app_kit::NSScreen::mainScreen(mtm) {
            let screen_height = screen.frame().size.height;
            let scale = screen.backingScaleFactor();
            return (point.x as i32, (screen_height - point.y) as i32, scale);
        }
    }
    // Fallback: assume 1080p screen height and 2x Retina if we can't get it
    (point.x as i32, (1080.0 - point.y) as i32, 2.0)
}

#[cfg(not(target_os = "macos"))]
fn get_mouse_position_and_scale() -> (i32, i32, f64) {
    (500, 300, 1.0) // Fallback for non-macOS
}

/// Read PNG dimensions from file header
fn get_png_dimensions(path: &str) -> Option<(u32, u32)> {
    let mut file = File::open(path).ok()?;

    // PNG signature (8 bytes) + IHDR chunk length (4 bytes) + "IHDR" (4 bytes)
    // Then width (4 bytes) and height (4 bytes) as big-endian u32
    let mut header = [0u8; 24];
    file.read_exact(&mut header).ok()?;

    // Check PNG signature
    if &header[0..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }

    // Width and height are at bytes 16-19 and 20-23 (big-endian)
    let width = u32::from_be_bytes([header[16], header[17], header[18], header[19]]);
    let height = u32::from_be_bytes([header[20], header[21], header[22], header[23]]);

    Some((width, height))
}

/// Start the screen capture flow using native macOS screencapture
/// This gives the familiar Cmd+Shift+4 crosshair for region selection
pub async fn start_capture(app: &AppHandle) -> Result<(), String> {
    // Create temp directory for captures
    let temp_dir = std::env::temp_dir().join("hands-captures");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let filename = format!("capture_{}.png", uuid::Uuid::new_v4());
    let file_path = temp_dir.join(&filename);
    let file_path_str = file_path.to_string_lossy().to_string();

    // Small delay to ensure all windows are in proper state
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Use macOS native screencapture with interactive region selection
    // -i: interactive mode (crosshair cursor like Cmd+Shift+4)
    // -x: no sound
    // Note: Requires Screen Recording permission in System Settings
    let output = Command::new("screencapture")
        .args(["-i", "-x", &file_path_str])
        .output()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    // Check if user cancelled (ESC key) - file won't exist
    if !file_path.exists() {
        println!("[capture] User cancelled screen capture");
        return Ok(());
    }

    if !output.status.success() {
        return Err("Screen capture failed".to_string());
    }

    println!("[capture] Screenshot saved to: {}", file_path_str);

    // Get mouse position and screen scale factor
    let (mouse_x, mouse_y, scale) = get_mouse_position_and_scale();
    println!("[capture] Mouse position: ({}, {}), scale: {}", mouse_x, mouse_y, scale);

    // Get image dimensions and convert to logical pixels
    // PNG contains actual pixels, but window positioning uses logical points
    let (panel_x, panel_y, img_width, img_height) = if let Some((px_width, px_height)) = get_png_dimensions(&file_path_str) {
        // Convert pixel dimensions to logical dimensions
        let logical_width = (px_width as f64 / scale) as u32;
        let logical_height = (px_height as f64 / scale) as u32;
        println!("[capture] Image: {}x{} px -> {}x{} logical (scale {})", px_width, px_height, logical_width, logical_height, scale);

        // Mouse is at bottom-right, subtract logical dimensions to get top-left
        let top_left_x = (mouse_x - logical_width as i32).max(0);
        let top_left_y = (mouse_y - logical_height as i32).max(0);
        println!("[capture] Calculated top-left: ({}, {})", top_left_x, top_left_y);
        (top_left_x, top_left_y, logical_width, logical_height)
    } else {
        println!("[capture] Could not read image dimensions, using mouse position");
        (mouse_x, mouse_y, 400, 300)
    };

    // Open action panel at top-left of capture region, sized to match image
    open_capture_action_panel(app, panel_x, panel_y, img_width, img_height, Some(file_path_str)).await?;

    Ok(())
}

#[tauri::command]
pub async fn start_capture_command(app: AppHandle) -> Result<(), String> {
    start_capture(&app).await
}

#[tauri::command]
pub async fn capture_region(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("hands-captures");
    std::fs::create_dir_all(&temp_dir).ok();

    let filename = format!("capture_{}.png", uuid::Uuid::new_v4());
    let file_path = temp_dir.join(&filename);
    let file_path_str = file_path.to_string_lossy().to_string();

    // Use screencapture with -R for specific region
    let region = format!("{},{},{},{}", x, y, width, height);
    let output = Command::new("screencapture")
        .args(["-R", &region, "-x", &file_path_str])
        .output()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    if !output.status.success() || !file_path.exists() {
        return Err("Screen capture failed".to_string());
    }

    // Open action panel with the screenshot at exact capture location
    open_capture_action_panel(&app, x, y, width, height, Some(file_path_str.clone())).await?;

    Ok(file_path_str)
}

/// Cancel capture (no-op with native screencapture, user presses ESC)
#[tauri::command]
pub async fn cancel_capture(_app: AppHandle) -> Result<(), String> {
    // Native screencapture handles cancellation via ESC key
    Ok(())
}

/// Open the capture action panel
pub async fn open_capture_action_panel(
    app: &AppHandle,
    _x: i32,
    _y: i32,
    img_width: u32,
    img_height: u32,
    screenshot_path: Option<String>,
) -> Result<(), String> {
    let panel_id = uuid::Uuid::new_v4().to_string();
    let label = format!("capture_action_{}", &panel_id[..8]);

    // Cap image size to reasonable max (e.g., 600px) to prevent huge windows
    let max_img_dim = 600.0;
    let capped_width = (img_width as f64).min(max_img_dim) as u32;
    let capped_height = (img_height as f64).min(max_img_dim) as u32;

    // Build query params with capped dimensions
    let mut query = format!("capture-action=true&panel-id={}&img-width={}&img-height={}", panel_id, capped_width, capped_height);
    if let Some(ref path) = screenshot_path {
        query.push_str(&format!("&screenshot={}", urlencoding::encode(path)));
    }

    let url = format!("overlay.html?{}", query);

    // Padding around image for glow effect (p-5 = 20px)
    let image_padding = 20.0;
    // Action panel below image - room for message bubble + action buttons
    let action_panel_height = 240.0;

    // Window dimensions: fuller width for action content
    let widget_width = 500.0;
    let widget_height = image_padding + capped_height as f64 + action_panel_height;

    // Position window in top-left corner
    let pos_x = 0.0;
    let pos_y = 0.0;

    println!("[capture] Widget: {}x{}, Position: ({}, {})",
        widget_width, widget_height, pos_x, pos_y);

    let window = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(url.into()),
    )
    .title("")
    .inner_size(widget_width, widget_height)
    .min_inner_size(400.0, 180.0)
    .position(pos_x, pos_y)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .build()
    .map_err(|e| format!("Failed to create capture panel: {}", e))?;

    let _ = window.set_focus();

    Ok(())
}

/// Close a capture action panel by ID
#[tauri::command]
pub async fn close_capture_panel(app: AppHandle, panel_id: String) -> Result<(), String> {
    // Find and close matching window
    for window in app.webview_windows().values() {
        if window.label().contains(&panel_id) {
            window.close().map_err(|e| format!("Failed to close panel: {}", e))?;
            break;
        }
    }
    Ok(())
}

/// Set whether the current window should ignore cursor events (click-through)
#[tauri::command]
pub async fn set_ignore_cursor_events(window: tauri::WebviewWindow, ignore: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(ignore)
        .map_err(|e| format!("Failed to set ignore cursor events: {}", e))
}
