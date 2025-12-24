//! Background job tracking for workbook sessions.
//!
//! Tracks active AI sessions and provides job status for tray menu.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Status of a background job
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Information about an active job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobInfo {
    pub id: String,
    pub workbook_id: String,
    pub session_id: String,
    pub status: JobStatus,
    pub description: String,
    pub started_at: u64,
    pub updated_at: u64,
}

impl JobInfo {
    pub fn new(workbook_id: String, session_id: String, description: String) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Self {
            id: format!("job_{}_{}", session_id, now),
            workbook_id,
            session_id,
            status: JobStatus::Running,
            description,
            started_at: now,
            updated_at: now,
        }
    }

    pub fn is_active(&self) -> bool {
        self.status == JobStatus::Running
    }
}

/// Registry for tracking background jobs across all workbooks
#[derive(Debug, Default)]
pub struct JobRegistry {
    jobs: HashMap<String, JobInfo>,
    active_count: AtomicU64,
}

impl JobRegistry {
    pub fn new() -> Self {
        Self {
            jobs: HashMap::new(),
            active_count: AtomicU64::new(0),
        }
    }

    /// Register a new job when AI starts processing
    pub fn register(&mut self, workbook_id: &str, session_id: &str, description: &str) -> String {
        let job = JobInfo::new(
            workbook_id.to_string(),
            session_id.to_string(),
            description.to_string(),
        );
        let job_id = job.id.clone();

        self.jobs.insert(job_id.clone(), job);
        self.active_count.fetch_add(1, Ordering::Relaxed);

        job_id
    }

    /// Update job status
    pub fn update_status(&mut self, job_id: &str, status: JobStatus) {
        if let Some(job) = self.jobs.get_mut(job_id) {
            let was_active = job.is_active();
            job.status = status;
            job.updated_at = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            // Update active count
            if was_active && !job.is_active() {
                self.active_count.fetch_sub(1, Ordering::Relaxed);
            }
        }
    }

    /// Mark a job as completed
    pub fn complete(&mut self, job_id: &str) {
        self.update_status(job_id, JobStatus::Completed);
    }

    /// Mark a job as failed
    pub fn fail(&mut self, job_id: &str) {
        self.update_status(job_id, JobStatus::Failed);
    }

    /// Cancel a job
    pub fn cancel(&mut self, job_id: &str) {
        self.update_status(job_id, JobStatus::Cancelled);
    }

    /// Find job by session ID
    pub fn find_by_session(&self, session_id: &str) -> Option<&JobInfo> {
        self.jobs.values().find(|j| j.session_id == session_id)
    }

    /// Find active job by session ID
    pub fn find_active_by_session(&self, session_id: &str) -> Option<&JobInfo> {
        self.jobs
            .values()
            .find(|j| j.session_id == session_id && j.is_active())
    }

    /// Get job by ID
    pub fn get(&self, job_id: &str) -> Option<&JobInfo> {
        self.jobs.get(job_id)
    }

    /// Check if a workbook has any active jobs
    pub fn has_active_jobs(&self, workbook_id: &str) -> bool {
        self.jobs
            .values()
            .any(|j| j.workbook_id == workbook_id && j.is_active())
    }

    /// Get all active jobs
    pub fn list_active(&self) -> Vec<&JobInfo> {
        self.jobs.values().filter(|j| j.is_active()).collect()
    }

    /// Get all active jobs for a workbook
    pub fn list_active_for_workbook(&self, workbook_id: &str) -> Vec<&JobInfo> {
        self.jobs
            .values()
            .filter(|j| j.workbook_id == workbook_id && j.is_active())
            .collect()
    }

    /// Get total active job count
    pub fn active_count(&self) -> u64 {
        self.active_count.load(Ordering::Relaxed)
    }

    /// Get workbooks with active jobs
    pub fn workbooks_with_active_jobs(&self) -> Vec<String> {
        let mut workbooks: Vec<String> = self
            .jobs
            .values()
            .filter(|j| j.is_active())
            .map(|j| j.workbook_id.clone())
            .collect();
        workbooks.sort();
        workbooks.dedup();
        workbooks
    }

    /// Clean up old completed/failed jobs (older than 1 hour)
    pub fn cleanup_old(&mut self) {
        let one_hour_ago = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
            - (60 * 60 * 1000);

        self.jobs
            .retain(|_, job| job.is_active() || job.updated_at > one_hour_ago);
    }
}

/// SSE event types from OpenCode server
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SessionEvent {
    #[serde(rename = "session.updated")]
    SessionUpdated {
        #[serde(rename = "sessionId")]
        session_id: String,
        status: Option<String>,
    },
    #[serde(rename = "session.status")]
    SessionStatus {
        #[serde(rename = "sessionId")]
        session_id: String,
        status: String,
    },
    #[serde(rename = "message.part.updated")]
    MessagePartUpdated {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    #[serde(other)]
    Unknown,
}

impl SessionEvent {
    /// Parse session status to determine if job is active
    pub fn is_running_status(status: &str) -> bool {
        matches!(status, "running" | "pending" | "streaming")
    }

    pub fn is_completed_status(status: &str) -> bool {
        matches!(status, "completed" | "idle" | "done")
    }

    pub fn is_failed_status(status: &str) -> bool {
        matches!(status, "failed" | "error" | "cancelled")
    }
}
