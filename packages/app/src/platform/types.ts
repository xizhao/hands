/**
 * Platform Adapter Interface
 *
 * Abstracts platform-specific operations (Tauri IPC, Cloud API, etc.)
 * to enable code sharing between desktop and web versions.
 */

// ============================================================================
// Core Types
// ============================================================================

export interface Workbook {
  id: string;
  name: string;
  description?: string;
  path?: string;
  directory?: string;
  created_at: number;
  updated_at: number;
  last_opened_at: number;
}

export interface RuntimeConnection {
  workbookId: string;
  port: number;
  tRpcUrl: string;
  status: "starting" | "running" | "stopped" | "error";
}

export interface RuntimeStatus {
  running: boolean;
  workbook_id: string;
  /**
   * Workbook directory path (desktop) or workbook ID (web).
   * Used as a unique identifier for the active workbook context.
   * Desktop: filesystem path like "/Users/name/workbooks/my-project"
   * Web: workbook ID like "abc123" (no filesystem access)
   */
  directory: string | undefined;
  runtime_port: number;
  message: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

export interface FilePickerOptions {
  multiple?: boolean;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
  defaultPath?: string;
  title?: string;
}

// ============================================================================
// Persistence Types
// ============================================================================

export interface PersistenceStatus {
  /** Whether there are unsaved changes */
  hasChanges: boolean;
  /** Last save timestamp */
  lastSaved: number | null;
  /** Whether sync is available */
  canSync: boolean;
  /** Remote status (for git/cloud sync) */
  remote?: {
    url: string | null;
    ahead: number;
    behind: number;
  };
}

export interface SaveResult {
  /** Unique identifier for this save (commit hash, snapshot id, etc.) */
  id: string;
  /** Save message */
  message: string;
  /** Timestamp */
  timestamp: number;
}

export interface HistoryEntry {
  /** Unique identifier */
  id: string;
  /** Short identifier for display */
  shortId: string;
  /** Entry message */
  message: string;
  /** Author name */
  author: string;
  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// tRPC Client Type (generic to avoid importing @trpc/client in types)
// ============================================================================

/** Generic tRPC client interface - actual type comes from platform implementation */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TRPCClientLike = any;

// ============================================================================
// Platform Capabilities
// ============================================================================

export interface PlatformCapabilities {
  /** Can access local filesystem directly */
  localFiles: boolean;
  /** Has native OS menu bar */
  nativeMenus: boolean;
  /** Works without internet connection */
  offlineSupport: boolean;
  /** Can sync data to cloud */
  cloudSync: boolean;
  /** Requires authentication */
  authentication: boolean;
}

// ============================================================================
// Platform Adapter Interface
// ============================================================================

export interface PlatformAdapter {
  // ============================================================================
  // Authentication (web only - desktop uses local mode)
  // ============================================================================
  auth?: {
    /** Get current authenticated user */
    getUser(): Promise<User | null>;
    /** Start OAuth flow */
    startOAuth(provider: string): Promise<void>;
    /** Logout current user */
    logout(): Promise<void>;
    /** Get current auth token */
    getToken(): string | null;
  };

  // ============================================================================
  // Workbook Lifecycle
  // ============================================================================
  workbook: {
    /** List all workbooks */
    list(): Promise<Workbook[]>;
    /** Create a new workbook */
    create(name: string, template?: string): Promise<Workbook>;
    /** Open a workbook and start its runtime */
    open(workbook: Workbook): Promise<RuntimeConnection>;
    /** Update workbook metadata */
    update?(workbook: Workbook): Promise<Workbook>;
    /** Delete a workbook */
    delete(id: string): Promise<void>;
  };

  // ============================================================================
  // Runtime Management
  // ============================================================================
  runtime: {
    /** Get current runtime status */
    getStatus(): Promise<RuntimeStatus | null>;
    /** Check if runtime is ready to use (desktop: port available, web: always ready) */
    isReady(): Promise<boolean>;
    /** Stop runtime for a workbook */
    stop(workbookId: string): Promise<void>;
    /** Trigger workbook evaluation */
    eval(workbookId: string): Promise<unknown>;
  };

