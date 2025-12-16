import React from "react";
import {
  createRegistry,
  loadModuleWithRetry,
} from "../lib/module-loader";
import {
  renderToRscStream,
  createRscResponse,
  createErrorResponse,
  extractPropsFromUrl,
} from "../lib/rsc";

// Preload all blocks using import.meta.glob
// Note: This is statically transformed by Vite at build time.
// When blocks are added/removed, the Vite plugin invalidates this module
// to trigger re-transform with updated glob results.
const blockModules = import.meta.glob<{ default: React.FC<any> }>(
  "@/blocks/*.tsx",
  { eager: false }
);

// Create registry from glob results
const blockRegistry = createRegistry(blockModules, /\/([^/]+)\.tsx$/);

// Log registry size on load
console.log(`[blocks] Registry initialized with ${blockRegistry.size} blocks`);

/**
 * Load a block by ID
 */
export async function loadBlock(blockId: string): Promise<React.FC<any>> {
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
