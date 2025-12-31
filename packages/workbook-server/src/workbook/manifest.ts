/**
 * Workbook Manifest Generation
 *
 * Generates manifest files for runtime consumption.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedWorkbookConfig, WorkbookManifest } from "./types.js";
import { discoverWorkbook, resolveConfig, type WorkbookConfig } from "./discovery.js";

/**
 * Generate all manifest files for a workbook
 */
export async function generateManifests(config: WorkbookConfig): Promise<WorkbookManifest> {
  const resolved = resolveConfig(config);
  const manifest = await discoverWorkbook(config);

  // Ensure output directory exists
  if (!existsSync(resolved.outDir)) {
    mkdirSync(resolved.outDir, { recursive: true });
  }

  // Generate pages manifest (TypeScript module for runtime)
  generatePagesManifest(resolved, manifest);

  // Generate blocks manifest (JSON for tooling)
  generateBlocksManifest(resolved, manifest);

  // Generate full manifest (JSON for debugging)
  writeFileSync(
    join(resolved.outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );

  return manifest;
}

/**
 * Generate pages manifest stub (pages are now dynamic via page registry)
 */
function generatePagesManifest(_config: ResolvedWorkbookConfig, _manifest: WorkbookManifest): void {
  // Pages are now handled by the page registry, not pre-generated
  // This function is kept for backwards compatibility but does nothing
}

/**
 * Generate blocks.json for editor/tooling
 */
function generateBlocksManifest(config: ResolvedWorkbookConfig, manifest: WorkbookManifest): void {
  const blocksData = manifest.blocks.map((block) => ({
    id: block.id,
    path: block.path,
    parentDir: block.parentDir,
    title: block.meta.title || block.id,
    description: block.meta.description,
    refreshable: block.meta.refreshable,
    uninitialized: block.uninitialized,
  }));

  writeFileSync(
    join(config.outDir, "blocks.json"),
    JSON.stringify(blocksData, null, 2),
    "utf-8"
  );
}


/**
 * Watch workbook for changes and regenerate manifests
 * Note: Requires chokidar to be installed
 */
export async function watchWorkbook(
  config: WorkbookConfig,
  onChange: (manifest: WorkbookManifest) => void
): Promise<() => void> {
  const resolved = resolveConfig(config);

  // Dynamic import chokidar - caller must ensure it's installed
  let chokidar: any;
  try {
    // @ts-expect-error - chokidar is an optional peer dependency
    chokidar = await import("chokidar");
  } catch {
    throw new Error("chokidar is required for watchWorkbook. Install with: bun add chokidar");
  }

  const watcher = chokidar.watch(
    [resolved.pagesDir, resolved.uiDir, resolved.pluginsDir, resolved.actionsDir].filter(existsSync),
    {
      ignoreInitial: true,
      ignored: /(^|[\/\\])\../, // ignore dotfiles
    }
  );

  let debounceTimer: NodeJS.Timeout | null = null;

  const regenerate = async () => {
    try {
      const manifest = await generateManifests(config);
      onChange(manifest);
    } catch (err) {
      console.error("Failed to regenerate manifests:", err);
    }
  };

  watcher.on("all", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(regenerate, 100);
  });

  // Initial generation
  regenerate();

  return () => {
    watcher.close();
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}
