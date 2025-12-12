/**
 * useNodePositionMap - Track DOM positions of RSC-rendered elements
 *
 * Scans the DOM for elements with data-node-id attributes and maintains
 * a map of their positions. Used by the edit overlay to position
 * selection highlights and drag handles.
 *
 * Updates on:
 * - Window resize
 * - Container scroll
 * - DOM mutations (ResizeObserver + MutationObserver)
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export interface NodePosition {
  /** Node ID from data-node-id attribute */
  nodeId: string
  /** Bounding rect relative to container */
  rect: DOMRect
  /** The DOM element */
  element: HTMLElement
}

export interface UseNodePositionMapOptions {
  /** Container element to search within */
  container: HTMLElement | null
  /** Whether tracking is enabled */
  enabled?: boolean
  /** Debounce delay for updates (ms) */
  debounceMs?: number
}

export interface UseNodePositionMapResult {
  /** Map of node ID to position data */
  positionMap: Map<string, NodePosition>
  /** Get position for a specific node */
  getPosition: (nodeId: string) => NodePosition | undefined
  /** Force a position update */
  refresh: () => void
  /** Whether currently scanning */
  isScanning: boolean
}

export function useNodePositionMap({
  container,
  enabled = true,
  debounceMs = 50,
}: UseNodePositionMapOptions): UseNodePositionMapResult {
  const [positionMap, setPositionMap] = useState<Map<string, NodePosition>>(new Map())
  const [isScanning, setIsScanning] = useState(false)

  // Refs for observers
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const mutationObserverRef = useRef<MutationObserver | null>(null)
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scan DOM and build position map
  const scanPositions = useCallback(() => {
    if (!container || !enabled) return

    setIsScanning(true)

    const newMap = new Map<string, NodePosition>()
    const containerRect = container.getBoundingClientRect()

    // Find all elements with data-node-id
    const elements = container.querySelectorAll('[data-node-id]')

    elements.forEach((el) => {
      const nodeId = el.getAttribute('data-node-id')
      if (!nodeId) return

      const elementRect = el.getBoundingClientRect()

      // Calculate position relative to container
      const relativeRect = new DOMRect(
        elementRect.left - containerRect.left + container.scrollLeft,
        elementRect.top - containerRect.top + container.scrollTop,
        elementRect.width,
        elementRect.height
      )

      newMap.set(nodeId, {
        nodeId,
        rect: relativeRect,
        element: el as HTMLElement,
      })
    })

    setPositionMap(newMap)
    setIsScanning(false)
  }, [container, enabled])

  // Debounced scan
  const debouncedScan = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }
    debounceTimeoutRef.current = setTimeout(scanPositions, debounceMs)
  }, [scanPositions, debounceMs])

  // Set up observers
  useEffect(() => {
    if (!container || !enabled) return

    // Initial scan
    scanPositions()

    // Resize observer - track element size changes
    resizeObserverRef.current = new ResizeObserver(() => {
      debouncedScan()
    })

    // Observe container and all descendants
    resizeObserverRef.current.observe(container)

    // Mutation observer - track DOM changes
    mutationObserverRef.current = new MutationObserver(() => {
      debouncedScan()
    })

    mutationObserverRef.current.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-node-id', 'style', 'class'],
    })

    // Window resize handler
    const handleResize = () => debouncedScan()
    window.addEventListener('resize', handleResize)

    // Scroll handler
    const handleScroll = () => debouncedScan()
    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
      resizeObserverRef.current?.disconnect()
      mutationObserverRef.current?.disconnect()
      window.removeEventListener('resize', handleResize)
      container.removeEventListener('scroll', handleScroll)
    }
  }, [container, enabled, scanPositions, debouncedScan])

  // Get position for a specific node
  const getPosition = useCallback(
    (nodeId: string): NodePosition | undefined => {
      return positionMap.get(nodeId)
    },
    [positionMap]
  )

  return {
    positionMap,
    getPosition,
    refresh: scanPositions,
    isScanning,
  }
}

/**
 * Find the node ID of the element at a given point
 */
export function findNodeAtPoint(
  container: HTMLElement,
  x: number,
  y: number
): string | null {
  const containerRect = container.getBoundingClientRect()
  const absoluteX = x + containerRect.left
  const absoluteY = y + containerRect.top

  const element = document.elementFromPoint(absoluteX, absoluteY)
  if (!element) return null

  // Walk up to find nearest element with data-node-id
  let current: Element | null = element
  while (current && current !== container) {
    const nodeId = current.getAttribute('data-node-id')
    if (nodeId) return nodeId
    current = current.parentElement
  }

  return null
}

/**
 * Get all ancestor node IDs for a given node ID
 */
export function getAncestorNodeIds(
  container: HTMLElement,
  nodeId: string
): string[] {
  const element = container.querySelector(`[data-node-id="${nodeId}"]`)
  if (!element) return []

  const ancestors: string[] = []
  let current: Element | null = element.parentElement

  while (current && current !== container) {
    const ancestorId = current.getAttribute('data-node-id')
    if (ancestorId) {
      ancestors.push(ancestorId)
    }
    current = current.parentElement
  }

  return ancestors
}

/**
 * Get all descendant node IDs for a given node ID
 */
export function getDescendantNodeIds(
  container: HTMLElement,
  nodeId: string
): string[] {
  const element = container.querySelector(`[data-node-id="${nodeId}"]`)
  if (!element) return []

  const descendants: string[] = []
  const childElements = element.querySelectorAll('[data-node-id]')

  childElements.forEach((el) => {
    const childId = el.getAttribute('data-node-id')
    if (childId && childId !== nodeId) {
      descendants.push(childId)
    }
  })

  return descendants
}
