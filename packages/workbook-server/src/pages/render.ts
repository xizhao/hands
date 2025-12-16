/**
 * Page Rendering
 *
 * Renders MDX pages with embedded blocks.
 *
 * Two modes:
 * - Dev: Blocks rendered via RSC Flight streaming
 * - Prod: Blocks rendered via SSR
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { compilePage, type CompiledPage, type PageMeta } from "./mdx.js";

// ============================================================================
// Types
// ============================================================================

export interface PageRenderContext {
  /** Path to the pages directory */
  pagesDir: string;

  /** Block server port for RSC rendering (dev mode) */
  blockServerPort?: number;

  /** Block render function for SSR (prod mode) */
  renderBlock?: (blockId: string, props: Record<string, unknown>) => Promise<string>;

  /** Whether to use RSC streaming (dev) or SSR (prod) */
  useRsc?: boolean;
}

export interface PageRenderResult {
  /** Rendered HTML */
  html: string;

  /** Page metadata from frontmatter */
  meta: PageMeta;

  /** Embedded block IDs that were rendered */
  blockIds: string[];

  /** Any errors during rendering */
  error?: string;
}

export interface RenderPageOptions {
  /** Page file path (relative to pagesDir) */
  pagePath: string;

  /** Render context */
  context: PageRenderContext;

