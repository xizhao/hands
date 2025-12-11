/**
 * Unified Element Plugin
 *
 * A single plugin that handles ALL element rendering:
 * 1. HTML elements (div, span, button, etc.) - rendered via React.createElement
 * 2. Custom components (Button, Card, etc.) - rendered via local registry or RSC
 *
 * This consolidates jsx-element-plugin, component-plugin, and rsc-component-plugin
 * into ONE plugin with ONE isVoid logic.
 */

import * as React from 'react'
import { useState, useEffect, useMemo } from 'react'
import { createPlatePlugin, useEditorRef } from 'platejs/react'
import { ReactEditor } from 'slate-react'
import type { RenderElementProps } from 'slate-react'
import type { TElement } from 'platejs'
import { DndPlugin, useDraggable, useDropLine } from '@platejs/dnd'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import { GripVertical, PlusIcon } from 'lucide-react'
import { PathApi } from 'platejs'
import { cn } from '../../lib/utils'
import { useRsc, useRscAvailable } from '../../rsc'
import type { ComponentType } from 'react'
import { Button as UIButton } from '../ui/button'
// Import stdlib registry for component discovery
import { listComponents, type ComponentMeta } from '@hands/stdlib/registry'

// Direct imports for stdlib components
import {
  Button as StdlibButton,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Badge,
  MetricCard,
} from '@hands/stdlib'

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
// Component Registry (built from stdlib registry)
// ============================================================================

/**
 * Build the set of known stdlib component names from the registry.
 * Components with `files` entries are stdlib components with actual implementations.
 */
function buildStdlibComponentSet(): Set<string> {
  const components = listComponents()
  const names = new Set<string>()

  for (const comp of components) {
    // Only include components that have actual file implementations
    if (comp.files && comp.files.length > 0) {
      // Use the `name` field which is PascalCase (e.g., "Button", "Card", "MetricCard")
      names.add(comp.name)
    }
  }

  // Add sub-components not in registry (Card exports multiple components)
  // These are discovered from the file but not individually registered
  names.add('CardHeader')
  names.add('CardTitle')
  names.add('CardDescription')
  names.add('CardContent')
  names.add('CardFooter')

  return names
}

/** Set of known stdlib component names */
export const STDLIB_COMPONENTS = buildStdlibComponentSet()

/**
 * Check if a component name is a known stdlib component
 */
export function isStdlibComponent(name: string): boolean {
  return STDLIB_COMPONENTS.has(name)
}

/**
 * Static component map - maps component names to their implementations
 * Using direct imports since dynamic imports don't resolve package aliases at runtime
 */
const STDLIB_COMPONENT_MAP: Record<string, ComponentType<any>> = {
  Button: StdlibButton,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  MetricCard,
}

/**
 * Get a stdlib component by name
 */
export function getStdlibComponent(name: string): ComponentType<any> | null {
  return STDLIB_COMPONENT_MAP[name] ?? null
}

/**
 * Local component registry - for backward compatibility
 * @deprecated Use getStdlibComponent() instead
 */
export const COMPONENT_MAP: Record<string, ComponentType<any>> = new Proxy({} as Record<string, ComponentType<any>>, {
  get(_, prop: string) {
    return getStdlibComponent(prop)
  },
  has(_, prop: string) {
    return isStdlibComponent(prop)
  },
})

/**
 * Default props for components
 */
