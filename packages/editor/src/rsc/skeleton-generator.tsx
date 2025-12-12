/**
 * Skeleton Generator for RSC-First Editor
 *
 * Generates placeholder skeletons from AST nodes while RSC content loads.
 * Each skeleton element has a data-skeleton-id that matches the expected
 * data-node-id from RSC render for hot-swapping.
 */

import * as React from 'react'
import type { EditableNode } from '../ast/oxc-parser'

// ============================================================================
// Skeleton Configs - Estimated dimensions for common components
// ============================================================================

interface SkeletonConfig {
  /** Base height in pixels */
  height: number
  /** Width - can be fixed px, percentage, or 'full' for 100% */
  width?: string | number
  /** Whether this component typically spans full width */
  fullWidth?: boolean
  /** Minimum height (won't shrink below this) */
  minHeight?: number
  /** Add spacing after this element */
  marginBottom?: number
}

/**
 * Default skeleton configurations for common components.
 * Keys are tag names (case-insensitive for DOM elements, exact for components).
 */
const SKELETON_CONFIGS: Record<string, SkeletonConfig> = {
  // Container components
  'Card': { height: 200, fullWidth: true, marginBottom: 16 },
  'CardHeader': { height: 60 },
  'CardTitle': { height: 24, width: '60%' },
  'CardDescription': { height: 16, width: '80%' },
  'CardContent': { height: 100, fullWidth: true },
  'CardFooter': { height: 48, fullWidth: true },

  // Navigation
  'Tabs': { height: 40, fullWidth: true },
  'TabsList': { height: 36, width: 300 },
  'TabsContent': { height: 200, fullWidth: true },

  // Data display
  'Table': { height: 300, fullWidth: true },
  'TableHeader': { height: 40, fullWidth: true },
  'TableBody': { height: 260, fullWidth: true },
  'TableRow': { height: 48, fullWidth: true },
  'TableCell': { height: 48, width: 120 },
  'Badge': { height: 22, width: 60 },
  'Avatar': { height: 40, width: 40 },

  // Form elements
  'Button': { height: 36, width: 120 },
  'Input': { height: 36, fullWidth: true },
  'Textarea': { height: 80, fullWidth: true },
  'Select': { height: 36, fullWidth: true },
  'Checkbox': { height: 16, width: 16 },
  'Switch': { height: 20, width: 36 },
  'Slider': { height: 20, fullWidth: true },

  // Charts (ChartJS / Recharts)
  'Chart': { height: 300, fullWidth: true },
  'BarChart': { height: 300, fullWidth: true },
  'LineChart': { height: 300, fullWidth: true },
  'PieChart': { height: 300, width: 300 },
  'AreaChart': { height: 300, fullWidth: true },

  // Typography / DOM
  'h1': { height: 40, width: '50%', marginBottom: 16 },
  'h2': { height: 32, width: '60%', marginBottom: 12 },
  'h3': { height: 24, width: '50%', marginBottom: 8 },
  'h4': { height: 20, width: '40%', marginBottom: 8 },
  'p': { height: 20, width: '100%', marginBottom: 8 },
  'span': { height: 16, width: 80 },
  'a': { height: 16, width: 100 },
  'strong': { height: 16, width: 60 },
  'em': { height: 16, width: 60 },

  // Layout
  'div': { height: 40, fullWidth: true },
  'section': { height: 200, fullWidth: true, marginBottom: 16 },
  'article': { height: 200, fullWidth: true, marginBottom: 16 },
  'header': { height: 60, fullWidth: true },
  'footer': { height: 60, fullWidth: true },
  'main': { height: 400, fullWidth: true },
  'aside': { height: 200, width: 250 },
  'nav': { height: 48, fullWidth: true },

  // Lists
  'ul': { height: 100, fullWidth: true },
  'ol': { height: 100, fullWidth: true },
  'li': { height: 24, fullWidth: true, marginBottom: 4 },

  // Images
  'img': { height: 200, width: 300 },
  'Image': { height: 200, width: 300 },

  // Special
  '#fragment': { height: 0 }, // Fragments don't render anything themselves
  '#text': { height: 16, width: '100%' },
}