  /** Custom wrapper for the page HTML */
  wrapper?: (content: string, meta: PageMeta) => string;
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Render a page to HTML
 *
 * @param options - Render options
 */
export async function renderPage(options: RenderPageOptions): Promise<PageRenderResult> {
  const { pagePath, context, wrapper } = options;
  const { pagesDir } = context;

  try {
    // Read page source
    const filePath = join(pagesDir, pagePath);
    const source = await readFile(filePath, "utf-8");

    // Compile page
    const compiled = compilePage(source);

    if (compiled.errors.length > 0) {
      return {
        html: renderErrorPage(compiled.errors.join("\n")),
        meta: compiled.meta,
        blockIds: [],
        error: compiled.errors.join("\n"),
      };
    }

    // Render markdown to HTML
    let html = renderMarkdown(compiled.content);

    // Render embedded blocks
    const blockIds: string[] = [];
    for (const blockRef of compiled.blocks) {
      blockIds.push(blockRef.id);

      let blockHtml: string;
      try {
        blockHtml = await renderBlockInPage(blockRef.id, blockRef.props, context);
      } catch (err) {
        blockHtml = renderBlockError(blockRef.id, err instanceof Error ? err.message : String(err));
      }

      // Replace Block element with rendered HTML
      // Match the full <Block ... /> or <Block ...>...</Block> element
      const blockPattern = new RegExp(
        `<Block[^>]*src=["']${escapeRegex(blockRef.id)}["'][^>]*/?>`,
        "g"
      );
      html = html.replace(blockPattern, blockHtml);
    }

    // Apply wrapper or default
    const fullHtml = wrapper
      ? wrapper(html, compiled.meta)
      : wrapPageHtml(html, compiled.meta);

    return {
      html: fullHtml,
      meta: compiled.meta,
      blockIds,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      html: renderErrorPage(error),
      meta: { title: "Error" },
      blockIds: [],
      error,
    };
  }
}

/**
 * Render a compiled page (when source is already parsed)
 */
export async function renderCompiledPage(
  compiled: CompiledPage,
  context: PageRenderContext,
  wrapper?: (content: string, meta: PageMeta) => string,
): Promise<PageRenderResult> {
  if (compiled.errors.length > 0) {
    return {
      html: renderErrorPage(compiled.errors.join("\n")),
      meta: compiled.meta,
      blockIds: [],
      error: compiled.errors.join("\n"),
    };
  }

  // Render markdown to HTML
  let html = renderMarkdown(compiled.content);

  // Render embedded blocks
  const blockIds: string[] = [];
  for (const blockRef of compiled.blocks) {
    blockIds.push(blockRef.id);

    let blockHtml: string;
    try {
      blockHtml = await renderBlockInPage(blockRef.id, blockRef.props, context);
    } catch (err) {
      blockHtml = renderBlockError(blockRef.id, err instanceof Error ? err.message : String(err));
    }

    // Replace Block element with rendered HTML
    const blockPattern = new RegExp(
      `<Block[^>]*src=["']${escapeRegex(blockRef.id)}["'][^>]*/?>`,
      "g"
    );
    html = html.replace(blockPattern, blockHtml);
  }

  // Apply wrapper or default
  const fullHtml = wrapper
    ? wrapper(html, compiled.meta)
    : wrapPageHtml(html, compiled.meta);

  return {
    html: fullHtml,
    meta: compiled.meta,
    blockIds,
  };
}

// ============================================================================
// Block Rendering
// ============================================================================

/**
 * Render a block within a page context
 */
async function renderBlockInPage(
  blockId: string,
  props: Record<string, unknown>,
  context: PageRenderContext,
): Promise<string> {
  // If custom render function provided (prod mode), use it
  if (context.renderBlock) {
    return context.renderBlock(blockId, props);
  }

  // If RSC mode and block server available, fetch via Flight
  if (context.useRsc && context.blockServerPort) {
    return fetchBlockViaRsc(blockId, props, context.blockServerPort);
  }

  // Fallback: render placeholder
  return renderBlockPlaceholder(blockId);
}

/**
 * Fetch block HTML via RSC Flight protocol
 */
async function fetchBlockViaRsc(
  blockId: string,
  props: Record<string, unknown>,
  port: number,
): Promise<string> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) {
      searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
    }
  }

  const url = `http://localhost:${port}/_editor/blocks/${blockId}?${searchParams}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Block fetch failed: ${response.statusText}`);
    }

    // For RSC, we get Flight format - need to extract HTML
    // For now, if it's HTML content type, return directly
    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("text/html")) {
      return response.text();
    }

    // If Flight format, we need to parse it (simplified for now)
    // In full implementation, would use createFromReadableStream
    if (contentType.includes("text/x-component")) {
      // For server-side page rendering, we can't easily consume Flight
      // Return a client-side placeholder that will hydrate
      return renderBlockClientPlaceholder(blockId, props);
    }

    return response.text();
  } catch (err) {
    throw new Error(`Failed to fetch block ${blockId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Render a placeholder for client-side hydration
 */
function renderBlockClientPlaceholder(blockId: string, props: Record<string, unknown>): string {
  const propsJson = escapeHtml(JSON.stringify(props));
  return `<div data-block-id="${escapeHtml(blockId)}" data-block-props="${propsJson}" class="block-placeholder">
    <div class="animate-pulse bg-gray-100 rounded p-4 min-h-[100px]"></div>
  </div>`;
}

/**
 * Render a static placeholder
 */
function renderBlockPlaceholder(blockId: string): string {
  return `<div class="block-placeholder border border-dashed border-gray-300 rounded p-4 text-center text-gray-500">
    Block: ${escapeHtml(blockId)}
  </div>`;
}

/**
 * Render a block error
 */
function renderBlockError(blockId: string, error: string): string {
  return `<div class="block-error bg-red-50 border border-red-200 rounded p-3 text-red-600 text-sm">
    <strong>Block Error (${escapeHtml(blockId)}):</strong> ${escapeHtml(error)}
  </div>`;
}

// ============================================================================
// Markdown Rendering
// ============================================================================

/**
 * Convert markdown to HTML
 *
 * Simple markdown rendering. For production, consider using remark-html.
 */
function renderMarkdown(content: string): string {
  let html = content;

  // Preserve Block elements (don't wrap in paragraphs)
  const blockPlaceholders: string[] = [];
  html = html.replace(/<Block[^>]*\/?>(?:<\/Block>)?/g, (match) => {
    const idx = blockPlaceholders.length;
    blockPlaceholders.push(match);
    return `__BLOCK_PLACEHOLDER_${idx}__`;
  });

  // Headers
  html = html.replace(/^###### (.*$)/gm, "<h6>$1</h6>");
  html = html.replace(/^##### (.*$)/gm, "<h5>$1</h5>");
  html = html.replace(/^#### (.*$)/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.*$)/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Horizontal rules
  html = html.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, "<hr>");

  // Lists
  html = html.replace(/^- (.*$)/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  html = html.replace(/^\d+\. (.*$)/gm, "<li>$1</li>");
  // Note: This is simplified - proper implementation would distinguish ordered lists

  // Blockquotes
  html = html.replace(/^> (.*$)/gm, "<blockquote>$1</blockquote>");

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });

  // Line breaks -> paragraphs
  html = html
    .split(/\n\n+/)
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return "";

      // Don't wrap if it's already a block element or placeholder
      if (trimmed.match(/^<(h[1-6]|ul|ol|li|div|blockquote|pre|hr|table|__BLOCK)/)) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  // Restore block placeholders
  for (let i = 0; i < blockPlaceholders.length; i++) {
    html = html.replace(`__BLOCK_PLACEHOLDER_${i}__`, blockPlaceholders[i]);
  }

  return html;
}

// ============================================================================
// HTML Wrappers
// ============================================================================

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
    .prose pre { background: #1f2937; color: #f9fafb; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin: 1rem 0; }
    .prose pre code { background: transparent; padding: 0; }
    .prose ul, .prose ol { margin-bottom: 1rem; padding-left: 1.5rem; }
    .prose li { margin-bottom: 0.25rem; }
    .prose blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; font-style: italic; color: #6b7280; margin: 1rem 0; }
    .prose hr { border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0; }
  </style>
</head>
<body>
  <main class="prose">
    ${content}
  </main>
</body>
</html>`;
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
      <pre class="text-red-600 text-sm whitespace-pre-wrap">${escapeHtml(error)}</pre>
    </div>
  </main>
</body>
</html>`;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
