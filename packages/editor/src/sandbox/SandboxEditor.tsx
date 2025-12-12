/**
 * SandboxEditor - Editor component for iframe sandbox
 *
 * Wraps PlateVisualEditor with:
 * - PostMessage communication with parent
 * - Error boundary for crash isolation
 * - Frontmatter parsing/serialization
 * - Auto-save debouncing
 */

import { Component, useCallback, useEffect, useRef, useState, type ReactNode, type ErrorInfo } from 'react'
import { PlateVisualEditor } from '../plate/PlateVisualEditor'
import {
  postToParent,
  isValidSandboxMessage,
  extractPayload,
  type ParentToEditorMessage,
  type InitPayload,
} from './protocol'

// ============================================================================
// Frontmatter Utilities
// ============================================================================

function parseFrontmatter(source: string): {
  title: string
  content: string
  rawFrontmatter: string
} {
  if (!source.startsWith('---')) {
    return { title: 'Untitled', content: source, rawFrontmatter: '' }
  }

  const endIndex = source.indexOf('---', 3)
  if (endIndex === -1) {
    return { title: 'Untitled', content: source, rawFrontmatter: '' }
  }

  const frontmatterStr = source.slice(3, endIndex).trim()
  const content = source.slice(endIndex + 3).trim()
  const rawFrontmatter = source.slice(0, endIndex + 3)

  let title = 'Untitled'
  for (const line of frontmatterStr.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    if (key === 'title') {
      let value = line.slice(colonIndex + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      title = value
      break
    }
  }

  return { title, content, rawFrontmatter }
}

function updateFrontmatterTitle(rawFrontmatter: string, newTitle: string): string {
  if (!rawFrontmatter) {
    return `---\ntitle: "${newTitle}"\n---`
  }

  const lines = rawFrontmatter.slice(3, -3).trim().split('\n')
  let titleFound = false
  const updatedLines = lines.map((line) => {
    if (line.startsWith('title:')) {
      titleFound = true
      return `title: "${newTitle}"`
    }
    return line
  })

  if (!titleFound) {
    updatedLines.unshift(`title: "${newTitle}"`)
  }

  return `---\n${updatedLines.join('\n')}\n---`
}

function extractH1Title(source: string): string | null {
  // Simple regex to find first h1 in markdown
  const match = source.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

// ============================================================================
// Error Boundary
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode
  onError: (error: Error, fatal: boolean) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class SandboxErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[SandboxEditor] Error caught:', error, errorInfo)
    this.props.onError(error, true)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="text-red-500 text-lg font-medium mb-2">Editor Error</div>
          <div className="text-gray-500 text-sm mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <div className="text-xs text-gray-400">
            The parent window will handle recovery.
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================================
// Main Editor Component
// ============================================================================

interface EditorState {
  pageId: string | null
  content: string
  readOnly: boolean
  theme: 'light' | 'dark'
  rscPort: number | null
}

export function SandboxEditor() {
  const [state, setState] = useState<EditorState>({
    pageId: null,
    content: '',
    readOnly: false,
    theme: 'light',
    rscPort: null,
  })
  const [isReady, setIsReady] = useState(false)

  // Track frontmatter for title sync
  const frontmatterRef = useRef({ title: 'Untitled', rawFrontmatter: '' })
  const lastTitleRef = useRef('Untitled')

  // Debounce timer for content changes
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Listen for messages from parent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isValidSandboxMessage(event)) return

      const message = extractPayload(event) as ParentToEditorMessage

      switch (message.type) {
        case 'INIT': {
          const payload = message.payload as InitPayload
          const { title, content, rawFrontmatter } = parseFrontmatter(payload.content)
          frontmatterRef.current = { title, rawFrontmatter }
          lastTitleRef.current = title

          setState({
            pageId: payload.pageId,
            content: content, // Content without frontmatter for editor
            readOnly: payload.readOnly,
            theme: payload.theme,
            rscPort: payload.rscPort,
          })
          break
        }

        case 'SET_CONTENT': {
          const { title, content, rawFrontmatter } = parseFrontmatter(message.payload.content)
          frontmatterRef.current = { title, rawFrontmatter }
          lastTitleRef.current = title

          setState((prev) => ({
            ...prev,
            pageId: message.payload.pageId,
            content: content,
          }))
          break
        }

        case 'SET_READ_ONLY':
          setState((prev) => ({ ...prev, readOnly: message.payload.readOnly }))
          break

        case 'SET_THEME':
          setState((prev) => ({ ...prev, theme: message.payload.theme }))
          break

        case 'SET_RSC_PORT':
          setState((prev) => ({ ...prev, rscPort: message.payload.port }))
          break

        case 'FOCUS':
          // Could focus the editor here if needed
          break

        case 'BLUR':
          // Could blur the editor here if needed
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Post READY message when mounted
  useEffect(() => {
    setIsReady(true)
    postToParent({ type: 'READY' })
  }, [])

  // Handle source changes from PlateVisualEditor
  const handleSourceChange = useCallback(
    (newSource: string) => {
      if (!state.pageId) return

      // Update local state immediately
      setState((prev) => ({ ...prev, content: newSource }))

      // Check if h1 title changed
      const currentH1 = extractH1Title(newSource)
      if (currentH1 && currentH1 !== lastTitleRef.current) {
        lastTitleRef.current = currentH1
        frontmatterRef.current.rawFrontmatter = updateFrontmatterTitle(
          frontmatterRef.current.rawFrontmatter,
          currentH1
        )
        frontmatterRef.current.title = currentH1

        // Notify parent of title change
        postToParent({
          type: 'TITLE_CHANGED',
          payload: { title: currentH1, pageId: state.pageId },
        })
      }

      // Debounce content change notification (1500ms like original)
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }

      saveTimerRef.current = setTimeout(() => {
        // Reconstruct full content with frontmatter
        const fullContent = frontmatterRef.current.rawFrontmatter
          ? frontmatterRef.current.rawFrontmatter + '\n\n' + newSource
          : newSource

        postToParent({
          type: 'CONTENT_CHANGED',
          payload: { content: fullContent, pageId: state.pageId! },
        })
      }, 1500)
    },
    [state.pageId]
  )

  // Handle errors
  const handleError = useCallback((error: Error, fatal: boolean) => {
    postToParent({
      type: 'ERROR',
      payload: { error: error.message, fatal },
    })
  }, [])

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark')
  }, [state.theme])

  // Show loading state until initialized
  if (!isReady || !state.pageId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-gray-500">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <span className="text-sm">Waiting for content...</span>
        </div>
      </div>
    )
  }

  return (
    <SandboxErrorBoundary onError={handleError}>
      <PlateVisualEditor
        source={state.content}
        onSourceChange={handleSourceChange}
        className="h-full"
      />
    </SandboxErrorBoundary>
  )
}
