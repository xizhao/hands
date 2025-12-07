use pg_embed::pg_enums::PgAuthMethod;
use pg_embed::pg_fetch::{PgFetchSettings, PG_V15};
use pg_embed::postgres::{PgEmbed, PgSettings};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_store::StoreExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

// App state to hold the database and server process
pub struct AppState {
    pub db: Option<PgPool>,
    pub pg: Option<PgEmbed>,
    pub server: Option<Child>,
    pub sst_servers: HashMap<String, Child>, // workbook_id -> sst dev process
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
    pub stats: Option<DatabaseStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseStats {
    pub size_bytes: i64,
    pub size_formatted: String,
    pub table_count: i64,
    pub connection_count: i32,
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
    // Ensure .hands directory exists
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

// Read the global workbooks index
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

// Write the global workbooks index
fn write_workbooks_index(index: &HashMap<String, Workbook>) -> Result<(), String> {
    let index_path = get_workbooks_index_path()?;
    let content = serde_json::to_string_pretty(index)
        .map_err(|e| format!("Failed to serialize workbooks index: {}", e))?;
    fs::write(&index_path, content)
        .map_err(|e| format!("Failed to write workbooks index: {}", e))
}

// Save workbook metadata to package.json under "hands" field
fn save_workbook_config(workbook: &Workbook) -> Result<(), String> {
    let workbook_dir = PathBuf::from(&workbook.directory);
    let package_path = workbook_dir.join("package.json");

    // Read existing package.json or create new one
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

    // Add/update hands metadata
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

// Read workbook config from package.json "hands" field
fn read_workbook_config(workbook_dir: &PathBuf) -> Option<Workbook> {
    let package_path = workbook_dir.join("package.json");
    if !package_path.exists() {
        return None;
    }

    let content = fs::read_to_string(&package_path).ok()?;
    let package: serde_json::Value = serde_json::from_str(&content).ok()?;

    // Check for hands metadata
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

#[tauri::command]
async fn create_workbook(request: CreateWorkbookRequest) -> Result<Workbook, String> {
    // Generate ID from slugified name
    let slug = request.name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let id = format!("{}-{:x}", slug, timestamp % 0xFFFF);

    // Create directory
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

    // Create SST project structure
    init_sst_project(&workbook_dir, &request.name, request.description.as_deref())?;

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

    // Save workbook config to its directory
    save_workbook_config(&workbook)?;

    // Update global index
    let mut index = read_workbooks_index()?;
    index.insert(id, workbook.clone());
    write_workbooks_index(&index)?;

    Ok(workbook)
}

fn get_template_dir() -> Result<PathBuf, String> {
    // Find the template directory in the monorepo
    // In dev: relative to the project root
    // In production: bundled with the app

    // Try to find it relative to the current exe (for dev)
    if let Ok(exe_path) = std::env::current_exe() {
        // Go up from target/debug/hands-desktop to packages/stdlib/template
        let mut path = exe_path;
        for _ in 0..5 {
            path = path.parent().unwrap_or(&path).to_path_buf();
        }
        let template_path = path.join("packages/stdlib/template");
        if template_path.exists() {
            return Ok(template_path);
        }
    }

    // Try relative to current dir (for dev)
    let cwd_template = PathBuf::from("../../stdlib/template");
    if cwd_template.exists() {
        return Ok(cwd_template);
    }

    // Try from home directory where hands-proto might be cloned
    if let Some(home) = dirs::home_dir() {
        let home_template = home.join("hands-proto/packages/stdlib/template");
        if home_template.exists() {
            return Ok(home_template);
        }
    }

    Err("Could not find template directory".to_string())
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

fn init_sst_project(workbook_dir: &PathBuf, name: &str, description: Option<&str>) -> Result<(), String> {
    // Get template directory
    let template_dir = get_template_dir()?;

    // Copy template to workbook directory
    copy_dir_recursive(&template_dir, workbook_dir)?;

    // Replace placeholders in files
    let slug = name.to_lowercase().replace(" ", "-");
    let desc = description.unwrap_or("");

    // Update package.json
    let package_path = workbook_dir.join("package.json");
    if package_path.exists() {
        let content = fs::read_to_string(&package_path).map_err(|e| e.to_string())?;
        let content = content.replace("{{name}}", &slug);
        fs::write(&package_path, content).map_err(|e| e.to_string())?;
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
async fn list_workbooks() -> Result<Vec<Workbook>, String> {
    let hands_dir = get_hands_dir()?;

    // Read existing index
    let mut index = read_workbooks_index().unwrap_or_default();
    let mut changed = false;

    // Scan filesystem for workbook directories
    let entries = fs::read_dir(&hands_dir)
        .map_err(|e| format!("Failed to read hands directory: {}", e))?;

    let mut found_ids: Vec<String> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        // Skip files (like workbooks.json) and hidden directories
        if !path.is_dir() {
            continue;
        }

        let dir_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // Skip hidden directories and the index file
        if dir_name.starts_with('.') {
            continue;
        }

        // Check if this directory has a workbook.json (is a valid workbook)
        if let Some(workbook_config) = read_workbook_config(&path) {
            found_ids.push(workbook_config.id.clone());

            // Update index if not present or out of sync
            if !index.contains_key(&workbook_config.id) {
                index.insert(workbook_config.id.clone(), workbook_config);
                changed = true;
            }
        } else {
            // Directory exists but no workbook.json - create one from filesystem
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

            // Save config to the workbook directory
            let _ = save_workbook_config(&workbook);

            found_ids.push(dir_name.clone());
            index.insert(dir_name, workbook);
            changed = true;
        }
    }

    // Remove entries from index that no longer exist on filesystem
    let stale_ids: Vec<String> = index.keys()
        .filter(|id| !found_ids.contains(id))
        .cloned()
        .collect();

    for id in stale_ids {
        index.remove(&id);
        changed = true;
    }

    // Persist changes to index
    if changed {
        let _ = write_workbooks_index(&index);
    }

    // Convert to vec and sort by last opened
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

    // Read from workbook.json in the workbook directory
    if let Some(workbook) = read_workbook_config(&workbook_dir) {
        return Ok(workbook);
    }

    // Fallback: create config from filesystem
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

    // Save the config for next time
    let _ = save_workbook_config(&workbook);

    Ok(workbook)
}

#[tauri::command]
async fn update_workbook(workbook: Workbook) -> Result<Workbook, String> {
    let workbook_dir = get_workbook_dir(&workbook.id)?;

    if !workbook_dir.exists() {
        return Err(format!("Workbook {} not found", workbook.id));
    }

    // Save config to workbook directory
    save_workbook_config(&workbook)?;

    // Update global index
    let mut index = read_workbooks_index().unwrap_or_default();
    index.insert(workbook.id.clone(), workbook.clone());
    write_workbooks_index(&index)?;

    Ok(workbook)
}

#[tauri::command]
async fn delete_workbook(id: String) -> Result<bool, String> {
    let workbook_dir = get_workbook_dir(&id)?;

    // Remove from filesystem
    if workbook_dir.exists() {
        fs::remove_dir_all(&workbook_dir)
            .map_err(|e| format!("Failed to delete workbook: {}", e))?;
    }

    // Remove from index
    let mut index = read_workbooks_index().unwrap_or_default();
    index.remove(&id);
    let _ = write_workbooks_index(&index);

    Ok(true)
}

#[tauri::command]
async fn check_server_health(port: u16) -> Result<HealthCheck, String> {
    // Use /session endpoint since /health returns HTML (SPA)
    let url = format!("http://localhost:{}/session", port);

    match reqwest::get(&url).await {
        Ok(response) => {
            if response.status().is_success() {
                // Verify it returns JSON, not HTML
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

#[tauri::command]
async fn db_execute(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    query: String,
) -> Result<String, String> {
    let state = state.lock().await;
    let db = state.db.as_ref().ok_or("Database not initialized")?;
    sqlx::query(&query)
        .execute(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok("OK".to_string())
}

#[tauri::command]
async fn get_database_status(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<DatabaseStatus, String> {
    let state = state.lock().await;

    match &state.db {
        Some(pool) => {
            // Get database size
            let size_result: Result<(i64,), _> = sqlx::query_as(
                "SELECT pg_database_size('hands_db')"
            )
            .fetch_one(pool)
            .await;

            // Get table count
            let table_result: Result<(i64,), _> = sqlx::query_as(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
            )
            .fetch_one(pool)
            .await;

            // Get connection count
            let conn_count = pool.size() as i32;

            let stats = match (size_result, table_result) {
                (Ok((size,)), Ok((tables,))) => {
                    let formatted = format_bytes(size);
                    Some(DatabaseStats {
                        size_bytes: size,
                        size_formatted: formatted,
                        table_count: tables,
                        connection_count: conn_count,
                    })
                }
                _ => None,
            };

            Ok(DatabaseStatus {
                connected: true,
                message: "Connected".to_string(),
                port: 5433,
                database: "hands_db".to_string(),
                stats,
            })
        }
        None => Ok(DatabaseStatus {
            connected: false,
            message: "Database not initialized".to_string(),
            port: 5433,
            database: "hands_db".to_string(),
            stats: None,
        }),
    }
}

fn format_bytes(bytes: i64) -> String {
    const KB: i64 = 1024;
    const MB: i64 = KB * 1024;
    const GB: i64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

#[tauri::command]
async fn db_query(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    query: String,
) -> Result<serde_json::Value, String> {
    let state = state.lock().await;
    let db = state.db.as_ref().ok_or("Database not initialized")?;
    let rows = sqlx::query(&query)
        .fetch_all(db)
        .await
        .map_err(|e| e.to_string())?;

    // Convert rows to JSON (simplified - you'd want proper column handling)
    let result: Vec<serde_json::Value> = rows
        .iter()
        .map(|_row| serde_json::json!({}))
        .collect();
    Ok(serde_json::json!(result))
}

async fn init_postgres(data_dir: PathBuf) -> Result<(PgEmbed, PgPool), String> {
    let pg_settings = PgSettings {
        database_dir: data_dir.clone(),
        port: 5433, // Use non-standard port to avoid conflicts
        user: "hands".to_string(),
        password: "hands".to_string(),
        auth_method: PgAuthMethod::Plain,
        persistent: true,
        timeout: Some(Duration::from_secs(30)),
        migration_dir: None,
    };

    let fetch_settings = PgFetchSettings {
        version: PG_V15,
        ..Default::default()
    };

    // Create and start PostgreSQL
    let mut pg = PgEmbed::new(pg_settings, fetch_settings)
        .await
        .map_err(|e| format!("Failed to create PgEmbed: {}", e))?;

    pg.setup()
        .await
        .map_err(|e| format!("Failed to setup PostgreSQL: {}", e))?;

    pg.start_db()
        .await
        .map_err(|e| format!("Failed to start PostgreSQL: {}", e))?;

    // Create the database (ignore if already exists)
    if let Err(e) = pg.create_database("hands_db").await {
        let err_str = format!("{:?}", e);
        // Only log if it's not an "already exists" error
        if !err_str.contains("42P04") && !err_str.contains("already exists") {
            return Err(format!("Failed to create database: {}", e));
        }
        println!("Database 'hands_db' already exists, continuing...");
    }

    // Build connection string
    let connection_string = format!(
        "postgres://hands:hands@localhost:5433/hands_db"
    );

    // Create connection pool
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&connection_string)
        .await
        .map_err(|e| format!("Failed to connect to PostgreSQL: {}", e))?;

    // Run initial migrations
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS apps (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )",
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create table: {}", e))?;

    println!("PostgreSQL initialized with database 'hands_db'");

    Ok((pg, pool))
}

async fn start_opencode_server(
    port: u16,
    model: Option<String>,
    env_vars: HashMap<String, String>,
    config_dir: Option<String>,
) -> Result<Child, String> {
    // Spawn opencode serve directly
    // In debug mode, inherit stdio to see logs; in release, pipe to log file

    let port_str = port.to_string();

    // Build environment with model config if provided
    let mut all_env = env_vars.clone();
    if let Some(ref m) = model {
        // Pass model via config content
        let config = serde_json::json!({ "model": m });
        all_env.insert("OPENCODE_CONFIG_CONTENT".to_string(), config.to_string());
    }

    // Set config dir for bundled agents/tools/plugins
    if let Some(ref dir) = config_dir {
        all_env.insert("OPENCODE_CONFIG_DIR".to_string(), dir.clone());
        println!("OpenCode config dir: {}", dir);
    }

    // Try bunx first (uses local node_modules/.bin/opencode)
    let child = Command::new("bunx")
        .args(["opencode-ai", "serve", "--port", &port_str])
        .envs(&all_env)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .or_else(|_| {
            // Fallback to npx
            Command::new("npx")
                .args(["opencode-ai", "serve", "--port", &port_str])
                .envs(&all_env)
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .kill_on_drop(true)
                .spawn()
        })
        .map_err(|e| format!("Failed to start opencode server: {}", e))?;

    println!("OpenCode server starting on port {}{}", port, model.map(|m| format!(" with model {}", m)).unwrap_or_default());
    Ok(child)
}

async fn wait_for_server(port: u16, timeout_secs: u64) -> bool {
    // Use /session endpoint since /health returns HTML (SPA)
    let url = format!("http://localhost:{}/session", port);
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    while start.elapsed() < timeout {
        if let Ok(resp) = reqwest::get(&url).await {
            if resp.status().is_success() {
                // Verify it returns JSON, not HTML
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
    let mut state = state.lock().await;

    // Kill existing server if running
    if let Some(ref mut server) = state.server {
        let _ = server.kill().await;
    }

    // Read API keys and model from store
    let env_vars = get_api_keys_from_store(&app);
    let model = get_model_from_store(&app);

    // Get bundled opencode config dir (same logic as setup)
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

    // Start new server with env vars and model
    match start_opencode_server(4096, model, env_vars, config_dir).await {
        Ok(child) => {
            state.server = Some(child);

            // Wait for it to be healthy
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

fn get_api_keys_from_store(app: &tauri::AppHandle) -> HashMap<String, String> {
    let mut env_vars = HashMap::new();

    // Try to get the store
    if let Ok(store) = app.store("settings.json") {
        // List of API key settings to check
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
        // Get settings object which contains provider and model
        if let Some(settings) = store.get("settings") {
            let provider = settings.get("provider").and_then(|v| v.as_str());
            let model = settings.get("model").and_then(|v| v.as_str());

            if let (Some(p), Some(m)) = (provider, model) {
                // Return in "provider/model" format
                return Some(format!("{}/{}", p, m));
            }
        }
    }
    None
}

// Wrangler dev server status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevServerStatus {
    pub running: bool,
    pub workbook_id: String,
    pub directory: String,
    pub port: u16,
    pub message: String,
}

#[tauri::command]
async fn start_dev_server(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
    directory: String,
) -> Result<DevServerStatus, String> {
    let mut state = state.lock().await;

    // Check if already running for this workbook
    if state.sst_servers.contains_key(&workbook_id) {
        return Ok(DevServerStatus {
            running: true,
            workbook_id,
            directory,
            port: 8787,
            message: "Dev server already running".to_string(),
        });
    }

    // First, install dependencies if needed
    let node_modules = PathBuf::from(&directory).join("node_modules");
    if !node_modules.exists() {
        println!("Installing dependencies in {}...", directory);
        let install_output = std::process::Command::new("bun")
            .args(["install"])
            .current_dir(&directory)
            .output()
            .or_else(|_| {
                std::process::Command::new("npm")
                    .args(["install"])
                    .current_dir(&directory)
                    .output()
            })
            .map_err(|e| format!("Failed to install dependencies: {}", e))?;

        if !install_output.status.success() {
            return Err(format!(
                "Failed to install dependencies: {}",
                String::from_utf8_lossy(&install_output.stderr)
            ));
        }
    }

    // Initialize D1 database if schema exists
    let schema_path = PathBuf::from(&directory).join("schema.sql");
    if schema_path.exists() {
        println!("Initializing D1 database...");
        let _ = std::process::Command::new("bunx")
            .args(["wrangler", "d1", "execute", "hands-db", "--local", "--file=./schema.sql"])
            .current_dir(&directory)
            .output();
    }

    // Start wrangler dev server (Miniflare)
    let child = Command::new("bunx")
        .args(["wrangler", "dev", "--local"])
        .current_dir(&directory)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .or_else(|_| {
            Command::new("npx")
                .args(["wrangler", "dev", "--local"])
                .current_dir(&directory)
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .kill_on_drop(true)
                .spawn()
        })
        .map_err(|e| format!("Failed to start dev server: {}", e))?;

    state.sst_servers.insert(workbook_id.clone(), child);
    println!("Wrangler dev server started for workbook {} on port 8787", workbook_id);

    Ok(DevServerStatus {
        running: true,
        workbook_id,
        directory,
        port: 8787,
        message: "Dev server started on http://localhost:8787".to_string(),
    })
}

#[tauri::command]
async fn stop_dev_server(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
) -> Result<DevServerStatus, String> {
    let mut state = state.lock().await;

    if let Some(mut child) = state.sst_servers.remove(&workbook_id) {
        let _ = child.kill().await;
        println!("Dev server stopped for workbook {}", workbook_id);
        return Ok(DevServerStatus {
            running: false,
            workbook_id,
            directory: String::new(),
            port: 8787,
            message: "Dev server stopped".to_string(),
        });
    }

    Ok(DevServerStatus {
        running: false,
        workbook_id,
        directory: String::new(),
        port: 8787,
        message: "Dev server was not running".to_string(),
    })
}

#[tauri::command]
async fn get_dev_server_status(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
) -> Result<DevServerStatus, String> {
    let state = state.lock().await;

    let running = state.sst_servers.contains_key(&workbook_id);

    Ok(DevServerStatus {
        running,
        workbook_id: workbook_id.clone(),
        directory: String::new(),
        port: 8787,
        message: if running {
            "Dev server is running on http://localhost:8787".to_string()
        } else {
            "Dev server is not running".to_string()
        },
    })
}

// Dev server outputs - introspection from filesystem
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevServerOutputs {
    pub available: bool,
    pub url: String,
    pub routes: Vec<DevRoute>,
    pub charts: Vec<ChartInfo>,
    pub crons: Vec<CronTrigger>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevRoute {
    pub path: String,
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartInfo {
    pub id: String,
    pub title: String,
    pub chart_type: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronTrigger {
    pub cron: String,
    pub description: Option<String>,
}

// Parse Hono routes from src/index.ts
fn parse_routes_from_source(directory: &str) -> Vec<DevRoute> {
    let index_path = PathBuf::from(directory).join("src/index.ts");
    let mut routes = Vec::new();

    if let Ok(content) = fs::read_to_string(&index_path) {
        // Match patterns like: app.get("/path", ...) or app.post("/api/foo", ...)
        let route_pattern = regex::Regex::new(r#"app\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']"#).unwrap();

        for cap in route_pattern.captures_iter(&content) {
            let method = cap.get(1).map(|m| m.as_str().to_uppercase()).unwrap_or_default();
            let path = cap.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
            routes.push(DevRoute { method, path });
        }
    }

    routes
}

// Parse charts from charts/index.ts
fn parse_charts_from_source(directory: &str) -> Vec<ChartInfo> {
    let charts_path = PathBuf::from(directory).join("charts/index.ts");
    let mut charts = Vec::new();

    if let Ok(content) = fs::read_to_string(&charts_path) {
        // Match chart objects in the array: { id: "...", title: "...", type: "...", ... }
        // This is a simplified parser - matches id, title, type fields
        let chart_pattern = regex::Regex::new(
            r#"\{\s*id:\s*["']([^"']+)["'][^}]*title:\s*["']([^"']+)["'][^}]*type:\s*["']([^"']+)["']"#
        ).unwrap();

        for cap in chart_pattern.captures_iter(&content) {
            charts.push(ChartInfo {
                id: cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default(),
                title: cap.get(2).map(|m| m.as_str().to_string()).unwrap_or_default(),
                chart_type: cap.get(3).map(|m| m.as_str().to_string()).unwrap_or_default(),
                description: None,
            });
        }
    }

    charts
}

// Parse cron triggers from wrangler.toml
fn parse_crons_from_wrangler(directory: &str) -> Vec<CronTrigger> {
    let wrangler_path = PathBuf::from(directory).join("wrangler.toml");
    let mut crons = Vec::new();

    if let Ok(content) = fs::read_to_string(&wrangler_path) {
        if let Ok(config) = content.parse::<toml::Table>() {
            // Look for [triggers] section with crons array
            if let Some(triggers) = config.get("triggers") {
                if let Some(cron_array) = triggers.get("crons") {
                    if let Some(arr) = cron_array.as_array() {
                        for cron_value in arr {
                            if let Some(cron_str) = cron_value.as_str() {
                                crons.push(CronTrigger {
                                    cron: cron_str.to_string(),
                                    description: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    crons
}

#[tauri::command]
async fn get_dev_server_routes(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    workbook_id: String,
) -> Result<DevServerOutputs, String> {
    let state = state.lock().await;
    let running = state.sst_servers.contains_key(&workbook_id);

    // Get workbook directory - parse filesystem even if server not running
    let workbook_dir = get_workbook_dir(&workbook_id)?;
    let directory = workbook_dir.to_string_lossy().to_string();

    // Check if this looks like a valid workbook (has wrangler.toml)
    let wrangler_exists = PathBuf::from(&directory).join("wrangler.toml").exists();

    if !wrangler_exists {
        return Ok(DevServerOutputs {
            available: false,
            url: String::new(),
            routes: vec![],
            charts: vec![],
            crons: vec![],
        });
    }

    // Parse routes from src/index.ts, charts from charts/, crons from wrangler.toml
    let routes = parse_routes_from_source(&directory);
    let charts = parse_charts_from_source(&directory);
    let crons = parse_crons_from_wrangler(&directory);

    Ok(DevServerOutputs {
        available: true,
        url: if running { "http://localhost:8787".to_string() } else { String::new() },
        routes,
        charts,
        crons,
    })
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

    // Create data directory if it doesn't exist
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

        // Copy the file
        fs::copy(&source, &dest).map_err(|e| format!("Failed to copy {}: {}", source_path, e))?;

        copied_files.push(dest.to_string_lossy().to_string());
    }

    Ok(CopyFilesResult {
        copied_files,
        data_dir: data_dir.to_string_lossy().to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            check_server_health,
            db_query,
            db_execute,
            copy_files_to_workbook,
            restart_server,
            get_database_status,
            create_workbook,
            list_workbooks,
            get_workbook,
            update_workbook,
            delete_workbook,
            start_dev_server,
            stop_dev_server,
            get_dev_server_status,
            get_dev_server_routes
        ])
        .setup(|app| {
            // Initialize empty state first
            let state = Arc::new(Mutex::new(AppState {
                db: None,
                pg: None,
                server: None,
                sst_servers: HashMap::new(),
            }));
            app.manage(state.clone());

            // Get app data directory for storing postgres data
            let app_handle = app.handle().clone();
            let data_dir = app_handle
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir")
                .join("postgres");

            // Get API keys and model from store for initial server start
            let env_vars = get_api_keys_from_store(&app_handle);
            let model = get_model_from_store(&app_handle);

            // Get bundled opencode config dir (contains agents, tools, plugins)
            // In dev mode, resource_dir() points to target/debug where build.rs copies the resources
            // In production, resources are bundled by Tauri based on tauri.conf.json
            let config_dir = app_handle.path().resource_dir()
                .ok()
                .map(|p| p.join("opencode"))
                .filter(|p| p.exists())
                .or_else(|| {
                    // Fallback: check relative to exe for non-standard setups
                    std::env::current_exe().ok().and_then(|exe| {
                        let dev_path = exe.parent()?.join("resources/opencode");
                        if dev_path.exists() {
                            return Some(dev_path);
                        }
                        // Also try walking up to find src-tauri/resources
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

            // Initialize postgres and server in background
            tauri::async_runtime::spawn(async move {
                // Start PostgreSQL
                match init_postgres(data_dir).await {
                    Ok((pg, pool)) => {
                        let mut s = state.lock().await;
                        s.db = Some(pool);
                        s.pg = Some(pg);
                        println!("PostgreSQL started successfully on port 5433!");
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize PostgreSQL: {}", e);
                    }
                }

                // Start OpenCode server with API keys and model
                match start_opencode_server(4096, model, env_vars, config_dir).await {
                    Ok(child) => {
                        let mut s = state.lock().await;
                        s.server = Some(child);

                        // Wait for server to be ready
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

            // Set transparent background on macOS using objc2
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
