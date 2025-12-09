/**
 * Block Serving
 *
 * Renders blocks and returns HTML.
 */

import * as React from "react"
import { renderToString } from "react-dom/server"
import type { BlockFn, BlockContext, BlockRenderResult } from "@hands/stdlib"
import { BlockRegistry } from "./registry.js"

export interface BlockServeOptions {
  /** Block registry */
  registry: BlockRegistry

  /** Block context */
  context: BlockContext

  /** Block ID */
  blockId: string

  /** Props to pass to the block */
  props?: Record<string, unknown>
}

export interface BlockServeResult extends BlockRenderResult {
  /** Time to render in milliseconds */
  renderTime: number
}

/**
 * Render a block to HTML
 *
 * @param options - Serve options
 */
export async function serveBlock(options: BlockServeOptions): Promise<BlockServeResult> {
  const { registry, context, blockId, props = {} } = options
  const startTime = performance.now()

  try {
    // Get block from registry
    const block = registry.get(blockId)

    if (!block) {
      return {
        html: renderError(`Block not found: ${blockId}`),
        blockId,
        error: `Block not found: ${blockId}`,
        renderTime: performance.now() - startTime,
      }
    }

    // Load the block module
    const { default: BlockFn } = await block.load()

    if (typeof BlockFn !== "function") {
      return {
        html: renderError(`Block ${blockId} does not export a function`),
        blockId,
        error: `Block ${blockId} does not export a function`,
        renderTime: performance.now() - startTime,
      }
    }

    // Render the block
    const element = await BlockFn(props, context)
    const html = renderToString(element)

    return {
      html,
      blockId,
      renderTime: performance.now() - startTime,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return {
      html: renderError(error),
      blockId,
      error,
      renderTime: performance.now() - startTime,
    }
  }
}

/**
 * Render an error message as HTML
 */
function renderError(message: string): string {
  return `<div class="p-4 border border-red-200 bg-red-50 text-red-700 rounded-lg">
  <strong>Block Error:</strong> ${escapeHtml(message)}
</div>`
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
 * Wrap block HTML with a container
 */
export function wrapBlockHtml(html: string, blockId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body class="bg-transparent" data-block-id="${blockId}">
  ${html}
</body>
</html>`
}
