/**
 * Unified Element Plugin
 *
 * A single plugin that handles ALL element rendering:
 * 1. HTML elements (div, span, button, etc.) - rendered via React.createElement
 * 2. Custom components (Button, Card, etc.) - rendered via RSC (React Server Components)
 *
 * ALL custom components go through RSC. This makes the editor truly dynamic -
 * it doesn't need to know what components exist ahead of time. The RSC server
 * is the single source of truth for component rendering.
 */

import * as React from 'react'
import { useState, useEffect, Component } from 'react'
import {
  createPlatePlugin,
  useEditorRef,
  ElementProvider,
} from 'platejs/react'
import type { RenderElementProps } from 'slate-react'
import type { TElement } from 'platejs'
import { DndPlugin, useDraggable, useDropLine } from '@platejs/dnd'
import { BlockSelectionPlugin, useBlockSelected } from '@platejs/selection/react'
import { GripVertical, PlusIcon } from 'lucide-react'
import { PathApi } from 'platejs'
import { cn } from '../../lib/utils'
import { useRsc, useRscAvailable } from '../../rsc'
import { Button as UIButton } from '../ui/button'
// Import stdlib registry for component discovery (UI hints only)
import { listComponents } from '@hands/stdlib/registry'

// NOTE: No direct stdlib component imports here.
// ALL custom components (stdlib or user-defined) go through RSC.
// This makes the editor truly dynamic - it doesn't need to know
// what components exist ahead of time.

// ============================================================================
// Constants
// ============================================================================

/**
 * HTML void elements - these truly have no children
 */
export const HTML_VOID_TAGS = new Set([
  'img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed',
  'source', 'track', 'wbr',
])

/**
 * All valid HTML element tags
 */
export const HTML_ELEMENTS = new Set([
  // Block elements
  'div', 'p', 'span', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'form', 'fieldset', 'legend', 'label', 'input', 'textarea', 'select', 'option', 'optgroup',
  'figure', 'figcaption', 'picture', 'img', 'video', 'audio', 'source', 'track',
  'iframe', 'embed', 'object', 'param',
  'canvas', 'svg', 'math',
  'details', 'summary', 'dialog', 'menu',
  'pre', 'code', 'blockquote', 'hr', 'br', 'wbr',
  // Inline elements
  'a', 'em', 'strong', 'small', 'mark', 'del', 'ins', 's', 'u', 'b', 'i',
  'sub', 'sup', 'abbr', 'cite', 'q', 'dfn', 'time', 'data', 'var', 'samp', 'kbd',
  'ruby', 'rt', 'rp', 'bdi', 'bdo',
  // Special
  'script', 'noscript', 'template', 'slot', 'style', 'link', 'meta', 'base', 'title', 'head', 'body', 'html',
  // Plate internal
  'fragment',
  // HTML button (lowercase)
  'button',
])

/**
 * Reserved Plate keys - filter these out of DOM props
 */
const RESERVED_KEYS = new Set(['type', 'id', 'children', 'isVoid', 'jsxProps'])

// ============================================================================
// Element Classification
// ============================================================================

/**
 * Check if a tag is a custom component (not HTML)
 *
 * JSX convention:
 * - PascalCase = ALWAYS React component
 * - lowercase + not in HTML_ELEMENTS = custom element
 * - lowercase + in HTML_ELEMENTS = native HTML
 */
export function isCustomComponent(tagName: string): boolean {
  if (/^[A-Z]/.test(tagName)) return true
  return !HTML_ELEMENTS.has(tagName)
}

/**
 * Check if an element should be void (no editable children)
 *
 * Only HTML void tags OR elements with explicit isVoid=true
 */
export function shouldBeVoid(element: TElement): boolean {
  const type = element?.type as string

  // HTML void elements
  if (type && HTML_VOID_TAGS.has(type.toLowerCase())) {
    return true
  }

  // Explicit isVoid flag (set by converter for self-closing components)
  if ((element as any)?.isVoid === true) {
    return true
  }

  return false
}

