//! Sound effects playback using rodio.
//!
//! Plays bundled MP3 files for UI feedback.

use rodio::{Decoder, OutputStream, Sink};
use std::io::Cursor;
use std::thread;

// Embed the sound files at compile time
const STARTUP_MP3: &[u8] = include_bytes!("../resources/sfx/hands-startup.mp3");
const CONFIRM_MP3: &[u8] = include_bytes!("../resources/sfx/hands-confirm.mp3");
const ERROR_MP3: &[u8] = include_bytes!("../resources/sfx/hands-error.mp3");

/// Play a sound effect by name
pub fn play(name: &str) {
    let data: &'static [u8] = match name {
        "startup" => STARTUP_MP3,
        "confirm" => CONFIRM_MP3,
        "error" => ERROR_MP3,
        _ => {
            eprintln!("[sfx] Unknown sound: {}", name);
            return;
        }
    };

    // Clone the name for the error message
    let name_owned = name.to_string();

    // Play in background thread to not block
    thread::spawn(move || {
        if let Err(e) = play_bytes(data) {
            eprintln!("[sfx] Failed to play {}: {}", name_owned, e);
        }
    });
}

fn play_bytes(data: &'static [u8]) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (_stream, stream_handle) = OutputStream::try_default()?;
    let sink = Sink::try_new(&stream_handle)?;

    // Set volume to 70%
    sink.set_volume(0.7);

    let cursor = Cursor::new(data);
    let source = Decoder::new(cursor)?;

    sink.append(source);
    sink.sleep_until_end();

    Ok(())
}

/// Tauri command to play sfx from frontend
#[tauri::command]
pub fn play_sfx(name: String) {
    play(&name);
}