  // ============================================================================
  // File System (desktop only)
  // ============================================================================
  fs?: {
    /** Open file picker dialog */
    pickFile(options?: FilePickerOptions): Promise<string | null>;
    /** Open directory picker dialog */
    pickDirectory(): Promise<string | null>;
    /** Read file contents */
    readFile?(path: string): Promise<Uint8Array>;
    /** Write file contents */
    writeFile?(path: string, data: Uint8Array): Promise<void>;
  };

  // ============================================================================
  // Window Management (desktop only)
  // ============================================================================
  window?: {
    /** Minimize window */
    minimize(): void;
    /** Toggle maximize */
    maximize(): void;
    /** Close window */
    close(): void;
    /** Set window title */
    setTitle(title: string): void;
    /** Check if window is maximized */
    isMaximized?(): Promise<boolean>;
    /** Check if window is fullscreen */
    isFullscreen?(): Promise<boolean>;
    /** Toggle fullscreen */
    toggleFullscreen?(): Promise<void>;
  };

  // ============================================================================
  // Storage (settings, preferences)
  // ============================================================================
  storage?: {
    /** Get a value from storage */
    get<T>(key: string): Promise<T | null>;
    /** Set a value in storage */
    set<T>(key: string, value: T): Promise<void>;
    /** Delete a value from storage */
    delete(key: string): Promise<void>;
  };

  // ============================================================================
  // Server Management (desktop only)
  // ============================================================================
  server?: {
    /** Restart the backend server */
    restart(): Promise<{ healthy: boolean; message: string }>;
    /** Get server health status */
    health(): Promise<{ healthy: boolean; message: string }>;
  };

  // ============================================================================
  // Window Events (desktop only)
  // ============================================================================
  windowEvents?: {
    /** Subscribe to window resize/fullscreen events */
    onResize(callback: () => void): () => void;
  };

  // ============================================================================
  // Navigation (cross-window routing)
  // ============================================================================
  navigation?: {
    /** Navigate to a route (used for cross-window navigation in desktop) */
    navigateInWorkbook(workbookId: string, route: string): Promise<void>;
    /** Subscribe to navigation events from other windows */
    onNavigate(callback: (route: string) => void): () => void;
  };

  // ============================================================================
  // AI / OpenCode
  // ============================================================================
  ai: {
    /** Get OpenCode client URL (desktop: local, web: cloud proxy) */
    getOpenCodeUrl(): string;
  };

  // ============================================================================
  // Persistence (saving, versioning, sync)
  // ============================================================================
  persistence: {
    /** Get current persistence status */
    getStatus(): Promise<PersistenceStatus>;
    /** Save current state with optional message */
    save(message?: string): Promise<SaveResult | null>;
    /** Get save history */
    getHistory(limit?: number): Promise<HistoryEntry[]>;
    /** Revert to a previous state */
    revert(entryId: string): Promise<void>;
    /** Sync operations (optional - git push/pull on desktop, cloud sync on web) */
    sync?: {
      /** Push local changes to remote */
      push(): Promise<void>;
      /** Pull remote changes */
      pull(): Promise<void>;
      /** Get remote URL */
      getRemote(): Promise<string | null>;
      /** Set remote URL */
      setRemote(url: string): Promise<void>;
    };
  };

  // ============================================================================
  // tRPC Client Factory
  // ============================================================================
  /**
   * Create a tRPC client for this platform.
   * Desktop: HTTP client to runtime server
   * Web: Local in-browser router
   */
  createTRPCClient?(): TRPCClientLike;

  // ============================================================================
  // Platform Info
  // ============================================================================
  /** Platform identifier */
  platform: "desktop" | "web";
  /** Platform capabilities */
  capabilities: PlatformCapabilities;
}
