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
import { useState, useEffect } from 'react'
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
  element: any
  componentName: string
  props: Record<string, unknown>
}) {
  return (
    <DraggableComponentWrapper element={element}>
      <RscComponentRenderer
        attributes={attributes}
        componentName={componentName}
        props={props}
        elementId={element.id}
        plateChildren={children}
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
}: {
  attributes: any
  componentName: string
  props: Record<string, unknown>
  elementId?: string
  plateChildren: React.ReactNode
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
        props={props}
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
        props={props}
        status={result.error ? 'error' : 'unknown'}
        error={result.error}
        plateChildren={plateChildren}
      />
    )
  }

  return (
    <div {...attributes} className="my-2">
      <div contentEditable={false}>{result.element}</div>
      {plateChildren}
    </div>
  )
}

/**
 * Placeholder for unknown/loading/error components
 */
function ComponentPlaceholder({
  attributes,
  componentName,
  props,
  status,
  error,
  plateChildren,
}: {
  attributes: any
  componentName: string
  props: Record<string, unknown>
  status: 'loading' | 'error' | 'unknown'
  error?: string
  plateChildren: React.ReactNode
}) {
  const statusStyles = {
    loading: 'border-blue-300 bg-blue-50/50',
    error: 'border-red-300 bg-red-50/50',
    unknown: 'border-gray-300 bg-gray-50',
  }

  return (
    <div
      {...attributes}
      className={cn(
        'component-placeholder my-1',
        'rounded border border-dashed p-3',
        statusStyles[status]
      )}
    >
      <div contentEditable={false}>
        <div className="flex items-center gap-2 mb-2">
          {status === 'loading' && (
            <div className="animate-spin h-3 w-3 border border-blue-400 border-t-transparent rounded-full" />
          )}
          {status === 'error' && <span className="text-red-500">!</span>}
          {status === 'unknown' && <span className="text-gray-400">?</span>}
          <span className="font-mono text-sm font-medium text-gray-700">
            &lt;{componentName}&gt;
          </span>
          {status === 'unknown' && (
            <span className="text-xs text-gray-500">(not found)</span>
          )}
        </div>

        {Object.keys(props).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {Object.entries(props).map(([key, value]) => (
              <span key={key} className="text-xs px-1.5 py-0.5 bg-white rounded border">
                <span className="text-blue-600">{key}</span>=
                <span className="text-green-600">
                  {typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}
                </span>
              </span>
            ))}
          </div>
        )}

        {status === 'error' && error && (
          <div className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
            {error}
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
