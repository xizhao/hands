use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

use crate::{get_workbook, list_workbooks, AppState};

const STORE_NAME: &str = "window-state.json";
const LAST_WORKBOOK_KEY: &str = "last_opened_workbook";

pub fn window_label(workbook_id: &str) -> String {
    format!("workbook_{}", workbook_id)
}

pub fn get_last_workbook(app: &AppHandle) -> Option<String> {
    if let Ok(store) = app.store(STORE_NAME) {
        store.get(LAST_WORKBOOK_KEY)
            .and_then(|v| v.as_str().map(|s| s.to_string()))
    } else {
        None
    }
}

pub fn set_last_workbook(app: &AppHandle, workbook_id: &str) {
    if let Ok(store) = app.store(STORE_NAME) {
        let _ = store.set(LAST_WORKBOOK_KEY, serde_json::json!(workbook_id));
        let _ = store.save();
    }
}

pub async fn open_workbook(
    app: &AppHandle,
    state: &Arc<Mutex<AppState>>,
    workbook_id: &str,
) -> Result<String, String> {
    let label = window_label(workbook_id);

    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        // Emit event so FloatingChat hides (even when showing existing window)
        let _ = app.emit("workbook-opened", workbook_id);
        return Ok(label);
    }

    let workbook = get_workbook(workbook_id.to_string()).await?;
    let url = format!("index.html?workbook={}", workbook_id);

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title(&workbook.name)
        .inner_size(900.0, 700.0)
        .min_inner_size(600.0, 400.0)
        .decorations(true)
        .transparent(false)
        .resizable(true)
        .shadow(true)
        .center()
        // Disable Tauri's native drag-drop to allow react-dnd HTML5 backend to work
        .disable_drag_drop_handler();

    #[cfg(target_os = "macos")]
    {
        use tauri::LogicalPosition;
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(LogicalPosition::new(16.0, 18.0));
    }

    builder
        .build()
        .map_err(|e| format!("Failed to create workbook window: {}", e))?;

    {
        let mut state_guard = state.lock().await;
        state_guard.runtime_manager.register_window(workbook_id, label.clone());
    }

    set_last_workbook(app, workbook_id);
    let _ = app.emit("workbook-opened", workbook_id);

    Ok(label)
}

pub async fn open_startup_workbook(
    app: &AppHandle,
    state: &Arc<Mutex<AppState>>,
) -> Result<Option<String>, String> {
    if let Some(workbook_id) = get_last_workbook(app) {
        if get_workbook(workbook_id.clone()).await.is_ok() {
            return Ok(Some(open_workbook(app, state, &workbook_id).await?));
        }
    }

    let workbooks = list_workbooks().await.unwrap_or_default();
    if let Some(first) = workbooks.first() {
        return Ok(Some(open_workbook(app, state, &first.id).await?));
    }

    Ok(None)
}

pub fn focus_workbook(app: &AppHandle, workbook_id: &str) -> bool {
    let label = window_label(workbook_id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.show();
        let _ = window.set_focus();
        // Emit event so FloatingChat hides
        let _ = app.emit("workbook-opened", workbook_id);
        true
    } else {
        false
    }
}
