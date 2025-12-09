/**
 * Page Rendering
 *
 * Renders markdown pages with embedded blocks to HTML.
 */

import { readFile } from "fs/promises"
import { join } from "path"
import type { BlockContext, PageMeta, PageRenderResult } from "@hands/stdlib"
import { compilePage } from "./mdx.js"
import { BlockRegistry } from "../blocks/registry.js"
import { serveBlock } from "../blocks/serve.js"

export interface RenderPageOptions {
  /** Path to the pages directory */
  pagesDir: string

  /** Page file path (relative to pagesDir) */
  pagePath: string

  /** Block registry for rendering embedded blocks */
  blockRegistry: BlockRegistry

  /** Block context for embedded blocks */
  blockContext: BlockContext
}

/**
 * Render a page to HTML
 *
 * @param options - Render options
 */
export async function renderPage(options: RenderPageOptions): Promise<PageRenderResult> {
  const { pagesDir, pagePath, blockRegistry, blockContext } = options

  try {
    // Read page source
    const filePath = join(pagesDir, pagePath)
    const source = await readFile(filePath, "utf-8")

    // Compile page
    const compiled = compilePage(source)

    // Render markdown to HTML
    let html = renderMarkdown(compiled.content)

    // Render embedded blocks
    for (const blockRef of compiled.blocks) {
      const blockResult = await serveBlock({
        registry: blockRegistry,
        context: blockContext,
        blockId: blockRef.id,
        props: blockRef.props,
      })

      // Replace Block element with rendered HTML
      const blockPattern = new RegExp(
        `<Block[^>]*id=["']${blockRef.id}["'][^>]*/?>`,
        "g"
      )
      html = html.replace(blockPattern, blockResult.html)
    }

    // Wrap in full HTML document
    const fullHtml = wrapPageHtml(html, compiled.meta)

    return {
      html: fullHtml,
      meta: compiled.meta,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return {
      html: renderErrorPage(error),
      meta: { title: "Error" },
      error,
    }
  }
}

/**
 * Convert markdown to HTML
 *
 * Simple markdown rendering without external dependencies.
 * For production, you might want to use a full markdown parser like marked or remark.
 */
function renderMarkdown(content: string): string {
  let html = content

  // Headers
  html = html.replace(/^### (.*$)/gm, "<h3>$1</h3>")
  html = html.replace(/^## (.*$)/gm, "<h2>$1</h2>")
  html = html.replace(/^# (.*$)/gm, "<h1>$1</h1>")

  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>")

  // Code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>")

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Line breaks -> paragraphs
  html = html
    .split(/\n\n+/)
    .map((para) => {
      // Don't wrap if it's already a block element or a Block component
      if (para.match(/^<(h[1-6]|ul|ol|li|div|Block|blockquote|pre|table)/)) {
        return para
      }
      return `<p>${para.replace(/\n/g, "<br>")}</p>`
    })
    .join("\n")

  // Lists (simple)
  html = html.replace(/^- (.*$)/gm, "<li>$1</li>")
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")

  return html
}

/**
 * Wrap page content in a full HTML document
 */
function wrapPageHtml(content: string, meta: PageMeta): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(meta.title)}</title>
  ${meta.description ? `<meta name="description" content="${escapeHtml(meta.description)}">` : ""}
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
    }
    .prose { max-width: 65ch; margin: 0 auto; padding: 2rem; }
    .prose h1 { font-size: 2.25rem; font-weight: 700; margin-bottom: 1rem; }
    .prose h2 { font-size: 1.5rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; }
    .prose h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; }
    .prose p { margin-bottom: 1rem; }
    .prose a { color: #2563eb; text-decoration: underline; }
    .prose code { background: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-size: 0.875em; }
    .prose ul, .prose ol { margin-bottom: 1rem; padding-left: 1.5rem; }
    .prose li { margin-bottom: 0.25rem; }
  </style>
</head>
<body>
  <main class="prose ${meta.className || ""}">
    ${content}
  </main>
</body>
</html>`
}

/**
 * Render an error page
 */
function renderErrorPage(error: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
  <main class="max-w-xl mx-auto p-8 mt-16">
    <div class="bg-red-50 border border-red-200 rounded-lg p-6">
      <h1 class="text-xl font-semibold text-red-700 mb-2">Page Error</h1>
      <p class="text-red-600">${escapeHtml(error)}</p>
    </div>
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
