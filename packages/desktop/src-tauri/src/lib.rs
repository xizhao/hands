use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};
use tauri_plugin_store::StoreExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

// Port configuration - matches packages/workbook-server/src/ports.ts
// All ports use 5-digit scheme with configurable prefix (default 55xxx)
const PORT_PREFIX: u16 = 55;
// const PORT_RUNTIME: u16 = PORT_PREFIX * 1000;        // 55000
// const PORT_POSTGRES: u16 = PORT_PREFIX * 1000 + 100; // 55100
// const PORT_WORKER: u16 = PORT_PREFIX * 1000 + 200;   // 55200
const PORT_OPENCODE: u16 = PORT_PREFIX * 1000 + 300;    // 55300

// Workbook server process info
#[derive(Debug)]
pub struct WorkbookServerProcess {
    pub child: Child,
    pub runtime_port: u16,
    pub directory: String,
    pub restart_count: u32,
}

// App state - now just tracks runtime processes and opencode server
pub struct AppState {
    pub server: Option<Child>,
    pub workbook_servers: HashMap<String, WorkbookServerProcess>, // workbook_id -> server process
    pub active_workbook_id: Option<String>,        // currently active workbook
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub healthy: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseStatus {
    pub connected: bool,
    pub message: String,
    pub port: u16,
    pub database: String,
}

// Workbook - a discrete project environment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workbook {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub directory: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub last_opened_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkbookRequest {
    pub name: String,
    pub description: Option<String>,
}

fn get_hands_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let hands_dir = home.join(".hands");
    if !hands_dir.exists() {
        fs::create_dir_all(&hands_dir).map_err(|e| format!("Failed to create .hands directory: {}", e))?;
    }
    Ok(hands_dir)
}

fn get_workbook_dir(id: &str) -> Result<PathBuf, String> {
    Ok(get_hands_dir()?.join(id))
}

fn save_workbook_config(workbook: &Workbook) -> Result<(), String> {
    let workbook_dir = PathBuf::from(&workbook.directory);
    let package_path = workbook_dir.join("package.json");

    let mut package: serde_json::Value = if package_path.exists() {
        let content = fs::read_to_string(&package_path)
            .map_err(|e| format!("Failed to read package.json: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse package.json: {}", e))?
    } else {
        serde_json::json!({
            "name": workbook.name.to_lowercase().replace(" ", "-"),
            "version": "0.0.1",
            "private": true
        })
    };

    package["hands"] = serde_json::json!({
        "id": workbook.id,
        "name": workbook.name,
        "description": workbook.description,
        "createdAt": workbook.created_at,
        "updatedAt": workbook.updated_at,
        "lastOpenedAt": workbook.last_opened_at
    });

    let content = serde_json::to_string_pretty(&package)
        .map_err(|e| format!("Failed to serialize package.json: {}", e))?;
    fs::write(&package_path, content)
        .map_err(|e| format!("Failed to write package.json: {}", e))
}

fn read_workbook_config(workbook_dir: &PathBuf) -> Option<Workbook> {
    let package_path = workbook_dir.join("package.json");
    if !package_path.exists() {
        return None;
    }

    let content = fs::read_to_string(&package_path).ok()?;
    let package: serde_json::Value = serde_json::from_str(&content).ok()?;
    let hands = package.get("hands")?;

    Some(Workbook {
        id: hands.get("id")?.as_str()?.to_string(),
        name: hands.get("name")?.as_str()?.to_string(),
        description: hands.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
        directory: workbook_dir.to_string_lossy().to_string(),
        created_at: hands.get("createdAt")?.as_u64()?,
        updated_at: hands.get("updatedAt")?.as_u64()?,
        last_opened_at: hands.get("lastOpenedAt")?.as_u64()?,
    })
}

/// Initialize workbook by calling the shared TypeScript implementation.
/// This ensures CLI and desktop app create identical workbook structures.
fn init_workbook(workbook_dir: &PathBuf, name: &str, _description: Option<&str>) -> Result<(), String> {
    // Get the config CLI script path (relative to CARGO_MANIFEST_DIR which is src-tauri)
    let config_script = format!("{}/../../workbook-server/src/config/cli.ts", env!("CARGO_MANIFEST_DIR"));

    let output = std::process::Command::new("bun")
        .args([
            "run",
            &config_script,
            "init",
            &format!("--name={}", name),
            &format!("--dir={}", workbook_dir.to_string_lossy()),
        ])
        .output()
        .map_err(|e| format!("Failed to run init script: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Init failed: {} {}", stderr, stdout));
    }

    Ok(())
}

