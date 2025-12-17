/**
 * Vite plugin for blocks with pre-validation
 *
 * Pre-validates blocks with esbuild before Vite processes them.
 * Only valid blocks are registered; invalid blocks are tracked for error display.
 *
 * Features:
 * - Pre-validates each block file with esbuild transform
 * - Generates a virtual module with only valid block imports
 * - Tracks build errors for invalid blocks
 * - Exposes /__blocks_errors endpoint for UI to fetch errors
 * - Watches for changes and re-validates
 */

import fs from "fs";
import path from "path";
import { transformWithEsbuild, type Plugin, type ViteDevServer } from "vite";

interface BlocksPluginOptions {
  workbookPath: string;
}

interface BlockError {
  id: string;
  path: string;
  error: string;
}

interface ValidBlock {
  id: string;
  path: string;
}

// Module-level state (shared across plugin instances)
let validBlocks: ValidBlock[] = [];
let blockErrors: BlockError[] = [];

const VIRTUAL_MODULE_ID = "virtual:blocks-registry";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

/**
 * Validate a single block file with Vite's esbuild transform
 */
async function validateBlock(filePath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const code = fs.readFileSync(filePath, "utf-8");
    await transformWithEsbuild(code, filePath, {
      loader: "tsx",
      format: "esm",
      target: "esnext",
      jsx: "preserve",
    });
    return { valid: true };
  } catch (err) {
    if (err instanceof Error) {
      // Extract clean error message from esbuild
      const lines = err.message.split("\n");
      const errorLine = lines.find((line) => line.includes("ERROR:"));
      if (errorLine) {
        const match = errorLine.match(/ERROR:\s*(.+)/);
        return { valid: false, error: match ? match[1] : errorLine };
      }
      return { valid: false, error: err.message };
    }
    return { valid: false, error: String(err) };
  }
}

/**
 * Scan and validate all blocks in directory
 */
async function scanAndValidateBlocks(blocksDir: string): Promise<void> {
  validBlocks = [];
  blockErrors = [];

  if (!fs.existsSync(blocksDir)) {
    console.log("[blocks] Blocks directory does not exist:", blocksDir);
    return;
  }

  const files = findBlockFiles(blocksDir, "");

  for (const relativePath of files) {
    const filePath = path.join(blocksDir, relativePath);
    const id = relativePath.replace(/\.tsx$/, "");

    const result = await validateBlock(filePath);

    if (result.valid) {
      validBlocks.push({ id, path: relativePath });
    } else {
      console.warn(`[blocks] Build error in ${relativePath}: ${result.error}`);
      blockErrors.push({ id, path: relativePath, error: result.error || "Unknown error" });
    }
  }

  console.log(`[blocks] Validated: ${validBlocks.length} valid, ${blockErrors.length} with errors`);
}

/**
 * Recursively find all block files
 */
function findBlockFiles(baseDir: string, subDir: string): string[] {
  const files: string[] = [];
  const currentDir = subDir ? path.join(baseDir, subDir) : baseDir;

  let entries;
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const relativePath = subDir ? `${subDir}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      files.push(...findBlockFiles(baseDir, relativePath));
      continue;
    }

    if (!entry.name.endsWith(".tsx")) continue;
    if (entry.name.endsWith(".types.tsx")) continue;

    files.push(relativePath);
  }

  return files.sort();
}

/**
 * Generate virtual module code with only valid blocks
 */
function generateVirtualModule(blocksDir: string): string {
  if (validBlocks.length === 0) {
    return `
// No valid blocks found
export const blockRegistry = new Map();
export const blockErrors = ${JSON.stringify(blockErrors)};
`;
  }

  const imports = validBlocks.map(
    (block, i) => `const load_${i} = () => import("${path.join(blocksDir, block.path)}");`
  );

  const entries = validBlocks.map(
    (block, i) => `  ["${block.id}", load_${i}]`
  );

  return `
// Auto-generated block registry (only valid blocks)
${imports.join("\n")}

export const blockRegistry = new Map([
${entries.join(",\n")}
]);

export const blockErrors = ${JSON.stringify(blockErrors)};
`;
}

export function blocksPlugin(options: BlocksPluginOptions): Plugin {
  const { workbookPath } = options;
  const blocksDir = path.join(workbookPath, "blocks");

  return {
    name: "hands-blocks",
    enforce: "pre",

    async buildStart() {
      // Validate all blocks at startup
      await scanAndValidateBlocks(blocksDir);
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return generateVirtualModule(blocksDir);
      }
    },

    configureServer(server: ViteDevServer) {
      // Expose block errors endpoint
      server.middlewares.use("/__blocks_errors", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ errors: blockErrors, valid: validBlocks }));
      });

      // Watch blocks directory
      server.watcher.add(path.join(blocksDir, "**/*.tsx"));

      const revalidateAndReload = async (changedPath: string) => {
        const relativePath = path.relative(blocksDir, changedPath);
        console.log(`[blocks] Re-validating after change: ${relativePath}`);

        await scanAndValidateBlocks(blocksDir);

        // Invalidate the virtual module
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
        }

        // Also invalidate in worker environment if present
        const workerEnv = (server as any).environments?.worker;
        if (workerEnv?.moduleGraph) {
          for (const [id, workerMod] of workerEnv.moduleGraph.idToModuleMap) {
            if (id.includes("blocks/render") || id.includes(VIRTUAL_MODULE_ID)) {
              workerEnv.moduleGraph.invalidateModule(workerMod);
            }
          }
        }

        server.ws.send({ type: "full-reload" });
      };

      // Handle file changes
      server.watcher.on("add", async (addedPath) => {
        if (!isBlockFile(addedPath, blocksDir)) return;
        await revalidateAndReload(addedPath);
      });

      server.watcher.on("unlink", async (removedPath) => {
        if (!isBlockFile(removedPath, blocksDir)) return;
        await revalidateAndReload(removedPath);
      });

      server.watcher.on("change", async (changedPath) => {
        if (!isBlockFile(changedPath, blocksDir)) return;
        await revalidateAndReload(changedPath);
      });

      console.log(`[blocks] Plugin ready, watching ${blocksDir}`);
    },
  };
}

function isBlockFile(filePath: string, blocksDir: string): boolean {
  if (!filePath.startsWith(blocksDir)) return false;
  if (!filePath.endsWith(".tsx") && !filePath.endsWith(".ts")) return false;
  if (filePath.endsWith(".types.ts")) return false;
  return true;
}

// Export for use by render.ts
export { validBlocks, blockErrors };
