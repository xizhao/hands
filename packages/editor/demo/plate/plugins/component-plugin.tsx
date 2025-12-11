/**
 * Unified Component Plugin
 *
 * A generalized plugin that renders ANY custom JSX element (non-HTML).
 *
 * How it works:
 * 1. Intercepts all elements that aren't standard HTML (e.g., "Button", "Card", "MyWidget")
 * 2. Looks up the component in a local registry (COMPONENT_MAP)
 * 3. If found locally, renders it directly
 * 4. If not found, falls back to RSC rendering via Flight
 *
 * This handles:
 * - PascalCase components (Button, Card)
 * - Custom elements (my-component, x-widget)
 * - Any non-HTML tag name
 */

import * as React from 'react'
import { useState, useEffect, useMemo, Suspense, lazy, forwardRef } from 'react'
import { createPlatePlugin } from 'platejs/react'
import { cn } from '../../lib/utils'
import { useRsc, useRscAvailable } from '../../../src/rsc'
import type { ComponentType } from 'react'

// ============================================================================
// HTML Element Detection
// ============================================================================

/**
 * Set of all known HTML element tag names
 */
const HTML_ELEMENTS = new Set([
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
  // HTML button is different from Button component
  'button',
])

/**
 * Check if an element should be handled by this plugin
 * Returns true for any non-HTML element (custom components)
 */
function isCustomComponent(tagName: string): boolean {
  return !HTML_ELEMENTS.has(tagName.toLowerCase())
}

// ============================================================================
// Component Registry
// ============================================================================

/**
 * Lazy wrapper that creates a component with Suspense fallback
 */
function createLazyComponent<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> } | { [key: string]: ComponentType<P> }>,
  exportName?: string
): ComponentType<P> {
  const LazyComponent = lazy(async () => {
    const mod = await loader()
    if (exportName && exportName in mod) {
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

// UI Components - lazy loaded from stdlib
const Button = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/button'),
  'Button'
)

const Card = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/card'),
  'Card'
)

const CardHeader = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/card'),
  'CardHeader'
)

const CardTitle = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/card'),
  'CardTitle'
)

const CardDescription = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/card'),
  'CardDescription'
)

const CardContent = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/card'),
  'CardContent'
)

const Badge = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/badge'),
  'Badge'
)

const MetricCard = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/data/metric-card'),
  'MetricCard'
)

/**
 * Map of component names to their React components
 * This is the LOCAL registry - components here render directly
 */
export const COMPONENT_MAP: Record<string, ComponentType<any>> = {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  MetricCard,
}

/**
 * Default props for each component type
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
// Component Renderers
// ============================================================================

interface ComponentWrapperProps {
  attributes: any
  children: React.ReactNode
  element: any
}

/**
 * Unified Component Element
 *
 * Renders any custom component:
 * 1. If in COMPONENT_MAP -> render locally
 * 2. Otherwise -> try RSC
 * 3. Fallback -> placeholder
 */
function ComponentWrapper({ attributes, children, element }: ComponentWrapperProps) {
  const { type, id, isVoid, jsxProps, children: _, ...otherProps } = element
  const componentName = type as string
  const props = jsxProps || otherProps

  // Check if we have this component locally
  const LocalComponent = COMPONENT_MAP[componentName]

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

  // Otherwise, try RSC
  return (
    <RscComponentRenderer
      attributes={attributes}
      componentName={componentName}
      props={props}
      elementId={id}
      plateChildren={children}
    />
  )
}

/**
 * Local Component Renderer
 * Renders components from COMPONENT_MAP directly
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

  // Merge default props with element props
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

        {/* Render the actual component */}
        <div style={{ padding: '4px' }}>
          <LocalComponent {...mergedProps} />
        </div>
      </div>
      {/* Plate children (required for void elements) */}
      {plateChildren}
    </div>
  )
}

/**
 * RSC Component Renderer
 * Fetches and renders components via RSC Flight stream
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

    return () => {
      cancelled = true
    }
  }, [componentName, props, elementId, renderComponent, rscAvailable])

  // Loading state
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

  // Error or not available
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

  // Success - render RSC element
  return (
    <div
      {...attributes}
      className={cn(
        'rsc-component my-2',
        'rounded border border-transparent hover:border-blue-300/50',
        'transition-colors'
      )}
    >
      <div contentEditable={false} className="rsc-component-content">
        {result.element}
      </div>
      {plateChildren}
    </div>
  )
}

/**
 * Placeholder for components that can't be rendered
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

  const statusIcons = {
    loading: (
      <div className="animate-spin h-3 w-3 border border-blue-400 border-t-transparent rounded-full" />
    ),
    error: <span className="text-red-500">!</span>,
    unknown: <span className="text-gray-400">?</span>,
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
          {statusIcons[status]}
          <span className="font-mono text-sm font-medium text-gray-700">
            &lt;{componentName}&gt;
          </span>
          {status === 'unknown' && (
            <span className="text-xs text-gray-500">(component not found)</span>
          )}
        </div>

        {/* Show props */}
        {Object.keys(props).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {Object.entries(props).map(([key, value]) => (
              <span
                key={key}
                className="text-xs px-1.5 py-0.5 bg-white rounded border"
              >
                <span className="text-blue-600">{key}</span>
                <span className="text-gray-400">=</span>
                <span className="text-green-600">
                  {typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Error message */}
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
 * Unified Component Plugin
 *
 * This plugin:
 * 1. Catches ALL custom element types (non-HTML)
 * 2. Renders them via local registry or RSC
 * 3. Marks them as void elements (non-editable content)
 */
export const ComponentPlugin = createPlatePlugin({
  key: 'component',

  node: {
    isElement: true,
  },

  // Override render for custom elements
  render: {
    // @ts-expect-error - Plate types are overly strict, this works at runtime
    belowNodes: ({ element, children, attributes }: any) => {
      const type = element?.type as string

      // Only handle custom elements (not HTML)
      if (!type || !isCustomComponent(type)) {
        return null
      }

      // Return a wrapper function that renders the component
      return () => (
        <ComponentWrapper
          element={element}
          attributes={attributes}
          children={children}
        />
      )
    },
  },

  // Extend editor to mark custom elements as void
  extendEditor: ({ editor }: any) => {
    const { isVoid: origIsVoid } = editor

    editor.isVoid = (element: any) => {
      const type = element?.type as string
      if (type && isCustomComponent(type)) {
        return true
      }
      return origIsVoid?.(element) ?? false
    }

    return editor
  },
})

export default ComponentPlugin
