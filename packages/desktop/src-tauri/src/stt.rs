//! Speech-to-text using Parakeet TDT model.
//!
//! Hold Option key to record, release to transcribe.
//! Uses batch transcription for accuracy (no streaming preview).

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use futures_util::StreamExt;
use parakeet_rs::{ParakeetTDT, Transcriber};
use std::sync::{Arc, Mutex};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};

/// Global STT state
static STT_STATE: OnceLock<Arc<Mutex<SttState>>> = OnceLock::new();

struct SttState {
    model: Option<ParakeetTDT>,
    model_path: String,
    is_recording: bool,
    /// Audio samples buffer (16kHz mono)
    audio_buffer: Vec<f32>,
}

impl SttState {
    fn new(model_path: String) -> Self {
        Self {
            model: None,
            model_path,
            is_recording: false,
            audio_buffer: Vec::new(),
        }
    }

    fn ensure_model(&mut self) -> Result<(), String> {
        if self.model.is_none() {
            println!("[stt] Loading Parakeet TDT model from: {}", self.model_path);

            // Check files exist (parakeet-rs looks for encoder-model*.onnx, decoder_joint*.onnx)
            let model_path = std::path::Path::new(&self.model_path);
            let encoder = model_path.join("encoder-model.int8.onnx");
            let decoder = model_path.join("decoder_joint-model.int8.onnx");
            let tokenizer = model_path.join("tokenizer.json");

            println!("[stt] Checking files: encoder={}, decoder={}, tokenizer={}",
                encoder.exists(), decoder.exists(), tokenizer.exists());

            if !encoder.exists() || !decoder.exists() || !tokenizer.exists() {
                return Err("Model files missing. Please download the model.".to_string());
            }

            match ParakeetTDT::from_pretrained(&self.model_path, None) {
                Ok(model) => {
                    self.model = Some(model);
                    println!("[stt] Model loaded successfully");
                    crate::sfx::play("confirm");
                }
                Err(e) => {
                    let err_msg = format!("Failed to load model: {}", e);
                    println!("[stt] {}", err_msg);
                    return Err(err_msg);
                }
            }
        }
        Ok(())
    }
}

fn get_state(app: &AppHandle) -> Arc<Mutex<SttState>> {
    STT_STATE
        .get_or_init(|| {
            // Model path in app data directory
            let model_path = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("models")
                .join("parakeet-tdt");

            Arc::new(Mutex::new(SttState::new(
                model_path.to_string_lossy().to_string(),
            )))
        })
        .clone()
}

/// Check if the STT model is available
#[tauri::command]
pub async fn stt_model_available(app: AppHandle) -> bool {
    let state = get_state(&app);
    let guard = state.lock().unwrap();

    let model_path = std::path::Path::new(&guard.model_path);
    // parakeet-rs TDT looks for encoder-model*.onnx and decoder_joint*.onnx
    let encoder_exists = model_path.join("encoder-model.int8.onnx").exists();
    let decoder_exists = model_path.join("decoder_joint-model.int8.onnx").exists();
    let tokenizer_exists = model_path.join("tokenizer.json").exists();

    encoder_exists && decoder_exists && tokenizer_exists
}

/// Get the model directory path
#[tauri::command]
pub async fn stt_model_path(app: AppHandle) -> String {
    let state = get_state(&app);
    let guard = state.lock().unwrap();
    guard.model_path.clone()
}

