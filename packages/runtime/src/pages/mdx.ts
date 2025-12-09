/**
 * MDX Compilation
 *
 * Compiles markdown with MDX support for Block elements.
 */

import type { PageMeta } from "@hands/stdlib"

export interface CompiledPage {
  /** Page metadata from frontmatter */
  meta: PageMeta

  /** Markdown content (without frontmatter) */
  content: string

  /** Block references found in the page */
  blocks: Array<{
    id: string
    props: Record<string, unknown>
  }>
}

/**
 * Compile a markdown page
 *
 * Extracts frontmatter, parses content, and finds Block references.
 *
 * @param source - Raw markdown source
 */
export function compilePage(source: string): CompiledPage {
  // Extract frontmatter
  const { meta, content } = extractFrontmatter(source)

  // Find Block elements
  const blocks = findBlockReferences(content)

  return {
    meta: {
      title: (meta.title as string) || "Untitled",
      description: meta.description as string | undefined,
      ...meta,
    },
    content,
    blocks,
  }
}

/**
 * Extract frontmatter from markdown
 */
function extractFrontmatter(source: string): {
  meta: Record<string, unknown>
  content: string
} {
  if (!source.startsWith("---")) {
    return { meta: {}, content: source }
  }

  const endIndex = source.indexOf("---", 3)
  if (endIndex === -1) {
    return { meta: {}, content: source }
  }

  const frontmatterStr = source.slice(3, endIndex).trim()
  const content = source.slice(endIndex + 3).trim()

  // Parse simple YAML
  const meta: Record<string, unknown> = {}

  for (const line of frontmatterStr.split("\n")) {
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    let value: string | boolean | number = line.slice(colonIndex + 1).trim()

    // Remove quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    // Parse booleans and numbers
    if (value === "true") value = true
    else if (value === "false") value = false
    else if (/^-?\d+(\.\d+)?$/.test(value)) {
      value = parseFloat(value)
    }

    meta[key] = value
  }

  return { meta, content }
}

/**
 * Find Block references in markdown content
 *
 * Looks for: <Block id="..." props={...} />
 */
function findBlockReferences(
  content: string
): Array<{ id: string; props: Record<string, unknown> }> {
  const blocks: Array<{ id: string; props: Record<string, unknown> }> = []

  // Match <Block id="..." ... />
  // Supports both self-closing and regular tags
  const blockPattern = /<Block\s+([^>]*)\/?>/g
  let match

  while ((match = blockPattern.exec(content)) !== null) {
    const attributesStr = match[1]
    const attributes = parseAttributes(attributesStr)

    if (attributes.id) {
      const id = String(attributes.id)
      const props = { ...attributes }
      delete props.id

      blocks.push({ id, props })
    }
  }

  return blocks
}

/**
 * Parse JSX-like attributes from a string
 *
 * Supports:
 * - id="value" (string)
 * - count={5} (number)
 * - active={true} (boolean)
 * - data={{ key: "value" }} (object - basic parsing)
 */
function parseAttributes(str: string): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}

  // Match key="value" or key={value}
  const attrPattern = /(\w+)=(?:"([^"]*)"|{([^}]*)})/g
  let match

  while ((match = attrPattern.exec(str)) !== null) {
    const key = match[1]
    const stringValue = match[2]
    const jsValue = match[3]

    if (stringValue !== undefined) {
      // String value
      attrs[key] = stringValue
    } else if (jsValue !== undefined) {
      // JS expression value
      attrs[key] = parseJsValue(jsValue)
    }
  }

  return attrs
}

/**
 * Parse a simple JS value
 */
function parseJsValue(str: string): unknown {
  const trimmed = str.trim()

  // Boolean
  if (trimmed === "true") return true
  if (trimmed === "false") return false

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed)
  }

  // Null/undefined
  if (trimmed === "null") return null
  if (trimmed === "undefined") return undefined

  // String (quoted)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  // Array (simple)
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }

  // Object (simple)
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      // Try to parse as JSON (with double quotes)
      const jsonStr = trimmed.replace(/(\w+):/g, '"$1":').replace(/'/g, '"')
      return JSON.parse(jsonStr)
    } catch {
      return trimmed
    }
  }

  // Return as string if nothing else matches
  return trimmed
}
