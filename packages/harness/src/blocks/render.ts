import React from "react";
import { renderToReadableStream } from "react-server-dom-webpack/server";

interface DbContext {
  sql<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<TParams, TResult>(
    preparedQuery: {
      run(params: TParams, client: unknown): Promise<TResult[]>;
    },
    params: TParams
  ): Promise<TResult[]>;
}

interface RequestContext {
  db: DbContext;
  params: Record<string, unknown>;
  env: Record<string, unknown>;
}

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

/**
 * Load a block by ID using import.meta.glob registry
 * Uses Vite's module resolution which handles "use client" transforms
 * Throws on error so callers can return proper error responses
 */
async function loadBlock(blockId: string): Promise<React.FC<any>> {
  try {
    const loader = blockRegistry.get(blockId);
    if (!loader) {
      throw new Error(`Block "${blockId}" not found in registry`);
    }

    // Load the module - Vite resolves this and applies RSC transforms
    const mod = await loader();
    const Block = mod.default;
    if (!Block) {
      throw new Error(`Block "${blockId}" has no default export`);
    }
    return Block;
  } catch (err) {
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