/// Download the STT model from HuggingFace
#[tauri::command]
pub async fn stt_download_model(app: AppHandle) -> Result<(), String> {
    let state = get_state(&app);
    let model_path = {
        let guard = state.lock().unwrap();
        guard.model_path.clone()
    };

    let model_dir = std::path::Path::new(&model_path);
    std::fs::create_dir_all(model_dir)
        .map_err(|e| format!("Failed to create model directory: {}", e))?;

    // TDT model from parakeet-rs author (compatible with the library)
    // https://huggingface.co/altunenes/parakeet-rs/tree/main/tdt
    let base_url = "https://huggingface.co/altunenes/parakeet-rs/resolve/main/tdt";

    // TDT int8 quantized model files (~670 MB total)
    // parakeet-rs looks for: encoder-model.onnx/encoder.onnx, decoder_joint-model.onnx/decoder_joint.onnx
    let files = [
        ("encoder-model.int8.onnx", "encoder-model.int8.onnx"),
        ("decoder_joint-model.int8.onnx", "decoder_joint-model.int8.onnx"),
        ("vocab.txt", "vocab.txt"),
    ];

    let client = reqwest::Client::new();

    // Calculate total size for progress
    let mut total_size: u64 = 0;
    let mut file_sizes: Vec<u64> = Vec::new();

    for (remote_name, local_name) in &files {
        let local_path = model_dir.join(local_name);
        if local_path.exists() {
            file_sizes.push(0); // Already downloaded
            continue;
        }

        let url = format!("{}/{}", base_url, remote_name);
        let head_response = client.head(&url).send().await.ok();
        let size = head_response
            .and_then(|r| r.headers().get("content-length")?.to_str().ok()?.parse().ok())
            .unwrap_or(0);
        file_sizes.push(size);
        total_size += size;
    }

    let mut downloaded: u64 = 0;

    for (remote_name, local_name) in files.iter() {
        let local_path = model_dir.join(local_name);
        if local_path.exists() {
            println!("[stt] {} already exists, skipping", local_name);
            continue;
        }

        let url = format!("{}/{}", base_url, remote_name);
        println!("[stt] Downloading {} -> {}", remote_name, local_name);

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to download {}: {}", remote_name, e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to download {}: HTTP {}", remote_name, response.status()));
        }

        // Stream download with progress
        let mut file = std::fs::File::create(&local_path)
            .map_err(|e| format!("Failed to create {}: {}", local_name, e))?;

        let mut stream = response.bytes_stream();
        let mut file_downloaded: u64 = 0;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
            std::io::Write::write_all(&mut file, &chunk)
                .map_err(|e| format!("Write error: {}", e))?;

            file_downloaded += chunk.len() as u64;
            downloaded += chunk.len() as u64;

            // Emit progress (0.0 to 1.0)
            if total_size > 0 {
                let progress = downloaded as f64 / total_size as f64;
                let _ = app.emit("stt:download-progress", progress);
            }
        }

        println!("[stt] Downloaded {} ({} bytes)", local_name, file_downloaded);
    }

    // Emit complete
    let _ = app.emit("stt:download-progress", 1.0_f64);

    // Generate tokenizer.json from vocab.txt (parakeet-rs needs HuggingFace tokenizer format)
    let tokenizer_path = model_dir.join("tokenizer.json");
    if !tokenizer_path.exists() {
        let vocab_path = model_dir.join("vocab.txt");
        if vocab_path.exists() {
            println!("[stt] Generating tokenizer.json from vocab.txt...");
            generate_tokenizer_json(&vocab_path, &tokenizer_path)?;
            println!("[stt] Generated tokenizer.json");
        }
    }

    println!("[stt] Model download complete!");
    Ok(())
}

/// Generate HuggingFace tokenizer.json from vocab.txt
fn generate_tokenizer_json(vocab_path: &std::path::Path, output_path: &std::path::Path) -> Result<(), String> {
    let vocab_content = std::fs::read_to_string(vocab_path)
        .map_err(|e| format!("Failed to read vocab.txt: {}", e))?;

    // Parse vocab.txt: each line is "token score" or just "token"
    let mut vocab: Vec<(String, f64)> = Vec::new();
    for (i, line) in vocab_content.lines().enumerate() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if !parts.is_empty() {
            let token = parts[0].to_string();
            let score = parts.get(1).and_then(|s| s.parse::<f64>().ok()).unwrap_or(-(i as f64));
            vocab.push((token, score));
        }
    }

    // Build tokenizer.json in HuggingFace Unigram format
    let vocab_json: Vec<serde_json::Value> = vocab.iter()
        .map(|(token, score)| serde_json::json!([token, *score]))
        .collect();

    let unk_id = vocab.iter().position(|(t, _)| t == "<unk>").unwrap_or(0);

    let tokenizer = serde_json::json!({
        "version": "1.0",
        "truncation": null,
        "padding": null,
        "added_tokens": [
            {
                "id": unk_id,
                "content": "<unk>",
                "single_word": false,
                "lstrip": false,
                "rstrip": false,
                "normalized": false,
                "special": true
            }
        ],
        "normalizer": {
            "type": "Sequence",
            "normalizers": []
        },
        "pre_tokenizer": null,
        "post_processor": null,
        "decoder": {
            "type": "Metaspace",
            "replacement": "▁",
            "add_prefix_space": true
        },
        "model": {
            "type": "Unigram",
            "unk_id": unk_id,
            "vocab": vocab_json
        }
    });

    let json_str = serde_json::to_string_pretty(&tokenizer)
        .map_err(|e| format!("Failed to serialize tokenizer: {}", e))?;

    std::fs::write(output_path, json_str)
        .map_err(|e| format!("Failed to write tokenizer.json: {}", e))?;

    Ok(())
}