// ============================================================================
// Component Discovery (from stdlib registry, for UI hints only)
// ============================================================================

/**
 * Build the set of known stdlib component names from the registry.
 * This is used for UI hints (e.g., autocomplete) - NOT for rendering.
 * ALL component rendering goes through RSC.
 */
function buildStdlibComponentSet(): Set<string> {
  const components = listComponents()
  const names = new Set<string>()

  for (const comp of components) {
    if (comp.files && comp.files.length > 0) {
      names.add(comp.name)
    }
  }

  // Add sub-components not individually registered
  names.add('CardHeader')
  names.add('CardTitle')
  names.add('CardDescription')
  names.add('CardContent')
  names.add('CardFooter')

  return names
}

/** Set of known stdlib component names (for UI hints) */
export const STDLIB_COMPONENTS = buildStdlibComponentSet()

/**
 * Check if a component name is a known stdlib component
 */
export function isStdlibComponent(name: string): boolean {
  return STDLIB_COMPONENTS.has(name)
}

// ============================================================================
// Element Renderers
// ============================================================================

/**
 * Extract DOM-safe props from element
 */
function getDomProps(element: any): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(element)) {
    if (RESERVED_KEYS.has(key) || key.startsWith('_')) continue
    props[key] = value
  }
  return props
}

// ============================================================================
// Draggable Wrapper for Custom Components
// ============================================================================

/**
 * DropLine component for drag and drop
 */
const DropLine = React.memo(function DropLine({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const { dropLine } = useDropLine()

  if (!dropLine) return null

  return (
    <div
      {...props}
      className={cn(
        'slate-dropLine',
        'absolute inset-x-0 h-0.5 opacity-100 transition-opacity',
        'bg-blue-500',
        dropLine === 'top' && '-top-px',
        dropLine === 'bottom' && '-bottom-px',
        className
      )}
    />
  )
})

/**
 * Block selection overlay for custom components
 * Uses Plate's useBlockSelected hook for proper reactivity
 */
function ComponentBlockSelection() {
  const editor = useEditorRef()
  const isBlockSelected = useBlockSelected()
  const isDragging = editor.getOption(DndPlugin, 'isDragging')

  if (!isBlockSelected) return null

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-[1] rounded-[4px]',
        'bg-blue-500/15',
        'transition-opacity duration-200',
        isDragging && 'opacity-0'
      )}
      data-slot="block-selection"
    />
  )
}

/**
 * Trigger slash menu on next block
 */
function triggerSlashNextBlock(
  editor: any,
  triggerText: string,
  at?: number[],
  insertAbove = false
) {
  let _at: number[] | undefined

  if (at) {
    const slicedPath = at.slice(0, 1)
    _at = insertAbove ? slicedPath : PathApi.next(slicedPath)
  }

  editor.tf.insertNodes(editor.api.create.block(), {
    at: _at,
    select: true,
  })
  editor.tf.insertText(triggerText)
}

/**
 * Draggable wrapper for custom components
 *
 * This provides the same drag handle UI as native Plate elements,
 * allowing custom components to be dragged and reordered.
 */
function DraggableComponentWrapper({
  element,
  children,
}: {
  element: TElement
  children: React.ReactNode
}) {
  const editor = useEditorRef()
  const isReadOnly = editor.dom?.readOnly

  // Skip drag handles in read-only mode
  if (isReadOnly) {
    return <>{children}</>
  }

  // Render the draggable version
  // Note: We always render drag handles for custom components since they're
  // typically top-level blocks. The DnD plugin handles nested elements gracefully.
  return (
    <DraggableComponentInner element={element}>
      {children}
    </DraggableComponentInner>
  )
}

/**
 * Inner draggable component that uses DnD hooks
 * Separated so hooks are only called when drag is enabled
 */
