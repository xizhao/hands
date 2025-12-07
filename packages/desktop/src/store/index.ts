/**
 * TanStack DB Store
 *
 * Replaces React Query + manual SSE cache updates with TanStack DB collections.
 * Collections are populated via SSE events from the opencode SDK.
 *
 * Architecture:
 * - Collections hold normalized data (sessions, messages, parts, etc.)
 * - SSE events write directly to collections via sync writers
 * - useLiveQuery provides reactive queries with sub-ms updates
 * - Full session sync on focus handles any missed SSE events
 */

import { createCollection } from "@tanstack/db"
import type {
  Session as SdkSession,
  Message as SdkMessage,
  Part as SdkPart,
  SessionStatus as SdkSessionStatus,
  Todo as SdkTodo,
} from "@opencode-ai/sdk/client"
import { subscribeToEvents, api, type ServerEvent, type SessionStatus } from "@/lib/api"

// ============ COLLECTION TYPES ============

// We store the SDK types directly
export type SessionRecord = SdkSession
export type MessageRecord = SdkMessage
export type PartRecord = SdkPart

export interface SessionStatusRecord {
  sessionId: string
  status: SessionStatus
}

export interface TodoRecord {
  id: string
  sessionId: string
  content: string
  status: "pending" | "in_progress" | "completed"
}

export interface FileDiffRecord {
  id: string
  sessionId: string
  file: string
  additions?: number
  deletions?: number
  before?: string
  after?: string
}

// ============ SYNC WRITER INTERFACE ============

type SyncWriter<T> = {
  begin: () => void
  write: (message: { value: T; type: "insert" | "update" | "delete" }) => void
  commit: () => void
  markReady: () => void
}

// Sync writers are populated when collections initialize
const syncWriters = {
  sessions: null as SyncWriter<SessionRecord> | null,
  messages: null as SyncWriter<MessageRecord> | null,
  parts: null as SyncWriter<PartRecord> | null,
  sessionStatus: null as SyncWriter<SessionStatusRecord> | null,
  todos: null as SyncWriter<TodoRecord> | null,
  fileDiffs: null as SyncWriter<FileDiffRecord> | null,
}

// ============ COLLECTIONS ============

export const sessionsCollection = createCollection<SessionRecord, string>({
  id: "sessions",
  getKey: (s) => s.id,
  sync: {
    sync: ({ begin, write, commit, markReady }) => {
      syncWriters.sessions = { begin, write, commit, markReady }
      markReady()
    },
  },
})

export const messagesCollection = createCollection<MessageRecord, string>({
  id: "messages",
  getKey: (m) => m.id,
  sync: {
    sync: ({ begin, write, commit, markReady }) => {
      syncWriters.messages = { begin, write, commit, markReady }
      markReady()
    },
  },
})

export const partsCollection = createCollection<PartRecord, string>({
  id: "parts",
  getKey: (p) => p.id,
  sync: {
    sync: ({ begin, write, commit, markReady }) => {
      syncWriters.parts = { begin, write, commit, markReady }
      markReady()
    },
  },
})

export const sessionStatusCollection = createCollection<SessionStatusRecord, string>({
  id: "sessionStatus",
  getKey: (s) => s.sessionId,
  sync: {
    sync: ({ begin, write, commit, markReady }) => {
      syncWriters.sessionStatus = { begin, write, commit, markReady }
      markReady()
    },
  },
})

export const todosCollection = createCollection<TodoRecord, string>({
  id: "todos",
  getKey: (t) => t.id,
  sync: {
    sync: ({ begin, write, commit, markReady }) => {
      syncWriters.todos = { begin, write, commit, markReady }
      markReady()
    },
  },
})

export const fileDiffsCollection = createCollection<FileDiffRecord, string>({
  id: "fileDiffs",
  getKey: (d) => d.id,
  sync: {
    sync: ({ begin, write, commit, markReady }) => {
      syncWriters.fileDiffs = { begin, write, commit, markReady }
      markReady()
    },
  },
})

// ============ SSE EVENT HANDLERS ============

function handleSessionCreated(session: SdkSession) {
  const w = syncWriters.sessions
  if (!w) return
  w.begin()
  w.write({ value: session, type: "insert" })
  w.commit()
}

function handleSessionUpdated(session: SdkSession) {
  const w = syncWriters.sessions
  if (!w) return
  w.begin()
  w.write({ value: session, type: "update" })
  w.commit()
}

function handleSessionDeleted(sessionId: string) {
  const w = syncWriters.sessions
  if (!w) return
  w.begin()
  w.write({ value: { id: sessionId } as SessionRecord, type: "delete" })
  w.commit()
}

function handleSessionStatus(sessionId: string, sdkStatus: SdkSessionStatus) {
  const w = syncWriters.sessionStatus
  if (!w) return

  // Map SDK status to our SessionStatus type
  const status: SessionStatus =
    sdkStatus.type === "retry"
      ? { type: "retry", error: sdkStatus.message }
      : sdkStatus.type === "busy"
        ? { type: "busy" }
        : { type: "idle" }

  w.begin()
  w.write({ value: { sessionId, status }, type: "update" })
  w.commit()
}

function handleMessageUpdated(message: SdkMessage) {
  const w = syncWriters.messages
  if (!w) return
  w.begin()
  w.write({ value: message, type: "update" })
  w.commit()
}

function handleMessageRemoved(messageId: string) {
  const w = syncWriters.messages
  if (!w) return
  w.begin()
  w.write({ value: { id: messageId } as MessageRecord, type: "delete" })
  w.commit()
}

