/**
 * Worker template generator for RedwoodSDK projects
 *
 * Reads worker.template.tsx (actual TypeScript file) and replaces placeholders
 * with config values. This approach gives us:
 * - Real TypeScript type checking in the template
 * - Easier maintenance (no string escaping issues)
 * - IDE support when editing the template
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HandsConfig } from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface WorkerTemplateConfig {
  config: HandsConfig;
  blocks: Array<{ id: string; path: string; parentDir: string }>;
  workbookDir: string;
}

/**
 * Generate the complete worker.tsx content by reading the template file
 * and replacing placeholders with actual values.
 */
export function generateWorkerTemplate(opts: WorkerTemplateConfig): string {
  const { config, blocks, workbookDir } = opts;
  // Strip leading "./" from blocksDir since the template already handles the relative path
  // e.g., "./blocks" -> "blocks" so `../../${blocksDir}` becomes `../../blocks`
  const blocksDir = (config.blocks?.dir || "./blocks").replace(/^\.\//, "");

  // Read the template file
  const templatePath = join(__dirname, "worker.template.tsx");
  let template = readFileSync(templatePath, "utf-8");

  // Generate the list of known block IDs as a JSON array string
  const blockIdsJson = JSON.stringify(blocks.map((b) => b.id));

  // Replace placeholders in the config object
  // The template has: "__WORKBOOK_NAME__", "__WORKBOOK_DIR__", "__BLOCKS_DIR__", "__BLOCK_IDS__"
  template = template.replace(/"__WORKBOOK_NAME__"/g, JSON.stringify(config.name || "workbook"));
  template = template.replace(/"__WORKBOOK_DIR__"/g, JSON.stringify(workbookDir));
  template = template.replace(/"__BLOCKS_DIR__"/g, JSON.stringify(blocksDir));
  // Block IDs need special handling - the template has: "__BLOCK_IDS__" as unknown as string[]
  // We replace the entire expression with the actual array
  template = template.replace(/"__BLOCK_IDS__" as unknown as string\[\]/g, blockIdsJson);

  return template;
}
