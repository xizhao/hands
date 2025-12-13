/**
 * Registry Generator Script
 *
 * Scans component files for JSDoc comments and generates registry.generated.ts
 *
 * Usage: bun run scripts/generate-registry.ts
 */

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

// ============================================
// Static Definitions (Categories)
// ============================================

const categories = {
  "ui-input": { name: "Form Inputs", description: "Form controls and input components" },
  "ui-display": { name: "Data Display", description: "Components for displaying data" },
  "ui-feedback": { name: "Feedback", description: "Loading, progress, and notifications" },
  "ui-overlay": { name: "Overlays", description: "Dialogs, popovers, and modals" },
  "ui-navigation": { name: "Navigation", description: "Navigation and menu components" },
  "ui-layout": { name: "UI Layout", description: "Layout primitives and containers" },
  data: { name: "Data", description: "Components for data visualization" },
  charts: { name: "Charts", description: "Chart and graph components" },
} as const;

// ============================================
// Types
// ============================================

interface ComponentEntry {
  name: string;
  category: string;
  description: string;
  icon?: string;
  keywords?: string[];
  example?: string;
  files: string[];
  dependencies: string[];
}

interface ParsedJSDoc {
  component?: string;
  name?: string;
  category?: string;
  description?: string;
  icon?: string;
  keywords?: string[];
  example?: string;
}

// ============================================
// JSDoc Parser (Regex-based for file-level comments)
// ============================================

function parseJSDocFromFile(filePath: string): ParsedJSDoc | null {
  const content = fs.readFileSync(filePath, "utf-8");

  // Look for file-level JSDoc comment with @component tag
  // Match /** ... */ at the start of the file (allowing whitespace before)
  const jsDocMatch = content.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (!jsDocMatch) return null;

  const jsDocContent = jsDocMatch[1];

  // Check for @component tag
  const componentMatch = jsDocContent.match(/@component\s+(\S+)/);
  if (!componentMatch) return null;

  const result: ParsedJSDoc = {
    component: componentMatch[1],
  };

  // Extract @name
  const nameMatch = jsDocContent.match(/@name\s+(.+?)(?=\n|$)/);
  if (nameMatch) result.name = nameMatch[1].trim();

  // Extract @category
  const categoryMatch = jsDocContent.match(/@category\s+(\S+)/);
  if (categoryMatch) result.category = categoryMatch[1].trim();

  // Extract @description
  const descMatch = jsDocContent.match(/@description\s+(.+?)(?=\n\s*\*\s*@|$)/s);
  if (descMatch) result.description = descMatch[1].replace(/\n\s*\*\s*/g, " ").trim();

  // Extract @icon
  const iconMatch = jsDocContent.match(/@icon\s+(\S+)/);
  if (iconMatch) result.icon = iconMatch[1].trim();

  // Extract @keywords
  const keywordsMatch = jsDocContent.match(/@keywords\s+(.+?)(?=\n\s*\*\s*@|$)/);
  if (keywordsMatch) {
    result.keywords = keywordsMatch[1]
      .replace(/\n\s*\*\s*/g, " ")
      .split(",")
      .map((k) => k.trim());
  }

  // Extract @example (multiline)
  const exampleMatch = jsDocContent.match(/@example\s*\n([\s\S]*?)(?=\n\s*\*\s*@|\n\s*\*\/|$)/);
  if (exampleMatch) {
    // Clean up the example: remove leading * and whitespace from each line
    result.example = exampleMatch[1]
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, ""))
      .join("\n")
      .trim();
  }

  return result;
}

// ============================================
// Dependency Detection
// ============================================

function extractDependencies(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const deps: string[] = [];

  // Match import statements for external packages (not relative imports)
  const importRegex = /import\s+.*?\s+from\s+["']([^./][^"']+)["']/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const pkg = match[1];
    // Get the package name (handle scoped packages)
    const pkgName = pkg.startsWith("@")
      ? pkg.split("/").slice(0, 2).join("/")
      : pkg.split("/")[0];

    // Skip internal packages and common peer deps
    if (
      !pkgName.startsWith("@hands/") &&
      !["react", "react-dom", "next"].includes(pkgName) &&
      !deps.includes(pkgName)
    ) {
      deps.push(pkgName);
    }
  }

  return deps;
}

// ============================================
// File Discovery
// ============================================

function findTsxFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTsxFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(path.relative(baseDir, fullPath));
    }
  }

  return files;
}

// ============================================
// Main Generator
// ============================================

async function generateRegistry() {
  const stdlibRoot = path.resolve(__dirname, "..");
  const componentsDir = path.join(stdlibRoot, "src/registry/components");
  const outputPath = path.join(stdlibRoot, "src/registry.generated.ts");

  console.log("Scanning components in:", componentsDir);

  // Find all component files
  const files = findTsxFiles(componentsDir);
  console.log(`Found ${files.length} component files`);

  // Parse each file
  const components: Record<string, ComponentEntry> = {};
  let parsedCount = 0;

  for (const file of files) {
    const filePath = path.join(componentsDir, file);
    const parsed = parseJSDocFromFile(filePath);

    if (parsed?.component) {
      const key = parsed.component;
      const relativePath = `registry/components/${file}`;

      components[key] = {
        name: parsed.name || key,
        category: parsed.category || "ui-display",
        description: parsed.description || "",
        icon: parsed.icon,
        keywords: parsed.keywords,
        example: parsed.example,
        files: [relativePath],
        dependencies: extractDependencies(filePath),
      };

      parsedCount++;
      console.log(`  Parsed: ${key} (${file})`);
    }
  }

  console.log(`\nParsed ${parsedCount} components with @component JSDoc`);
  console.log(`Total components: ${Object.keys(components).length}`);

  // Generate output
  const output = `// Auto-generated by scripts/generate-registry.ts - DO NOT EDIT DIRECTLY
// Run: bun run generate

export const registry = {
  $schema: "https://hands.dev/schema/registry.json",
  name: "@hands/stdlib",
  version: "0.1.0",
  components: ${JSON.stringify(components, null, 2)},
  categories: ${JSON.stringify(categories, null, 2)},
} as const;

export default registry;
`;

  fs.writeFileSync(outputPath, output);
  console.log(`\nGenerated: ${outputPath}`);
}

// Run
generateRegistry().catch(console.error);
