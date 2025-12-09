use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_store::StoreExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

// Runtime process info for a workbook
#[derive(Debug)]
pub struct RuntimeProcess {
    pub child: Child,
    pub runtime_port: u16,
    pub postgres_port: u16,
    pub worker_port: u16,
    pub directory: String,
    pub restart_count: u32,
}

// App state - now just tracks runtime processes and opencode server
pub struct AppState {
    pub server: Option<Child>,
    pub runtimes: HashMap<String, RuntimeProcess>, // workbook_id -> runtime process
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

fn get_workbooks_index_path() -> Result<PathBuf, String> {
    Ok(get_hands_dir()?.join("workbooks.json"))
}

fn get_workbook_dir(id: &str) -> Result<PathBuf, String> {
    Ok(get_hands_dir()?.join(id))
}

fn read_workbooks_index() -> Result<HashMap<String, Workbook>, String> {
    let index_path = get_workbooks_index_path()?;
    if !index_path.exists() {
        return Ok(HashMap::new());
    }
    let content = fs::read_to_string(&index_path)
        .map_err(|e| format!("Failed to read workbooks index: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse workbooks index: {}", e))
}

fn write_workbooks_index(index: &HashMap<String, Workbook>) -> Result<(), String> {
    let index_path = get_workbooks_index_path()?;
    let content = serde_json::to_string_pretty(index)
        .map_err(|e| format!("Failed to serialize workbooks index: {}", e))?;
    fs::write(&index_path, content)
        .map_err(|e| format!("Failed to write workbooks index: {}", e))
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

fn get_template_dir() -> Result<PathBuf, String> {
    // Try relative to executable (production build)
    if let Ok(exe_path) = std::env::current_exe() {
        let mut path = exe_path;
        for _ in 0..5 {
            path = path.parent().unwrap_or(&path).to_path_buf();
        }
        let template_path = path.join("packages/workbook-starter");
        if template_path.exists() {
            return Ok(template_path);
        }
    }

    // Try relative to current working directory (dev mode)
    let cwd_template = PathBuf::from("../../workbook-starter");
    if cwd_template.exists() {
        return Ok(cwd_template);
    }

    // Try from home directory (fallback)
    if let Some(home) = dirs::home_dir() {
        let home_template = home.join("hands-proto/packages/workbook-starter");
        if home_template.exists() {
            return Ok(home_template);
        }
    }

    Err("Could not find workbook-starter template directory".to_string())
}

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create directory {:?}: {}", dst, e))?;

    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read directory {:?}: {}", src, e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());

        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            fs::copy(&path, &dest_path)
                .map_err(|e| format!("Failed to copy {:?} to {:?}: {}", path, dest_path, e))?;
        }
    }

    Ok(())
}

