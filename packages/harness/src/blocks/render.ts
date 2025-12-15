import React from "react";
import { renderToReadableStream } from "react-server-dom-webpack/server";

// Preload all blocks using import.meta.glob
// Vite will handle "use client" transforms and create a registry
// Using alias from vite.config.mts
const blockModules = import.meta.glob<{ default: React.FC<any> }>(
  "@/blocks/*.tsx",
  { eager: false }
);

// Create a map of blockId -> loader function for easier access
const blockRegistry = new Map<
  string,
  () => Promise<{ default: React.FC<any> }>
>();

// Initialize registry from glob results
for (const [path, loader] of Object.entries(blockModules)) {
  // Extract blockId from path (e.g., "../blocks/MyBlock.tsx" -> "MyBlock")
  const match = path.match(/\/([^/]+)\.tsx$/);
  if (match && loader) {
    const blockId = match[1];
    blockRegistry.set(
      blockId,
      loader as () => Promise<{ default: React.FC<any> }>
    );
  }
}

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 100;

/**
 * Check if error is a Vite pre-bundle invalidation (retryable)
 */
function isPreBundleError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes("new version of the pre-bundle");
  }
  return false;
}

/**
 * Sleep for given ms
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load a block by ID using import.meta.glob registry
 * Uses Vite's module resolution which handles "use client" transforms
 * Retries on Vite pre-bundle invalidation errors
 */
async function loadBlock(
  blockId: string,
  retries = MAX_RETRIES
): Promise<React.FC<any>> {
  const loader = blockRegistry.get(blockId);
  if (!loader) {
    throw new Error(`Block "${blockId}" not found in registry`);
  }

  try {
    // Load the module - Vite resolves this and applies RSC transforms
    const mod = await loader();
    const Block = mod.default;
    if (!Block) {
      throw new Error(`Block "${blockId}" has no default export`);
    }
    return Block;
  } catch (err) {
    // Retry on Vite pre-bundle invalidation
    if (isPreBundleError(err) && retries > 0) {
      console.log(
        `[worker] Pre-bundle invalidated, retrying... (${retries} left)`
      );
      await sleep(RETRY_DELAY_MS);
      return loadBlock(blockId, retries - 1);
    }
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[worker] Failed to load block "${blockId}":`, error);
    throw error;
  }
}

export async function handleBlockGet({ request, ctx, params }: any) {
  // params.$0 contains the wildcard match for /blocks/*
  const blockId = params.$0;

  // Dynamically load the block - Vite handles "use client" transforms
  let Block: React.FC<any>;
  try {
    Block = await loadBlock(blockId);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[worker] Block "${blockId}" load error:`, err);
    return Response.json({ error, stack }, { status: 500 });
  }

  const url = new URL(request.url);
  const props = Object.fromEntries(url.searchParams);

  // Remove internal params from props passed to component
  delete props.edit;
  delete props._ts;

  try {
    const stream = () =>
      renderToReadableStream(
        React.createElement(Block, props),
        new Proxy(
          {},
          {
            get(_, key) {
              return { id: key, name: key, chunks: [] };
            },
          }
        )
      );

    return new Response(stream(), {
      headers: {
        "Content-Type": "text/x-component",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[worker] Block "${blockId}" render error:`, err);
    return Response.json({ error, stack }, { status: 500 });
  }
}