/// Start recording audio for STT
#[tauri::command]
pub async fn stt_start_recording(app: AppHandle) -> Result<(), String> {
    let state = get_state(&app);

    // Ensure model is loaded
    {
        let mut guard = state.lock().unwrap();

        // Prevent double-start
        if guard.is_recording {
            println!("[stt] Already recording, ignoring start request");
            return Ok(());
        }

        println!("[stt] Loading model...");
        guard.ensure_model()?;
        println!("[stt] Model ready, starting recording");
        guard.is_recording = true;
        guard.audio_buffer.clear();
    }

    // Start audio capture in background
    let state_clone = state.clone();
    std::thread::spawn(move || {
        println!("[stt] Audio capture thread started");
        if let Err(e) = capture_audio(state_clone) {
            eprintln!("[stt] Audio capture error: {}", e);
        }
        println!("[stt] Audio capture thread ended");
    });

    println!("[stt] Recording started");
    Ok(())
}

/// Stop recording and return final transcription
#[tauri::command]
pub async fn stt_stop_recording(app: AppHandle) -> Result<String, String> {
    let state = get_state(&app);
    let mut guard = state.lock().unwrap();

    // Prevent double-stop
    if !guard.is_recording {
        println!("[stt] Not recording, ignoring stop request");
        return Ok(String::new());
    }

    guard.is_recording = false;
    let total_samples = guard.audio_buffer.len();
    let duration_ms = (total_samples as f32 / 16.0) as usize; // 16kHz
    println!("[stt] Recording stopped: {} samples ({}ms)", total_samples, duration_ms);

    // Batch transcribe all audio
    let audio: Vec<f32> = guard.audio_buffer.drain(..).collect();
    if audio.is_empty() {
        println!("[stt] No audio captured");
        return Ok(String::new());
    }

    let final_text = if let Some(ref mut model) = guard.model {
        println!("[stt] Transcribing {} samples...", audio.len());
        // transcribe_samples(audio, sample_rate, channels, timestamp_mode)
        match model.transcribe_samples(audio, 16000, 1, None) {
            Ok(result) => {
                // Clean up SentencePiece markers (▁ -> space)
                result.text.replace('▁', " ").trim().to_string()
            }
            Err(e) => {
                eprintln!("[stt] Transcription error: {}", e);
                return Err(format!("Transcription failed: {}", e));
            }
        }
    } else {
        return Err("Model not loaded".to_string());
    };

    println!("[stt] Final transcription: {}", final_text);
    Ok(final_text)
}

/// Cancel recording without transcribing (used when Option+other key is pressed)
#[tauri::command]
pub async fn stt_cancel_recording(app: AppHandle) -> Result<(), String> {
    let state = get_state(&app);
    let mut guard = state.lock().unwrap();

    if !guard.is_recording {
        return Ok(());
    }

    println!("[stt] Recording cancelled");
    guard.is_recording = false;
    guard.audio_buffer.clear();
    Ok(())
}

/// Check if currently recording
#[tauri::command]
pub async fn stt_is_recording(app: AppHandle) -> bool {
    let state = get_state(&app);
    let guard = state.lock().unwrap();
    guard.is_recording
}

/// Capture audio (accumulates samples for batch transcription)
fn capture_audio(state: Arc<Mutex<SttState>>) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("No input device available")?;

    println!("[stt] Using input device: {}", device.name().unwrap_or_default());

    let default_config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {}", e))?;

    let sample_rate = default_config.sample_rate().0;
    let channels = default_config.channels();

    let config = cpal::StreamConfig {
        channels,
        sample_rate: cpal::SampleRate(sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    // Resampling ratio to 16kHz (what the model expects)
    let resample_ratio = 16000.0 / sample_rate as f64;

    let state_clone = state.clone();
    let err_fn = |err| eprintln!("[stt] Audio stream error: {}", err);

    let stream = device
        .build_input_stream(
            &config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                let mut guard = state_clone.lock().unwrap();
                if !guard.is_recording {
                    return;
                }

                // Convert to mono if stereo
                let mono: Vec<f32> = if channels == 2 {
                    data.chunks(2).map(|c| (c[0] + c[1]) / 2.0).collect()
                } else {
                    data.to_vec()
                };

                // Resample to 16kHz
                let resampled: Vec<f32> = (0..((mono.len() as f64 * resample_ratio) as usize))
                    .map(|i| {
                        let src_idx = (i as f64 / resample_ratio) as usize;
                        mono.get(src_idx).copied().unwrap_or(0.0)
                    })
                    .collect();

                guard.audio_buffer.extend_from_slice(&resampled);
            },
            err_fn,
            None,
        )
        .map_err(|e| format!("Failed to build input stream: {}", e))?;

    println!("[stt] Audio stream built ({}Hz {}ch -> 16kHz mono)", sample_rate, channels);
    stream.play().map_err(|e| format!("Failed to play stream: {}", e))?;
    println!("[stt] Recording...");

    // Keep the stream alive while recording
    loop {
        std::thread::sleep(std::time::Duration::from_millis(50));
        let guard = state.lock().unwrap();
        if !guard.is_recording {
            break;
        }
    }

    Ok(())
}
