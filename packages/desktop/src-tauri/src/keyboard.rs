//! Global keyboard listener for Option key detection.
//!
//! Uses device_query (polling-based) to detect Option key press/release for STT activation.
//! - Option press: Show floating chat + start STT recording
//! - Option release: Stop recording, transcribe, insert text
//! - Option+Space: Toggle text input focus / hide window

use device_query::{DeviceQuery, DeviceState, Keycode};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// Tracks whether Option is currently held
static OPTION_HELD: AtomicBool = AtomicBool::new(false);
/// Tracks whether Space was pressed while Option was held
static SPACE_PRESSED_WITH_OPTION: AtomicBool = AtomicBool::new(false);

/// Start the global keyboard listener using device_query (polling-based)
pub fn start_keyboard_listener(app: AppHandle) {
    let app_handle = app.clone();

    thread::spawn(move || {
        let device_state = DeviceState::new();
        let mut option_press_time: Option<Instant> = None;
        let mut prev_option_held = false;
        let mut prev_space_held = false;

        loop {
            let keys: Vec<Keycode> = device_state.get_keys();

            // Check if Option is held - on macOS it's LOption/ROption
            let option_held = keys.contains(&Keycode::LOption)
                || keys.contains(&Keycode::ROption);
            let space_held = keys.contains(&Keycode::Space);

            // Option key pressed (transition from not held to held)
            if option_held && !prev_option_held {
                OPTION_HELD.store(true, Ordering::SeqCst);
                option_press_time = Some(Instant::now());
                SPACE_PRESSED_WITH_OPTION.store(false, Ordering::SeqCst);

                // Show floating chat window
                let app_for_show = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(window) = app_for_show.get_webview_window("floating_chat") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });

                // Emit event to start STT
                let _ = app_handle.emit("option-key-pressed", ());
            }

            // Space pressed while Option is held
            if space_held && !prev_space_held && option_held {
                SPACE_PRESSED_WITH_OPTION.store(true, Ordering::SeqCst);
                let _ = app_handle.emit("option-space-pressed", ());
            }

            // Option key released (transition from held to not held)
            if !option_held && prev_option_held {
                OPTION_HELD.store(false, Ordering::SeqCst);

                // Check if this was a quick tap vs hold
                let was_quick_tap = option_press_time
                    .map(|t| t.elapsed() < Duration::from_millis(200))
                    .unwrap_or(false);

                // Only trigger STT completion if Space wasn't pressed
                if !SPACE_PRESSED_WITH_OPTION.load(Ordering::SeqCst) {
                    if was_quick_tap {
                        let _ = app_handle.emit("option-key-tapped", ());
                    } else {
                        let _ = app_handle.emit("option-key-released", ());
                    }
                }

                option_press_time = None;
                SPACE_PRESSED_WITH_OPTION.store(false, Ordering::SeqCst);
            }

            prev_option_held = option_held;
            prev_space_held = space_held;

            // Poll every 10ms (100Hz) - low latency but minimal CPU
            thread::sleep(Duration::from_millis(10));
        }
    });
}

/// Check if Option key is currently held
pub fn is_option_held() -> bool {
    OPTION_HELD.load(Ordering::SeqCst)
}