function DraggableComponentInner({
  element,
  children,
}: {
  element: TElement
  children: React.ReactNode
}) {
  const editor = useEditorRef()

  const { isDragging, nodeRef, handleRef } = useDraggable({
    element,
    onDropHandler: (_, { dragItem }) => {
      const id = (dragItem as { id: string[] | string }).id
      const blockSelectionApi = editor.getApi(BlockSelectionPlugin)?.blockSelection
      if (blockSelectionApi) {
        blockSelectionApi.add(id)
      }
    },
  })

  const [isDirectHover, setIsDirectHover] = useState(false)

  return (
    <div
      className={cn('group/block relative slate-selectable', isDragging && 'opacity-50')}
      onMouseEnter={(e) => {
        e.stopPropagation()
        setIsDirectHover(true)
      }}
      onMouseLeave={() => setIsDirectHover(false)}
    >
      {/* Gutter with drag handle - positioned to the left */}
      <div
        className={cn(
          'absolute -left-12 top-0 z-50 flex h-full items-start pt-0.5',
          'opacity-0 transition-opacity duration-150',
          isDirectHover && 'opacity-100'
        )}
        contentEditable={false}
      >
        <div className="flex items-center gap-0.5">
          {/* Plus button to insert */}
          <UIButton
            className={cn('size-6 p-0', isDirectHover ? 'opacity-100' : 'opacity-0')}
            onClick={(event) => {
              event.stopPropagation()
              event.preventDefault()
              const at = editor.api.findPath(element)
              triggerSlashNextBlock(editor, '/', at, event.altKey)
            }}
            onMouseDown={() => {
              editor.tf.focus()
              editor.getApi(BlockSelectionPlugin)?.blockSelection?.clear()
            }}
            tabIndex={-1}
            variant="ghost"
          >
            <PlusIcon className="size-4 text-gray-500" />
          </UIButton>

          {/* Drag handle */}
          <UIButton
            className="size-6 p-0 cursor-grab active:cursor-grabbing"
            data-plate-prevent-deselect
            ref={handleRef}
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              const blockSelectionApi = editor.getApi(BlockSelectionPlugin)?.blockSelection
              if (blockSelectionApi) {
                // Toggle selection: if already selected, clear; otherwise select this block
                const elementId = (element as any).id
                const selectedIds = blockSelectionApi.getNodes?.()?.map((entry: any) => entry[0]?.id) ?? []
                if (selectedIds.includes(elementId)) {
                  blockSelectionApi.clear?.()
                } else {
                  blockSelectionApi.clear?.()
                  blockSelectionApi.add?.(elementId)
                }
              }
            }}
          >
            <GripVertical className="size-4 text-gray-500" />
          </UIButton>
        </div>
      </div>

      {/* Block content wrapper */}
      <div
        className="slate-blockWrapper relative"
        onContextMenu={(event) =>
          editor
            .getApi(BlockSelectionPlugin)
            ?.blockSelection?.addOnContextMenu?.({ element, event })
        }
        ref={nodeRef}
      >
        {children}
        <DropLine />
        <ComponentBlockSelection />
      </div>
    </div>
  )
}

/**
 * Unified Element Component
 *
 * Renders any element - HTML or custom component
 */
function ElementRenderer(props: RenderElementProps) {
  const { attributes, children, element } = props
  const type = (element as any).type as string
  const domProps = getDomProps(element)

  // Custom component (PascalCase or non-HTML)
  if (isCustomComponent(type)) {
    return (
      <CustomComponentRenderer
        attributes={attributes}
        children={children}
        element={element}
        componentName={type}
        props={domProps}
      />
    )
  }

  // HTML element - render directly
  return React.createElement(
    type as keyof JSX.IntrinsicElements,
    { ...attributes, ...domProps },
    children
  )
}

/**
 * Custom Component Renderer
 *
 * ALL custom components go through RSC. This makes the editor truly dynamic -
 * it doesn't need to know what components exist ahead of time.
 *
 * The RSC server is the single source of truth for:
 * - stdlib components (Button, Card, MetricCard, etc.)
 * - user-defined components
 * - any React component registered in the workbook
 */