function handlePartUpdated(part: SdkPart) {
  const w = syncWriters.parts
  if (!w) return
  w.begin()
  w.write({ value: part, type: "update" })
  w.commit()
}

function handlePartRemoved(partId: string) {
  const w = syncWriters.parts
  if (!w) return
  w.begin()
  w.write({ value: { id: partId } as PartRecord, type: "delete" })
  w.commit()
}

function handleTodosUpdated(sessionId: string, todos: SdkTodo[]) {
  const w = syncWriters.todos
  if (!w) return

  w.begin()
  for (const todo of todos) {
    w.write({
      value: {
        id: todo.id,
        sessionId,
        content: todo.content,
        status: todo.status as "pending" | "in_progress" | "completed",
      },
      type: "update",
    })
  }
  w.commit()
}

function handleSessionDiff(
  sessionId: string,
  diffs: Array<{ file: string; additions?: number; deletions?: number; before?: string; after?: string }>
) {
  const w = syncWriters.fileDiffs
  if (!w) return

  w.begin()
  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i]
    w.write({
      value: {
        id: `${sessionId}-${i}`,
        sessionId,
        file: d.file,
        additions: d.additions,
        deletions: d.deletions,
        before: d.before,
        after: d.after,
      },
      type: "update",
    })
  }
  w.commit()
}

// ============ PROCESS SSE EVENTS ============

function processEvent(event: ServerEvent) {
  switch (event.type) {
    case "session.created":
      handleSessionCreated(event.properties.info)
      break
    case "session.updated":
      handleSessionUpdated(event.properties.info)
      break
    case "session.deleted":
      handleSessionDeleted(event.properties.info.id)
      break
    case "session.status":
      handleSessionStatus(event.properties.sessionID, event.properties.status)
      break
    case "message.updated":
      handleMessageUpdated(event.properties.info)
      break
    case "message.removed":
      handleMessageRemoved(event.properties.messageID)
      break
    case "message.part.updated":
      handlePartUpdated(event.properties.part)
      break
    case "message.part.removed":
      handlePartRemoved(event.properties.partID)
      break
    case "todo.updated":
      handleTodosUpdated(event.properties.sessionID, event.properties.todos)
      break
    case "session.diff":
      handleSessionDiff(event.properties.sessionID, event.properties.diff)
      break
    default:
      console.log("[store] Unknown event:", (event as { type: string }).type)
  }
}

// ============ BOOTSTRAP & SYNC ============

let cleanupFn: (() => void) | null = null
const syncedSessions = new Set<string>()

/**
 * Bootstrap collections with initial data from API
 */
async function bootstrap() {
  try {
    const [sessions, statuses] = await Promise.all([
      api.sessions.list(),
      api.status.all(),
    ])

    // Load sessions
    const sw = syncWriters.sessions
    if (sw) {
      sw.begin()
      for (const session of sessions) {
        sw.write({ value: session, type: "insert" })
      }
      sw.commit()
    }

    // Load session statuses
    const stw = syncWriters.sessionStatus
    if (stw) {
      stw.begin()
      for (const [sessionId, status] of Object.entries(statuses)) {
        stw.write({ value: { sessionId, status }, type: "insert" })
      }
      stw.commit()
    }

    console.log("[store] Bootstrapped:", sessions.length, "sessions")
  } catch (err) {
    console.error("[store] Bootstrap error:", err)
  }
}

/**
 * Start syncing SSE events to collections.
 * Also bootstraps initial data.
 * Returns cleanup function.
 */
export function startSync(): () => void {
  if (cleanupFn) {
    console.warn("[store] Sync already started")
    return cleanupFn
  }

  // Bootstrap initial data
  bootstrap()

  // Subscribe to SSE events
  const unsubscribe = subscribeToEvents(
    (event) => {
      try {
        processEvent(event)
      } catch (err) {
        console.error("[store] Error processing event:", err)
      }
    },
    (err) => {
      console.error("[store] SSE error:", err)
    }
  )

  cleanupFn = () => {
    unsubscribe()
    cleanupFn = null
  }

  return cleanupFn
}

/**
 * Full sync a session's data from API.
 * Call this when switching to a session to ensure we have all messages/parts.
 * Handles any missed SSE events.
 */
export async function syncSession(sessionId: string): Promise<void> {
  // Skip if already synced this session
  if (syncedSessions.has(sessionId)) return

  try {
    const [messagesData, todosData] = await Promise.all([
      api.messages.list(sessionId),
      api.todos.list(sessionId),
    ])

    // Sync messages
    const mw = syncWriters.messages
    if (mw) {
      mw.begin()
      for (const msg of messagesData) {
        mw.write({ value: msg.info, type: "update" })
      }
      mw.commit()
    }

    // Sync parts
    const pw = syncWriters.parts
    if (pw) {
      pw.begin()
      for (const msg of messagesData) {
        for (const part of msg.parts) {
          pw.write({ value: part, type: "update" })
        }
      }
      pw.commit()
    }

    // Sync todos
    const tw = syncWriters.todos
    if (tw) {
      tw.begin()
      for (const todo of todosData) {
        tw.write({
          value: {
            id: todo.id,
            sessionId,
            content: todo.content,
            status: todo.status,
          },
          type: "update",
        })
      }
      tw.commit()
    }

    syncedSessions.add(sessionId)
    console.log("[store] Synced session:", sessionId, messagesData.length, "messages")
  } catch (err) {
    console.error("[store] Error syncing session:", err)
  }
}

/**
 * Clear sync cache for a session (e.g., after delete)
 */
export function clearSessionSync(sessionId: string): void {
  syncedSessions.delete(sessionId)
}
