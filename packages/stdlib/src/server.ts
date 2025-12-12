/**
 * Server-only exports from @hands/stdlib
 *
 * Use this entry point in RSC workers and server-side code.
 * It does NOT include "use client" components, avoiding SSR bundling issues.
 *
 * Import like: import { BlockFn, BlockMeta } from "@hands/stdlib/server"
 */

// Import registry data (TypeScript, not JSON - for SSR compatibility)
import registry from "./registry"

// Core types (all server-safe)
export * from "./types/index.js"

// Source utilities
export { defineSource } from "./sources/types.js"

// Registry types (duplicated here to avoid importing from registry/index.js)
export interface ComponentMeta {
  name: string
  category: string
  description: string
  files: string[]
  dependencies: string[]
  plateKey?: string
  icon?: string
  keywords?: string[]
}

export interface CategoryMeta {
  name: string
  description: string
}

export interface Registry {
  name: string
  version: string
  components: Record<string, ComponentMeta>
  categories: Record<string, CategoryMeta>
}

// Export typed registry
export const componentRegistry = registry as Registry

// Helper functions for querying
export function listComponents(category?: string): Array<{ key: string } & ComponentMeta> {
  return Object.entries(componentRegistry.components)
    .filter(([_, comp]) => !category || comp.category === category)
    .map(([key, comp]) => ({ key, ...comp }))
}

export function getComponent(name: string): (ComponentMeta & { key: string }) | undefined {
  const comp = componentRegistry.components[name]
  return comp ? { key: name, ...comp } : undefined
}

export function searchComponents(query: string): Array<{ key: string } & ComponentMeta> {
  const q = query.toLowerCase()
  return Object.entries(componentRegistry.components)
    .filter(([key, comp]) =>
      key.includes(q) ||
      comp.name.toLowerCase().includes(q) ||
      comp.description.toLowerCase().includes(q) ||
      comp.category.includes(q)
    )
    .map(([key, comp]) => ({ key, ...comp }))
}

export function listCategories(): Array<{ key: string } & CategoryMeta> {
  return Object.entries(componentRegistry.categories)
    .map(([key, cat]) => ({ key, ...cat }))
}

export function getCategory(name: string): CategoryMeta | undefined {
  return componentRegistry.categories[name]
}

// RSC component registry for server-side rendering
// These components can be rendered via RSC and will serialize client references
// for "use client" components that need client-side hydration.
//
// Note: We import the actual components here even though some have "use client".
// The RSC bundler (rwsdk) handles serializing them as client references.
import {
  Button,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Badge,
  MetricCard,
  BarChart,
  LineChart,
} from "./registry/index.js"

export const rscComponents: Record<string, React.ComponentType<any>> = {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  MetricCard,
  BarChart,
  LineChart,
}

// Re-export for type checking
import type React from "react"
