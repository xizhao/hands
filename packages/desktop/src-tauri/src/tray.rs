//! System tray management for Hands desktop app.
//!
//! Provides always-on taskbar presence with workbook quick access.

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem},
    AppHandle, Manager, Wry, Emitter,
};

use crate::{Workbook, list_workbooks};

/// Create and configure the system tray
pub fn create_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app, &[])?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .icon(app.default_window_icon().unwrap().clone())
        .icon_as_template(true)
        .tooltip("Hands")
        .on_tray_icon_event(|tray, event| {
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    // Left click: show/focus main window
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.set_focus();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
                _ => {}
            }
        })
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id.as_ref());
        })
        .build(app)?;

    Ok(())
}

/// Build the tray menu with current workbook list
fn build_tray_menu(app: &AppHandle, workbooks: &[Workbook]) -> Result<Menu<Wry>, Box<dyn std::error::Error>> {
    let mut menu_builder = MenuBuilder::new(app);

    // Quick capture action
    let capture_item = MenuItemBuilder::new("Capture Screen Region")
        .id("capture")
        .accelerator("CmdOrCtrl+Shift+H")
        .build(app)?;
    menu_builder = menu_builder.item(&capture_item);

    menu_builder = menu_builder.separator();

    // Workbooks section
    if workbooks.is_empty() {
        let no_workbooks = MenuItemBuilder::new("No workbooks")
            .id("no_workbooks")
            .enabled(false)
            .build(app)?;
        menu_builder = menu_builder.item(&no_workbooks);
    } else {
        // Build workbooks submenu
        let mut workbooks_submenu = SubmenuBuilder::new(app, "Workbooks");

        for workbook in workbooks.iter().take(10) {
            let item = MenuItemBuilder::new(&workbook.name)
                .id(format!("workbook:{}", workbook.id))
                .build(app)?;
            workbooks_submenu = workbooks_submenu.item(&item);
        }

        let workbooks_menu = workbooks_submenu.build()?;
        menu_builder = menu_builder.item(&workbooks_menu);
    }

    // New workbook
    let new_workbook = MenuItemBuilder::new("New Workbook...")
        .id("new_workbook")
        .build(app)?;
    menu_builder = menu_builder.item(&new_workbook);

    menu_builder = menu_builder.separator();

    // Show main window
    let show_window = MenuItemBuilder::new("Show Hands")
        .id("show_window")
        .build(app)?;
    menu_builder = menu_builder.item(&show_window);

    // Settings
    let settings = MenuItemBuilder::new("Settings...")
        .id("settings")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    menu_builder = menu_builder.item(&settings);

    menu_builder = menu_builder.separator();

    // Quit
    let quit = PredefinedMenuItem::quit(app, Some("Quit Hands"))?;
    menu_builder = menu_builder.item(&quit);

    Ok(menu_builder.build()?)
}

/// Handle tray menu item clicks
fn handle_menu_event(app: &AppHandle, menu_id: &str) {
    match menu_id {
        "capture" => {
            // Trigger screen capture flow
            start_capture_flow(app);
        }
        "show_window" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "settings" => {
            // Show main window and emit settings event
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("open-settings", ());
            }
        }
        "new_workbook" => {
            // Show main window - frontend handles workbook creation
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("new-workbook", ());
            }
        }
        id if id.starts_with("workbook:") => {
            let workbook_id = id.strip_prefix("workbook:").unwrap();
            open_workbook_window_from_tray(app, workbook_id);
        }
        _ => {}
    }
}

/// Open a workbook in a new window (triggered from tray)
fn open_workbook_window_from_tray(app: &AppHandle, workbook_id: &str) {
    let app = app.clone();
    let workbook_id = workbook_id.to_string();

    tauri::async_runtime::spawn(async move {
        // Emit event to frontend to handle workbook opening
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.emit("open-workbook", workbook_id);
        }
    });
}

/// Start the screen capture flow
fn start_capture_flow(app: &AppHandle) {
    let app = app.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::capture::start_capture(&app).await {
            eprintln!("[capture] Failed to start capture: {}", e);
        }
    });
}

/// Update the tray menu with current workbooks
pub async fn update_tray_menu(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Fetch current workbooks
    let workbooks = list_workbooks().await.unwrap_or_default();

    // Rebuild menu
    let menu = build_tray_menu(app, &workbooks)?;

    // Update tray menu
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}
