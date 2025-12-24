// Workbook - a discrete project/environment with its own code repo and sessions
// Re-export from platform types for consistency
export type { Workbook } from "../platform/types";

// Extended workbook with editor state
export interface WorkbookWithEditorState {
  id: string;
  name: string;
  description?: string;
  // Path to the git repo: ~/.hands/<id>/ (optional on web)
  directory?: string;
  // Timestamps (from Rust: created_at, updated_at, last_opened_at)
  created_at: number;
  updated_at: number;
  // Last opened - for sorting
  last_opened_at: number;
  // Editor state (cursor positions, open files, etc.)
  editorState?: EditorState;
  // App-specific state
  appState?: Record<string, unknown>;
}

export interface EditorState {
  // Files currently open in editor tabs
  openFiles: string[];
  // Currently active file
  activeFile?: string;
  // Cursor positions per file
  cursors: Record<string, { line: number; column: number }>;
  // Scroll positions per file
  scrollPositions: Record<string, { top: number; left: number }>;
}

export interface WorkbookSession {
  workbookId: string;
  sessionId: string;
  // OpenCode session info is stored by OpenCode itself
  // We just track the relationship
}

// Generate a unique workbook ID
export function generateWorkbookId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `wb_${timestamp}${random}`;
}

// Get the directory path for a workbook
export function getWorkbookDirectory(id: string): string {
  // This will be resolved by Rust to ~/.hands/<id>/
  return id;
}
