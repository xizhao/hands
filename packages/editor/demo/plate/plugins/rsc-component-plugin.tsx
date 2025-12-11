/**
 * RSC Component Plugin
 *
 * Renders PascalCase JSX components via React Server Components.
 * Instead of showing placeholder boxes, this plugin fetches the
 * actual rendered output from the runtime worker via Flight.
 *
 * Components are detected as PascalCase (e.g., Card, Button, MyComponent)
 * and rendered via the /rsc/component endpoint.
 */

import * as React from 'react'
import { useState, useEffect, Suspense } from 'react'
import { createPlatePlugin, type PlateElementProps } from 'platejs/react'
import { cn } from '../../lib/utils'
import { useRsc, useRscAvailable } from '../../../src/rsc'

type PlateRenderElementProps = PlateElementProps

/**
 * Check if a tag name is a React component (PascalCase)
 */
function isPascalCase(tagName: string): boolean {
  return /^[A-Z]/.test(tagName)
}

/**
 * RSC Component Element
 *
 * Renders a PascalCase component via RSC Flight stream.
 * Falls back to placeholder if RSC is not available.
 */
function RscComponentElement({ attributes, children, element }: PlateRenderElementProps) {
  const { type, id, isVoid, jsxProps, children: _, ...otherProps } = element as any
  const rscAvailable = useRscAvailable()

  // If RSC is not available, fall back to placeholder
  if (!rscAvailable) {
    return (
      <RscPlaceholder
        attributes={attributes}
        tagName={type}
        props={jsxProps || otherProps}
        children={children}
        status="disabled"
      />
    )
  }

  return (
    <Suspense
      fallback={
        <RscPlaceholder
          attributes={attributes}
          tagName={type}
          props={jsxProps || otherProps}
          children={children}
          status="loading"
        />
      }
    >
      <RscComponentRenderer
        attributes={attributes}
        tagName={type}
        props={jsxProps || otherProps}
        elementId={id}
        children={children}
      />
    </Suspense>
  )
}

/**
 * RSC Component Renderer
 *
 * Actually fetches and renders the component via RSC.
 */
function RscComponentRenderer({
  attributes,
  tagName,
  props,
  elementId,
  children,
}: {
  attributes: any
  tagName: string
  props: Record<string, unknown>
  elementId?: string
  children: React.ReactNode
}) {
  const { renderComponent } = useRsc()
  const [result, setResult] = useState<{
    element: React.ReactNode | null
    error?: string
    loading: boolean
  }>({ element: null, loading: true })

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        const res = await renderComponent({
          tagName,
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
  }, [tagName, props, elementId, renderComponent])

  if (result.loading) {
    return (
      <RscPlaceholder
        attributes={attributes}
        tagName={tagName}
        props={props}
        children={children}
        status="loading"
      />
    )
  }

  if (result.error) {
    return (
      <RscPlaceholder
        attributes={attributes}
        tagName={tagName}
        props={props}
        children={children}
        status="error"
        error={result.error}
      />
    )
  }

  // Render the RSC element with Plate attributes
  return (
    <div
      {...attributes}
      className={cn(
        'rsc-component',
        'rounded border border-transparent hover:border-blue-300/50',
        'transition-colors'
      )}
      contentEditable={false}
    >
      <div className="rsc-component-content">
        {result.element}
      </div>
      {children}
    </div>
  )
}

/**
 * Placeholder for RSC components
 */
function RscPlaceholder({
  attributes,
  tagName,
  props,
  children,
  status,
  error,
}: {
  attributes: any
  tagName: string
  props: Record<string, unknown>
  children: React.ReactNode
  status: 'loading' | 'error' | 'disabled'
  error?: string
}) {
  const statusColors = {
    loading: 'border-blue-300 bg-blue-50/50',
    error: 'border-red-300 bg-red-50/50',
    disabled: 'border-gray-300 bg-gray-50',
  }

  const statusIcons = {
    loading: (
      <div className="animate-spin h-3 w-3 border border-blue-400 border-t-transparent rounded-full" />
    ),
    error: <span className="text-red-500">⚠</span>,
    disabled: <span className="text-gray-400">○</span>,
  }

  return (
    <div
      {...attributes}
      className={cn(
        'rsc-placeholder',
        'rounded border border-dashed p-3 my-1',
        statusColors[status]
      )}
      contentEditable={false}
    >
      <div className="flex items-center gap-2 mb-2">
        {statusIcons[status]}
        <span className="font-mono text-sm font-medium text-gray-700">
          &lt;{tagName}&gt;
        </span>
        {status === 'disabled' && (
          <span className="text-xs text-gray-500">(RSC not connected)</span>
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

      {/* Plate children (required for void elements) */}
      {children}
    </div>
  )
}

/**
 * RSC Component Plugin
 *
 * Handles rendering of PascalCase components via RSC.
 * This plugin intercepts elements that look like React components
 * and renders them via the Flight wire format.
 */
export const RscComponentPlugin = createPlatePlugin({
  key: 'rsc-component',

  node: {
    isElement: true,
  },

  render: {
    belowNodes: ({ element, children, attributes }: any) => {
      const type = (element as any).type as string

      // Only handle PascalCase elements (React components)
      if (!type || !isPascalCase(type)) {
        // Return identity wrapper
        return () => children
      }

      // Skip stdlib components (handled by stdlib plugin)
      const stdlibComponents = new Set([
        'Button',
        'Card',
        'CardHeader',
        'CardTitle',
        'CardDescription',
        'CardContent',
        'Badge',
        'MetricCard',
      ])
      if (stdlibComponents.has(type)) {
        return () => children
      }

      // Return a wrapper function
      return () => (
        <RscComponentElement
          element={element}
          attributes={attributes}
          children={children}
          nodeProps={{}}
        />
      )
    },
  },

  extendEditor: ({ editor }: any) => {
    const { isVoid: origIsVoid } = editor

    // Mark PascalCase elements as void (can't have editable children)
    editor.isVoid = (element: any) => {
      const type = element.type as string
      if (type && isPascalCase(type)) {
        return true
      }
      return origIsVoid(element)
    }

    return editor
  },
})

export default RscComponentPlugin
