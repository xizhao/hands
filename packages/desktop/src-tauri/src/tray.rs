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

use crate::{Workbook, list_workbooks, create_workbook, CreateWorkbookRequest, AppState, window_manager};

/// Configure the system tray (created from tauri.conf.json)
pub fn create_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Get the tray icon that was created from config (icon loaded from tauri.conf.json trayIcon.iconPath)
    let tray = app.tray_by_id("main").ok_or("Tray icon 'main' not found - check tauri.conf.json")?;

    println!("[tray] Found tray with id 'main'");

    // Build and set the menu (no active workbook initially)
    let menu = build_tray_menu(app, &[], None)?;
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
fn build_tray_menu(app: &AppHandle, workbooks: &[Workbook], active_workbook_id: Option<&str>) -> Result<Menu<Wry>, Box<dyn std::error::Error>> {
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
            // Show checkmark for active workbook
            let is_active = active_workbook_id == Some(&workbook.id);
            let label = if is_active {
                format!("✓ {}", workbook.name)
            } else {
                format!("   {}", workbook.name)
            };
            let item = MenuItemBuilder::new(&label)
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
            // Open/focus floating chat (the primary UI)
            show_floating_chat(app);
        }
        "settings" => {
            // Open workbook and emit settings event
            show_or_open_workbook(app, Some("open-settings"));
        }
        "new_workbook" => {
            // Create a new workbook and open it
            create_and_open_workbook(app);
        }
        id if id.starts_with("workbook:") => {
            let workbook_id = id.strip_prefix("workbook:").unwrap();
            switch_active_workbook(app, workbook_id);
        }
        _ => {}
    }
}

fn show_floating_chat(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Get active workbook directory
        let workbook_dir = {
            let Some(state) = app.try_state::<Arc<Mutex<AppState>>>() else { return };
            let state = state.lock().await;
            if let Some(ref workbook_id) = state.active_workbook_id {
                // Find workbook directory
                if let Ok(workbooks) = list_workbooks().await {
                    workbooks.iter()
                        .find(|w| &w.id == workbook_id)
                        .map(|w| w.directory.clone())
                } else {
                    None
                }
            } else {
                // Use first workbook if none active
                if let Ok(workbooks) = list_workbooks().await {
                    workbooks.first().map(|w| w.directory.clone())
                } else {
                    None
                }
            }
        };

        if let Some(dir) = workbook_dir {
            if let Err(e) = crate::floating_chat::open_floating_chat(app, dir).await {
                eprintln!("[tray] Failed to open floating chat: {}", e);
            }
        } else {
            eprintln!("[tray] No workbook available for floating chat");
        }
    });
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

/// Create a new workbook and open it
fn create_and_open_workbook(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Create a new workbook
        let workbook = match create_workbook(CreateWorkbookRequest {
            name: "Untitled Notebook".to_string(),
            description: None,
        }).await {
            Ok(wb) => wb,
            Err(e) => {
                eprintln!("[tray] Failed to create workbook: {}", e);
                return;
            }
        };

        println!("[tray] Created new workbook: {}", workbook.id);

        // Open the workbook window
        let Some(state) = app.try_state::<Arc<Mutex<AppState>>>() else { return };
        if let Err(e) = window_manager::open_workbook(&app, &state, &workbook.id).await {
            eprintln!("[tray] Failed to open workbook: {}", e);
        }

        // Update tray menu to include new workbook
        if let Err(e) = update_tray_menu(&app).await {
            eprintln!("[tray] Failed to update tray menu: {}", e);
        }
    });
}

/// Switch to a different active workbook (starts runtime, updates floating chat context)
fn switch_active_workbook(app: &AppHandle, workbook_id: &str) {
    let app = app.clone();
    let workbook_id = workbook_id.to_string();
    tauri::async_runtime::spawn(async move {
        // Get workbook directory
        let workbooks = match list_workbooks().await {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[tray] Failed to list workbooks: {}", e);
                return;
            }
        };
        let workbook = match workbooks.iter().find(|w| w.id == workbook_id) {
            Some(w) => w,
            None => {
                eprintln!("[tray] Workbook not found: {}", workbook_id);
                return;
            }
        };

        // Get app state
        let Some(state) = app.try_state::<Arc<Mutex<AppState>>>() else {
            eprintln!("[tray] Failed to get app state");
            return;
        };

        // 1. Start the workbook runtime (tRPC/Vite server)
        println!("[tray] Starting runtime for workbook: {}", workbook_id);
        if let Err(e) = crate::start_workbook_server_internal(
            &app,
            &state,
            &workbook_id,
            &workbook.directory,
        ).await {
            eprintln!("[tray] Failed to start runtime: {}", e);
            // Continue anyway - runtime might already be running
        }

        // 2. Set active workbook (emits active-workbook-changed event, restarts OpenCode)
        if let Err(e) = crate::set_active_workbook_internal(&app, &workbook_id).await {
            eprintln!("[tray] Failed to switch workbook: {}", e);
            return;
        }
        println!("[tray] Switched to workbook: {}", workbook_id);

        // 3. Update tray menu to show new active workbook
        if let Err(e) = update_tray_menu(&app).await {
            eprintln!("[tray] Failed to update menu: {}", e);
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

    // Get active workbook ID
    let active_workbook_id = {
        if let Some(state) = app.try_state::<Arc<Mutex<AppState>>>() {
            let state = state.lock().await;
            state.active_workbook_id.clone()
        } else {
            None
        }
    };

    // Rebuild menu with active workbook indicator
    let menu = build_tray_menu(app, &workbooks, active_workbook_id.as_deref())?;

    // Update tray menu
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}
