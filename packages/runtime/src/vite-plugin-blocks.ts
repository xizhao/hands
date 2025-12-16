/**
 * Vite plugin for blocks hot-reload
 *
 * Problem: import.meta.glob creates a static map at module initialization.
 * When new block files are added, Vite's HMR for the client environment updates,
 * but the worker environment's blockRegistry doesn't get invalidated.
 *
 * Solution: Watch blocks/ directory and invalidate worker modules
 * when files are added or removed.
 */

import fs from "fs";
import path from "path";
import type { Plugin, ViteDevServer } from "vite";

interface BlocksPluginOptions {
  workbookPath: string;
}

export function blocksPlugin(options: BlocksPluginOptions): Plugin {
  const { workbookPath } = options;
  const blocksDir = path.join(workbookPath, "blocks");

  // Track known block files to detect add/remove
  let knownBlocks = new Set<string>();

  // Initialize known blocks synchronously at plugin creation
  try {
    if (fs.existsSync(blocksDir)) {
      const files = fs.readdirSync(blocksDir);
      for (const file of files) {
        if (file.endsWith(".tsx") || file.endsWith(".ts")) {
          knownBlocks.add(file);
        }
      }
    }
  } catch {
    // Ignore errors during initialization
  }

  return {
    name: "hands-blocks",
    enforce: "pre",

    configureServer(server: ViteDevServer) {
      // Watch blocks directory
      server.watcher.add(path.join(blocksDir, "**/*.tsx"));
      server.watcher.add(path.join(blocksDir, "**/*.ts"));

      const invalidateBlockRegistry = async () => {
        // Find the render.ts module in the worker environment
        const workerEnv = (server as any).environments?.worker;
        if (!workerEnv) {
          // Fallback: use main module graph
          const moduleGraph = server.moduleGraph;
          for (const mod of moduleGraph.getModulesByFile(
            path.resolve(__dirname, "blocks/render.ts")
          ) || []) {
            console.log(`[blocks] Invalidating render.ts`);
            moduleGraph.invalidateModule(mod);
          }
          return;
        }

        // Get the module graph for the worker environment
        const moduleGraph = workerEnv.moduleGraph;
        if (!moduleGraph) {
          console.log("[blocks] Worker module graph not found");
          return;
        }

        // Find and invalidate all modules that use blocks
        for (const [id, mod] of moduleGraph.idToModuleMap) {
          if (id.includes("blocks/render") || id.includes("worker.tsx")) {
            console.log(`[blocks] Invalidating ${path.basename(id)} in worker`);
            moduleGraph.invalidateModule(mod);
          }
        }
      };

      // Handle file additions
      server.watcher.on("add", async (addedPath) => {
        if (!isBlockFile(addedPath, blocksDir)) return;

        const relativePath = path.relative(blocksDir, addedPath);
        if (knownBlocks.has(relativePath)) return;

        console.log(`[blocks] New block detected: ${relativePath}`);
        knownBlocks.add(relativePath);
        await invalidateBlockRegistry();
      });

      // Handle file removals
      server.watcher.on("unlink", async (removedPath) => {
        if (!isBlockFile(removedPath, blocksDir)) return;

        const relativePath = path.relative(blocksDir, removedPath);
        if (!knownBlocks.has(relativePath)) return;

        console.log(`[blocks] Block removed: ${relativePath}`);
        knownBlocks.delete(relativePath);
        await invalidateBlockRegistry();
      });

      console.log(`[blocks] Watching for changes, tracking ${knownBlocks.size} blocks`);
    },
  };
}

function isBlockFile(filePath: string, blocksDir: string): boolean {
  if (!filePath.startsWith(blocksDir)) return false;
  if (!filePath.endsWith(".tsx") && !filePath.endsWith(".ts")) return false;
  if (filePath.endsWith(".types.ts")) return false; // Skip type files
  return true;
}
