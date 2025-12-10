/**
 * Static Rendering Module
 *
 * Renders pages to static HTML at build time:
 * - Plate documents (.plate.json) -> PlateStatic -> HTML
 * - Markdown (.md) -> renderToString with React -> HTML
 *
 * Used by production builds for pre-rendering static pages.
 */

import * as React from "react"
import { renderToString } from "react-dom/server"

// Plate types (simplified local definitions to avoid heavy dependency)
type TText = { text: string; [key: string]: unknown }
type TElement = { type?: string; children?: TDescendant[]; [key: string]: unknown }
type TDescendant = TText | TElement

export interface StaticRenderOptions {
  /** Page title */
  title: string
  /** Page description */
  description?: string
  /** Tailwind CDN (for production, bundle CSS instead) */
  includeTailwind?: boolean
}

export interface PageDocument {
  /** Document type: "plate" for Plate JSON, "markdown" for markdown */
  type: "plate" | "markdown"
  /** Plate document (array of nodes) for type="plate" */
  content?: TDescendant[]
  /** Markdown content for type="markdown" */
  markdown?: string
  /** Page metadata */
  meta: {
    title: string
    description?: string
    [key: string]: unknown
  }
}

/**
 * Render a page document to static HTML
 */
export function renderPageToHtml(doc: PageDocument, options: Partial<StaticRenderOptions> = {}): string {
  const opts: StaticRenderOptions = {
    title: doc.meta.title,
    description: doc.meta.description,
    includeTailwind: true,
    ...options,
  }

  let bodyHtml: string

  if (doc.type === "plate" && doc.content) {
    // Render Plate document using PlateStatic components
    const element = <PlateStaticRenderer value={doc.content} />
    bodyHtml = renderToString(element)
  } else if (doc.type === "markdown" && doc.markdown) {
    // Render markdown to HTML
    const element = <MarkdownRenderer content={doc.markdown} />
    bodyHtml = renderToString(element)
  } else {
    bodyHtml = "<p>No content</p>"
  }

  return wrapInHtmlDocument(bodyHtml, opts)
}

/**
 * Static renderer for Plate documents
 *
 * This is a simplified version that renders without the full Plate editor.
 * For production, it renders each node type to appropriate HTML elements.
 */
function PlateStaticRenderer({ value }: { value: TDescendant[] }): React.ReactElement {
  return (
    <div className="plate-content">
      {value.map((node, index) => (
        <PlateNode key={index} node={node} />
      ))}
    </div>
  )
}

/**
 * Render a single Plate node
 */
