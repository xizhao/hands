/**
 * Stdlib Component Plugin for Plate
 *
 * Renders React components from @hands/stdlib in the editor.
 * Components are rendered as void elements (non-editable content).
 */

import { createPlatePlugin, PlateElement, type PlateElementProps } from 'platejs/react'
import { useState, useMemo, useCallback, type ComponentType, lazy, Suspense, forwardRef } from 'react'

export const STDLIB_COMPONENT_KEY = 'stdlib-component'

export interface StdlibComponentElement {
  type: 'stdlib-component'
  componentName: string
  props: Record<string, unknown>
  children: [{ text: '' }]
  id?: string
}

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
    <Suspense fallback={<div className="animate-pulse bg-gray-700 h-8 rounded" />}>
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

// Data Components
const MetricCard = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/data/metric-card'),
  'MetricCard'
)

/**
 * Map of component names to their React components
 */
export const STDLIB_COMPONENT_MAP: Record<string, ComponentType<any>> = {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  MetricCard,
}

export function getStdlibComponent(name: string): ComponentType<any> | undefined {
  return STDLIB_COMPONENT_MAP[name]
}

export function isStdlibComponent(name: string): boolean {
  return name in STDLIB_COMPONENT_MAP
}

/**
 * Default props for each component type
 */
export const DEFAULT_COMPONENT_PROPS: Record<string, Record<string, unknown>> = {
  Button: { children: 'Button', variant: 'default' },
  Card: {},
  CardTitle: { children: 'Card Title' },
  CardDescription: { children: 'Card description' },
  Badge: { children: 'Badge', variant: 'default' },
  MetricCard: { title: 'Metric', value: 0, description: 'Description' },
}

export function getDefaultProps(componentName: string): Record<string, unknown> {
  return DEFAULT_COMPONENT_PROPS[componentName] ?? {}
}

/**
 * Stdlib Component Node Renderer
 */
function StdlibComponentNode(props: PlateElementProps) {
  const { element, children } = props
  const stdlibElement = element as unknown as StdlibComponentElement
  const { componentName, props: componentProps } = stdlibElement

  const [isHovered, setIsHovered] = useState(false)
  const [isSelected, setIsSelected] = useState(false)

  // Get the React component from the map
  const Component = useMemo(() => getStdlibComponent(componentName), [componentName])

  // Merge default props with element props
  const mergedProps = useMemo(() => {
    const defaults = getDefaultProps(componentName)
    return { ...defaults, ...componentProps }
  }, [componentName, componentProps])

  return (
    <PlateElement
      {...props}
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
          ...(isHovered && !isSelected ? { boxShadow: '0 0 0 1px rgba(255,255,255,0.1)' } : {}),
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
            backgroundColor: 'rgba(30, 30, 30, 0.9)',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: '10px',
            fontWeight: 500,
            color: '#888',
            opacity: isHovered || isSelected ? 1 : 0,
            transition: 'opacity 0.15s ease',
          }}
        >
          {componentName}
        </div>

        {/* Render the actual component */}
        <div style={{ padding: '4px' }}>
          {!Component ? (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(180, 50, 50, 0.1)',
              border: '1px solid rgba(180, 50, 50, 0.2)',
              color: '#ff8a8a',
              fontSize: '13px',
            }}>
              Component not found: <code style={{ fontFamily: 'monospace' }}>{componentName}</code>
            </div>
          ) : (
            <Component {...mergedProps} />
          )}
        </div>
      </div>
      {children}
    </PlateElement>
  )
}

export const StdlibComponentPlugin = createPlatePlugin({
  key: STDLIB_COMPONENT_KEY,
  node: {
    isElement: true,
    isVoid: true,
  },
  render: {
    node: StdlibComponentNode,
  },
})

export const StdlibComponentKit = [StdlibComponentPlugin]
