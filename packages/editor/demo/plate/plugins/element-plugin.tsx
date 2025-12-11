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
import { useState, useEffect, useMemo, Suspense, lazy, forwardRef } from 'react'
import { createPlatePlugin, type PlateRenderElementProps, type RenderNodeWrapper } from 'platejs/react'
import type { TElement } from 'platejs'
import { cn } from '../../lib/utils'
import { useRsc, useRscAvailable } from '../../../src/rsc'
import type { ComponentType } from 'react'
// Import stdlib registry for component discovery
import { listComponents, type ComponentMeta } from '@hands/stdlib/registry'

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
const RESERVED_KEYS = new Set(['type', 'id', 'children', 'isVoid'])

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
 * Map component names to their import paths in @hands/stdlib
 * Format: componentName -> { path: import path, exportName: named export }
 */
const COMPONENT_IMPORT_MAP: Record<string, { path: string; exportName: string }> = {
  Button: { path: '@hands/stdlib/registry/components/ui/button', exportName: 'Button' },
  Card: { path: '@hands/stdlib/registry/components/ui/card', exportName: 'Card' },
  CardHeader: { path: '@hands/stdlib/registry/components/ui/card', exportName: 'CardHeader' },
  CardTitle: { path: '@hands/stdlib/registry/components/ui/card', exportName: 'CardTitle' },
  CardDescription: { path: '@hands/stdlib/registry/components/ui/card', exportName: 'CardDescription' },
  CardContent: { path: '@hands/stdlib/registry/components/ui/card', exportName: 'CardContent' },
  CardFooter: { path: '@hands/stdlib/registry/components/ui/card', exportName: 'CardFooter' },
  Badge: { path: '@hands/stdlib/registry/components/ui/badge', exportName: 'Badge' },
  MetricCard: { path: '@hands/stdlib/registry/components/data/metric-card', exportName: 'MetricCard' },
  DataTable: { path: '@hands/stdlib/registry/components/data/data-table', exportName: 'DataTable' },
  LineChart: { path: '@hands/stdlib/registry/components/charts/line-chart', exportName: 'LineChart' },
  BarChart: { path: '@hands/stdlib/registry/components/charts/bar-chart', exportName: 'BarChart' },
}

// Cache for loaded components
const componentCache = new Map<string, ComponentType<any>>()

function createLazyComponent<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> } | { [key: string]: ComponentType<P> }>,
  exportName: string
): ComponentType<P> {
  const LazyComponent = lazy(async () => {
    const mod = await loader()
    if (exportName in mod) {
      return { default: (mod as Record<string, ComponentType<P>>)[exportName] }
    }
    return mod as { default: ComponentType<P> }
  })

  return forwardRef<unknown, P>((props, ref) => (
    <Suspense fallback={<div className="animate-pulse bg-gray-200 h-8 rounded" />}>
      <LazyComponent {...props} ref={ref} />
    </Suspense>
  )) as unknown as ComponentType<P>
}

/**
 * Get a stdlib component by name, lazily loaded
 */
export function getStdlibComponent(name: string): ComponentType<any> | null {
  // Check cache first
  if (componentCache.has(name)) {
    return componentCache.get(name)!
  }

  const importInfo = COMPONENT_IMPORT_MAP[name]
  if (!importInfo) {
    return null
  }

  // Create lazy component with dynamic import
  // @ts-expect-error - Dynamic import paths
  const LazyComp = createLazyComponent(
    () => import(/* @vite-ignore */ importInfo.path),
    importInfo.exportName
  )

  componentCache.set(name, LazyComp)
  return LazyComp
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

/**
 * Unified Element Component
 *
 * Renders any element - HTML or custom component
 */
function ElementRenderer(props: PlateRenderElementProps) {
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
 * 1. Check local registry
 * 2. Fall back to RSC
 * 3. Fall back to placeholder
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
      <LocalComponentRenderer
        attributes={attributes}
        componentName={componentName}
        LocalComponent={LocalComponent}
        props={props}
        plateChildren={children}
      />
    )
  }

  // Try RSC for unknown components
  return (
    <RscComponentRenderer
      attributes={attributes}
      componentName={componentName}
      props={props}
      elementId={element.id}
      plateChildren={children}
    />
  )
}

/**
 * Local Component Renderer
 */
function LocalComponentRenderer({
  attributes,
  componentName,
  LocalComponent,
  props,
  plateChildren,
}: {
  attributes: any
  componentName: string
  LocalComponent: ComponentType<any>
  props: Record<string, unknown>
  plateChildren: React.ReactNode
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isSelected, setIsSelected] = useState(false)

  const mergedProps = useMemo(() => {
    const defaults = DEFAULT_PROPS[componentName] ?? {}
    return { ...defaults, ...props }
  }, [componentName, props])

  return (
    <div
      {...attributes}
      style={{
        margin: '8px 0',
        position: 'relative',
        borderRadius: '8px',
        ...(isSelected ? { boxShadow: '0 0 0 2px rgba(74, 158, 255, 0.5)' } : {}),
      }}
    >
      <div
        contentEditable={false}
        style={{
          position: 'relative',
          borderRadius: '8px',
          transition: 'all 0.15s ease',
          ...(isHovered && !isSelected ? { boxShadow: '0 0 0 1px rgba(200, 200, 200, 0.3)' } : {}),
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setIsSelected(true)}
        onBlur={() => setIsSelected(false)}
      >
        {/* Component type badge */}
        <div
          style={{
            position: 'absolute',
            left: '-8px',
            top: '-8px',
            zIndex: 10,
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: 'rgba(240, 240, 240, 0.95)',
            border: '1px solid rgba(200, 200, 200, 0.3)',
            fontSize: '10px',
            fontWeight: 500,
            color: '#666',
            opacity: isHovered || isSelected ? 1 : 0,
            transition: 'opacity 0.15s ease',
          }}
        >
          {componentName}
        </div>

        <div style={{ padding: '4px' }}>
          <LocalComponent {...mergedProps}>{plateChildren}</LocalComponent>
        </div>
      </div>
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
    <div
      {...attributes}
      className={cn(
        'rsc-component my-2',
        'rounded border border-transparent hover:border-blue-300/50',
        'transition-colors'
      )}
    >
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
// Plugin Definition
// ============================================================================

/**
 * Unified Element Plugin
 *
 * Single plugin that:
 * 1. Renders ALL elements (HTML + custom components)
 * 2. Handles isVoid consistently (only HTML void tags + explicit isVoid)
 * 3. Handles isElement (any object with type + children)
 */
export const ElementPlugin = createPlatePlugin({
  key: 'element',

  // Use parsers to catch ALL unknown element types
  parsers: {
    html: {},
  },

  // Render fallback for any element type not handled by specific plugins
  render: {
    // aboveNodes renders ABOVE the default element content
    // This is key for void elements - we render the component here
    aboveNodes: ((props) => {
      const type = (props.element as any)?.type as string
      if (!type) return undefined

      // Only handle custom components (PascalCase or non-HTML)
      if (isCustomComponent(type)) {
        return (props) => <ElementRenderer {...props} />
      }

      return undefined
    }) as RenderNodeWrapper,

    // belowNodes for non-void elements
    belowNodes: ((props) => {
      const type = (props.element as any)?.type as string
      if (!type) return undefined

      // Only handle HTML elements (not custom components)
      if (!isCustomComponent(type) && !HTML_VOID_TAGS.has(type)) {
        return (props) => <ElementRenderer {...props} />
      }

      return undefined
    }) as RenderNodeWrapper,
  },

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
