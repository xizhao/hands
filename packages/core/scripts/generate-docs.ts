/**
 * Docs Generator Script
 *
 * Scans stdlib component files for JSDoc comments and generates:
 * 1. docs/components.md - Markdown reference for agents/LLMs
 * 2. docs/registry.json - Structured component metadata
 *
 * Usage: bun run scripts/generate-docs.ts
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

interface ComponentDoc {
  name: string;
  category: "static" | "active";
  description: string;
  keywords: string[];
  example: string;
  file: string;
}

interface ParsedJSDoc {
  component?: string;
  category?: string;
  description?: string;
  keywords?: string[];
  example?: string;
}

// ============================================================================
// JSDoc Parser
// ============================================================================

function parseJSDocFromFile(filePath: string): ParsedJSDoc | null {
  const content = fs.readFileSync(filePath, "utf-8");

  // Look for file-level JSDoc comment with @component tag
  const jsDocMatch = content.match(/^\s*["']use client["'];\s*\n\s*\/\*\*([\s\S]*?)\*\//);
  if (!jsDocMatch) {
    // Try without "use client"
    const altMatch = content.match(/^\s*\/\*\*([\s\S]*?)\*\//);
    if (!altMatch) return null;
    return parseJSDocContent(altMatch[1]);
  }

  return parseJSDocContent(jsDocMatch[1]);
}

function parseJSDocContent(jsDocContent: string): ParsedJSDoc | null {
  // Check for @component tag
  const componentMatch = jsDocContent.match(/@component\s+(\S+)/);
  if (!componentMatch) return null;

  const result: ParsedJSDoc = {
    component: componentMatch[1],
  };

  // Extract @category
  const categoryMatch = jsDocContent.match(/@category\s+(\S+)/);
  if (categoryMatch) result.category = categoryMatch[1].trim();

  // Extract @description
  const descMatch = jsDocContent.match(/@description\s+(.+?)(?=\n\s*\*\s*@|$)/s);
  if (descMatch) {
    result.description = descMatch[1]
      .replace(/\n\s*\*\s*/g, " ")
      .trim();
  }

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
    result.example = exampleMatch[1]
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, ""))
      .join("\n")
      .trim();
  }

  return result;
}

// ============================================================================
// File Discovery
// ============================================================================

function findTsxFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

// ============================================================================
// Markdown Generator
// ============================================================================

function generateMarkdown(components: ComponentDoc[]): string {
  const staticComponents = components.filter((c) => c.category === "static");
  const activeComponents = components.filter((c) => c.category === "active");

  let md = `# Hands Standard Library

Component reference for the Hands data application framework.

## Overview

The stdlib provides two categories of components:

- **Static** - Display-only components that render data
- **Active** - Interactive components that handle user input and execute SQL mutations

---

## Static Components

Display-only components that render live data from SQL queries.

`;

  for (const comp of staticComponents) {
    md += generateComponentSection(comp);
  }

  md += `
---

## Active Components

Interactive components for building forms that execute SQL mutations.

`;

  for (const comp of activeComponents) {
    md += generateComponentSection(comp);
  }

  return md;
}

function generateComponentSection(comp: ComponentDoc): string {
  let section = `### ${comp.name}

${comp.description}

`;

  if (comp.keywords.length > 0) {
    section += `**Keywords:** ${comp.keywords.join(", ")}\n\n`;
  }

  if (comp.example) {
    section += `**Example:**
\`\`\`tsx
${comp.example}
\`\`\`

`;
  }

  return section;
}

// ============================================================================
// TypeScript Generator (for agent prompts)
// ============================================================================

function generateTypeScript(components: ComponentDoc[], markdown: string): string {
  const staticComponents = components.filter((c) => c.category === "static");
  const activeComponents = components.filter((c) => c.category === "active");

  return `/**
 * Stdlib Documentation - Auto-generated
 *
 * DO NOT EDIT - Run: bun run generate:docs
 */

// Full documentation as markdown (for system prompts)
export const STDLIB_DOCS = ${JSON.stringify(markdown)};

// Component metadata
export const STDLIB_COMPONENTS = ${JSON.stringify(
    Object.fromEntries(
      components.map((c) => [
        c.name,
        {
          category: c.category,
          description: c.description,
          keywords: c.keywords,
          example: c.example,
        },
      ])
    ),
    null,
    2
  )} as const;

// Component names by category
export const STATIC_COMPONENTS = ${JSON.stringify(staticComponents.map((c) => c.name))} as const;
export const ACTIVE_COMPONENTS = ${JSON.stringify(activeComponents.map((c) => c.name))} as const;

// All component names
export const ALL_COMPONENTS = [...STATIC_COMPONENTS, ...ACTIVE_COMPONENTS] as const;

// Quick reference for agents (shorter than full docs)
export const STDLIB_QUICK_REF = ${JSON.stringify(`
## Stdlib Components

### Static (Display)
${staticComponents.map((c) => `- **${c.name}**: ${c.description}`).join("\n")}

### Active (Interactive)
${activeComponents.map((c) => `- **${c.name}**: ${c.description}`).join("\n")}
`)};
`;
}

// ============================================================================
// Main
// ============================================================================

async function generateDocs() {
  const coreRoot = path.resolve(__dirname, "..");
  const stdlibDir = path.join(coreRoot, "src/stdlib");
  const docsDir = path.join(coreRoot, "src/docs");

  console.log("Scanning stdlib components in:", stdlibDir);

  // Ensure docs directory exists
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Find all component files
  const files = findTsxFiles(stdlibDir);
  console.log(`Found ${files.length} component files`);

  // Parse each file
  const components: ComponentDoc[] = [];

  for (const file of files) {
    const parsed = parseJSDocFromFile(file);

    if (parsed?.component) {
      components.push({
        name: parsed.component,
        category: (parsed.category as "static" | "active") || "static",
        description: parsed.description || "",
        keywords: parsed.keywords || [],
        example: parsed.example || "",
        file: path.relative(coreRoot, file),
      });
      console.log(`  Parsed: ${parsed.component} (${parsed.category})`);
    }
  }

  console.log(`\nTotal components: ${components.length}`);

  // Generate markdown
  const markdown = generateMarkdown(components);
  const mdPath = path.join(docsDir, "components.md");
  fs.writeFileSync(mdPath, markdown);
  console.log(`Generated: ${mdPath}`);

  // Generate JSON registry
  const registry = {
    $schema: "https://hands.dev/schema/stdlib.json",
    version: "0.1.0",
    components: Object.fromEntries(
      components.map((c) => [
        c.name,
        {
          category: c.category,
          description: c.description,
          keywords: c.keywords,
          example: c.example,
          file: c.file,
        },
      ])
    ),
  };

  const jsonPath = path.join(docsDir, "registry.json");
  fs.writeFileSync(jsonPath, JSON.stringify(registry, null, 2));
  console.log(`Generated: ${jsonPath}`);

  // Generate TypeScript for agent consumption
  const typescript = generateTypeScript(components, markdown);
  const tsPath = path.join(docsDir, "stdlib.ts");
  fs.writeFileSync(tsPath, typescript);
  console.log(`Generated: ${tsPath}`);
}

// Run
generateDocs().catch(console.error);