// ============================================================================
// Skeleton Components
// ============================================================================

interface SkeletonProps {
  nodeId: string
  height: number
  width?: string | number
  fullWidth?: boolean
  marginBottom?: number
  children?: React.ReactNode
  isContainer?: boolean
}

function SkeletonElement({
  nodeId,
  height,
  width,
  fullWidth,
  marginBottom,
  children,
  isContainer,
}: SkeletonProps) {
  const style: React.CSSProperties = {
    minHeight: height,
    width: fullWidth ? '100%' : (typeof width === 'number' ? `${width}px` : width),
    marginBottom: marginBottom,
  }

  if (isContainer && children) {
    // Container skeleton - shows structure
    return (
      <div
        data-skeleton-id={nodeId}
        className="rounded-md border border-muted/30 bg-muted/5 p-3"
        style={style}
      >
        {children}
      </div>
    )
  }

  // Leaf skeleton - shows loading animation
  return (
    <div
      data-skeleton-id={nodeId}
      className="rounded-md bg-muted/20 animate-pulse"
      style={style}
    />
  )
}

// ============================================================================
// Generator
// ============================================================================

function getSkeletonConfig(tagName: string): SkeletonConfig {
  // Try exact match first
  if (SKELETON_CONFIGS[tagName]) {
    return SKELETON_CONFIGS[tagName]
  }

  // Try lowercase for DOM elements
  const lower = tagName.toLowerCase()
  if (SKELETON_CONFIGS[lower]) {
    return SKELETON_CONFIGS[lower]
  }

  // Default config
  return { height: 40, fullWidth: true }
}

/**
 * Generate a skeleton tree from an EditableNode AST
 */
export function generateSkeletonFromAST(node: EditableNode | null): React.ReactNode {
  if (!node) return null

  // Skip fragments at root - just render children
  if (node.tagName === '#fragment') {
    return (
      <>
        {node.children.map((child) => generateSkeletonFromAST(child))}
      </>
    )
  }

  // Text nodes
  if (node.isText) {
    const config = getSkeletonConfig('#text')
    return (
      <SkeletonElement
        key={node.id}
        nodeId={node.id}
        height={config.height}
        width={config.width}
        marginBottom={config.marginBottom}
      />
    )
  }

  const config = getSkeletonConfig(node.tagName)
  const hasChildren = node.children.length > 0

  // For container-like elements, render children inside
  if (hasChildren) {
    return (
      <SkeletonElement
        key={node.id}
        nodeId={node.id}
        height={config.height}
        width={config.width}
        fullWidth={config.fullWidth}
        marginBottom={config.marginBottom}
        isContainer
      >
        {node.children.map((child) => generateSkeletonFromAST(child))}
      </SkeletonElement>
    )
  }

  // Leaf elements
  return (
    <SkeletonElement
      key={node.id}
      nodeId={node.id}
      height={config.height}
      width={config.width}
      fullWidth={config.fullWidth}
      marginBottom={config.marginBottom}
    />
  )
}

/**
 * Estimate total height of skeleton tree (for layout shift prevention)
 */
export function estimateSkeletonHeight(node: EditableNode | null): number {
  if (!node) return 0

  if (node.tagName === '#fragment') {
    return node.children.reduce((sum, child) => sum + estimateSkeletonHeight(child), 0)
  }

  const config = getSkeletonConfig(node.tagName)
  const childrenHeight = node.children.reduce((sum, child) => sum + estimateSkeletonHeight(child), 0)

  // Container elements: children height + padding, or minimum height
  return Math.max(config.height, childrenHeight + 24) + (config.marginBottom || 0)
}
