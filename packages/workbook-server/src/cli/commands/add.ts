/**
 * hands add source <name> - Add a source from the registry
 *
 * Copies source files from the registry and updates package.json hands config.
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getStdlibSourcePath, loadConfig, saveConfig } from "../../config/index.js";
import { loadRegistry } from "./sources.js";

interface AddOptions {
  schedule?: string;
}

export async function addCommand(name: string, options: AddOptions) {
  const workbookDir = process.cwd();

  // Verify this is a workbook directory
  const pkgJsonPath = join(workbookDir, "package.json");
  if (!existsSync(pkgJsonPath)) {
    console.error("Error: package.json not found");
    console.error("Run this command from a workbook directory");
    process.exit(1);
  }

  // Load the source registry
  const registry = await loadRegistry();
  const registryItem = registry.items.find((i) => i.name === name);

  if (!registryItem) {
    console.error(`Error: Source "${name}" not found`);
    console.error();
    console.error("Available sources:");
    for (const item of registry.items) {
      console.error(`  ${item.name.padEnd(15)} ${item.title}`);
    }
    process.exit(1);
  }

  console.log(`Adding source: ${registryItem.title}`);

  // Get the stdlib path (where source files live)
  const stdlibPath = getStdlibSourcePath();
  const filesCreated: string[] = [];
  const errors: string[] = [];

  // Copy each file from registry
  for (const file of registryItem.files) {
    const sourcePath = join(stdlibPath, "src/registry/sources", file.path);
    const targetPath = join(workbookDir, file.target);

    try {
      // Check if source file exists
      if (!existsSync(sourcePath)) {
        errors.push(`Source file not found: ${sourcePath}`);
        continue;
      }

      // Create target directory
      await mkdir(dirname(targetPath), { recursive: true });

      // Check if target already exists
      if (existsSync(targetPath)) {
        console.log(`  Skipping (exists): ${file.target}`);
        continue;
      }

      // Copy file
      await copyFile(sourcePath, targetPath);
      filesCreated.push(file.target);
      console.log(`  Created: ${file.target}`);
    } catch (error) {
      errors.push(`Failed to copy ${file.path}: ${error}`);
    }
  }

  // Update package.json hands config
  try {
    const config = await loadConfig(workbookDir);

    // Add source if not already present
    if (!config.sources[name]) {
      config.sources[name] = {
        enabled: true,
        autoSync: true,
        syncOnStart: false,
        schedule: options.schedule ?? registryItem.schedule,
        options: {},
      };

      // Add required secrets
      for (const secret of registryItem.secrets) {
        if (!config.secrets[secret]) {
          config.secrets[secret] = {
            required: true,
            description: `Required by ${name} source`,
          };
        }
      }

      await saveConfig(workbookDir, config);
      console.log("  Updated: package.json (hands config)");
    }
  } catch (error) {
    errors.push(`Failed to update package.json: ${error}`);
  }

  // Add dependencies to package.json
  if (registryItem.dependencies.length > 0) {
    try {
      const pkgJsonPath = join(workbookDir, "package.json");
      if (existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(await Bun.file(pkgJsonPath).text());
        pkgJson.dependencies = pkgJson.dependencies || {};

        let depsAdded = false;
        for (const dep of registryItem.dependencies) {
          // Parse dependency string (e.g., "stripe@^17.0.0" or just "stripe")
          const [pkgName, version] =
            dep.includes("@") && !dep.startsWith("@") ? dep.split("@") : [dep, "latest"];

          if (!pkgJson.dependencies[pkgName]) {
            pkgJson.dependencies[pkgName] = version;
            depsAdded = true;
            console.log(`  Added dependency: ${pkgName}@${version}`);
          }
        }

        if (depsAdded) {
          await Bun.write(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
          console.log("  Updated: package.json");
        }
      }
    } catch (error) {
      errors.push(`Failed to update package.json: ${error}`);
    }
  }

  // Print errors if any
  if (errors.length > 0) {
    console.error();
    console.error("Errors:");
    for (const error of errors) {
      console.error(`  ${error}`);
    }
    process.exit(1);
  }

  // Print next steps
  console.log();
  console.log("Next steps:");

  if (registryItem.dependencies.length > 0) {
    console.log("  Install dependencies:");
    console.log("    bun install");
    console.log();
  }

  if (registryItem.secrets.length > 0) {
    console.log("  Set required secrets in .env.local:");
    for (const secret of registryItem.secrets) {
      console.log(`    ${secret}=<your-value>`);
    }
    console.log();
  }

  console.log("  Start the runtime to sync data:");
  console.log("    hands dev");
}
