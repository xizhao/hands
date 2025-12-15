/**
 * hands new <name> - Create a new workbook
 *
 * Uses the shared initWorkbook() from config to create
 * the standard workbook structure.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { initWorkbook, slugify } from "../../config/index.js";

interface NewOptions {
  template?: string;
}

export async function newCommand(name: string, _options: NewOptions) {
  const slug = slugify(name);
  const targetDir = join(process.cwd(), slug);

  // Check if directory already exists
  if (existsSync(targetDir)) {
    console.error(`Error: Directory already exists: ${slug}`);
    process.exit(1);
  }

  console.log(`Creating workbook: ${name}`);

  // Create directory
  await mkdir(targetDir, { recursive: true });

  // Use shared initialization function
  await initWorkbook({ name, directory: targetDir });

  console.log("  Created: package.json (with hands config)");
  console.log("  Created: tsconfig.json");
  console.log("  Created: .gitignore");
  console.log("  Created: pages/index.md");
  console.log("  Created: blocks/welcome.tsx");
  console.log("  Created: blocks/ui/");
  console.log("  Created: lib/db.ts");

  console.log();
  console.log("Done! Next steps:");
  console.log(`  cd ${slug}`);
  console.log("  bun install");
  console.log("  hands dev");
  console.log();
  console.log("Optional:");
  console.log("  hands add source hackernews  # Add a data source");
  console.log("  hands build                  # Build for production");
}
