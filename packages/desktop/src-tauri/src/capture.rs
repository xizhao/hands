//! Screen capture functionality using xcap.
//!
//! Provides region selection overlay and screenshot capture.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use xcap::Monitor;
use image::ImageEncoder;
use image::codecs::png::PngEncoder;
use std::io::Cursor;
use base64::Engine;

/// Start the screen capture flow - opens overlay window(s)
pub async fn start_capture(app: &AppHandle) -> Result<(), String> {
    // Get all monitors
    let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;

    if monitors.is_empty() {
        return Err("No monitors found".to_string());
    }

    // For now, just use the primary monitor (first one)
    // TODO: Support multi-monitor capture
    let monitor = &monitors[0];
    let width = monitor.width().map_err(|e| format!("Failed to get monitor width: {}", e))?;
    let height = monitor.height().map_err(|e| format!("Failed to get monitor height: {}", e))?;

    // Check if capture overlay already exists
    if let Some(window) = app.get_webview_window("capture_overlay_main") {
        let _ = window.set_focus();
        return Ok(());
    }

    // Create fullscreen transparent overlay window
    let overlay_url = "index.html?capture-overlay=true";

    let window = WebviewWindowBuilder::new(
        app,
        "capture_overlay_main",
        WebviewUrl::App(overlay_url.into()),
    )
    .title("")
    .inner_size(width as f64, height as f64)
    .position(0.0, 0.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .fullscreen(true)
    .build()
    .map_err(|e| format!("Failed to create capture overlay: {}", e))?;

    // Focus the overlay
    let _ = window.set_focus();

    Ok(())
}

/// Capture a specific region of the screen
#[tauri::command]
pub async fn capture_region(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    // Get primary monitor
    let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;

    if monitors.is_empty() {
        return Err("No monitors found".to_string());
    }

    let monitor = &monitors[0];

    // Capture the full screen first
    let screenshot = monitor.capture_image()
        .map_err(|e| format!("Failed to capture screen: {}", e))?;

    // Crop to the selected region - ensure we don't go out of bounds
    let crop_x = (x as u32).min(screenshot.width().saturating_sub(1));
    let crop_y = (y as u32).min(screenshot.height().saturating_sub(1));
    let crop_width = width.min(screenshot.width().saturating_sub(crop_x));
    let crop_height = height.min(screenshot.height().saturating_sub(crop_y));

    let cropped = image::imageops::crop_imm(
        &screenshot,
        crop_x,
        crop_y,
        crop_width,
        crop_height,
    ).to_image();

    // Convert to PNG and base64 encode
    let mut buffer = Cursor::new(Vec::new());
    let encoder = PngEncoder::new(&mut buffer);
    encoder.write_image(
        cropped.as_raw(),
        cropped.width(),
        cropped.height(),
        image::ExtendedColorType::Rgba8,
    ).map_err(|e| format!("Failed to encode image: {}", e))?;

    let _base64_image = base64::engine::general_purpose::STANDARD.encode(buffer.into_inner());

    // Save to temp file for the chat widget
    let temp_dir = std::env::temp_dir().join("hands-captures");
    std::fs::create_dir_all(&temp_dir).ok();

    let filename = format!("capture_{}.png", uuid::Uuid::new_v4());
    let file_path = temp_dir.join(&filename);

    // Save the cropped image
    cropped.save(&file_path)
        .map_err(|e| format!("Failed to save screenshot: {}", e))?;

    let file_path_str = file_path.to_string_lossy().to_string();

    // Close the capture overlay
    if let Some(overlay) = app.get_webview_window("capture_overlay_main") {
        let _ = overlay.close();
    }

    // Open chat widget with the screenshot
    open_chat_widget(&app, x + width as i32 / 2, y + height as i32, Some(file_path_str.clone())).await?;

    Ok(file_path_str)
}

/// Cancel the capture and close overlay
#[tauri::command]
pub async fn cancel_capture(app: AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("capture_overlay_main") {
        overlay.close().map_err(|e| format!("Failed to close overlay: {}", e))?;
    }
    Ok(())
}

/// Open the floating chat widget
pub async fn open_chat_widget(
    app: &AppHandle,
    x: i32,
    y: i32,
    screenshot_path: Option<String>,
) -> Result<(), String> {
    let widget_id = uuid::Uuid::new_v4().to_string();
    let label = format!("chat_widget_{}", &widget_id[..8]);

    // Build query params
    let mut query = format!("chat-widget=true&widget-id={}", widget_id);
    if let Some(ref path) = screenshot_path {
        query.push_str(&format!("&screenshot={}", urlencoding::encode(path)));
    }

    let url = format!("index.html?{}", query);

    // Position the widget near the capture region
    let widget_width = 400.0;
    let widget_height = 300.0;

    // Adjust position to keep on screen
    let pos_x = (x as f64 - widget_width / 2.0).max(0.0);
    let pos_y = (y as f64 + 10.0).max(0.0);

    let window = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(url.into()),
    )
    .title("")
    .inner_size(widget_width, widget_height)
    .min_inner_size(300.0, 200.0)
    .position(pos_x, pos_y)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .build()
    .map_err(|e| format!("Failed to create chat widget: {}", e))?;

    let _ = window.set_focus();

    Ok(())
}

/// Close a chat widget by ID
#[tauri::command]
pub async fn close_chat_widget(app: AppHandle, widget_id: String) -> Result<(), String> {
    // Find and close matching window
    for window in app.webview_windows().values() {
        if window.label().contains(&widget_id) {
            window.close().map_err(|e| format!("Failed to close widget: {}", e))?;
            break;
        }
    }
    Ok(())
}
