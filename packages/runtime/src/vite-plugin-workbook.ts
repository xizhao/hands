/**
 * Vite Plugin: Workbook
 *
 * Unified discovery and bundling for workbook content:
 * - Pages: MDX files in pages/ directory
 * - Actions: TypeScript files in actions/ directory
 *
 * Both run in CF Workers with access to @hands/db.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import type { Value } from "platejs";

interface WorkbookPluginOptions {
  workbookPath: string;
}

// =============================================================================
// Shared Utilities
// =============================================================================

const contentHashes = new Map<string, string>();

function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hashContent(content: string): string {
  return crypto.createHash("md5").update(normalizeContent(content)).digest("hex");
}

function sanitizeId(id: string): string {
  return id
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/^(\d)/, "_$1");
}

// =============================================================================
// Pages Processing
// =============================================================================

interface PageMeta {
  id: string;
  frontmatter: Record<string, unknown>;
  content: string;
  value: Value;
}

function extractBlockIds(nodes: any[], blockIds: Set<string>): void {
  for (const node of nodes) {
    if (node.type === "rsc-block" && node.blockId) {
      blockIds.add(node.blockId);
    }
    if (node.children) {
      extractBlockIds(node.children, blockIds);
    }
  }
}

// Simple frontmatter parser to avoid importing from @hands/core
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const yaml = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};

  // Simple YAML parsing (key: value only)
  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value: unknown = line.slice(colonIdx + 1).trim();
      // Remove quotes
      if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
        value = (value as string).slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

// Lazy-load the MDX parser only when needed (after Vite is running)
let parseMdxToPlate: ((source: string) => { frontmatter: Record<string, unknown>; value: Value; errors: string[] }) | null = null;

async function loadMdxParser() {
  if (parseMdxToPlate) return parseMdxToPlate;
  // Import from pre-built dist to avoid Node ESM resolution issues
  const mod = await import("../../core/dist/primitives/serialization/mdx-parser.js");
  parseMdxToPlate = mod.parseMdxToPlate;
  return parseMdxToPlate;
}

async function processPages(pagesDir: string): Promise<PageMeta[]> {
  if (!fs.existsSync(pagesDir)) {
    return [];
  }

  const pageFiles = fs
    .readdirSync(pagesDir)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

  const pages: PageMeta[] = [];

  for (const file of pageFiles) {
    const filePath = path.join(pagesDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const ext = path.extname(file);
    const id = path.basename(file, ext);

    contentHashes.set(filePath, hashContent(content));

    try {
      // Try to use the full MDX parser
      const parser = await loadMdxParser();
      const result = parser(content);
      if (result.errors.length > 0) {
        console.warn(`[workbook:pages] Warnings for ${file}:`, result.errors);
      }
      pages.push({ id, frontmatter: result.frontmatter, content, value: result.value });
    } catch (err) {
      // Fallback to simple frontmatter parsing
      console.error(`[workbook:pages] Failed to parse ${file}:`, err);
      const { frontmatter } = parseFrontmatter(content);
      pages.push({
        id,
        frontmatter: frontmatter.title ? frontmatter : { title: id, ...frontmatter },
        content,
        value: [{ type: "p", children: [{ text: `Error parsing page: ${err}` }] }],
      });
    }
  }

  return pages;
}

function generatePagesManifest(pages: PageMeta[], outputDir: string): void {
  const allBlockIds = new Set<string>();
  for (const page of pages) {
    extractBlockIds(page.value, allBlockIds);
  }

  const blockImports = Array.from(allBlockIds)
    .map((id) => {
      const importPath = id.startsWith("blocks/") ? id.slice(7) : id;
      return `import ${sanitizeId(id)}Block from "@/blocks/${importPath}";`;
    })
    .join("\n");

  const blockMap = Array.from(allBlockIds)
    .map((id) => `  "${id}": ${sanitizeId(id)}Block,`)
    .join("\n");

  const manifest = `// Auto-generated pages manifest - DO NOT EDIT
import { route } from "rwsdk/router";
import { Page } from "@hands/runtime/pages/Page";
import { PageStatic } from "@hands/runtime/components/PageStatic";
${blockImports}

const blocks: Record<string, React.FC<any>> = {
${blockMap}
};

${pages
  .map(
    (p) => `const ${sanitizeId(p.id)}Frontmatter = ${JSON.stringify(p.frontmatter)};
const ${sanitizeId(p.id)}Value = ${JSON.stringify(p.value)};`
  )
  .join("\n\n")}

${pages
  .map(
    (p) => `function ${sanitizeId(p.id)}Page() {
  const fm = ${sanitizeId(p.id)}Frontmatter;
  return (
    <Page title={fm.title as string} description={fm.description as string}>
      <PageStatic value={${sanitizeId(p.id)}Value} blocks={blocks} />
    </Page>
  );
}`
  )
  .join("\n\n")}

export const pages = {
${pages.map((p) => `  "${p.id}": { frontmatter: ${sanitizeId(p.id)}Frontmatter },`).join("\n")}
} as const;

export type PageId = keyof typeof pages;

export const pageRoutes = [
${pages.map((p) => `  route("/pages/${p.id}", ${sanitizeId(p.id)}Page),`).join("\n")}
] as const;
`;

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "index.tsx"), manifest);
}

// =============================================================================
// Actions Processing
// =============================================================================

interface ActionMeta {
  id: string;
  path: string;
  relativePath: string;
}

function discoverActions(actionsDir: string): ActionMeta[] {
  if (!fs.existsSync(actionsDir)) {
    return [];
  }

  const actionFiles = fs
    .readdirSync(actionsDir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"));

  return actionFiles.map((file) => {
    const id = path.basename(file, ".ts");
    const filePath = path.join(actionsDir, file);
    contentHashes.set(filePath, hashContent(fs.readFileSync(filePath, "utf-8")));
    return {
      id,
      path: filePath,
      relativePath: `actions/${file}`,
    };
  });
}

function generateActionsManifest(actions: ActionMeta[], outputDir: string, workbookPath: string): void {
  const imports = actions
    .map((a) => `import ${sanitizeId(a.id)}Action from "${path.join(workbookPath, a.relativePath)}";`)
    .join("\n");

  const actionMap = actions
    .map((a) => `  "${a.id}": ${sanitizeId(a.id)}Action,`)
    .join("\n");

  const manifest = `// Auto-generated actions manifest - DO NOT EDIT
import type { ActionDefinition } from "@hands/runtime";
${imports}

export const actions: Record<string, ActionDefinition> = {
${actionMap}
};

export type ActionId = keyof typeof actions;

export function getAction(id: string): ActionDefinition | undefined {
  return actions[id];
}

export function listActions(): Array<{ id: string; definition: ActionDefinition }> {
  return Object.entries(actions).map(([id, definition]) => ({ id, definition }));
}
`;

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "index.ts"), manifest);
}

// =============================================================================
// Plugin
// =============================================================================

export function workbookPlugin(options: WorkbookPluginOptions): Plugin {
  const { workbookPath } = options;
  const pagesDir = path.join(workbookPath, "pages");
  const actionsDir = path.join(workbookPath, "actions");
  const pagesOutputDir = path.join(workbookPath, ".hands/pages");
  const actionsOutputDir = path.join(workbookPath, ".hands/actions");

  async function processAll() {
    // Process pages
    const pages = await processPages(pagesDir);
    generatePagesManifest(pages, pagesOutputDir);
    console.log(`[workbook] Generated ${pages.length} pages`);

    // Process actions
    const actions = discoverActions(actionsDir);
    generateActionsManifest(actions, actionsOutputDir, workbookPath);
    console.log(`[workbook] Generated ${actions.length} actions`);
  }

  return {
    name: "hands-workbook",
    enforce: "pre",

    async buildStart() {
      await processAll();
    },

    configureServer(server) {
      console.log(`[workbook] Watching: ${pagesDir}, ${actionsDir}`);
      server.watcher.add(pagesDir);
      server.watcher.add(actionsDir);

      const handleChange = async (changedPath: string, action: string) => {
        const isPage = changedPath.startsWith(pagesDir) &&
          (changedPath.endsWith(".mdx") || changedPath.endsWith(".md"));
        const isAction = changedPath.startsWith(actionsDir) &&
          changedPath.endsWith(".ts") &&
          !changedPath.endsWith(".test.ts") &&
          !changedPath.endsWith(".d.ts");

        if (!isPage && !isAction) return;

        // Check if content actually changed
        if (action === "change") {
          try {
            const content = fs.readFileSync(changedPath, "utf-8");
            const hash = hashContent(content);
            if (contentHashes.get(changedPath) === hash) return;
            contentHashes.set(changedPath, hash);
          } catch {
            // File might be deleted
          }
        }

        const type = isPage ? "page" : "action";
        console.log(`[workbook] ${action} ${type}: ${path.basename(changedPath)}`);
        await processAll();

        // Invalidate manifests
        const manifestPath = isPage
          ? path.join(pagesOutputDir, "index.tsx")
          : path.join(actionsOutputDir, "index.ts");

        const mods = server.moduleGraph.getModulesByFile(manifestPath);
        if (mods) {
          for (const m of mods) {
            server.moduleGraph.invalidateModule(m);
          }
        }

        server.ws.send({ type: "full-reload" });
      };

      server.watcher.on("change", (p) => handleChange(p, "change"));
      server.watcher.on("add", (p) => handleChange(p, "add"));
      server.watcher.on("unlink", (p) => {
        contentHashes.delete(p);
        handleChange(p, "unlink");
      });
    },
  };
}
