/**
 * Error Event System - Types and utilities for streaming errors from editor iframe to parent
 *
 * Error categories:
 * - http: API/HTTP errors (mutations, fetches) - show as Sonner alerts
 * - runtime: JavaScript runtime errors - show in Alerts panel
 * - mutation: Source mutation failures - show as Sonner alerts
 */

// ============================================================================
// Error Event Types
// ============================================================================

export type EditorErrorCategory = 'http' | 'runtime' | 'mutation'

export interface EditorErrorEvent {
  type: 'editor-error'
  category: EditorErrorCategory
  error: EditorError
}

export interface EditorError {
  /** Unique error ID */
  id: string
  /** Error category */
  category: EditorErrorCategory
  /** Human-readable error message */
  message: string
  /** Optional technical details */
  details?: string
  /** Stack trace for runtime errors */
  stack?: string
  /** HTTP status code (for http errors) */
  status?: number
  /** Operation that failed (for mutation errors) */
  operation?: string
  /** Timestamp */
  timestamp: number
  /** Block ID where error occurred */
  blockId?: string
}

// ============================================================================
// Message Types (iframe <-> parent)
// ============================================================================

export interface EditorMessage {
  type: 'editor-error' | 'sandbox-ready' | 'styles'
  [key: string]: unknown
}

export function isEditorErrorEvent(msg: unknown): msg is EditorErrorEvent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as EditorErrorEvent).type === 'editor-error' &&
    typeof (msg as EditorErrorEvent).error === 'object'
  )
}

// ============================================================================
// Error Creation Helpers
// ============================================================================

let errorCounter = 0

function generateErrorId(): string {
  return `err-${Date.now()}-${++errorCounter}`
}

export function createHttpError(
  message: string,
  options: {
    status?: number
    details?: string
    blockId?: string
  } = {}
): EditorError {
  return {
    id: generateErrorId(),
    category: 'http',
    message,
    status: options.status,
    details: options.details,
    blockId: options.blockId,
    timestamp: Date.now(),
  }
}

export function createMutationError(
  message: string,
  options: {
    operation?: string
    details?: string
    blockId?: string
  } = {}
): EditorError {
  return {
    id: generateErrorId(),
    category: 'mutation',
    message,
    operation: options.operation,
    details: options.details,
    blockId: options.blockId,
    timestamp: Date.now(),
  }
}

export function createRuntimeError(
  error: Error | string,
  options: {
    blockId?: string
  } = {}
): EditorError {
  const errorObj = error instanceof Error ? error : new Error(String(error))
  return {
    id: generateErrorId(),
    category: 'runtime',
    message: errorObj.message,
    stack: errorObj.stack,
    blockId: options.blockId,
    timestamp: Date.now(),
  }
}

// ============================================================================
// Error Sending (from iframe to parent)
// ============================================================================

export function sendErrorToParent(error: EditorError): void {
  if (typeof window === 'undefined' || !window.parent) return

  const event: EditorErrorEvent = {
    type: 'editor-error',
    category: error.category,
    error,
  }

  try {
    window.parent.postMessage(event, '*')
    console.log('[EditorError] Sent error to parent:', error.category, error.message)
  } catch (e) {
    console.error('[EditorError] Failed to send error to parent:', e)
  }
}

// ============================================================================
// Global Error Handler Setup (call once in iframe)
// ============================================================================

let globalErrorHandlerInstalled = false

export function installGlobalErrorHandler(blockId?: string): () => void {
  if (globalErrorHandlerInstalled) return () => {}

  const handleError = (event: ErrorEvent) => {
    const error = createRuntimeError(event.error || event.message, { blockId })
    sendErrorToParent(error)
  }

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const message = event.reason instanceof Error
      ? event.reason.message
      : String(event.reason)
    const error = createRuntimeError(message, { blockId })
    error.stack = event.reason instanceof Error ? event.reason.stack : undefined
    sendErrorToParent(error)
  }

  window.addEventListener('error', handleError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
  globalErrorHandlerInstalled = true

  console.log('[EditorError] Global error handler installed')

  return () => {
    window.removeEventListener('error', handleError)
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    globalErrorHandlerInstalled = false
  }
}