function PlateNode({ node }: { node: TDescendant }): React.ReactElement | null {
  // Check if it's a text node
  if ("text" in node) {
    return <PlateText node={node as TText} />
  }

  const element = node as TElement
  const children = element.children?.map((child: TDescendant, index: number) => (
    <PlateNode key={index} node={child} />
  ))

  switch (element.type) {
    case "p":
    case "paragraph":
      return <p className="my-2">{children}</p>

    case "h1":
    case "heading":
      if ((element as any).level === 1 || element.type === "h1") {
        return <h1 className="text-3xl font-bold mt-6 mb-3">{children}</h1>
      }
      if ((element as any).level === 2) {
        return <h2 className="text-2xl font-semibold mt-5 mb-2">{children}</h2>
      }
      if ((element as any).level === 3) {
        return <h3 className="text-xl font-semibold mt-4 mb-2">{children}</h3>
      }
      return <h4 className="text-lg font-medium mt-3 mb-1">{children}</h4>

    case "h2":
      return <h2 className="text-2xl font-semibold mt-5 mb-2">{children}</h2>

    case "h3":
      return <h3 className="text-xl font-semibold mt-4 mb-2">{children}</h3>

    case "h4":
      return <h4 className="text-lg font-medium mt-3 mb-1">{children}</h4>

    case "h5":
      return <h5 className="text-base font-medium mt-2 mb-1">{children}</h5>

    case "h6":
      return <h6 className="text-sm font-medium mt-2 mb-1">{children}</h6>

    case "blockquote":
      return (
        <blockquote className="border-l-4 border-gray-300 pl-4 italic my-4">
          {children}
        </blockquote>
      )

    case "code_block":
    case "codeBlock":
      return (
        <pre className="bg-gray-100 rounded-lg p-4 overflow-x-auto my-4">
          <code className="text-sm font-mono">{children}</code>
        </pre>
      )

    case "code_line":
    case "codeLine":
      return <div>{children}</div>

    case "ul":
    case "bulleted_list":
    case "bulletedList":
      return <ul className="list-disc list-inside my-3">{children}</ul>

    case "ol":
    case "numbered_list":
    case "numberedList":
      return <ol className="list-decimal list-inside my-3">{children}</ol>

    case "li":
    case "list_item":
    case "listItem":
      return <li className="my-1">{children}</li>

    case "lic":
    case "listItemContent":
      return <span>{children}</span>

    case "a":
    case "link":
      const href = (element as any).url || (element as any).href || "#"
      return (
        <a href={href} className="text-blue-600 hover:underline">
          {children}
        </a>
      )

    case "img":
    case "image":
      const src = (element as any).url || (element as any).src
      const alt = (element as any).alt || ""
      return (
        <figure className="my-4">
          <img src={src} alt={alt} className="max-w-full rounded" />
          {(element as any).caption && (
            <figcaption className="text-sm text-gray-600 mt-2">
              {(element as any).caption}
            </figcaption>
          )}
        </figure>
      )

    case "hr":
    case "horizontalRule":
      return <hr className="my-6 border-gray-300" />

    case "table":
      return (
        <table className="min-w-full border-collapse my-4">
          <tbody>{children}</tbody>
        </table>
      )

    case "tr":
    case "tableRow":
      return <tr className="border-b border-gray-200">{children}</tr>

    case "td":
    case "tableCell":
      return <td className="px-4 py-2 border border-gray-200">{children}</td>

    case "th":
    case "tableHeader":
      return (
        <th className="px-4 py-2 border border-gray-200 bg-gray-50 font-semibold">
          {children}
        </th>
      )

    case "callout":
      const variant = (element as any).variant || "info"
      const variantClasses: Record<string, string> = {
        info: "bg-blue-50 border-blue-200 text-blue-800",
        warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
        error: "bg-red-50 border-red-200 text-red-800",
        success: "bg-green-50 border-green-200 text-green-800",
      }
      return (
        <div className={`rounded-lg border p-4 my-4 ${variantClasses[variant] || variantClasses.info}`}>
          {children}
        </div>
      )

    case "toggle":
      return (
        <details className="my-2">
          <summary className="cursor-pointer font-medium">
            {(element as any).title || "Toggle"}
          </summary>
          <div className="pl-4 mt-2">{children}</div>
        </details>
      )

    case "column_group":
    case "columnGroup":
      return <div className="flex gap-4 my-4">{children}</div>

    case "column":
      const width = (element as any).width || "auto"
      return <div style={{ flex: width === "auto" ? 1 : `0 0 ${width}` }}>{children}</div>

    case "block":
    case "Block":
      // Block placeholder - these should be processed separately
      const blockId = (element as any).id || "unknown"
      return (
        <div className="border border-dashed border-gray-300 rounded p-4 my-4 text-center text-gray-500">
          Block: {blockId}
        </div>
      )

    default:
      // Default: render as div with children
      return <div>{children}</div>
  }
}

/**
 * Render a text node with marks (bold, italic, etc.)
 */
function PlateText({ node }: { node: TText }): React.ReactElement {
  let content: React.ReactNode = node.text

  // Apply marks
  if ((node as any).bold) {
    content = <strong>{content}</strong>
  }
  if ((node as any).italic) {
    content = <em>{content}</em>
  }
  if ((node as any).underline) {
    content = <u>{content}</u>
  }
  if ((node as any).strikethrough) {
    content = <del>{content}</del>
  }
  if ((node as any).code) {
    content = <code className="bg-gray-100 px-1 rounded text-sm">{content}</code>
  }
  if ((node as any).subscript) {
    content = <sub>{content}</sub>
  }
  if ((node as any).superscript) {
    content = <sup>{content}</sup>
  }

  // Handle color and background
  const style: React.CSSProperties = {}
  if ((node as any).color) {
    style.color = (node as any).color
  }
  if ((node as any).backgroundColor) {
    style.backgroundColor = (node as any).backgroundColor
  }

  if (Object.keys(style).length > 0) {
    return <span style={style}>{content}</span>
  }

  return <>{content}</>
}

