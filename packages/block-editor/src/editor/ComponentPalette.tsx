/**
 * Component Palette - Sidebar showing available components to drag into the canvas
 */

import { useDraggable } from "@dnd-kit/core"
import type { PropSchema } from "../model/block-model"

export interface ComponentDefinition {
  /** Tag name (e.g., 'div', 'Card', 'Button') */
  tagName: string

  /** Display name for the palette */
  displayName: string

  /** Category for grouping */
  category: string

  /** Whether the component accepts children */
  acceptsChildren?: boolean

  /** Prop schema for the component */
  propSchema?: PropSchema

  /** Icon component */
  icon?: React.ReactNode

  /** Is this a server component? */
  isServerComponent?: boolean
}

export interface ComponentPaletteProps {
  /** Available components */
  components: ComponentDefinition[]

  /** Class name for the container */
  className?: string
}

/**
 * Component palette sidebar
 */
export function ComponentPalette({ components, className }: ComponentPaletteProps) {
  // Group components by category
  const categories = components.reduce(
    (acc, comp) => {
      const cat = comp.category || "Other"
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(comp)
      return acc
    },
    {} as Record<string, ComponentDefinition[]>
  )

  return (
    <div className={`w-56 border-r bg-muted/20 overflow-y-auto ${className ?? ""}`}>
      <div className="p-3 border-b">
        <h2 className="text-sm font-semibold text-foreground">Components</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Drag to canvas to add
        </p>
      </div>

      <div className="p-2 space-y-4">
        {Object.entries(categories).map(([category, comps]) => (
          <div key={category}>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 mb-2">
              {category}
            </h3>
            <div className="space-y-1">
              {comps.map((comp) => (
                <DraggableComponent key={comp.tagName} component={comp} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface DraggableComponentProps {
  component: ComponentDefinition
}

/**
 * A draggable component item in the palette
 */
function DraggableComponent({ component }: DraggableComponentProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${component.tagName}`,
    data: { component },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`
        flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-grab
        border border-transparent
        hover:bg-muted hover:border-border
        active:cursor-grabbing
        ${isDragging ? "opacity-50" : ""}
      `}
    >
      {/* Icon */}
      <div className="w-5 h-5 flex items-center justify-center text-muted-foreground">
        {component.icon ?? <ComponentIcon tagName={component.tagName} />}
      </div>

      {/* Name */}
      <span className="flex-1 truncate">{component.displayName}</span>

      {/* Tag indicator */}
      <span className="text-xs text-muted-foreground font-mono">
        {`<${component.tagName}>`}
      </span>
    </div>
  )
}

/**
 * Default icon for a component based on tag name
 */
function ComponentIcon({ tagName }: { tagName: string }) {
  // Simple SVG icons based on common elements
  switch (tagName.toLowerCase()) {
    case "div":
    case "section":
    case "article":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )

    case "span":
    case "p":
    case "text":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path d="M3 4h10M3 8h7M3 12h10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      )

    case "h1":
    case "h2":
    case "h3":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path d="M3 3v10M13 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      )

    case "ul":
    case "ol":
    case "li":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <circle cx="3" cy="4" r="1.5" />
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="3" cy="12" r="1.5" />
          <path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      )

    case "button":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <rect x="2" y="4" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )

    case "img":
    case "image":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="5" cy="5" r="1.5" />
          <path d="M2 10l3-3 2 2 4-4 3 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )

    default:
      // Custom component - show a puzzle piece
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path
            d="M4 2h3v1.5a1.5 1.5 0 003 0V2h3a2 2 0 012 2v3h-1.5a1.5 1.5 0 000 3H15v3a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      )
  }
}

export default ComponentPalette