#[tauri::command]
async fn create_workbook(
    request: CreateWorkbookRequest,
) -> Result<Workbook, String> {
    let slug = request.name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let id = format!("{}-{:x}", slug, timestamp % 0xFFFF);

    let workbook_dir = get_workbook_dir(&id)?;
    fs::create_dir_all(&workbook_dir).map_err(|e| format!("Failed to create workbook directory: {}", e))?;

    // Initialize git repo
    let output = std::process::Command::new("git")
        .args(["init"])
        .current_dir(&workbook_dir)
        .output()
        .map_err(|e| format!("Failed to initialize git: {}", e))?;

    if !output.status.success() {
        return Err(format!("Git init failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    // Create project structure from template
    init_workbook(&workbook_dir, &request.name, request.description.as_deref())?;

    let now = timestamp as u64;
    let workbook = Workbook {
        id: id.clone(),
        name: request.name,
        description: request.description,
        directory: workbook_dir.to_string_lossy().to_string(),
        created_at: now,
        updated_at: now,
        last_opened_at: now,
    };

    save_workbook_config(&workbook)?;

    Ok(workbook)
}

/// List all workbooks by scanning ~/.hands directories
#[tauri::command]
async fn list_workbooks() -> Result<Vec<Workbook>, String> {
    let hands_dir = get_hands_dir()?;
    let mut workbooks: Vec<Workbook> = Vec::new();

    let entries = fs::read_dir(&hands_dir)
        .map_err(|e| format!("Failed to read hands directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        let dir_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // Skip hidden directories
        if dir_name.starts_with('.') {
            continue;
        }

        // Try to read workbook config from package.json
        if let Some(workbook) = read_workbook_config(&path) {
            workbooks.push(workbook);
        } else {
            // Create config for legacy/uninitialized directories
            let metadata = fs::metadata(&path).ok();
            let created = metadata.as_ref()
                .and_then(|m| m.created().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            let workbook = Workbook {
                id: dir_name.clone(),
                name: dir_name,
                description: None,
                directory: path.to_string_lossy().to_string(),
                created_at: created,
                updated_at: created,
                last_opened_at: created,
            };

            // Save config so it's recognized next time
            let _ = save_workbook_config(&workbook);
            workbooks.push(workbook);
        }
    }

    // Sort by last opened (most recent first)
    workbooks.sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));

    Ok(workbooks)
}

#[tauri::command]
async fn get_workbook(id: String) -> Result<Workbook, String> {
    let workbook_dir = get_workbook_dir(&id)?;

    if !workbook_dir.exists() {
        return Err(format!("Workbook {} not found", id));
    }

    if let Some(workbook) = read_workbook_config(&workbook_dir) {
        return Ok(workbook);
    }

    let metadata = fs::metadata(&workbook_dir).ok();
    let created = metadata.as_ref()
        .and_then(|m| m.created().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let workbook = Workbook {
        id: id.clone(),
        name: id,
        description: None,
        directory: workbook_dir.to_string_lossy().to_string(),
        created_at: created,
        updated_at: created,
        last_opened_at: created,
    };

    let _ = save_workbook_config(&workbook);
    Ok(workbook)
}

#[tauri::command]
async fn update_workbook(workbook: Workbook) -> Result<Workbook, String> {
    let workbook_dir = get_workbook_dir(&workbook.id)?;

    if !workbook_dir.exists() {
        return Err(format!("Workbook {} not found", workbook.id));
    }

    save_workbook_config(&workbook)?;

    Ok(workbook)
}

#[tauri::command]
async fn delete_workbook(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    id: String,
) -> Result<bool, String> {
    // Stop runtime if running
    {
        let mut state = state.lock().await;
        if let Some(mut runtime) = state.workbook_servers.remove(&id) {
            // Call /stop endpoint first for graceful shutdown
            let stop_url = format!("http://localhost:{}/stop", runtime.runtime_port);
            let _ = reqwest::Client::new()
                .post(&stop_url)
                .send()
                .await;
            // Then kill the process
            let _ = runtime.child.kill().await;
        }
    }

    let workbook_dir = get_workbook_dir(&id)?;

    if workbook_dir.exists() {
        fs::remove_dir_all(&workbook_dir)
            .map_err(|e| format!("Failed to delete workbook: {}", e))?;
    }

    Ok(true)
}

// Runtime status from the runtime server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeStatus {
    #[serde(rename = "workbookId")]
    pub workbook_id: String,
    #[serde(rename = "workbookDir")]
    pub workbook_dir: String,
    #[serde(rename = "runtimePort")]
    pub runtime_port: u16,
    #[serde(rename = "startedAt")]
    pub started_at: u64,
    pub services: RuntimeServices,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeServices {
    pub postgres: ServiceStatus,
    pub worker: ServiceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatus {
    pub up: bool,
    pub port: u16,
    pub pid: Option<u32>,
    pub error: Option<String>,
}

// Workbook server ready message from stdout
#[derive(Debug, Clone, Deserialize)]
struct WorkbookServerReady {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(rename = "runtimePort")]
    runtime_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevServerStatus {
    pub running: bool,
    pub workbook_id: String,
    pub directory: String,
    pub runtime_port: u16,
    pub message: String,
}

/// Kill processes listening on a specific port
fn kill_processes_on_port(port: u16) {
    if let Ok(output) = std::process::Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .output()
    {
        if output.status.success() {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                if let Ok(pid_num) = pid.trim().parse::<i32>() {
                    println!("[cleanup] Killing process {} on port {}", pid_num, port);
                    let _ = std::process::Command::new("kill")
                        .args(["-9", &pid_num.to_string()])
                        .output();
                }
            }
        }
    }
}

/// Force cleanup any stale runtime lockfile and processes
async fn force_cleanup_workbook_server() {
    // Get lockfile path (macOS: ~/Library/Application Support/Hands/runtime.lock)
    let lock_path = std::env::var("HOME").ok().map(|h| {
        PathBuf::from(h).join("Library/Application Support/Hands/runtime.lock")
    });

    if let Some(path) = lock_path {
        if path.exists() {
            // Read the lockfile to get PIDs and ports
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(lock) = serde_json::from_str::<serde_json::Value>(&content) {
                    // Kill the runtime process by PID
                    if let Some(pid) = lock.get("pid").and_then(|v| v.as_i64()) {
                        println!("[cleanup] Killing stale runtime PID {}", pid);
                        let _ = std::process::Command::new("kill")
                            .args(["-9", &pid.to_string()])
                            .output();
                    }
                    // Kill postgres by PID
                    if let Some(pid) = lock.get("postgresPid").and_then(|v| v.as_i64()) {
                        println!("[cleanup] Killing stale postgres PID {}", pid);
                        let _ = std::process::Command::new("kill")
                            .args(["-9", &pid.to_string()])
                            .output();
                    }
                    // Kill wrangler by PID
                    if let Some(pid) = lock.get("wranglerPid").and_then(|v| v.as_i64()) {
                        println!("[cleanup] Killing stale wrangler PID {}", pid);
                        let _ = std::process::Command::new("kill")
                            .args(["-9", &pid.to_string()])
                            .output();
                    }

                    // Also kill by port (in case PIDs are stale but processes respawned)
                    if let Some(port) = lock.get("postgresPort").and_then(|v| v.as_u64()) {
                        kill_processes_on_port(port as u16);
                    }
                    if let Some(port) = lock.get("wranglerPort").and_then(|v| v.as_u64()) {
                        kill_processes_on_port(port as u16);
                    }
                    if let Some(port) = lock.get("runtimePort").and_then(|v| v.as_u64()) {
                        kill_processes_on_port(port as u16);
                    }
                }
            }
            // Remove the lockfile
            println!("[cleanup] Removing stale lockfile: {:?}", path);
            let _ = std::fs::remove_file(&path);
            // Wait for processes to die
            tokio::time::sleep(Duration::from_millis(1000)).await;
        }
    }

    // Also cleanup postmaster.pid files that might be stale
    if let Some(home) = std::env::var("HOME").ok() {
        let hands_dir = PathBuf::from(&home).join(".hands");
        if hands_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&hands_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let postmaster_pid = entry.path().join("postgres/postmaster.pid");
                    if postmaster_pid.exists() {
                        println!("[cleanup] Removing stale postmaster.pid: {:?}", postmaster_pid);
                        let _ = std::fs::remove_file(&postmaster_pid);
                    }
                }
            }
        }
    }
}

