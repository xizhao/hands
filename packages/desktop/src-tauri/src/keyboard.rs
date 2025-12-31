//! Global keyboard listener for Option key detection.
//!
//! Uses device_query (polling-based) to detect Option key press/release for STT activation.
//! - Option press ALONE: Show floating chat + start STT recording
//! - Option release: Stop recording, transcribe, insert text
//! - Option+Space: Toggle text input focus / hide window
//! - Option+other key: Ignored (allows Option+C, Option+V, etc. to work normally)

use device_query::{DeviceQuery, DeviceState, Keycode};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Tracks whether Option is currently held
static OPTION_HELD: AtomicBool = AtomicBool::new(false);
/// Tracks whether Space was pressed while Option was held
static SPACE_PRESSED_WITH_OPTION: AtomicBool = AtomicBool::new(false);
/// Tracks whether another key was pressed with Option (makes it a combo, not STT trigger)
static OTHER_KEY_WITH_OPTION: AtomicBool = AtomicBool::new(false);
/// Shutdown flag for the keyboard listener thread
static SHUTDOWN: AtomicBool = AtomicBool::new(false);

/// Check if only Option key(s) are pressed (no other keys)
fn is_option_alone(keys: &[Keycode]) -> bool {
    keys.iter().all(|k| matches!(k, Keycode::LOption | Keycode::ROption))
}

/// Start the global keyboard listener using device_query (polling-based)
pub fn start_keyboard_listener(app: AppHandle) {
    // Reset shutdown flag in case of restart
    SHUTDOWN.store(false, Ordering::SeqCst);

    let app_handle = app.clone();

    thread::spawn(move || {
        let device_state = DeviceState::new();
        let mut prev_option_held = false;
        let mut prev_space_held = false;
        let mut stt_started = false;

        println!("[keyboard] Listener thread started");

        while !SHUTDOWN.load(Ordering::SeqCst) {
            let keys: Vec<Keycode> = device_state.get_keys();

            // Check if Option is held - on macOS it's LOption/ROption
            let option_held = keys.contains(&Keycode::LOption)
                || keys.contains(&Keycode::ROption);
            let space_held = keys.contains(&Keycode::Space);
            let option_alone = is_option_alone(&keys);

            // Option key pressed (transition from not held to held)
            if option_held && !prev_option_held {
                OPTION_HELD.store(true, Ordering::SeqCst);
                SPACE_PRESSED_WITH_OPTION.store(false, Ordering::SeqCst);
                OTHER_KEY_WITH_OPTION.store(false, Ordering::SeqCst);
                stt_started = false;

                // Only trigger STT if Option is pressed alone
                if option_alone {
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
                    stt_started = true;
                }
            }

            // If Option is held and another key is pressed, mark as combo (not STT)
            if option_held && !option_alone && !space_held {
                if !OTHER_KEY_WITH_OPTION.load(Ordering::SeqCst) {
                    OTHER_KEY_WITH_OPTION.store(true, Ordering::SeqCst);
                    // Cancel STT if it was started
                    if stt_started {
                        let _ = app_handle.emit("option-key-cancelled", ());
                        stt_started = false;
                    }
                }
            }

            // Space pressed while Option is held
            if space_held && !prev_space_held && option_held {
                SPACE_PRESSED_WITH_OPTION.store(true, Ordering::SeqCst);
                let _ = app_handle.emit("option-space-pressed", ());
            }

            // Option key released (transition from held to not held)
            if !option_held && prev_option_held {
                OPTION_HELD.store(false, Ordering::SeqCst);

                // Always emit release event to stop STT recording
                // The frontend will handle whether to transcribe or cancel
                let _ = app_handle.emit("option-key-released", ());

                stt_started = false;
                SPACE_PRESSED_WITH_OPTION.store(false, Ordering::SeqCst);
                OTHER_KEY_WITH_OPTION.store(false, Ordering::SeqCst);
            }

            prev_option_held = option_held;
            prev_space_held = space_held;

            // Poll every 10ms (100Hz) - low latency but minimal CPU
            thread::sleep(Duration::from_millis(10));
        }

        println!("[keyboard] Listener thread stopped");
    });
}

/// Stop the keyboard listener thread.
/// Call this on app shutdown to prevent resource leaks.
pub fn stop_keyboard_listener() {
    SHUTDOWN.store(true, Ordering::SeqCst);
}

/// Check if Option key is currently held
pub fn is_option_held() -> bool {
    OPTION_HELD.load(Ordering::SeqCst)
}
