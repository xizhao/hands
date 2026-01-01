//! Sidecar binary management
//!
//! Always uses pre-compiled standalone binaries to ensure dev/prod parity.
//! Run `bun run build:sidecars` to compile the TypeScript sidecars.

use std::path::PathBuf;
use tokio::process::Command;

/// Available sidecar binaries
#[derive(Debug, Clone, Copy)]
pub enum Sidecar {
    /// Workbook initialization CLI
    Cli,
    /// Workbook runtime server
    WorkbookServer,
    /// OpenCode agent server
    Agent,
    /// Bun runtime (for vite dev server)
    Bun,
}

impl Sidecar {
    /// Get the sidecar name (used for externalBin lookup)
    pub fn name(&self) -> &'static str {
        match self {
            Sidecar::Cli => "hands-cli",
            Sidecar::WorkbookServer => "hands-workbook-server",
            Sidecar::Agent => "hands-agent",
            Sidecar::Bun => "bun",
        }
    }
}

/// Get the path to a sidecar binary
fn get_sidecar_path(sidecar: Sidecar) -> PathBuf {
    #[cfg(debug_assertions)]
    {
        // Dev mode - binaries are in src-tauri/binaries/
        let binaries_dir = format!("{}/binaries", env!("CARGO_MANIFEST_DIR"));
        let target = get_target_triple();
        let binary_name = format!("{}-{}", sidecar.name(), target);
        PathBuf::from(binaries_dir).join(binary_name)
    }

    #[cfg(not(debug_assertions))]
    {
        // Production - Tauri v2 puts binaries in Contents/MacOS/ without target triple suffix
        let exe_dir = std::env::current_exe()
            .expect("Failed to get executable path")
            .parent()
            .expect("Failed to get executable directory")
            .to_path_buf();

        #[cfg(target_os = "macos")]
        {
            // Tauri v2 bundles externalBin to MacOS/ folder, not Resources/
            exe_dir.join(sidecar.name())
        }

        #[cfg(target_os = "windows")]
        {
            exe_dir.join(format!("{}.exe", sidecar.name()))
        }

        #[cfg(target_os = "linux")]
        {
            exe_dir.join(sidecar.name())
        }
    }
}

/// Get the target triple for the current platform (dev builds only)
#[cfg(debug_assertions)]
fn get_target_triple() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { "aarch64-apple-darwin" }

    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    { "x86_64-apple-darwin" }

    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    { "x86_64-unknown-linux-gnu" }

    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    { "aarch64-unknown-linux-gnu" }

    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    { "x86_64-pc-windows-msvc" }
}

/// Get the directory containing sidecar binaries
/// This is used to set PATH so child processes can find bundled binaries like opencode
pub fn get_sidecar_dir() -> PathBuf {
    #[cfg(debug_assertions)]
    {
        // Dev mode - binaries are in src-tauri/binaries/
        PathBuf::from(format!("{}/binaries", env!("CARGO_MANIFEST_DIR")))
    }

    #[cfg(not(debug_assertions))]
    {
        // Production - Tauri v2 puts binaries in Contents/MacOS/
        std::env::current_exe()
            .expect("Failed to get executable path")
            .parent()
            .expect("Failed to get executable directory")
            .to_path_buf()
    }
}

/// Create a command for running a sidecar with PATH set to include sidecar directory
pub fn command(sidecar: Sidecar) -> Command {
    let binary_path = get_sidecar_path(sidecar);
    println!("[sidecar] Running {:?} from: {:?}", sidecar, binary_path);

    // Check if binary exists and is executable
    if !binary_path.exists() {
        eprintln!("[sidecar] ERROR: Binary not found at {:?}", binary_path);
    }

    let mut cmd = Command::new(binary_path);

    // Set PATH to include sidecar directory so child processes can find bundled binaries
    let sidecar_dir = get_sidecar_dir();
    let current_path = std::env::var("PATH").unwrap_or_default();
    let new_path = format!("{}:{}", sidecar_dir.to_string_lossy(), current_path);
    cmd.env("PATH", new_path);

    cmd
}

/// Create a synchronous command for running a sidecar with PATH set to include sidecar directory
pub fn command_sync(sidecar: Sidecar) -> std::process::Command {
    let binary_path = get_sidecar_path(sidecar);
    println!("[sidecar] Running {:?} from: {:?}", sidecar, binary_path);

    if !binary_path.exists() {
        eprintln!("[sidecar] ERROR: Binary not found at {:?}", binary_path);
    }

    let mut cmd = std::process::Command::new(binary_path);

    // Set PATH to include sidecar directory so child processes can find bundled binaries
    let sidecar_dir = get_sidecar_dir();
    let current_path = std::env::var("PATH").unwrap_or_default();
    let new_path = format!("{}:{}", sidecar_dir.to_string_lossy(), current_path);
    cmd.env("PATH", new_path);

    cmd
}