/// Internal helper to spawn and wait for runtime ready
async fn spawn_workbook_server(
    workbook_id: &str,
    directory: &str,
    env_vars: HashMap<String, String>,
) -> Result<(Child, u16), String> {
    // Force cleanup any stale processes before starting
    force_cleanup_workbook_server().await;

    // Get the workbook-server script path (relative to CARGO_MANIFEST_DIR which is src-tauri)
    let runtime_script = format!("{}/../../workbook-server/src/index.ts", env!("CARGO_MANIFEST_DIR"));

    // Start hands-runtime process - run from the workbook directory
    let mut child = Command::new("bun")
        .args([
            "run",
            &runtime_script,
            &format!("--workbook-id={}", workbook_id),
            &format!("--workbook-dir={}", directory),
        ])
        .envs(&env_vars)
        .current_dir(directory)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to start runtime: {}", e))?;

    // Read stdout to get the ready message with port info
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let mut reader = BufReader::new(stdout).lines();

    // Wait for ready message (with timeout)
    let timeout_result = tokio::time::timeout(Duration::from_secs(60), async {
        while let Ok(Some(line)) = reader.next_line().await {
            println!("[runtime] {}", line);

            // Try to parse as ready message
            if line.starts_with('{') {
                if let Ok(ready) = serde_json::from_str::<WorkbookServerReady>(&line) {
                    if ready.msg_type == "ready" {
                        return Ok((ready.runtime_port, reader));
                    }
                }
            }
        }
        Err("Runtime exited without ready message".to_string())
    }).await;

    match timeout_result {
        Ok(Ok((runtime_port, mut reader))) => {
            // Continue reading stdout in background to show Vite logs
            tokio::spawn(async move {
                while let Ok(Some(line)) = reader.next_line().await {
                    println!("[runtime] {}", line);
                }
            });
            Ok((child, runtime_port))
        }
        Ok(Err(e)) => {
            let _ = child.kill().await;
            Err(e)
        }
        Err(_) => {
            let _ = child.kill().await;
            Err("Timeout waiting for runtime to start".to_string())
        }
    }
}

