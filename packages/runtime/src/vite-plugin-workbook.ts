/**
 * Vite Plugin: Workbook
 *
 * Unified discovery and bundling for workbook content:
 * - Pages: MDX files in pages/ directory
 * - Actions: TypeScript files in actions/ directory
 *
 * Both run in CF Workers with access to @hands/db.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Value } from "platejs";
import type { Plugin } from "vite";

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
  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
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
let parseMdxToPlate:
  | ((source: string) => { frontmatter: Record<string, unknown>; value: Value; errors: string[] })
  | null = null;

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

  const pageFiles = fs.readdirSync(pagesDir).filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

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
const ${sanitizeId(p.id)}Value = ${JSON.stringify(p.value)};`,
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
}`,
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
  isWorkflow: boolean;
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
    const content = fs.readFileSync(filePath, "utf-8");
    contentHashes.set(filePath, hashContent(content));

    // Detect workflow actions by looking for "workflow" property/function
    // This is a simple heuristic - workflow actions use `workflow:` or `async workflow(`
    const isWorkflow = /\bworkflow\s*[:(]/.test(content);

    return {
      id,
      path: filePath,
      relativePath: `actions/${file}`,
      isWorkflow,
    };
  });
}

function toPascalCase(id: string): string {
  return id
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function generateActionsManifest(
  actions: ActionMeta[],
  outputDir: string,
  workbookPath: string,
  isDev: boolean,
): void {
  const imports = actions
    .map(
      (a) => `import ${sanitizeId(a.id)}Action from "${path.join(workbookPath, a.relativePath)}";`,
    )
    .join("\n");

  const actionMap = actions.map((a) => `  "${a.id}": ${sanitizeId(a.id)}Action,`).join("\n");

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

  // Generate CF Workflow classes for workflow actions (skip in dev mode)
  const workflowActions = actions.filter((a) => a.isWorkflow);
  generateWorkflowClasses(workflowActions, outputDir, workbookPath, isDev);
}

/**
 * Generate CF WorkflowEntrypoint classes for workflow actions.
 * These are used when deploying to production CF Workers.
 * In dev mode, skip generation to keep the stub file (CF imports don't work in dev).
 */
