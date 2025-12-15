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
const blockModules = import.meta.glob<{ default: React.FC<any> }>(
  "@/blocks/*.tsx",
  { eager: false }
);

// Create registry from glob results
const blockRegistry = createRegistry(blockModules, /\/([^/]+)\.tsx$/);

/**
 * Load a block by ID
 */
export async function loadBlock(blockId: string): Promise<React.FC<any>> {
  const loader = blockRegistry.get(blockId);
  if (!loader) {
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