/// Start runtime monitoring task that auto-restarts crashed runtimes
fn start_workbook_server_monitor(state: Arc<Mutex<AppState>>, app: tauri::AppHandle) {
    const MAX_RESTARTS: u32 = 5;
    const RESTART_DELAY_MS: u64 = 2000;

    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;

            let mut state_guard = state.lock().await;

            // Collect workbooks that need restart
            let mut to_restart: Vec<(String, String, u32)> = Vec::new();

            for (workbook_id, runtime) in state_guard.workbook_servers.iter_mut() {
                // Check if process has exited
                match runtime.child.try_wait() {
                    Ok(Some(status)) => {
                        // Process exited
                        if runtime.restart_count < MAX_RESTARTS {
                            println!(
                                "[monitor] Runtime for {} exited with {:?}, will restart (attempt {}/{})",
                                workbook_id, status, runtime.restart_count + 1, MAX_RESTARTS
                            );
                            to_restart.push((
                                workbook_id.clone(),
                                runtime.directory.clone(),
                                runtime.restart_count + 1,
                            ));
                        } else {
                            eprintln!(
                                "[monitor] Runtime for {} exceeded max restarts ({}), giving up",
                                workbook_id, MAX_RESTARTS
                            );
                        }
                    }
                    Ok(None) => {
                        // Still running, all good
                    }
                    Err(e) => {
                        eprintln!("[monitor] Error checking runtime {}: {}", workbook_id, e);
                    }
                }
            }

            // Remove dead runtimes before restarting
            for (workbook_id, _, _) in &to_restart {
                state_guard.workbook_servers.remove(workbook_id);
            }

            // Drop lock before spawning new processes
            drop(state_guard);

            // Restart crashed runtimes
            for (workbook_id, directory, restart_count) in to_restart {
                tokio::time::sleep(Duration::from_millis(RESTART_DELAY_MS)).await;

                println!("[monitor] Restarting runtime for {}...", workbook_id);

                let env_vars = get_api_keys_from_store(&app);
                match spawn_workbook_server(&workbook_id, &directory, env_vars).await {
                    Ok((child, runtime_port)) => {
                        let mut state_guard = state.lock().await;
                        state_guard.workbook_servers.insert(workbook_id.clone(), WorkbookServerProcess {
                            child,
                            runtime_port,
                            directory,
                            restart_count,
                        });
                        println!(
                            "[monitor] Runtime restarted for {} on port {}",
                            workbook_id, runtime_port
                        );
                    }
                    Err(e) => {
                        eprintln!("[monitor] Failed to restart runtime for {}: {}", workbook_id, e);
                    }
                }
            }
        }
    });
}

/// Start the hands-runtime for a workbook
#[tauri::command]
async fn start_workbook_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
    directory: String,
) -> Result<DevServerStatus, String> {
    println!("[tauri] start_workbook_server: {} at {}", workbook_id, directory);

    // Stop ALL existing runtimes first (they share port 55000)
    {
        let mut state_guard = state.lock().await;
        let existing_ids: Vec<String> = state_guard.workbook_servers.keys().cloned().collect();

        for existing_id in existing_ids {
            if let Some(mut runtime) = state_guard.workbook_servers.remove(&existing_id) {
                println!("[tauri] Stopping existing runtime: {}", existing_id);
                // Try graceful shutdown
                let stop_url = format!("http://localhost:{}/stop", runtime.runtime_port);
                let _ = reqwest::Client::new()
                    .post(&stop_url)
                    .timeout(Duration::from_secs(2))
                    .send()
                    .await;
                // Force kill
                let _ = runtime.child.kill().await;
            }
        }
    }

    // Small delay to ensure port is released
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Force kill any process still on runtime port (55000) - handles orphaned processes
    let runtime_port_default: u16 = PORT_PREFIX as u16 * 1000;
    kill_processes_on_port(runtime_port_default);
    tokio::time::sleep(Duration::from_millis(300)).await;

    let env_vars = get_api_keys_from_store(&app);
    let (child, runtime_port) =
        spawn_workbook_server(&workbook_id, &directory, env_vars).await?;

    // Re-acquire lock and store
    let mut state_guard = state.lock().await;
    state_guard.workbook_servers.insert(workbook_id.clone(), WorkbookServerProcess {
        child,
        runtime_port,
        directory: directory.clone(),
        restart_count: 0,
    });

    println!(
        "Workbook server started for {} on port {}",
        workbook_id, runtime_port
    );

    Ok(DevServerStatus {
        running: true,
        workbook_id,
        directory,
        runtime_port,
        message: format!("Workbook server started on port {}", runtime_port),
    })
}

/// Set the active workbook and restart OpenCode server with new database URL
/// This also restarts OpenCode with the workbook directory as CWD
#[tauri::command]
async fn set_active_workbook(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
) -> Result<HealthCheck, String> {
    // Get the workbook directory FIRST (before acquiring state lock)
    let workbook_dir = get_workbook_dir(&workbook_id)?;
    let workbook_dir_str = workbook_dir.to_string_lossy().to_string();

    if !workbook_dir.exists() {
        return Err(format!("Workbook directory does not exist: {}", workbook_dir_str));
    }

    println!("Set active workbook to: {} (dir: {})", workbook_id, workbook_dir_str);

    {
        let mut state_guard = state.lock().await;
        state_guard.active_workbook_id = Some(workbook_id.clone());
    }

    // Restart server to pick up new working directory and database URL
    restart_server_with_dir(app, state, workbook_id, workbook_dir_str).await
}

/// Stop the runtime for a workbook
#[tauri::command]
async fn stop_runtime(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
) -> Result<DevServerStatus, String> {
    let mut state_guard = state.lock().await;

    if let Some(mut runtime) = state_guard.workbook_servers.remove(&workbook_id) {
        // Try graceful shutdown via /stop endpoint
        let stop_url = format!("http://localhost:{}/stop", runtime.runtime_port);
        let _ = reqwest::Client::new()
            .post(&stop_url)
            .timeout(Duration::from_secs(5))
            .send()
            .await;

        // Force kill if still running
        let _ = runtime.child.kill().await;

        println!("Runtime stopped for workbook {}", workbook_id);

        return Ok(DevServerStatus {
            running: false,
            workbook_id,
            directory: String::new(),
            runtime_port: 0,
            message: "Runtime stopped".to_string(),
        });
    }

    Ok(DevServerStatus {
        running: false,
        workbook_id,
        directory: String::new(),
        runtime_port: 0,
        message: "Runtime was not running".to_string(),
    })
}

