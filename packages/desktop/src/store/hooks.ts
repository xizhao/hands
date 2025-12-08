/**
 * React hooks for TanStack DB collections
 *
 * These replace the React Query hooks in hooks/useSession.ts
 * Uses useLiveQuery for reactive, sub-millisecond updates
 */

import { useMemo, useEffect, useCallback, useState } from "react"
import { useLiveQuery } from "@tanstack/react-db"
import { eq } from "@tanstack/db"
import {
  sessionsCollection,
  messagesCollection,
  partsCollection,
  sessionStatusCollection,
  todosCollection,
  fileDiffsCollection,
  syncSession,
  clearSessionSync,
  type SessionRecord,
  type PartRecord,
} from "./index"
import { api, type MessageWithParts, type SessionStatus, type PermissionResponse, type Session } from "@/lib/api"

// ============ SESSION HOOKS ============

/**
 * Get all sessions, sorted by creation time (newest first)
 */
export function useSessions() {
  const { data, isLoading, isReady } = useLiveQuery(sessionsCollection)

  const sorted = useMemo(() => {
    if (!data) return []
    return [...data].sort((a, b) => b.time.created - a.time.created)
  }, [data])

  return { data: sorted, isLoading, isReady }
}

/**
 * Get a single session by ID
 */
export function useSession(sessionId: string | null) {
  const { data, isLoading, isReady } = useLiveQuery(
    (q) =>
      sessionId
        ? q.from({ s: sessionsCollection }).where(({ s }) => eq(s.id, sessionId))
        : null,
    [sessionId]
  )

  return {
    data: data?.[0] as SessionRecord | undefined,
    isLoading,
    isReady,
  }
}

// ============ MESSAGE HOOKS ============

/**
 * Get messages for a session with their parts combined
 */
export function useMessages(sessionId: string | null) {
  // Sync session data on first access
  useEffect(() => {
    if (sessionId) {
      syncSession(sessionId)
    }
  }, [sessionId])

  // Get messages for this session
  const { data: messages, isLoading: messagesLoading } = useLiveQuery(
    (q) =>
      sessionId
        ? q.from({ m: messagesCollection }).where(({ m }) => eq(m.sessionID, sessionId))
        : null,
    [sessionId]
  )

  // Get parts for this session
  const { data: parts } = useLiveQuery(
    (q) =>
      sessionId
        ? q.from({ p: partsCollection }).where(({ p }) => eq(p.sessionID, sessionId))
        : null,
    [sessionId]
  )

  // Combine messages with their parts
  const combined = useMemo((): MessageWithParts[] => {
    if (!messages) return []

    // Group parts by messageId
    const partsByMessage = new Map<string, PartRecord[]>()
    for (const part of parts || []) {
      const existing = partsByMessage.get(part.messageID) || []
      existing.push(part)
      partsByMessage.set(part.messageID, existing)
    }

    // Combine and sort by creation time
    return [...messages]
      .sort((a, b) => a.time.created - b.time.created)
      .map((msg) => ({
        info: msg,
        parts: partsByMessage.get(msg.id) || [],
      }))
  }, [messages, parts])

  return { data: combined, isLoading: messagesLoading }
}

// ============ STATUS HOOKS ============

/**
 * Get all session statuses
 */
export function useSessionStatuses() {
  const { data, isLoading } = useLiveQuery(sessionStatusCollection)

  const statusMap = useMemo(() => {
    const map: Record<string, SessionStatus> = {}
    for (const record of data || []) {
      map[record.sessionId] = record.status
    }
    return map
  }, [data])

  return { data: statusMap, isLoading }
}

/**
 * Get status for a specific session
 */
export function useSessionStatus(sessionId: string | null) {
  const { data } = useLiveQuery(
    (q) =>
      sessionId
        ? q
            .from({ s: sessionStatusCollection })
            .where(({ s }) => eq(s.sessionId, sessionId))
        : null,
    [sessionId]
  )

  return data?.[0]?.status as SessionStatus | undefined
}

// ============ TODO HOOKS ============

/**
 * Get todos for a session
 */
export function useTodos(sessionId: string | null) {
  const { data, isLoading } = useLiveQuery(
    (q) =>
      sessionId
        ? q.from({ t: todosCollection }).where(({ t }) => eq(t.sessionId, sessionId))
        : null,
    [sessionId]
  )

  return { data: data || [], isLoading }
}

// ============ FILE DIFF HOOKS ============

/**
 * Get file diffs for a session
 */
export function useFileDiffs(sessionId: string | null) {
  const { data, isLoading } = useLiveQuery(
    (q) =>
      sessionId
        ? q.from({ d: fileDiffsCollection }).where(({ d }) => eq(d.sessionId, sessionId))
        : null,
    [sessionId]
  )

  return { data: data || [], isLoading }
}

// ============ MUTATION HOOKS ============

/**
 * Create a new session
 */
export function useCreateSession() {
  const [isPending, setIsPending] = useState(false)

  const mutateAsync = useCallback(
    async (body?: { parentID?: string; title?: string }) => {
      setIsPending(true)
      try {
        return await api.sessions.create(body)
      } finally {
        setIsPending(false)
      }
    },
    []
  )

  const mutate = useCallback(
    (
      body?: { parentID?: string; title?: string },
      options?: { onSuccess?: (session: Session) => void }
    ) => {
      mutateAsync(body).then((session) => {
        options?.onSuccess?.(session)
      })
    },
    [mutateAsync]
  )

  return { mutate, mutateAsync, isPending }
}

/**
 * Delete a session
 */
export function useDeleteSession() {
  const mutate = useCallback(async (id: string) => {
    clearSessionSync(id)
    return api.sessions.delete(id)
  }, [])

  return { mutate, mutateAsync: mutate }
}

/**
 * Send a message to a session
 */
export function useSendMessage() {
  const mutate = useCallback(
    async ({ sessionId, content, system }: { sessionId: string; content: string; system?: string }) => {
      const result = await api.promptAsync(sessionId, content, { system })
      if (result.error) {
        throw new Error(`Failed to send message: ${result.error}`)
      }
      return { sessionId }
    },
    []
  )

  return { mutate, mutateAsync: mutate, isPending: false }
}

/**
 * Abort a running session
 */
export function useAbortSession(sessionId: string | null) {
  const mutate = useCallback(async () => {
    if (!sessionId) return
    return api.abort(sessionId)
  }, [sessionId])

  return { mutate, mutateAsync: mutate }
}

/**
 * Respond to a permission request
 */
export function useRespondToPermission(sessionId: string | null) {
  const [isPending, setIsPending] = useState(false)

  const mutate = useCallback(
    async ({
      permissionId,
      response,
    }: {
      permissionId: string
      response: PermissionResponse
    }) => {
      if (!sessionId) return
      setIsPending(true)
      try {
        return await api.respondToPermission(sessionId, permissionId, response)
      } finally {
        setIsPending(false)
      }
    },
    [sessionId]
  )

  return { mutate, mutateAsync: mutate, isPending }
}
