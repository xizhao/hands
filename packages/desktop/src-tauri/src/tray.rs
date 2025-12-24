//! System tray management for Hands desktop app.
//!
//! Provides always-on taskbar presence with workbook quick access.

use tauri::{
    tray::{TrayIconEvent},
    menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem},
    AppHandle, Manager, Wry, Emitter,
};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::{Workbook, list_workbooks, AppState, window_manager};

/// Configure the system tray (created from tauri.conf.json)
pub fn create_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Get the tray icon that was created from config (icon loaded from tauri.conf.json trayIcon.iconPath)
    let tray = app.tray_by_id("main").ok_or("Tray icon 'main' not found - check tauri.conf.json")?;

    println!("[tray] Found tray with id 'main'");

    // Build and set the menu
    let menu = build_tray_menu(app, &[])?;
    tray.set_menu(Some(menu))?;
    println!("[tray] Menu set");

    tray.set_show_menu_on_left_click(true)?;
    tray.set_tooltip(Some("Hands"))?;

    // Set up event handlers
    tray.on_tray_icon_event(|_tray, event| {
        if let TrayIconEvent::Click { .. } = event {
            // Menu will show automatically due to set_show_menu_on_left_click
        }
    });

    let app_handle = app.clone();
    tray.on_menu_event(move |_app, event| {
        handle_menu_event(&app_handle, event.id.as_ref());
    });

    println!("[tray] System tray configured with hands logo icon");
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
            // Open/focus last workbook
            show_or_open_workbook(app, None);
        }
        "settings" => {
            // Open workbook and emit settings event
            show_or_open_workbook(app, Some("open-settings"));
        }
        "new_workbook" => {
            // Open workbook and emit new-workbook event
            show_or_open_workbook(app, Some("new-workbook"));
        }
        id if id.starts_with("workbook:") => {
            let workbook_id = id.strip_prefix("workbook:").unwrap();
            open_workbook_window_from_tray(app, workbook_id);
        }
        _ => {}
    }
}

fn show_or_open_workbook(app: &AppHandle, event: Option<&'static str>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<Arc<Mutex<AppState>>>() else { return };
        match window_manager::open_startup_workbook(&app, &state).await {
            Ok(Some(label)) => {
                if let Some(event_name) = event {
                    if let Some(window) = app.get_webview_window(&label) {
                        let _ = window.emit(event_name, ());
                    }
                }
            }
            _ => {}
        }
    });
}

fn open_workbook_window_from_tray(app: &AppHandle, workbook_id: &str) {
    let app = app.clone();
    let workbook_id = workbook_id.to_string();
    tauri::async_runtime::spawn(async move {
        if let Some(state) = app.try_state::<Arc<Mutex<AppState>>>() {
            let _ = window_manager::open_workbook(&app, &state, &workbook_id).await;
        } else {
            eprintln!("[tray] Failed to get app state");
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
