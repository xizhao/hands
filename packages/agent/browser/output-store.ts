/**
 * Output Store (IndexedDB VFS)
 *
 * Stores large tool outputs outside of chat messages.
 * Allows agents to read subsections via the readOutput tool.
 */

// ============================================================================
// Types
// ============================================================================

export interface StoredOutput {
  id: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  content: string;
  totalLines: number;
  totalChars: number;
  createdAt: number;
}

export interface OutputPreview {
  /** Reference ID for readOutput tool */
  outputId: string;
  /** First N lines or chars of content */
  preview: string;
  /** Total lines in full output */
  totalLines: number;
  /** Total characters in full output */
  totalChars: number;
  /** Whether there's more content beyond preview */
  hasMore: boolean;
  /** Message for the agent */
  message: string;
}

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = "hands-output-store";
const DB_VERSION = 1;
const STORE_NAME = "outputs";

/** Maximum chars to inline in tool result (before storing externally) */
export const INLINE_LIMIT = 5_000;
/** Maximum lines to show in preview */
export const PREVIEW_LINES = 15;
/** Maximum chars to show in preview */
export const PREVIEW_CHARS = 2_000;

// ============================================================================
// IndexedDB Helpers
// ============================================================================

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });

  return dbPromise;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a short ID for stored outputs.
 */
function generateOutputId(): string {
  return `out_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Store a large output and return a preview with reference ID.
 * If content is small enough, returns null (caller should inline it).
 */
export async function storeOutput(
  content: string,
  meta: {
    sessionId: string;
    toolCallId: string;
    toolName: string;
  }
): Promise<OutputPreview | null> {
  // Don't store if small enough to inline
  if (content.length <= INLINE_LIMIT) {
    return null;
  }

  const id = generateOutputId();
  const lines = content.split("\n");
  const totalLines = lines.length;
  const totalChars = content.length;

  // Create preview (first N lines, capped at PREVIEW_CHARS)
  let preview = "";
  let lineCount = 0;
  for (const line of lines) {
    if (lineCount >= PREVIEW_LINES || preview.length >= PREVIEW_CHARS) break;
    preview += (lineCount > 0 ? "\n" : "") + line;
    lineCount++;
  }
  if (preview.length > PREVIEW_CHARS) {
    preview = preview.slice(0, PREVIEW_CHARS) + "...";
  }

  const storedOutput: StoredOutput = {
    id,
    sessionId: meta.sessionId,
    toolCallId: meta.toolCallId,
    toolName: meta.toolName,
    content,
    totalLines,
    totalChars,
    createdAt: Date.now(),
  };

  // Store in IndexedDB
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(storedOutput);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });

  return {
    outputId: id,
    preview,
    totalLines,
    totalChars,
    hasMore: totalChars > preview.length,
    message: `Full output stored (${totalLines} lines, ${totalChars} chars). Use readOutput tool with id="${id}" to read more.`,
  };
}

/**
 * Read a stored output, optionally with line-based pagination.
 */
export async function readStoredOutput(
  id: string,
  options?: {
    /** Start line (0-indexed) */
    offset?: number;
    /** Number of lines to read */
    limit?: number;
  }
): Promise<{
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  hasMore: boolean;
} | null> {
  const db = await openDB();

  const stored = await new Promise<StoredOutput | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });

  if (!stored) return null;

  const lines = stored.content.split("\n");
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 100;

  const startLine = Math.max(0, Math.min(offset, lines.length));
  const endLine = Math.min(startLine + limit, lines.length);
  const content = lines.slice(startLine, endLine).join("\n");

  return {
    content,
    startLine,
    endLine,
    totalLines: lines.length,
    hasMore: endLine < lines.length,
  };
}

/**
 * Get metadata about a stored output without reading content.
 */
export async function getOutputMeta(id: string): Promise<{
  id: string;
  toolName: string;
  totalLines: number;
  totalChars: number;
  createdAt: number;
} | null> {
  const db = await openDB();

  const stored = await new Promise<StoredOutput | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });

  if (!stored) return null;

  return {
    id: stored.id,
    toolName: stored.toolName,
    totalLines: stored.totalLines,
    totalChars: stored.totalChars,
    createdAt: stored.createdAt,
  };
}

/**
 * Delete old outputs for a session (cleanup).
 */
export async function pruneOutputs(
  sessionId: string,
  olderThan?: number
): Promise<number> {
  const db = await openDB();
  const cutoff = olderThan ?? Date.now() - 24 * 60 * 60 * 1000; // Default: 24 hours

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("sessionId");
    const request = index.openCursor(IDBKeyRange.only(sessionId));

    let deleted = 0;

    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value as StoredOutput;
        if (record.createdAt < cutoff) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      } else {
        resolve(deleted);
      }
    };
  });
}

/**
 * List all outputs for a session (for debugging/cleanup).
 */
export async function listOutputs(sessionId: string): Promise<Array<{
  id: string;
  toolName: string;
  totalChars: number;
  createdAt: number;
}>> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("sessionId");
    const request = index.getAll(IDBKeyRange.only(sessionId));

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = (request.result as StoredOutput[]).map((r) => ({
        id: r.id,
        toolName: r.toolName,
        totalChars: r.totalChars,
        createdAt: r.createdAt,
      }));
      resolve(results);
    };
  });
}