/// Get the currently active runtime (if any)
#[tauri::command]
async fn get_active_runtime(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<Option<DevServerStatus>, String> {
    let state_guard = state.lock().await;

    let workbook_id = match &state_guard.active_workbook_id {
        Some(id) => id.clone(),
        None => return Ok(None),
    };

    if let Some(runtime) = state_guard.workbook_servers.get(&workbook_id) {
        return Ok(Some(DevServerStatus {
            running: true,
            workbook_id,
            directory: runtime.directory.clone(),
            runtime_port: runtime.runtime_port,
            message: "Runtime is running".to_string(),
        }));
    }

    Ok(None)
}

/// Get runtime status for a workbook
#[tauri::command]
async fn get_runtime_status(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
) -> Result<DevServerStatus, String> {
    let state_guard = state.lock().await;

    if let Some(runtime) = state_guard.workbook_servers.get(&workbook_id) {
        // Ping the runtime to verify it's still alive
        let status_url = format!("http://localhost:{}/status", runtime.runtime_port);
        let is_running = match reqwest::get(&status_url).await {
            Ok(resp) if resp.status().is_success() => true,
            _ => false,
        };

        // Always return port info if we have a runtime entry
        return Ok(DevServerStatus {
            running: is_running,
            workbook_id,
            directory: String::new(),
            runtime_port: runtime.runtime_port,
            message: if is_running {
                "Runtime is running".to_string()
            } else {
                "Runtime is starting...".to_string()
            },
        });
    }

    // Drop lock before making HTTP requests
    drop(state_guard);

    // Fallback: Check if runtime is running on default port (started externally)
    let default_runtime_port: u16 = PORT_PREFIX as u16 * 1000;

    let status_url = format!("http://localhost:{}/status", default_runtime_port);
    if let Ok(resp) = reqwest::get(&status_url).await {
        if resp.status().is_success() {
            // Runtime is running on default port - return it
            return Ok(DevServerStatus {
                running: true,
                workbook_id,
                directory: String::new(),
                runtime_port: default_runtime_port,
                message: "Runtime detected on default port".to_string(),
            });
        }
    }

    Ok(DevServerStatus {
        running: false,
        workbook_id,
        directory: String::new(),
        runtime_port: 0,
        message: "Runtime is not running".to_string(),
    })
}

/// Execute SQL query through runtime (via tRPC)
#[tauri::command]
async fn runtime_query(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
    query: String,
) -> Result<serde_json::Value, String> {
    let state_guard = state.lock().await;

    let runtime = state_guard.workbook_servers.get(&workbook_id)
        .ok_or("Runtime not running for this workbook")?;

    // Use tRPC endpoint (db.query is a mutation)
    let url = format!("http://localhost:{}/trpc/db.query", runtime.runtime_port);

    let resp = reqwest::Client::new()
        .post(&url)
        .json(&serde_json::json!({ "query": query }))
        .send()
        .await
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    if !resp.status().is_success() {
        let error = resp.text().await.unwrap_or_default();
        return Err(format!("Query failed: {}", error));
    }

    // tRPC wraps response in { "result": { "data": ... } }
    let trpc_response: serde_json::Value = resp.json().await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // Extract the data from tRPC response wrapper
    trpc_response
        .get("result")
        .and_then(|r| r.get("data"))
        .cloned()
        .ok_or_else(|| {
            // Check for tRPC error format
            if let Some(error) = trpc_response.get("error") {
                format!("Query failed: {}", error)
            } else {
                "Invalid tRPC response format".to_string()
            }
        })
}

/// Trigger eval on runtime
#[tauri::command]
async fn runtime_eval(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
) -> Result<serde_json::Value, String> {
    let state_guard = state.lock().await;

    let runtime = state_guard.workbook_servers.get(&workbook_id)
        .ok_or("Runtime not running for this workbook")?;

    let url = format!("http://localhost:{}/eval", runtime.runtime_port);

    let resp = reqwest::Client::new()
        .post(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to run eval: {}", e))?;

    resp.json().await.map_err(|e| format!("Failed to parse response: {}", e))
}

// OpenCode server management
#[tauri::command]
async fn check_server_health(port: u16) -> Result<HealthCheck, String> {
    let url = format!("http://localhost:{}/session", port);

    match reqwest::get(&url).await {
        Ok(response) => {
            if response.status().is_success() {
                if let Ok(text) = response.text().await {
                    if text.starts_with('[') || text.starts_with('{') {
                        return Ok(HealthCheck {
                            healthy: true,
                            message: "Server is healthy".to_string(),
                        });
                    }
                }
                Ok(HealthCheck {
                    healthy: false,
                    message: "Server returned HTML instead of JSON".to_string(),
                })
            } else {
                Ok(HealthCheck {
                    healthy: false,
                    message: format!("Server returned status: {}", response.status()),
                })
            }
        }
        Err(e) => Ok(HealthCheck {
            healthy: false,
            message: format!("Failed to connect: {}", e),
        }),
    }
}

fn get_api_keys_from_store(app: &tauri::AppHandle) -> HashMap<String, String> {
    let mut env_vars = HashMap::new();

    // First, try to read from .env.local in the desktop package (dev mode)
    let env_local_path = format!("{}/../.env.local", env!("CARGO_MANIFEST_DIR"));
    if let Ok(contents) = std::fs::read_to_string(&env_local_path) {
        for line in contents.lines() {
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let value = value.trim();
                if !key.is_empty() && !value.is_empty() && !key.starts_with('#') {
                    env_vars.insert(key.to_string(), value.to_string());
                }
            }
        }
    }

    // Then override with store values (settings UI takes precedence)
    if let Ok(store) = app.store("settings.json") {
        let keys = [
            ("anthropic_api_key", "ANTHROPIC_API_KEY"),
            ("openai_api_key", "OPENAI_API_KEY"),
            ("google_api_key", "GOOGLE_GENERATIVE_AI_API_KEY"),
            ("hands_ai_api_key", "HANDS_AI_API_KEY"),
        ];

        for (store_key, env_key) in keys {
            if let Some(value) = store.get(store_key) {
                if let Some(s) = value.as_str() {
                    if !s.is_empty() {
                        env_vars.insert(env_key.to_string(), s.to_string());
                    }
                }
            }
        }
    }

    env_vars
}

fn get_model_from_store(app: &tauri::AppHandle) -> Option<String> {
    if let Ok(store) = app.store("settings.json") {
        if let Some(settings) = store.get("settings") {
            let provider = settings.get("provider").and_then(|v| v.as_str());
            let model = settings.get("model").and_then(|v| v.as_str());

            if let (Some(p), Some(m)) = (provider, model) {
                return Some(format!("{}/{}", p, m));
            }
        }
    }
    None
}

/// Kill any existing process listening on the given port
async fn kill_process_on_port(port: u16) -> Result<(), String> {
    // Use lsof to find processes on the port and kill them
    let output = std::process::Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .output();

    if let Ok(output) = output {
        if output.status.success() {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                if let Ok(pid_num) = pid.trim().parse::<i32>() {
                    println!("Killing existing process {} on port {}", pid_num, port);
                    let _ = std::process::Command::new("kill")
                        .args(["-9", &pid_num.to_string()])
                        .output();
                }
            }
            // Give a moment for the port to be released
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }
    Ok(())
}

async fn start_opencode_server(
    port: u16,
    model: Option<String>,
    env_vars: HashMap<String, String>,
    working_dir: Option<String>,
) -> Result<Child, String> {
    // Kill any existing process on this port first
    kill_process_on_port(port).await?;

    let mut all_env = env_vars.clone();

    // Set port and model for the agent server
    all_env.insert("HANDS_AGENT_PORT".to_string(), port.to_string());
    if let Some(ref m) = model {
        all_env.insert("HANDS_MODEL".to_string(), m.clone());
    }

    // CRITICAL: Set HANDS_WORKBOOK_DIR env var so the agent knows which directory it should use
    // This is more reliable than just current_dir() because the agent explicitly reads this
    if let Some(ref dir) = working_dir {
        all_env.insert("HANDS_WORKBOOK_DIR".to_string(), dir.clone());
    }

    // Get the agent server script path (relative to CARGO_MANIFEST_DIR which is src-tauri)
    let agent_script = format!("{}/../../agent/src/index.ts", env!("CARGO_MANIFEST_DIR"));

    // Build command - run from the workbook directory if provided
    let mut cmd = Command::new("bun");
    cmd.args(["run", &agent_script])
        .envs(&all_env)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .kill_on_drop(true);

    if let Some(ref dir) = working_dir {
        cmd.current_dir(dir);
        println!("Hands agent working directory: {}", dir);
    } else {
        println!("WARNING: Starting Hands agent without a working directory - sessions will be isolated!");
    }

    let child = cmd.spawn()
        .map_err(|e| format!("Failed to start Hands agent server: {}", e))?;

    println!("Hands agent server starting on port {}{}", port, model.map(|m| format!(" with model {}", m)).unwrap_or_default());
    Ok(child)
}

async fn wait_for_server(port: u16, timeout_secs: u64) -> bool {
    let url = format!("http://localhost:{}/session", port);
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    while start.elapsed() < timeout {
        if let Ok(resp) = reqwest::get(&url).await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    if text.starts_with('[') || text.starts_with('{') {
                        return true;
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    false
}

/// Restart OpenCode server with explicit workbook directory
/// This is the core function that ensures OpenCode runs in the correct directory
async fn restart_server_with_dir(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
    workbook_dir: String,
) -> Result<HealthCheck, String> {
    let mut state_guard = state.lock().await;

    if let Some(ref mut server) = state_guard.server {
        let _ = server.kill().await;
    }

    let mut env_vars = get_api_keys_from_store(&app);
    let model = get_model_from_store(&app);

    // Add database URL if runtime is available (optional - AI works without DB)
    // Set runtime port for agent tools to access SQLite via tRPC
    if let Some(runtime) = state_guard.workbook_servers.get(&workbook_id) {
        env_vars.insert("HANDS_RUNTIME_PORT".to_string(), runtime.runtime_port.to_string());
        println!("Setting HANDS_RUNTIME_PORT for workbook {}: {}", workbook_id, runtime.runtime_port);
    }

    println!("Restarting OpenCode server with working directory: {}", workbook_dir);

    match start_opencode_server(PORT_OPENCODE, model, env_vars, Some(workbook_dir)).await {
        Ok(child) => {
            state_guard.server = Some(child);

            if wait_for_server(PORT_OPENCODE, 30).await {
                Ok(HealthCheck {
                    healthy: true,
                    message: "Server restarted successfully".to_string(),
                })
            } else {
                Ok(HealthCheck {
                    healthy: false,
                    message: "Server started but health check failed".to_string(),
                })
            }
        }
        Err(e) => Ok(HealthCheck {
            healthy: false,
            message: e,
        }),
    }
}

#[tauri::command]
async fn restart_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<HealthCheck, String> {
    let state_guard = state.lock().await;

    // Get active workbook info
    let (workbook_id, workbook_dir) = if let Some(ref id) = state_guard.active_workbook_id {
        // Try to get directory from runtime first, fall back to computing it
        let dir = if let Some(runtime) = state_guard.workbook_servers.get(id) {
            runtime.directory.clone()
        } else {
            get_workbook_dir(id)?.to_string_lossy().to_string()
        };
        (id.clone(), Some(dir))
    } else {
        (String::new(), None)
    };

    // Drop the lock before calling the inner function
    drop(state_guard);

    if let Some(dir) = workbook_dir {
        restart_server_with_dir(app, state, workbook_id, dir).await
    } else {
        // No active workbook - start without a working directory (legacy behavior)
        println!("WARNING: Restarting OpenCode without active workbook - sessions will be isolated");
        let mut state_guard = state.lock().await;

        if let Some(ref mut server) = state_guard.server {
            let _ = server.kill().await;
        }

        let env_vars = get_api_keys_from_store(&app);
        let model = get_model_from_store(&app);

        match start_opencode_server(PORT_OPENCODE, model, env_vars, None).await {
            Ok(child) => {
                state_guard.server = Some(child);

                if wait_for_server(PORT_OPENCODE, 30).await {
                    Ok(HealthCheck {
                        healthy: true,
                        message: "Server restarted successfully (no workbook)".to_string(),
                    })
                } else {
                    Ok(HealthCheck {
                        healthy: false,
                        message: "Server started but health check failed".to_string(),
                    })
                }
            }
            Err(e) => Ok(HealthCheck {
                healthy: false,
                message: e,
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyFilesResult {
    pub copied_files: Vec<String>,
    pub data_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileData {
    pub filename: String,
    pub bytes: Vec<u8>,
}

/// Write file data to workbook's data directory
#[tauri::command]
async fn write_file_to_workbook(
    workbook_id: String,
    file_data: FileData,
) -> Result<CopyFilesResult, String> {
    let workbook_dir = get_workbook_dir(&workbook_id)?;
    let data_dir = workbook_dir.join("data");

    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;

    let dest = data_dir.join(&file_data.filename);
    fs::write(&dest, &file_data.bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(CopyFilesResult {
        copied_files: vec![dest.to_string_lossy().to_string()],
        data_dir: data_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn copy_files_to_workbook(
    workbook_id: String,
    file_paths: Vec<String>,
) -> Result<CopyFilesResult, String> {
    let workbook_dir = get_workbook_dir(&workbook_id)?;
    let data_dir = workbook_dir.join("data");

    fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data directory: {}", e))?;

    let mut copied_files = Vec::new();

    for source_path in file_paths {
        let source = PathBuf::from(&source_path);
        if !source.exists() {
            continue;
        }

        let file_name = source
            .file_name()
            .ok_or_else(|| "Invalid file path".to_string())?;
        let dest = data_dir.join(file_name);

        fs::copy(&source, &dest).map_err(|e| format!("Failed to copy {}: {}", source_path, e))?;

        copied_files.push(dest.to_string_lossy().to_string());
    }

    Ok(CopyFilesResult {
        copied_files,
        data_dir: data_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn open_webview(
    app: tauri::AppHandle,
    url: String,
    title: Option<String>,
) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    let label = format!("preview_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis());

    let window_title = title.clone().unwrap_or_else(|| "Preview".to_string());

    let encoded_url = urlencoding::encode(&url);
    let encoded_title = urlencoding::encode(&window_title);
    let preview_url = format!("index.html?preview=true&url={}&title={}", encoded_url, encoded_title);

    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(preview_url.into()))
        .title(&window_title)
        .inner_size(900.0, 700.0)
        .min_inner_size(400.0, 300.0)
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .center();

    #[cfg(target_os = "macos")]
    let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay);

    builder
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn open_db_browser(
    app: tauri::AppHandle,
    runtime_port: u16,
    workbook_id: String,
) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    let window_label = format!("db_browser_{}", workbook_id);

    // Check if window already exists
    if let Some(window) = app.get_webview_window(&window_label) {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Open DB browser with runtime port as query param
    // Use just query params (not index.html) for Vite dev server compatibility
    let url = format!("?db-browser=true&port={}", runtime_port);

    let mut builder = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title("Database Browser")
        .inner_size(900.0, 600.0)
        .min_inner_size(600.0, 400.0)
        .decorations(true)
        .resizable(true)
        .center();

    // macOS: transparent titlebar
    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay);
    }

    builder
        .build()
        .map_err(|e| format!("Failed to create DB browser window: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn open_docs(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    // Check if docs window already exists
    if let Some(window) = app.get_webview_window("docs") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Find docs directory in resources
    let docs_dir = app.path().resource_dir()
        .ok()
        .map(|p| p.join("docs"))
        .filter(|p| p.exists())
        .or_else(|| {
            // Dev mode fallback
            std::env::current_exe().ok().and_then(|exe| {
                let mut path = exe;
                for _ in 0..5 {
                    path = path.parent()?.to_path_buf();
                    let docs = path.join("docs/dist");
                    if docs.exists() {
                        return Some(docs);
                    }
                }
                None
            })
        });

    let docs_path = docs_dir.ok_or("Docs not found")?;
    println!("Opening docs from: {:?}", docs_path);

    // Use file:// URL to open local docs
    let docs_url = format!("file://{}/index.html", docs_path.to_string_lossy());

    let builder = WebviewWindowBuilder::new(&app, "docs", WebviewUrl::External(docs_url.parse().map_err(|e| format!("{}", e))?))
        .title("Hands Documentation")
        .inner_size(1000.0, 800.0)
        .min_inner_size(600.0, 400.0)
        .decorations(true)
        .resizable(true)
        .center();

    builder
        .build()
        .map_err(|e| format!("Failed to create docs window: {}", e))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard::init())
        .invoke_handler(tauri::generate_handler![
            check_server_health,
            restart_server,
            create_workbook,
            list_workbooks,
            get_workbook,
            update_workbook,
            delete_workbook,
            start_workbook_server,
            stop_runtime,
            get_runtime_status,
            get_active_runtime,
            runtime_query,
            runtime_eval,
            copy_files_to_workbook,
            write_file_to_workbook,
            open_webview,
            open_db_browser,
            open_docs,
            set_active_workbook
        ])
        .setup(|app| {
            let state = Arc::new(Mutex::new(AppState {
                server: None,
                workbook_servers: HashMap::new(),
                active_workbook_id: None,
            }));
            app.manage(state.clone());

            // Start runtime monitor for auto-restart
            start_workbook_server_monitor(state.clone(), app.handle().clone());

            // Build the application menu
            let app_handle = app.handle();

            // Settings menu item with Cmd+,
            let settings_item = MenuItemBuilder::new("Settings...")
                .id("settings")
                .accelerator("CmdOrCtrl+,")
                .build(app_handle)?;

            // App submenu (macOS shows this as the app name)
            let app_submenu = SubmenuBuilder::new(app_handle, "Hands")
                .about(None)
                .separator()
                .item(&settings_item)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            // File submenu
            // Note: We intentionally omit .close_window() here because Cmd+W is handled
            // by the frontend hotkey system to navigate up instead of closing the window
            let file_submenu = SubmenuBuilder::new(app_handle, "File")
                .build()?;

            // Edit submenu - native items needed for devtools copy/paste to work on macOS
            let edit_submenu = SubmenuBuilder::new(app_handle, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .separator()
                .select_all()
                .build()?;

            // View submenu
            let view_submenu = SubmenuBuilder::new(app_handle, "View")
                .fullscreen()
                .build()?;

            // Window submenu
            let window_submenu = SubmenuBuilder::new(app_handle, "Window")
                .minimize()
                .build()?;

            let menu = MenuBuilder::new(app_handle)
                .item(&app_submenu)
                .item(&file_submenu)
                .item(&edit_submenu)
                .item(&view_submenu)
                .item(&window_submenu)
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app_handle, event| {
                if event.id().as_ref() == "settings" {
                    // Emit event to frontend to open settings modal
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.emit("open-settings", ());
                    }
                }
            });

            let app_handle = app.handle().clone();
            let env_vars = get_api_keys_from_store(&app_handle);
            let model = get_model_from_store(&app_handle);

            // Start Hands agent server (no postgres - runtime manages it per workbook)
            // No working directory at startup - will be set when workbook is activated
            tauri::async_runtime::spawn(async move {
                match start_opencode_server(PORT_OPENCODE, model, env_vars, None).await {
                    Ok(child) => {
                        let mut s = state.lock().await;
                        s.server = Some(child);

                        if wait_for_server(PORT_OPENCODE, 30).await {
                            println!("Hands agent is ready!");
                        } else {
                            eprintln!("Hands agent started but health check timed out");
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to start Hands agent: {}", e);
                    }
                }
            });

            #[cfg(target_os = "macos")]
            {
                use objc2_app_kit::{NSColor, NSWindow};

                if let Some(window) = app.get_webview_window("main") {
                    let ns_window = window.ns_window().unwrap() as *mut NSWindow;
                    unsafe {
                        let ns_window = &*ns_window;
                        let clear_color = NSColor::clearColor();
                        ns_window.setBackgroundColor(Some(&clear_color));
                        ns_window.setOpaque(false);
                    }
                }
            }

            // Open devtools by default in debug builds
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Only cleanup when main window is destroyed
                if window.label() == "main" {
                    println!("[shutdown] Main window destroyed, cleaning up...");

                    // Force cleanup runtime lockfile and kill any orphaned processes
                    tauri::async_runtime::block_on(async {
                        force_cleanup_workbook_server().await;
                    });

                    // Kill OpenCode server port
                    kill_processes_on_port(PORT_OPENCODE);

                    println!("[shutdown] Cleanup complete");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
