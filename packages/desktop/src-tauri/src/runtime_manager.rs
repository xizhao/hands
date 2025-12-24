//! Runtime manager for multiple concurrent workbook runtimes.
//!
//! Handles dynamic port allocation and lifecycle management.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU16, AtomicUsize, Ordering};
use tokio::process::Child;
use serde::{Deserialize, Serialize};

/// Port allocation scheme:
/// - 55000: Reserved (launcher/legacy)
/// - 55001-55049: Dynamic runtime ports (workbook servers)
/// - 55050-55099: Reserved for future use
/// - 55100-55149: Postgres ports
/// - 55150-55199: Reserved for future use
/// - 55200-55249: Worker ports
/// - 55300: OpenCode server (shared)
const RUNTIME_PORT_START: u16 = 55001;
const RUNTIME_PORT_END: u16 = 55049;

/// Information about a running workbook runtime
#[derive(Debug)]
pub struct RuntimeInfo {
    pub workbook_id: String,
    pub runtime_port: u16,
    pub postgres_port: u16,
    pub worker_port: u16,
    pub process: Child,
    pub directory: String,
    pub restart_count: u32,
    pub active_jobs: AtomicUsize,
    pub windows: HashSet<String>, // window labels using this runtime
}

impl RuntimeInfo {
    pub fn has_active_jobs(&self) -> bool {
        self.active_jobs.load(Ordering::Relaxed) > 0
    }

    pub fn increment_jobs(&self) {
        self.active_jobs.fetch_add(1, Ordering::Relaxed);
    }

    pub fn decrement_jobs(&self) {
        self.active_jobs.fetch_sub(1, Ordering::Relaxed);
    }
}

/// Manages multiple concurrent workbook runtimes
pub struct RuntimeManager {
    /// Map of workbook_id -> RuntimeInfo
    runtimes: HashMap<String, RuntimeInfo>,
    /// Set of allocated runtime ports
    allocated_ports: HashSet<u16>,
    /// Next port to try
    next_port: AtomicU16,
}

impl Default for RuntimeManager {
    fn default() -> Self {
        Self::new()
    }
}

impl RuntimeManager {
    pub fn new() -> Self {
        Self {
            runtimes: HashMap::new(),
            allocated_ports: HashSet::new(),
            next_port: AtomicU16::new(RUNTIME_PORT_START),
        }
    }

    /// Allocate a new runtime port
    pub fn allocate_port(&mut self) -> Option<u16> {
        let start = self.next_port.load(Ordering::Relaxed);
        let mut port = start;

        loop {
            if !self.allocated_ports.contains(&port) {
                self.allocated_ports.insert(port);
                // Move to next port for next allocation
                self.next_port.store(
                    if port >= RUNTIME_PORT_END { RUNTIME_PORT_START } else { port + 1 },
                    Ordering::Relaxed
                );
                return Some(port);
            }

            port = if port >= RUNTIME_PORT_END { RUNTIME_PORT_START } else { port + 1 };

            // If we've checked all ports, none available
            if port == start {
                return None;
            }
        }
    }

    /// Release a port back to the pool
    pub fn release_port(&mut self, port: u16) {
        self.allocated_ports.remove(&port);
    }

    /// Get runtime for a workbook
    pub fn get(&self, workbook_id: &str) -> Option<&RuntimeInfo> {
        self.runtimes.get(workbook_id)
    }

    /// Get mutable runtime for a workbook
    pub fn get_mut(&mut self, workbook_id: &str) -> Option<&mut RuntimeInfo> {
        self.runtimes.get_mut(workbook_id)
    }

    /// Check if a workbook has a running runtime
    pub fn has_runtime(&self, workbook_id: &str) -> bool {
        self.runtimes.contains_key(workbook_id)
    }

    /// Insert a new runtime
    pub fn insert(&mut self, workbook_id: String, info: RuntimeInfo) {
        self.allocated_ports.insert(info.runtime_port);
        self.runtimes.insert(workbook_id, info);
    }

    /// Remove a runtime and release its port
    pub fn remove(&mut self, workbook_id: &str) -> Option<RuntimeInfo> {
        if let Some(info) = self.runtimes.remove(workbook_id) {
            self.release_port(info.runtime_port);
            Some(info)
        } else {
            None
        }
    }

    /// Get all workbook IDs with running runtimes
    pub fn workbook_ids(&self) -> Vec<String> {
        self.runtimes.keys().cloned().collect()
    }

    /// Get count of active runtimes
    pub fn count(&self) -> usize {
        self.runtimes.len()
    }

    /// Check if any runtime has active jobs
    pub fn any_active_jobs(&self) -> bool {
        self.runtimes.values().any(|r| r.has_active_jobs())
    }

    /// Get list of workbooks with active jobs
    pub fn workbooks_with_active_jobs(&self) -> Vec<String> {
        self.runtimes
            .iter()
            .filter(|(_, r)| r.has_active_jobs())
            .map(|(id, _)| id.clone())
            .collect()
    }

    /// Register a window as using a runtime
    pub fn register_window(&mut self, workbook_id: &str, window_label: String) {
        if let Some(runtime) = self.runtimes.get_mut(workbook_id) {
            runtime.windows.insert(window_label);
        }
    }

    /// Unregister a window from a runtime
    pub fn unregister_window(&mut self, workbook_id: &str, window_label: &str) -> bool {
        if let Some(runtime) = self.runtimes.get_mut(workbook_id) {
            runtime.windows.remove(window_label);
            runtime.windows.is_empty()
        } else {
            false
        }
    }

    /// Get iterator over all runtimes
    pub fn iter(&self) -> impl Iterator<Item = (&String, &RuntimeInfo)> {
        self.runtimes.iter()
    }

    /// Get mutable iterator over all runtimes
    pub fn iter_mut(&mut self) -> impl Iterator<Item = (&String, &mut RuntimeInfo)> {
        self.runtimes.iter_mut()
    }
}

/// Status of a workbook runtime for API responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeStatus {
    pub workbook_id: String,
    pub running: bool,
    pub runtime_port: u16,
    pub postgres_port: u16,
    pub worker_port: u16,
    pub active_jobs: usize,
    pub window_count: usize,
}

impl From<&RuntimeInfo> for RuntimeStatus {
    fn from(info: &RuntimeInfo) -> Self {
        Self {
            workbook_id: info.workbook_id.clone(),
            running: true,
            runtime_port: info.runtime_port,
            postgres_port: info.postgres_port,
            worker_port: info.worker_port,
            active_jobs: info.active_jobs.load(Ordering::Relaxed),
            window_count: info.windows.len(),
        }
    }
}