function CustomComponentRenderer({
  attributes,
  children,
  element,
  componentName,
  props,
}: {
  attributes: any
  children: React.ReactNode
  element: TElement
  componentName: string
  props: Record<string, unknown>
}) {
  return (
    <DraggableComponentWrapper element={element}>
      <RscComponentRenderer
        attributes={attributes}
        componentName={componentName}
        props={props}
        elementId={(element as any).id}
        plateChildren={children}
        element={element}
      />
    </DraggableComponentWrapper>
  )
}

/**
 * RSC Component Renderer
 */
function RscComponentRenderer({
  attributes,
  componentName,
  props,
  elementId,
  plateChildren,
  element,
}: {
  attributes: any
  componentName: string
  props: Record<string, unknown>
  elementId?: string
  plateChildren: React.ReactNode
  element: TElement
}) {
  const rscAvailable = useRscAvailable()
  const { renderComponent } = useRsc()

  const [result, setResult] = useState<{
    element: React.ReactNode | null
    error?: string
    loading: boolean
  }>({ element: null, loading: true })

  useEffect(() => {
    if (!rscAvailable) {
      setResult({ element: null, loading: false, error: 'RSC not connected' })
      return
    }

    let cancelled = false

    async function render() {
      try {
        const res = await renderComponent({
          tagName: componentName,
          props,
          elementId,
        })

        if (!cancelled) {
          setResult({ element: res.element, error: res.error, loading: false })
        }
      } catch (err) {
        if (!cancelled) {
          setResult({
            element: null,
            error: err instanceof Error ? err.message : String(err),
            loading: false,
          })
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [componentName, props, elementId, renderComponent, rscAvailable])

  if (result.loading) {
    return (
      <ComponentPlaceholder
        attributes={attributes}
        componentName={componentName}
        element={element}
        status="loading"
        plateChildren={plateChildren}
      />
    )
  }

  if (result.error || !result.element) {
    return (
      <ComponentPlaceholder
        attributes={attributes}
        componentName={componentName}
        element={element}
        status={result.error ? 'error' : 'unknown'}
        error={result.error}
        plateChildren={plateChildren}
      />
    )
  }

  return (
    <div {...attributes} className="my-2">
      <div contentEditable={false}>
        <RscErrorBoundary componentName={componentName}>
          {result.element}
        </RscErrorBoundary>
      </div>
      {plateChildren}
    </div>
  )
}

// Error boundary for RSC-rendered components
interface RscErrorBoundaryProps {
  componentName: string
  children: React.ReactNode
}

interface RscErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class RscErrorBoundary extends Component<RscErrorBoundaryProps, RscErrorBoundaryState> {
  state: RscErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): RscErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[RSC Error] Component "${this.props.componentName}" crashed:`, error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-red-500/50 bg-red-500/10 rounded-md text-sm">
          <div className="font-medium text-red-600 dark:text-red-400">
            Error in {this.props.componentName}
          </div>
          <div className="text-red-500/80 mt-1 font-mono text-xs">
            {this.state.error?.message || 'Unknown error'}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================================
// Skeleton Components for Loading States
// ============================================================================

/**
 * Shimmer animation keyframes (injected via style tag)
 * Theme-aware with subtle, polished animation
 */
const shimmerStyles = `
@keyframes skeleton-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.skeleton-block {
  background: hsl(var(--muted, 240 5% 96%));
  position: relative;
  overflow: hidden;
}
.skeleton-block::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    hsl(var(--muted-foreground, 240 4% 46%) / 0.08) 40%,
    hsl(var(--muted-foreground, 240 4% 46%) / 0.12) 50%,
    hsl(var(--muted-foreground, 240 4% 46%) / 0.08) 60%,
    transparent 100%
  );
  animation: skeleton-shimmer 2s ease-in-out infinite;
}
.dark .skeleton-block {
  background: hsl(240 4% 16%);
}
.dark .skeleton-block::after {
  background: linear-gradient(
    90deg,
    transparent 0%,
    hsl(0 0% 100% / 0.04) 40%,
    hsl(0 0% 100% / 0.08) 50%,
    hsl(0 0% 100% / 0.04) 60%,
    transparent 100%
  );
}
`

// Inject shimmer styles once
if (typeof document !== 'undefined') {
  const styleId = 'skeleton-shimmer-styles'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = shimmerStyles
    document.head.appendChild(style)
  }
}

/**
 * Single skeleton block with polished shimmer
 */
function SkeletonBlock({
  width = '100%',
  height = '1rem',
  className,
  rounded = 'md',
}: {
  width?: string | number
  height?: string | number
  className?: string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
}) {
  const roundedClass = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  }[rounded]

  return (
    <div
      className={cn('skeleton-block', roundedClass, className)}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  )
}

/**
 * Generate skeleton for a text node (leaf)
 * Estimates width based on text length
 */
function TextSkeleton({ text }: { text: string }) {
  // Estimate width based on character count (rough approximation)
  const charWidth = 8 // ~8px per character average
  const estimatedWidth = Math.min(text.length * charWidth, 400)
  // Vary width slightly for visual interest
  const width = Math.max(estimatedWidth, 40)

  return <SkeletonBlock width={width} height={16} className="inline-block" />
}

/**
 * Generate skeleton for an element node recursively
 * This creates a skeleton that mirrors the component tree structure
 */
function ElementSkeleton({ element, depth = 0 }: { element: any; depth?: number }) {
  const type = element?.type as string
  const children = element?.children || []

  // For void elements or leaf-like elements, render a simple block
  if (shouldBeVoid(element) || children.length === 0) {
    return (
      <SkeletonBlock
        width="100%"
        height={32}
        className="rounded-md"
      />
    )
  }

  // Check if all children are text nodes (leaf element)
  const isLeafLike = children.every((child: any) => 'text' in child)

  if (isLeafLike) {
    // Render inline skeleton for text content
    const textContent = children.map((c: any) => c.text || '').join('')
    if (textContent.trim()) {
      return <TextSkeleton text={textContent} />
    }
    return <SkeletonBlock width="60%" height={16} />
  }

  // Determine layout hints from element type
  const isFlexRow = type.toLowerCase().includes('row') ||
                    type.toLowerCase().includes('header') ||
                    type.toLowerCase().includes('footer') ||
                    (element as any).className?.includes('flex-row') ||
                    (element as any).className?.includes('flex ')

  const isGrid = type.toLowerCase().includes('grid')

  // Render children recursively
  const childSkeletons = children
    .filter((child: any) => !('text' in child)) // Skip text nodes, handled above
    .map((child: any, index: number) => (
      <ElementSkeleton
        key={child.id || index}
        element={child as TElement}
        depth={depth + 1}
      />
    ))

  // For nested custom components, render with appropriate layout
  if (isCustomComponent(type)) {
    return (
      <div className={cn(
        'rounded-lg border border-border/40 bg-card/30 p-3',
        depth > 0 && 'border-border/20'
      )}>
        <div className={cn(
          isFlexRow && 'flex items-center gap-3',
          isGrid && 'grid grid-cols-2 gap-3',
          !isFlexRow && !isGrid && 'space-y-2'
        )}>
          {childSkeletons.length > 0 ? childSkeletons : (
            // Default content skeleton if no children
            <>
              <SkeletonBlock width="50%" height={18} />
              <SkeletonBlock width="80%" height={14} />
            </>
          )}
        </div>
      </div>
    )
  }

  // For HTML containers, just render children with layout
  return (
    <div className={cn(
      isFlexRow && 'flex items-center gap-2',
      isGrid && 'grid grid-cols-2 gap-2',
      !isFlexRow && !isGrid && 'space-y-1.5'
    )}>
      {childSkeletons.length > 0 ? childSkeletons : (
        <SkeletonBlock width="100%" height={14} />
      )}
    </div>
  )
}

/**
 * Dynamic skeleton generator based on component tree structure
 * Analyzes the actual Plate element tree to create matching skeletons
 */
function ComponentSkeleton({
  element,
}: {
  element: any
}) {
  const children = element?.children || []

  // If no meaningful children, render a generic card skeleton
  const hasStructure = children.some((child: any) =>
    !('text' in child) || (child.text && child.text.trim())
  )

  if (!hasStructure) {
    // Generic skeleton for components without tree structure
    return (
      <div className="rounded-lg border border-border/50 bg-card/50 p-4 space-y-3">
        <SkeletonBlock width="45%" height={20} />
        <div className="space-y-2">
          <SkeletonBlock width="100%" height={14} />
          <SkeletonBlock width="85%" height={14} />
        </div>
      </div>
    )
  }

  // Render skeleton based on actual tree structure
  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-4">
      <div className="space-y-3">
        {children.map((child: any, index: number) => {
          if ('text' in child) {
            if (child.text && child.text.trim()) {
              return <TextSkeleton key={index} text={child.text} />
            }
            return null
          }
          return (
            <ElementSkeleton
              key={child.id || index}
              element={child as TElement}
            />
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Error Display Component
// ============================================================================

/**
 * Polished error state for failed component renders
 */
function ComponentError({
  componentName,
  error,
}: {
  componentName: string
  error?: string
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-red-800">Failed to render</span>
            <code className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded font-mono">
              &lt;{componentName}&gt;
            </code>
          </div>
          {error && (
            <p className="mt-1 text-sm text-red-600 break-words">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Placeholder for unknown/loading/error components
 */
function ComponentPlaceholder({
  attributes,
  componentName,
  element,
  status,
  error,
  plateChildren,
}: {
  attributes: any
  componentName: string
  element: any
  status: 'loading' | 'error' | 'unknown'
  error?: string
  plateChildren: React.ReactNode
}) {
  return (
    <div {...attributes} className="my-2">
      <div contentEditable={false}>
        {status === 'loading' && (
          <ComponentSkeleton element={element} />
        )}
        {status === 'error' && (
          <ComponentError componentName={componentName} error={error} />
        )}
        {status === 'unknown' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <span className="text-amber-600 text-lg">?</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-amber-800">Unknown component</span>
                  <code className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded font-mono">
                    &lt;{componentName}&gt;
                  </code>
                </div>
                <p className="mt-0.5 text-sm text-amber-600">
                  This component is not registered in the current workspace
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      {plateChildren}
    </div>
  )
}

// ============================================================================
// Fallback Renderer for Unknown Types
// ============================================================================

/**
 * Fallback element renderer for Plate.
 *
 * This is passed to PlateContent's renderElement prop to handle any element
 * types that don't have a registered plugin.
 *
 * Wraps elements with ElementProvider to enable Plate hooks like useBlockSelected.
 */
export function elementFallbackRenderer(props: RenderElementProps & { path?: number[] }): React.ReactElement {
  const { element, path = [] } = props

  // Wrap with ElementProvider so hooks like useBlockSelected work
  return (
    <ElementProvider
      element={element}
      entry={[element, path]}
      path={path}
      scope={(element as any).type ?? 'default'}
    >
      <ElementRenderer {...(props as any)} />
    </ElementProvider>
  )
}

// ============================================================================
// Plugin Definition
// ============================================================================

/**
 * Unified Element Plugin
 *
 * Single plugin that:
 * 1. Extends isElement/isVoid for dynamic element detection
 * 2. Provides elementFallbackRenderer for use with PlateContent
 * 3. Registers render.aboveNodes to handle custom component wrapping
 *
 * NOTE: We use elementFallbackRenderer as the renderElement prop on PlateContent
 * to handle ALL element types dynamically. The DnD plugin's aboveNodes will
 * still wrap these elements because it runs in the plugin pipeline.
 */
export const ElementPlugin = createPlatePlugin({
  key: 'element',

  extendEditor: ({ editor }) => {
    const origIsElement = editor.isElement
    const origIsVoid = editor.isVoid

    // Any object with type + children is an element
    editor.isElement = (value: any) => {
      if (value && typeof value === 'object' && 'type' in value && 'children' in value) {
        return true
      }
      return origIsElement(value)
    }

    // Only HTML void tags OR explicit isVoid flag
    editor.isVoid = (element: TElement) => {
      return shouldBeVoid(element) || origIsVoid(element)
    }

    return editor
  },
})

export default ElementPlugin