function generateWorkflowClasses(
  workflowActions: ActionMeta[],
  outputDir: string,
  workbookPath: string,
  isDev: boolean,
): void {
  // In dev mode, don't generate workflow classes - keep the stub
  // Workflow classes use cloudflare:workers imports which only work in production
  if (isDev) {
    console.log(`[workbook] Skipping workflow class generation (dev mode)`);
    return;
  }

  // Handle empty case - still generate file for module resolution
  if (workflowActions.length === 0) {
    const emptyManifest = `// Auto-generated CF Workflow classes - DO NOT EDIT
// No workflow actions found in this workbook

export const workflowBindings = {} as const;

export type WorkflowId = never;

export function getWorkflowBinding(_id: string): { className: string; binding: string } | undefined {
  return undefined;
}
`;
    fs.writeFileSync(path.join(outputDir, "workflows.ts"), emptyManifest);
    return;
  }

  const imports = workflowActions
    .map(
      (a) => `import ${sanitizeId(a.id)}Action from "${path.join(workbookPath, a.relativePath)}";`,
    )
    .join("\n");

  const workflowClasses = workflowActions
    .map((a) => {
      const className = `${toPascalCase(a.id)}Workflow`;
      const varName = sanitizeId(a.id);
      return `
/**
 * CF Workflow class for "${a.id}" action.
 * Auto-generated - DO NOT EDIT.
 */
export class ${className} extends WorkflowEntrypoint<Env, unknown> {
  async run(event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<unknown> {
    const runId = crypto.randomUUID();
    const ctx = buildWorkflowContext(this.env, runId);
    return ${varName}Action.workflow(step, ctx, event.payload);
  }
}`;
    })
    .join("\n");

  const workflowBindings = workflowActions
    .map((a) => {
      const className = `${toPascalCase(a.id)}Workflow`;
      const bindingName = `${a.id.toUpperCase().replace(/-/g, "_")}_WORKFLOW`;
      return `  "${a.id}": { className: "${className}", binding: "${bindingName}" },`;
    })
    .join("\n");

  const workflowManifest = `// Auto-generated CF Workflow classes - DO NOT EDIT
// Env type is globally available from worker-configuration.d.ts
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { buildWorkflowContext } from "@hands/runtime/actions/workflow-context";
${imports}

// =============================================================================
// Workflow Classes
// =============================================================================
${workflowClasses}

// =============================================================================
// Workflow Registry
// =============================================================================

export const workflowBindings = {
${workflowBindings}
} as const;

export type WorkflowId = keyof typeof workflowBindings;

export function getWorkflowBinding(id: string): { className: string; binding: string } | undefined {
  return workflowBindings[id as WorkflowId];
}
`;

  fs.writeFileSync(path.join(outputDir, "workflows.ts"), workflowManifest);
  console.log(`[workbook] Generated ${workflowActions.length} workflow classes`);
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

  // Track if we're in dev mode (set in configResolved)
  let isDev = process.env.NODE_ENV !== "production";

  /**
   * Generate initial files synchronously before any modules load.
   * This is required because CF worker environment resolves modules
   * from disk, not through Vite's virtual module hooks.
   */
  function ensureFilesExist() {
    fs.mkdirSync(pagesOutputDir, { recursive: true });
    fs.mkdirSync(actionsOutputDir, { recursive: true });

    // Pages stub
    const pagesIndex = path.join(pagesOutputDir, "index.tsx");
    if (!fs.existsSync(pagesIndex)) {
      fs.writeFileSync(
        pagesIndex,
        `// Auto-generated - DO NOT EDIT
export const pages = {} as const;
export type PageId = never;
export const pageRoutes = [] as const;
`,
      );
    }

    // Actions stub
    const actionsIndex = path.join(actionsOutputDir, "index.ts");
    if (!fs.existsSync(actionsIndex)) {
      fs.writeFileSync(
        actionsIndex,
        `// Auto-generated - DO NOT EDIT
export const actions = {} as const;
export type ActionId = never;
export function getAction(_id: string) { return undefined; }
export function listActions() { return []; }
`,
      );
    }

    // Workflows stub - always write on startup to ensure clean state
    // In dev mode, we keep this stub; in prod, generateWorkflowClasses overwrites it
    const workflowsFile = path.join(actionsOutputDir, "workflows.ts");
    fs.writeFileSync(
      workflowsFile,
      `// Auto-generated - DO NOT EDIT
// Workflows only run in production CF deployments
export const workflowBindings = {} as const;
export type WorkflowId = never;
export function getWorkflowBinding(_id: string) { return undefined; }
`,
    );
  }

  async function processAll() {
    // Process pages
    const pages = await processPages(pagesDir);
    generatePagesManifest(pages, pagesOutputDir);
    console.log(`[workbook] Generated ${pages.length} pages`);

    // Process actions (generates workflows.ts only in prod mode)
    const actions = discoverActions(actionsDir);
    generateActionsManifest(actions, actionsOutputDir, workbookPath, isDev);
    console.log(`[workbook] Generated ${actions.length} actions`);
  }

  // Generate files immediately when plugin is loaded (before Vite starts)
  ensureFilesExist();

  // Full path to the workflows file for module resolution
  const workflowsFilePath = path.join(actionsOutputDir, "workflows.ts");

  return {
    name: "hands-workbook",
    enforce: "pre",

    configResolved(config) {
      // Update isDev based on resolved Vite config
      isDev = config.command === "serve";
    },

    // Resolve @hands/actions/* imports to the generated files
    resolveId(id) {
      if (id === "@hands/actions/workflows") {
        return workflowsFilePath;
      }
      if (id === "@hands/actions") {
        return path.join(actionsOutputDir, "index.ts");
      }
      if (id === "@hands/pages") {
        return path.join(pagesOutputDir, "index.tsx");
      }
      return null;
    },

    async buildStart() {
      await processAll();
    },

    configureServer(server) {
      console.log(`[workbook] Watching: ${pagesDir}, ${actionsDir}`);
      server.watcher.add(pagesDir);
      server.watcher.add(actionsDir);

      const handleChange = async (changedPath: string, action: string) => {
        const isPage =
          changedPath.startsWith(pagesDir) &&
          (changedPath.endsWith(".mdx") || changedPath.endsWith(".md"));
        const isAction =
          changedPath.startsWith(actionsDir) &&
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
