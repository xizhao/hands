/**
 * Vite plugin for pages
 *
 * Processes MDX files:
 * 1. Parse MDX with frontmatter and Block components
 * 2. Convert to Plate JSON (rsc-block elements for Block components)
 * 3. Generate page components using PlateStatic
 * 4. Generate route manifest
 */

import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import type { Value } from "platejs";

interface PagesPluginOptions {
  workbookPath: string;
}

interface PageMeta {
  id: string;
  frontmatter: Record<string, unknown>;
  content: string;
  value: Value;
}

export function pagesPlugin(options: PagesPluginOptions): Plugin {
  const { workbookPath } = options;
  const pagesDir = path.join(workbookPath, "pages");
  const outputDir = path.join(workbookPath, ".hands/pages");

  return {
    name: "hands-pages",
    enforce: "pre",

    async buildStart() {
      await processAllPages(pagesDir, outputDir);
    },

    configureServer(server) {
      // Watch the pages directory for changes
      // Note: watcher.add takes paths, not globs - we filter by extension in the handler
      console.log(`[pages] Watching directory: ${pagesDir}`);
      server.watcher.add(pagesDir);

      const reprocessAndReload = async (changedPath: string, action: string) => {
        console.log(`[pages] ${action} ${path.basename(changedPath)}...`);
        await processAllPages(pagesDir, outputDir);

        // Invalidate the generated manifest module to trigger HMR
        const manifestPath = path.join(outputDir, "index.tsx");
        console.log(`[pages] Looking for module: ${manifestPath}`);

        const mod = server.moduleGraph.getModuleById(manifestPath);
        console.log(`[pages] Module found: ${!!mod}`);

        if (mod) {
          server.moduleGraph.invalidateModule(mod);
          console.log(`[pages] Invalidated module`);
        }

        // Also try by URL
        const mods = server.moduleGraph.getModulesByFile(manifestPath);
        console.log(`[pages] Modules by file: ${mods?.size || 0}`);
        if (mods) {
          for (const m of mods) {
            server.moduleGraph.invalidateModule(m);
            console.log(`[pages] Invalidated module by file: ${m.url}`);
          }
        }

        // Send full reload since pages affect routing
        console.log(`[pages] Sending full-reload`);
        server.ws.send({ type: "full-reload" });
      };

      server.watcher.on("change", async (changedPath) => {
        console.log(`[pages] Watcher change event: ${changedPath}`);
        if (
          (changedPath.endsWith(".mdx") || changedPath.endsWith(".md")) &&
          changedPath.startsWith(pagesDir)
        ) {
          await reprocessAndReload(changedPath, "Reprocessing");
        }
      });

      server.watcher.on("add", async (addedPath) => {
        if (
          (addedPath.endsWith(".mdx") || addedPath.endsWith(".md")) &&
          addedPath.startsWith(pagesDir)
        ) {
          await reprocessAndReload(addedPath, "Processing new file");
        }
      });

      server.watcher.on("unlink", async (removedPath) => {
        if (
          (removedPath.endsWith(".mdx") || removedPath.endsWith(".md")) &&
          removedPath.startsWith(pagesDir)
        ) {
          await reprocessAndReload(removedPath, "Removed");
        }
      });
    },
  };
}

async function processAllPages(
  pagesDir: string,
  outputDir: string
): Promise<void> {
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  if (!fs.existsSync(pagesDir)) {
    console.log("[pages] No pages directory found, generating empty manifest");
    await generateManifest([], outputDir);
    return;
  }

  const pageFiles = fs
    .readdirSync(pagesDir)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

  console.log(`[pages] Processing ${pageFiles.length} page files...`);

  // Dynamically import the parser using relative path (workspace deps don't resolve at vite config time)
  const { parseMdx } = await import("../../editor/src/mdx/parser");

  const pages: PageMeta[] = [];

  for (const file of pageFiles) {
    const filePath = path.join(pagesDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const ext = path.extname(file);
    const id = path.basename(file, ext);

    try {
      const result = parseMdx(content);

      if (result.errors.length > 0) {
        console.warn(`[pages] Warnings for ${file}:`, result.errors);
      }

      pages.push({
        id,
        frontmatter: result.frontmatter,
        content,
        value: result.value,
      });
    } catch (err) {
      console.error(`[pages] Failed to parse ${file}:`, err);
      // Create a fallback page with error message
      pages.push({
        id,
        frontmatter: { title: id },
        content,
        value: [{ type: "p", children: [{ text: `Error parsing page: ${err}` }] }],
      });
    }
  }

  await generateManifest(pages, outputDir);
  console.log(`[pages] Done. Generated manifest with ${pages.length} pages`);
}

async function generateManifest(
  pages: PageMeta[],
  outputDir: string
): Promise<void> {
  // Collect all unique block IDs across all pages
  const allBlockIds = new Set<string>();
  for (const page of pages) {
    extractBlockIds(page.value, allBlockIds);
  }

  // Generate block imports
  const blockImports = Array.from(allBlockIds)
    .map((id) => `import ${sanitizeId(id)}Block from "@/blocks/${id}";`)
    .join("\n");

  // Generate block map
  const blockMap = Array.from(allBlockIds)
    .map((id) => `  "${id}": ${sanitizeId(id)}Block,`)
    .join("\n");

  // Generate the manifest - blocks imported statically, rwsdk handles HMR
  const manifest = `// Auto-generated pages manifest - DO NOT EDIT
import { route } from "rwsdk/router";
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

// Page components (RSC) that render via PlateStatic (client)
${pages
  .map(
    (p) => `function ${sanitizeId(p.id)}Page() {
  const title = (${sanitizeId(p.id)}Frontmatter.title as string) || "Untitled";
  return (
    <article className="prose prose-slate max-w-none">
      <h1>{title}</h1>
      <PageStatic value={${sanitizeId(p.id)}Value} blocks={blocks} />
    </article>
  );
}`
  )
  .join("\n\n")}

// Page metadata for lookups
export const pages = {
${pages.map((p) => `  "${p.id}": { frontmatter: ${sanitizeId(p.id)}Frontmatter },`).join("\n")}
} as const;

export type PageId = keyof typeof pages;

// Routes for rwsdk render()
export const pageRoutes = [
${pages.map((p) => `  route("/pages/${p.id}", ${sanitizeId(p.id)}Page),`).join("\n")}
] as const;
`;

  fs.writeFileSync(path.join(outputDir, "index.tsx"), manifest);
}

/** Recursively extract all block IDs from a Plate value */
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

function sanitizeId(id: string): string {
  // Convert kebab-case to camelCase and ensure valid JS identifier
  return id
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/^(\d)/, "_$1");
}
