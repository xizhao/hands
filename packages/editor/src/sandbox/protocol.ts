/**
 * EditorSandbox PostMessage Protocol
 *
 * Defines the message types for communication between the desktop app
 * (parent) and the sandboxed editor iframe (child).
 */

// ============================================================================
// Parent → Editor Messages
// ============================================================================

export interface InitPayload {
  pageId: string
  content: string // MDX source with frontmatter
  readOnly: boolean
  rscPort: number | null // Runtime port for RSC rendering
  theme: 'light' | 'dark'
}

export type ParentToEditorMessage =
  | { type: 'INIT'; payload: InitPayload }
  | { type: 'SET_CONTENT'; payload: { content: string; pageId: string } }
  | { type: 'SET_READ_ONLY'; payload: { readOnly: boolean } }
  | { type: 'SET_RSC_PORT'; payload: { port: number } }
  | { type: 'SET_THEME'; payload: { theme: 'light' | 'dark' } }
  | { type: 'FOCUS' }
  | { type: 'BLUR' }

// ============================================================================
// Editor → Parent Messages
// ============================================================================

export interface ContentPayload {
  content: string // Full MDX with frontmatter
  pageId: string
}

export type EditorToParentMessage =
  | { type: 'READY' }
  | { type: 'CONTENT_CHANGED'; payload: ContentPayload }
  | { type: 'TITLE_CHANGED'; payload: { title: string; pageId: string } }
  | { type: 'SAVE_REQUESTED'; payload: ContentPayload } // Explicit save (Cmd+S)
  | { type: 'ERROR'; payload: { error: string; fatal: boolean } }
  | { type: 'HEIGHT_CHANGED'; payload: { height: number } } // For auto-sizing

// ============================================================================
// Message Wrapper
// ============================================================================

export const SANDBOX_MESSAGE_SOURCE = 'hands-editor-sandbox' as const
export const SANDBOX_PROTOCOL_VERSION = 1 as const

export interface SandboxMessage<T> {
  source: typeof SANDBOX_MESSAGE_SOURCE
  version: typeof SANDBOX_PROTOCOL_VERSION
  payload: T
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wrap a message payload for sending
 */
export function wrapMessage<T>(payload: T): SandboxMessage<T> {
  return {
    source: SANDBOX_MESSAGE_SOURCE,
    version: SANDBOX_PROTOCOL_VERSION,
    payload,
  }
}

/**
 * Check if an event contains a valid sandbox message
 */
export function isValidSandboxMessage(
  event: MessageEvent
): event is MessageEvent<SandboxMessage<unknown>> {
  const data = event.data
  return (
    data &&
    typeof data === 'object' &&
    data.source === SANDBOX_MESSAGE_SOURCE &&
    data.version === SANDBOX_PROTOCOL_VERSION
  )
}

/**
 * Post a message to the parent window (from iframe)
 */
export function postToParent(message: EditorToParentMessage): void {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(wrapMessage(message), '*')
  }
}

/**
 * Post a message to an iframe (from parent)
 */
export function postToSandbox(
  iframe: HTMLIFrameElement,
  message: ParentToEditorMessage
): void {
  if (iframe.contentWindow) {
    iframe.contentWindow.postMessage(wrapMessage(message), '*')
  }
}

/**
 * Extract the typed payload from a validated message event
 */
export function extractPayload<T>(
  event: MessageEvent<SandboxMessage<T>>
): T {
  return event.data.payload
}