/**
 * Markdown renderer using React components
 */
function MarkdownRenderer({ content }: { content: string }): React.ReactElement {
  // Parse markdown into a simple AST and render
  const lines = content.split("\n")
  const elements: React.ReactElement[] = []
  let currentParagraph: string[] = []
  let inCodeBlock = false
  let codeBlockContent: string[] = []
  let codeBlockLang = ""
  let listItems: string[] = []
  let listType: "ul" | "ol" | null = null

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join("\n")
      if (text.trim()) {
        elements.push(
          <p key={elements.length} className="my-2">
            {renderInlineMarkdown(text)}
          </p>
        )
      }
      currentParagraph = []
    }
  }

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const ListTag = listType
      elements.push(
        <ListTag key={elements.length} className={listType === "ul" ? "list-disc" : "list-decimal"} style={{ marginLeft: "1.5rem" }}>
          {listItems.map((item, i) => (
            <li key={i}>{renderInlineMarkdown(item)}</li>
          ))}
        </ListTag>
      )
      listItems = []
      listType = null
    }
  }

  for (const line of lines) {
    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={elements.length} className="bg-gray-100 rounded-lg p-4 overflow-x-auto my-4">
            <code className="text-sm font-mono">{codeBlockContent.join("\n")}</code>
          </pre>
        )
        codeBlockContent = []
        inCodeBlock = false
      } else {
        flushParagraph()
        flushList()
        inCodeBlock = true
        codeBlockLang = line.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeBlockContent.push(line)
      continue
    }

    // Headers
    const h6Match = line.match(/^###### (.+)$/)
    if (h6Match) {
      flushParagraph()
      flushList()
      elements.push(<h6 key={elements.length} className="text-sm font-medium mt-2 mb-1">{renderInlineMarkdown(h6Match[1])}</h6>)
      continue
    }

    const h5Match = line.match(/^##### (.+)$/)
    if (h5Match) {
      flushParagraph()
      flushList()
      elements.push(<h5 key={elements.length} className="text-base font-medium mt-2 mb-1">{renderInlineMarkdown(h5Match[1])}</h5>)
      continue
    }

    const h4Match = line.match(/^#### (.+)$/)
    if (h4Match) {
      flushParagraph()
      flushList()
      elements.push(<h4 key={elements.length} className="text-lg font-medium mt-3 mb-1">{renderInlineMarkdown(h4Match[1])}</h4>)
      continue
    }

    const h3Match = line.match(/^### (.+)$/)
    if (h3Match) {
      flushParagraph()
      flushList()
      elements.push(<h3 key={elements.length} className="text-xl font-semibold mt-4 mb-2">{renderInlineMarkdown(h3Match[1])}</h3>)
      continue
    }

    const h2Match = line.match(/^## (.+)$/)
    if (h2Match) {
      flushParagraph()
      flushList()
      elements.push(<h2 key={elements.length} className="text-2xl font-semibold mt-5 mb-2">{renderInlineMarkdown(h2Match[1])}</h2>)
      continue
    }

    const h1Match = line.match(/^# (.+)$/)
    if (h1Match) {
      flushParagraph()
      flushList()
      elements.push(<h1 key={elements.length} className="text-3xl font-bold mt-6 mb-3">{renderInlineMarkdown(h1Match[1])}</h1>)
      continue
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      flushParagraph()
      flushList()
      elements.push(<hr key={elements.length} className="my-6 border-gray-300" />)
      continue
    }

    // Unordered list
    const ulMatch = line.match(/^[-*+] (.+)$/)
    if (ulMatch) {
      flushParagraph()
      if (listType !== "ul") {
        flushList()
        listType = "ul"
      }
      listItems.push(ulMatch[1])
      continue
    }

    // Ordered list
    const olMatch = line.match(/^\d+\. (.+)$/)
    if (olMatch) {
      flushParagraph()
      if (listType !== "ol") {
        flushList()
        listType = "ol"
      }
      listItems.push(olMatch[1])
      continue
    }

    // Blockquote
    const bqMatch = line.match(/^> (.+)$/)
    if (bqMatch) {
      flushParagraph()
      flushList()
      elements.push(
        <blockquote key={elements.length} className="border-l-4 border-gray-300 pl-4 italic my-4">
          {renderInlineMarkdown(bqMatch[1])}
        </blockquote>
      )
      continue
    }

    // Empty line
    if (line.trim() === "") {
      flushParagraph()
      flushList()
      continue
    }

    // Regular text
    currentParagraph.push(line)
  }

  flushParagraph()
  flushList()

  return <>{elements}</>
}

/**
 * Render inline markdown (bold, italic, code, links)
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  // This is a simplified version - for production use a proper parser
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Bold + Italic
    let match = remaining.match(/^\*\*\*(.+?)\*\*\*/)
    if (match) {
      parts.push(<strong key={key++}><em>{match[1]}</em></strong>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Bold
    match = remaining.match(/^\*\*(.+?)\*\*/)
    if (match) {
      parts.push(<strong key={key++}>{match[1]}</strong>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Italic
    match = remaining.match(/^\*(.+?)\*/)
    if (match) {
      parts.push(<em key={key++}>{match[1]}</em>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Inline code
    match = remaining.match(/^`([^`]+)`/)
    if (match) {
      parts.push(<code key={key++} className="bg-gray-100 px-1 rounded text-sm">{match[1]}</code>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Links
    match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (match) {
      parts.push(<a key={key++} href={match[2]} className="text-blue-600 hover:underline">{match[1]}</a>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Plain text (up to next special char)
    const nextSpecial = remaining.search(/[\*`\[]/)
    if (nextSpecial === -1) {
      parts.push(remaining)
      break
    } else if (nextSpecial === 0) {
      // Special char that didn't match a pattern
      parts.push(remaining[0])
      remaining = remaining.slice(1)
    } else {
      parts.push(remaining.slice(0, nextSpecial))
      remaining = remaining.slice(nextSpecial)
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

/**
 * Wrap content in a full HTML document
 */
function wrapInHtmlDocument(content: string, opts: StaticRenderOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title)}</title>
  ${opts.description ? `<meta name="description" content="${escapeHtml(opts.description)}">` : ""}
  ${opts.includeTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ""}
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
    }
    .prose {
      max-width: 65ch;
      margin: 0 auto;
      padding: 2rem;
    }
  </style>
</head>
<body>
  <main class="prose">
    ${content}
  </main>
</body>
</html>`
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/**
 * Parse a Plate JSON file
 */
export function parsePlateDocument(jsonContent: string): PageDocument | null {
  try {
    const data = JSON.parse(jsonContent)

    // Expect { content: TDescendant[], meta?: { title, description } }
    if (Array.isArray(data)) {
      return {
        type: "plate",
        content: data,
        meta: { title: "Untitled" },
      }
    }

    if (data.content && Array.isArray(data.content)) {
      return {
        type: "plate",
        content: data.content,
        meta: data.meta || { title: "Untitled" },
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Parse a markdown file into a PageDocument
 */
export function parseMarkdownDocument(mdContent: string): PageDocument {
  let content = mdContent
  let title = "Untitled"
  let description: string | undefined

  // Extract frontmatter
  if (content.startsWith("---")) {
    const endIndex = content.indexOf("---", 3)
    if (endIndex !== -1) {
      const frontmatter = content.slice(3, endIndex).trim()
      content = content.slice(endIndex + 3).trim()

      // Parse frontmatter
      for (const line of frontmatter.split("\n")) {
        const colonIndex = line.indexOf(":")
        if (colonIndex === -1) continue

        const key = line.slice(0, colonIndex).trim()
        let value = line.slice(colonIndex + 1).trim()

        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }

        if (key === "title") title = value
        if (key === "description") description = value
      }
    }
  }

  return {
    type: "markdown",
    markdown: content,
    meta: { title, description },
  }
}
