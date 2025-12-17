import React from "react";
import {
  loadModuleWithRetry,
} from "../lib/module-loader";
import {
  renderToRscStream,
  createRscResponse,
  createErrorResponse,
  extractPropsFromUrl,
} from "../lib/rsc";

// Import pre-validated block registry from virtual module
// The Vite plugin pre-validates each block with esbuild before including it
// Blocks with syntax errors are excluded and tracked separately
import { blockRegistry, blockErrors } from "virtual:blocks-registry";

// Log registry size on load
console.log(`[blocks] Registry initialized with ${blockRegistry.size} valid blocks, ${blockErrors.length} with errors`);

/**
 * Check if a block has a build error
 */
export function getBlockBuildError(blockId: string): string | undefined {
  const error = blockErrors.find((e: { id: string }) => e.id === blockId);
  return error?.error;
}

/**
 * Load a block by ID
 */
export async function loadBlock(blockId: string): Promise<React.FC<any>> {
  // Check for build error first
  const buildError = getBlockBuildError(blockId);
  if (buildError) {
    throw new Error(`Build error: ${buildError}`);
  }

  const loader = blockRegistry.get(blockId);
  if (!loader) {
    console.error(`[blocks] Block "${blockId}" not found. Available: [${[...blockRegistry.keys()].join(", ")}]`);
    throw new Error(`Block "${blockId}" not found in registry`);
  }

  const mod = await loadModuleWithRetry(loader, `block "${blockId}"`);
  const Block = mod.default;
  if (!Block) {
    throw new Error(`Block "${blockId}" has no default export`);
  }
  return Block;
}

export async function handleBlockGet({ request, params }: any) {
  const blockId = params.$0;

  // Check for build error - return specific error response
  const buildError = getBlockBuildError(blockId);
  if (buildError) {
    return createErrorResponse(
      new Error(`Build error: ${buildError}`),
      `Block "${blockId}" build error`
    );
  }

  let Block: React.FC<any>;
  try {
    Block = await loadBlock(blockId);
  } catch (err) {
    return createErrorResponse(err, `Block "${blockId}" load error`);
  }

  const url = new URL(request.url);
  const props = extractPropsFromUrl(url);

  try {
    const stream = renderToRscStream(React.createElement(Block, props));
    return createRscResponse(stream);
  } catch (err) {
    return createErrorResponse(err, `Block "${blockId}" render error`);
  }
}