const DEFAULT_PROPS: Record<string, Record<string, unknown>> = {
  Button: { children: 'Button', variant: 'default' },
  Card: {},
  CardTitle: { children: 'Card Title' },
  CardDescription: { children: 'Card description' },
  Badge: { children: 'Badge', variant: 'default' },
  MetricCard: { title: 'Metric', value: 0, description: 'Description' },
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
 * Shows a highlight when the block is selected via drag selection
 */
function ComponentBlockSelection({ element }: { element: TElement }) {
  const editor = useEditorRef()
  const isDragging = editor.getOption(DndPlugin, 'isDragging')

  // Check if this element is in the block selection using the API
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin)?.blockSelection
  const selectedIds = blockSelectionApi?.getNodes?.()?.map((entry: any) => entry[0]?.id) ?? []
  const isSelected = selectedIds.includes((element as any).id)

  if (!isSelected) return null

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

  // Get the path of this element
  const path = useMemo(() => {
    try {
      return ReactEditor.findPath(editor as any, element)
    } catch {
      return null
    }
  }, [editor, element])

  // Only enable drag for top-level blocks
  const isTopLevel = path && path.length === 1
  const isReadOnly = editor.dom?.readOnly

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

  // If not top-level or read-only, render without drag handles
  if (!isTopLevel || isReadOnly) {
    return <>{children}</>
  }

  return (
    <div className={cn('group relative slate-selectable', isDragging && 'opacity-50')}>
      {/* Gutter with drag handle - positioned to the left */}
      <div
        className={cn(
          'absolute -left-12 top-0 z-50 flex h-full items-start pt-0.5',
          'opacity-0 transition-opacity duration-150',
          'group-hover:opacity-100'
        )}
        contentEditable={false}
      >
        <div className="flex items-center gap-0.5">
          {/* Plus button to insert */}
          <UIButton
            className="size-6 p-0 opacity-0 group-hover:opacity-100"
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
        <ComponentBlockSelection element={element} />
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
 * 1. Wrap with DraggableComponentWrapper for drag handles
 * 2. Check local registry for component
 * 3. Fall back to RSC
 * 4. Fall back to placeholder
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
  // Try stdlib component first
  const LocalComponent = getStdlibComponent(componentName)

  if (LocalComponent) {
    return (
      <DraggableComponentWrapper element={element}>
        <LocalComponentRenderer
          attributes={attributes}
          element={element}
          componentName={componentName}
          LocalComponent={LocalComponent}
          props={props}
          plateChildren={children}
        />
      </DraggableComponentWrapper>
    )
  }

  // Try RSC for unknown components
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
 * Local Component Renderer
 *
 * Renders stdlib components with proper Slate attributes.
 * DnD drag handles are added by DraggableComponentWrapper.
 *
 * For void elements: component is non-editable, plateChildren is a hidden placeholder
 * For non-void elements: plateChildren are rendered inside the component
 */
function LocalComponentRenderer({
  attributes,
  element,
  componentName,
  LocalComponent,
  props,
  plateChildren,
}: {
  attributes: any
  element: TElement
  componentName: string
  LocalComponent: ComponentType<any>
  props: Record<string, unknown>
  plateChildren: React.ReactNode
}) {
  const isVoid = shouldBeVoid(element)

  const mergedProps = useMemo(() => {
    const defaults = DEFAULT_PROPS[componentName] ?? {}
    return { ...defaults, ...props }
  }, [componentName, props])

  // Void elements: render component non-editable with hidden children placeholder
  if (isVoid) {
    return (
      <div {...attributes} className="my-2">
        <div contentEditable={false} className="rounded-lg">
          <LocalComponent {...mergedProps} />
        </div>
        {/* Required hidden placeholder for Slate void element selection */}
        {plateChildren}
      </div>
    )
  }

  // Non-void elements: render component with editable children inside
  return (
    <div {...attributes} className="my-2">
      <LocalComponent {...mergedProps}>
        {plateChildren}
      </LocalComponent>
    </div>
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
 * types that don't have a registered plugin. Without this, unknown types
 * render as empty void divs with data-slate-spacer.
 * 
 * Returns undefined for known types (letting Plate's plugin system handle them),
 * and renders via ElementRenderer for unknown types.
 */
export function elementFallbackRenderer(props: RenderElementProps): React.ReactElement {
  // Route all elements through ElementRenderer
  return <ElementRenderer {...(props as any)} />
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
