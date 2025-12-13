/**
 * Block Serving
 *
 * Renders blocks and returns HTML.
 */

import type { BlockContext, BlockRenderResult } from "@hands/stdlib";
import { renderToString } from "react-dom/server";
import type { BlockRegistry } from "./registry.js";

export interface BlockServeOptions {
  /** Block registry */
  registry: BlockRegistry;

  /** Block context */
  context: BlockContext;

  /** Block ID */
  blockId: string;

  /** Props to pass to the block */
  props?: Record<string, unknown>;
}

export interface BlockServeResult extends BlockRenderResult {
  /** Time to render in milliseconds */
  renderTime: number;
}

/**
 * Render a block to HTML
 *
 * @param options - Serve options
 */
export async function serveBlock(options: BlockServeOptions): Promise<BlockServeResult> {
  const { registry, context, blockId, props = {} } = options;
  const startTime = performance.now();

  try {
    // Get block from registry
    const block = registry.get(blockId);

    if (!block) {
      return {
        html: renderError(`Block not found: ${blockId}`),
        blockId,
        error: `Block not found: ${blockId}`,
        renderTime: performance.now() - startTime,
      };
    }

    // Load the block module
    const { default: BlockFn } = await block.load();

    if (typeof BlockFn !== "function") {
      return {
        html: renderError(`Block ${blockId} does not export a function`),
        blockId,
        error: `Block ${blockId} does not export a function`,
        renderTime: performance.now() - startTime,
      };
    }

    // Render the block (ctx is passed inside props now)
    const element = await BlockFn({ ...props, ctx: context });
    const html = renderToString(element);

    return {
      html,
      blockId,
      renderTime: performance.now() - startTime,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      html: renderError(error),
      blockId,
      error,
      renderTime: performance.now() - startTime,
    };
  }
}

/**
 * Render an error message as HTML (inline, no container styling)
 */
function renderError(message: string): string {
  return `<span style="color:#dc2626">${escapeHtml(message)}</span>`;
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
    .replace(/'/g, "&#039;");
}
