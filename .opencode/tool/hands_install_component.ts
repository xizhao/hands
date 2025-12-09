/**
 * Install a component from @hands/stdlib into the workbook
 *
 * This tool copies component files from the stdlib registry into the workbook's
 * lib/components directory, similar to how shadcn/ui works.
 */

import * as fs from "fs";
import * as path from "path";

// Read registry
const registryPath = path.join(__dirname, "../../packages/stdlib/src/registry.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));

export const description = "Install a component from @hands/stdlib into the workbook";

export const parameters = {
  type: "object",
  properties: {
    component: {
      type: "string",
      description: "The component name to install (e.g., 'button', 'line-chart', 'data-table')",
    },
    workbookDir: {
      type: "string",
      description: "The workbook directory path",
    },
  },
  required: ["component", "workbookDir"],
};

interface ComponentEntry {
  name: string;
  type: string;
  description: string;
  files: string[];
  dependencies: string[];
  registryDependencies: string[];
}

export async function run(args: { component: string; workbookDir: string }): Promise<string> {
  const { component, workbookDir } = args;

  // Check if component exists in registry
  const componentEntry = registry.components[component] as ComponentEntry | undefined;
  if (!componentEntry) {
    const available = Object.keys(registry.components).join(", ");
    return `Component "${component}" not found in registry. Available components: ${available}`;
  }

  const stdlibSrc = path.join(__dirname, "../../packages/stdlib/src");
  const targetDir = path.join(workbookDir, "lib/components", componentEntry.type);

  // Ensure target directory exists
  fs.mkdirSync(targetDir, { recursive: true });

  // Ensure lib/utils.ts exists
  const utilsTarget = path.join(workbookDir, "lib/utils.ts");
  if (!fs.existsSync(utilsTarget)) {
    const utilsSource = path.join(stdlibSrc, "lib/utils.ts");
    fs.mkdirSync(path.dirname(utilsTarget), { recursive: true });
    fs.copyFileSync(utilsSource, utilsTarget);
  }

  // Install registry dependencies first
  const installed: string[] = [];
  for (const dep of componentEntry.registryDependencies) {
    const depEntry = registry.components[dep] as ComponentEntry | undefined;
    if (depEntry) {
      for (const file of depEntry.files) {
        const source = path.join(stdlibSrc, file);
        const depTargetDir = path.join(workbookDir, "lib/components", depEntry.type);
        fs.mkdirSync(depTargetDir, { recursive: true });
        const target = path.join(depTargetDir, path.basename(file));

        if (!fs.existsSync(target)) {
          let content = fs.readFileSync(source, "utf-8");
          // Rewrite imports from @/ to relative
          content = content.replace(/@\/lib\/utils/g, "../../utils");
          fs.writeFileSync(target, content);
          installed.push(`${dep}: ${path.basename(file)}`);
        }
      }
    }
  }

  // Copy component files
  for (const file of componentEntry.files) {
    const source = path.join(stdlibSrc, file);
    const target = path.join(targetDir, path.basename(file));

    let content = fs.readFileSync(source, "utf-8");
    // Rewrite imports from @/ to relative
    content = content.replace(/@\/lib\/utils/g, "../../utils");
    fs.writeFileSync(target, content);
    installed.push(`${component}: ${path.basename(file)}`);
  }

  // Build import statement for user
  const importPath = `./lib/components/${componentEntry.type}/${component.replace(/-/g, "-")}`;
  const importExample = `import { ${componentEntry.name} } from "${importPath}";`;

  return `Installed ${componentEntry.name}:

Files created:
${installed.map(f => `  - ${f}`).join("\n")}

Usage in your block:
\`\`\`tsx
${importExample}

export function Block() {
  return <${componentEntry.name} />;
}
\`\`\`

${componentEntry.dependencies.length > 0 ? `\nNote: This component requires these npm packages: ${componentEntry.dependencies.join(", ")}` : ""}`;
}

// Export list function for agent to browse available components
export async function listComponents(): Promise<string> {
  const categories: Record<string, string[]> = {};

  for (const [name, entry] of Object.entries(registry.components)) {
    const comp = entry as ComponentEntry;
    if (!categories[comp.type]) {
      categories[comp.type] = [];
    }
    categories[comp.type].push(`  - ${name}: ${comp.description}`);
  }

  let result = "Available components:\n\n";
  for (const [category, components] of Object.entries(categories)) {
    const categoryInfo = registry.categories[category];
    result += `## ${categoryInfo?.name || category}\n`;
    result += components.join("\n") + "\n\n";
  }

  return result;
}
