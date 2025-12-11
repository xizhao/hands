/**
 * JSX Element Plugin
 *
 * A catch-all plugin that renders any JSX element type not handled by other plugins.
 * This ensures every element in the JSX tree is editable as a Plate block.
 */

import * as React from 'react'
import { createPlatePlugin, type PlateRenderElementProps } from 'platejs/react'
import { cn } from '../../lib/utils'

// Known block types that have dedicated plugins
const HANDLED_TYPES = new Set([
  'p', 'paragraph',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote',
  'hr',
  'code_block',
  'ul', 'ol', 'li',
  'table', 'tr', 'td', 'th',
  'img',
  'stdlib-component',
])

/**
 * Generic JSX Element component
 *
 * Renders any element with its original tag name and props.
 * Supports both block and inline elements.
 */
function JsxElement({ attributes, children, element, nodeProps }: PlateRenderElementProps) {
  const { type, id, isVoid, children: _, ...props } = element as any

  // Get the original tag name from type
  const TagName = type as keyof JSX.IntrinsicElements

  // Filter out internal Plate props
  const domProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    // Skip internal props
    if (key.startsWith('_') || key === 'id') continue
    // Convert className
    if (key === 'className') {
      domProps.className = value
    } else {
      domProps[key] = value
    }
  }

  // Check if it's an inline element
  const isInline = ['span', 'a', 'strong', 'em', 'code', 'mark', 'small', 'sub', 'sup'].includes(type.toLowerCase())

  // For void elements, render without children
  if (isVoid) {
    return (
      <div
        {...attributes}
        className={cn(
          'jsx-element jsx-void',
          'rounded border border-dashed border-gray-300 p-2 my-1',
          'bg-gray-50 text-sm text-gray-600'
        )}
        contentEditable={false}
      >
        <span className="font-mono text-xs text-gray-400 mr-2">&lt;{type}&gt;</span>
        {Object.entries(domProps).map(([k, v]) => (
          <span key={k} className="text-xs mr-2">
            <span className="text-blue-600">{k}</span>=
            <span className="text-green-600">"{String(v)}"</span>
          </span>
        ))}
        {children}
      </div>
    )
  }

  // Render as the actual element
  return React.createElement(
    TagName,
    {
      ...attributes,
      ...domProps,
      className: cn(
        'jsx-element',
        domProps.className,
        // Add some default styling for common elements
        type === 'div' && 'my-1',
        type === 'section' && 'my-2',
        type === 'article' && 'my-2',
        type === 'aside' && 'my-1 pl-4 border-l-2 border-gray-200',
        type === 'nav' && 'my-1',
        type === 'header' && 'mb-2',
        type === 'footer' && 'mt-2',
        type === 'main' && 'my-2',
        type === 'form' && 'my-2 space-y-2',
        type === 'fieldset' && 'border p-2 rounded',
        type === 'label' && 'font-medium',
        type === 'button' && 'px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600',
        type === 'a' && 'text-blue-600 underline',
      ),
    },
    children
  )
}

/**
 * Create the JSX Element Plugin
 *
 * This plugin handles ALL element types not covered by specific plugins.
 * It uses a custom isElement check to match any unhandled type.
 */
export const JsxElementPlugin = createPlatePlugin({
  key: 'jsx-element',

  // Handle elements dynamically
  node: {
    isElement: true,
  },

  // Custom render that handles unknown types
  render: {
    // Use beforeEditable to inject a custom renderElement
    // This catches any element type not handled by other plugins
    belowNodes: ({ element, children, attributes }) => {
      const type = (element as any).type as string

      // Skip if handled by another plugin
      if (!type || HANDLED_TYPES.has(type)) {
        return null
      }

      return (
        <JsxElement
          element={element}
          attributes={attributes}
          children={children}
          nodeProps={{}}
        />
      )
    },
  },

  // Override normalizeNode to allow any element type
  extendEditor: ({ editor }) => {
    const { isElement, isVoid: origIsVoid } = editor

    // Allow any type to be an element
    editor.isElement = (value: any) => {
      if (value && typeof value === 'object' && 'type' in value && 'children' in value) {
        return true
      }
      return isElement(value)
    }

    // Check void based on element's isVoid property
    editor.isVoid = (element: any) => {
      if (element.isVoid === true) return true
      return origIsVoid(element)
    }

    return editor
  },
})

export default JsxElementPlugin