fn init_workbook(workbook_dir: &PathBuf, name: &str, description: Option<&str>) -> Result<(), String> {
    let template_dir = get_template_dir()?;
    copy_dir_recursive(&template_dir, workbook_dir)?;

    let slug = name.to_lowercase().replace(" ", "-");
    let desc = description.unwrap_or("");

    // Update package.json
    let package_path = workbook_dir.join("package.json");
    if package_path.exists() {
        let content = fs::read_to_string(&package_path).map_err(|e| e.to_string())?;
        let content = content.replace("{{name}}", &slug);
        fs::write(&package_path, content).map_err(|e| e.to_string())?;
    }

    // Update wrangler.toml - runtime will set DATABASE_URL dynamically
    let wrangler_path = workbook_dir.join("wrangler.toml");
    if wrangler_path.exists() {
        let content = fs::read_to_string(&wrangler_path).map_err(|e| e.to_string())?;
        let content = content.replace("{{name}}", &slug);
        // Remove database_url placeholder - runtime manages this
        let content = content.replace("{{database_url}}", "");
        fs::write(&wrangler_path, content).map_err(|e| e.to_string())?;
    }

    // Update sst.config.ts
    let sst_path = workbook_dir.join("sst.config.ts");
    if sst_path.exists() {
        let content = fs::read_to_string(&sst_path).map_err(|e| e.to_string())?;
        let content = content.replace("{{name}}", &slug);
        fs::write(&sst_path, content).map_err(|e| e.to_string())?;
    }

    // Update README.md
    let readme_path = workbook_dir.join("README.md");
    if readme_path.exists() {
        let content = fs::read_to_string(&readme_path).map_err(|e| e.to_string())?;
        let content = content.replace("{{name}}", name).replace("{{description}}", desc);
        fs::write(&readme_path, content).map_err(|e| e.to_string())?;
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

    let mut index = read_workbooks_index()?;
    index.insert(id, workbook.clone());
    write_workbooks_index(&index)?;

    Ok(workbook)
}

#[tauri::command]
async fn list_workbooks() -> Result<Vec<Workbook>, String> {
    let hands_dir = get_hands_dir()?;
    let mut index = read_workbooks_index().unwrap_or_default();
    let mut changed = false;

    let entries = fs::read_dir(&hands_dir)
        .map_err(|e| format!("Failed to read hands directory: {}", e))?;

    let mut found_ids: Vec<String> = Vec::new();

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

        if dir_name.starts_with('.') {
            continue;
        }

        if let Some(workbook_config) = read_workbook_config(&path) {
            found_ids.push(workbook_config.id.clone());
            if !index.contains_key(&workbook_config.id) {
                index.insert(workbook_config.id.clone(), workbook_config);
                changed = true;
            }
        } else {
            let metadata = fs::metadata(&path).ok();
            let created = metadata.as_ref()
                .and_then(|m| m.created().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            let workbook = Workbook {
                id: dir_name.clone(),
                name: dir_name.clone(),
                description: None,
                directory: path.to_string_lossy().to_string(),
                created_at: created,
                updated_at: created,
                last_opened_at: created,
            };

            let _ = save_workbook_config(&workbook);
            found_ids.push(dir_name.clone());
            index.insert(dir_name, workbook);
            changed = true;
        }
    }

    let stale_ids: Vec<String> = index.keys()
        .filter(|id| !found_ids.contains(id))
        .cloned()
        .collect();

    for id in stale_ids {
        index.remove(&id);
        changed = true;
    }

    if changed {
        let _ = write_workbooks_index(&index);
    }

    let mut workbooks: Vec<Workbook> = index.into_values().collect();
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

    let mut index = read_workbooks_index().unwrap_or_default();
    index.insert(workbook.id.clone(), workbook.clone());
    write_workbooks_index(&index)?;

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
        if let Some(mut runtime) = state.runtimes.remove(&id) {
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

    let mut index = read_workbooks_index().unwrap_or_default();
    index.remove(&id);
    let _ = write_workbooks_index(&index);

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

// Runtime ready message from stdout
#[derive(Debug, Clone, Deserialize)]
struct RuntimeReady {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(rename = "runtimePort")]
    runtime_port: u16,
    #[serde(rename = "postgresPort")]
    postgres_port: u16,
    #[serde(rename = "workerPort")]
    worker_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevServerStatus {
    pub running: bool,
    pub workbook_id: String,
    pub directory: String,
    pub runtime_port: u16,
    pub postgres_port: u16,
    pub worker_port: u16,
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
async fn force_cleanup_runtime() {
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
async fn spawn_runtime(
    workbook_id: &str,
    directory: &str,
) -> Result<(Child, u16, u16, u16), String> {
    // Force cleanup any stale processes before starting
    force_cleanup_runtime().await;

    // Get the runtime script path (relative to CARGO_MANIFEST_DIR which is src-tauri)
    let runtime_script = format!("{}/../../runtime/src/index.ts", env!("CARGO_MANIFEST_DIR"));

    // Start hands-runtime process - run from the workbook directory
    let mut child = Command::new("bun")
        .args([
            "run",
            &runtime_script,
            &format!("--workbook-id={}", workbook_id),
            &format!("--workbook-dir={}", directory),
        ])
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
                if let Ok(ready) = serde_json::from_str::<RuntimeReady>(&line) {
                    if ready.msg_type == "ready" {
                        return Ok((ready.runtime_port, ready.postgres_port, ready.worker_port));
                    }
                }
            }
        }
        Err("Runtime exited without ready message".to_string())
    }).await;

    match timeout_result {
        Ok(Ok((runtime_port, postgres_port, worker_port))) => {
            Ok((child, runtime_port, postgres_port, worker_port))
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
fn start_runtime_monitor(state: Arc<Mutex<AppState>>) {
    const MAX_RESTARTS: u32 = 5;
    const RESTART_DELAY_MS: u64 = 2000;

    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;

            let mut state_guard = state.lock().await;

            // Collect workbooks that need restart
            let mut to_restart: Vec<(String, String, u32)> = Vec::new();

            for (workbook_id, runtime) in state_guard.runtimes.iter_mut() {
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
                state_guard.runtimes.remove(workbook_id);
            }

            // Drop lock before spawning new processes
            drop(state_guard);

            // Restart crashed runtimes
            for (workbook_id, directory, restart_count) in to_restart {
                tokio::time::sleep(Duration::from_millis(RESTART_DELAY_MS)).await;

                println!("[monitor] Restarting runtime for {}...", workbook_id);

                match spawn_runtime(&workbook_id, &directory).await {
                    Ok((child, runtime_port, postgres_port, worker_port)) => {
                        let mut state_guard = state.lock().await;
                        state_guard.runtimes.insert(workbook_id.clone(), RuntimeProcess {
                            child,
                            runtime_port,
                            postgres_port,
                            worker_port,
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
async fn start_runtime(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
    directory: String,
) -> Result<DevServerStatus, String> {
    let state_guard = state.lock().await;

    // Check if already tracked in our state
    if let Some(runtime) = state_guard.runtimes.get(&workbook_id) {
        return Ok(DevServerStatus {
            running: true,
            workbook_id,
            directory,
            runtime_port: runtime.runtime_port,
            postgres_port: runtime.postgres_port,
            worker_port: runtime.worker_port,
            message: "Runtime already running".to_string(),
        });
    }

    // Drop lock while spawning
    drop(state_guard);

    let (child, runtime_port, postgres_port, worker_port) =
        spawn_runtime(&workbook_id, &directory).await?;

    // Re-acquire lock and store
    let mut state_guard = state.lock().await;
    state_guard.runtimes.insert(workbook_id.clone(), RuntimeProcess {
        child,
        runtime_port,
        postgres_port,
        worker_port,
        directory: directory.clone(),
        restart_count: 0,
    });

    println!(
        "Runtime started for workbook {} - runtime:{}, postgres:{}, worker:{}",
        workbook_id, runtime_port, postgres_port, worker_port
    );

    Ok(DevServerStatus {
        running: true,
        workbook_id,
        directory,
        runtime_port,
        postgres_port,
        worker_port,
        message: format!("Runtime started on port {}", runtime_port),
    })
}

/// Set the active workbook and restart OpenCode server with new database URL
#[tauri::command]
async fn set_active_workbook(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
) -> Result<HealthCheck, String> {
    {
        let mut state_guard = state.lock().await;
        state_guard.active_workbook_id = Some(workbook_id.clone());
        println!("Set active workbook to: {}", workbook_id);
    }

    // Restart server to pick up new database URL
    restart_server(app, state).await
}

/// Stop the runtime for a workbook
#[tauri::command]
async fn stop_runtime(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
) -> Result<DevServerStatus, String> {
    let mut state_guard = state.lock().await;

    if let Some(mut runtime) = state_guard.runtimes.remove(&workbook_id) {
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
            postgres_port: 0,
            worker_port: 0,
            message: "Runtime stopped".to_string(),
        });
    }

    Ok(DevServerStatus {
        running: false,
        workbook_id,
        directory: String::new(),
        runtime_port: 0,
        postgres_port: 0,
        worker_port: 0,
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

    if let Some(runtime) = state_guard.runtimes.get(&workbook_id) {
        return Ok(Some(DevServerStatus {
            running: true,
            workbook_id,
            directory: runtime.directory.clone(),
            runtime_port: runtime.runtime_port,
            postgres_port: runtime.postgres_port,
            worker_port: runtime.worker_port,
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

    if let Some(runtime) = state_guard.runtimes.get(&workbook_id) {
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
            postgres_port: runtime.postgres_port,
            worker_port: runtime.worker_port,
            message: if is_running {
                "Runtime is running".to_string()
            } else {
                "Runtime is starting...".to_string()
            },
        });
    }

    Ok(DevServerStatus {
        running: false,
        workbook_id,
        directory: String::new(),
        runtime_port: 0,
        postgres_port: 0,
        worker_port: 0,
        message: "Runtime is not running".to_string(),
    })
}

/// Execute SQL query through runtime
#[tauri::command]
async fn runtime_query(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
    query: String,
) -> Result<serde_json::Value, String> {
    let state_guard = state.lock().await;

    let runtime = state_guard.runtimes.get(&workbook_id)
        .ok_or("Runtime not running for this workbook")?;

    let url = format!("http://localhost:{}/postgres/query", runtime.runtime_port);

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

    resp.json().await.map_err(|e| format!("Failed to parse response: {}", e))
}

/// Trigger eval on runtime
#[tauri::command]
async fn runtime_eval(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
) -> Result<serde_json::Value, String> {
    let state_guard = state.lock().await;

    let runtime = state_guard.runtimes.get(&workbook_id)
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

    if let Ok(store) = app.store("settings.json") {
        let keys = [
            ("anthropic_api_key", "ANTHROPIC_API_KEY"),
            ("openai_api_key", "OPENAI_API_KEY"),
            ("google_api_key", "GOOGLE_GENERATIVE_AI_API_KEY"),
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
    config_dir: Option<String>,
    working_dir: Option<String>,
) -> Result<Child, String> {
    // Kill any existing process on this port first
    kill_process_on_port(port).await?;

    let port_str = port.to_string();

    let mut all_env = env_vars.clone();
    if let Some(ref m) = model {
        let config = serde_json::json!({ "model": m });
        all_env.insert("OPENCODE_CONFIG_CONTENT".to_string(), config.to_string());
    }

    if let Some(ref dir) = config_dir {
        all_env.insert("OPENCODE_CONFIG_DIR".to_string(), dir.clone());
        println!("OpenCode config dir: {}", dir);
    } else {
        println!("WARNING: OpenCode config dir not found, using built-in agents only");
    }

    // Build command with optional working directory
    let mut cmd = Command::new("bunx");
    cmd.args(["opencode-ai", "serve", "--port", &port_str])
        .envs(&all_env)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .kill_on_drop(true);

    if let Some(ref dir) = working_dir {
        cmd.current_dir(dir);
        println!("OpenCode working directory: {}", dir);
    }

    let child = cmd.spawn().or_else(|_| {
        let mut cmd = Command::new("npx");
        cmd.args(["opencode-ai", "serve", "--port", &port_str])
            .envs(&all_env)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .kill_on_drop(true);

        if let Some(ref dir) = working_dir {
            cmd.current_dir(dir);
        }

        cmd.spawn()
    })
    .map_err(|e| format!("Failed to start opencode server: {}", e))?;

    println!("OpenCode server starting on port {}{}", port, model.map(|m| format!(" with model {}", m)).unwrap_or_default());
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

#[tauri::command]
async fn restart_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<HealthCheck, String> {
    let mut state_guard = state.lock().await;

    if let Some(ref mut server) = state_guard.server {
        let _ = server.kill().await;
    }

    let mut env_vars = get_api_keys_from_store(&app);
    let model = get_model_from_store(&app);

    // Add database URL for active workbook and get working directory
    let mut working_dir: Option<String> = None;
    if let Some(ref workbook_id) = state_guard.active_workbook_id {
        if let Some(runtime) = state_guard.runtimes.get(workbook_id) {
            let db_name = format!("hands_{}", workbook_id.replace('-', "_"));
            let db_url = format!(
                "postgres://hands:hands@localhost:{}/{}",
                runtime.postgres_port, db_name
            );
            env_vars.insert("HANDS_DATABASE_URL".to_string(), db_url.clone());
            println!("Setting HANDS_DATABASE_URL for workbook {}: {}", workbook_id, db_url);
            // Use workbook directory as working directory
            working_dir = Some(runtime.directory.clone());
        }
    }

    let config_dir = app.path().resource_dir()
        .ok()
        .map(|p| p.join("opencode"))
        .filter(|p| p.exists())
        .or_else(|| {
            std::env::current_exe().ok().and_then(|exe| {
                let dev_path = exe.parent()?.join("resources/opencode");
                if dev_path.exists() {
                    return Some(dev_path);
                }
                let mut path = exe;
                for _ in 0..5 {
                    path = path.parent()?.to_path_buf();
                    let resources = path.join("src-tauri/resources/opencode");
                    if resources.exists() {
                        return Some(resources);
                    }
                }
                None
            })
        })
        .map(|p| p.to_string_lossy().to_string());

    match start_opencode_server(4096, model, env_vars, config_dir, working_dir).await {
        Ok(child) => {
            state_guard.server = Some(child);

            if wait_for_server(4096, 30).await {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyFilesResult {
    pub copied_files: Vec<String>,
    pub data_dir: String,
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
        .invoke_handler(tauri::generate_handler![
            check_server_health,
            restart_server,
            create_workbook,
            list_workbooks,
            get_workbook,
            update_workbook,
            delete_workbook,
            start_runtime,
            stop_runtime,
            get_runtime_status,
            get_active_runtime,
            runtime_query,
            runtime_eval,
            copy_files_to_workbook,
            open_webview,
            open_db_browser,
            open_docs,
            set_active_workbook
        ])
        .setup(|app| {
            let state = Arc::new(Mutex::new(AppState {
                server: None,
                runtimes: HashMap::new(),
                active_workbook_id: None,
            }));
            app.manage(state.clone());

            // Start runtime monitor for auto-restart
            start_runtime_monitor(state.clone());

            let app_handle = app.handle().clone();
            let env_vars = get_api_keys_from_store(&app_handle);
            let model = get_model_from_store(&app_handle);

            let config_dir = app_handle.path().resource_dir()
                .ok()
                .map(|p| p.join("opencode"))
                .filter(|p| p.exists())
                .or_else(|| {
                    std::env::current_exe().ok().and_then(|exe| {
                        let dev_path = exe.parent()?.join("resources/opencode");
                        if dev_path.exists() {
                            return Some(dev_path);
                        }
                        let mut path = exe;
                        for _ in 0..5 {
                            path = path.parent()?.to_path_buf();
                            let resources = path.join("src-tauri/resources/opencode");
                            if resources.exists() {
                                return Some(resources);
                            }
                        }
                        None
                    })
                })
                .map(|p| p.to_string_lossy().to_string());

            // Start OpenCode server only (no postgres - runtime manages it per workbook)
            // No working directory at startup - will be set when workbook is activated
            tauri::async_runtime::spawn(async move {
                match start_opencode_server(4096, model, env_vars, config_dir, None).await {
                    Ok(child) => {
                        let mut s = state.lock().await;
                        s.server = Some(child);

                        if wait_for_server(4096, 30).await {
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
