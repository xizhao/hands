/**
 * hands sources - List available sources from the registry
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { getStdlibSourcePath } from "../../config/index.js";

interface RegistryItem {
  name: string;
  type: "source";
  title: string;
  description: string;
  files: Array<{ path: string; target: string }>;
  dependencies: string[];
  secrets: string[];
  streams: string[];
  tables?: string[];
  schedule?: string;
  icon?: string;
}

interface Registry {
  $schema?: string;
  name: string;
  version: string;
  items: RegistryItem[];
}

export async function sourcesCommand() {
  const registry = await loadRegistry();

  console.log("Available sources:");
  console.log();

  if (registry.items.length === 0) {
    console.log("No sources available in registry.");
    return;
  }

  for (const item of registry.items) {
    console.log(`${item.name}`);
    console.log(`  ${item.title} - ${item.description}`);

    if (item.secrets.length > 0) {
      console.log(`  Secrets: ${item.secrets.join(", ")}`);
    }

    if (item.dependencies.length > 0) {
      console.log(`  Dependencies: ${item.dependencies.join(", ")}`);
    }

    console.log(`  Streams: ${item.streams.join(", ")}`);

    if (item.schedule) {
      console.log(`  Schedule: ${item.schedule}`);
    }

    console.log();
  }
}

/**
 * Load the source registry from @hands/stdlib
 */
export async function loadRegistry(): Promise<Registry> {
  const stdlibPath = getStdlibSourcePath();
  const registryPath = join(stdlibPath, "src/registry/sources/registry.json");

  try {
    const file = Bun.file(registryPath);
    return await file.json();
  } catch (error) {
    console.error(`Failed to load registry: ${error}`);
    process.exit(1);
  }
}
