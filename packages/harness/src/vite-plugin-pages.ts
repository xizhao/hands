/**
 * Vite plugin for pages
 *
 * Processes markdown/MDX files:
 * 1. Parse frontmatter for title/description
 * 2. Deserialize markdown → Plate JSON
 * 3. Generate page components using PlateStatic
 * 4. Generate route manifest
 */

import fs from "fs";
import path from "path";
import type { Plugin } from "vite";

interface PagesPluginOptions {
  workbookPath: string;
}

interface PageMeta {
  id: string;
  frontmatter: Record<string, unknown>;
  markdown: string;
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
      // Watch for page file changes
      server.watcher.add(path.join(pagesDir, "**/*.mdx"));
      server.watcher.add(path.join(pagesDir, "**/*.md"));

      server.watcher.on("change", async (changedPath) => {
        if (
          (changedPath.endsWith(".mdx") || changedPath.endsWith(".md")) &&
          changedPath.startsWith(pagesDir)
        ) {
          console.log(`[pages] Reprocessing ${path.basename(changedPath)}...`);
          await processAllPages(pagesDir, outputDir);
        }
      });

      server.watcher.on("add", async (addedPath) => {
        if (
          (addedPath.endsWith(".mdx") || addedPath.endsWith(".md")) &&
          addedPath.startsWith(pagesDir)
        ) {
          console.log(`[pages] Processing new file ${path.basename(addedPath)}...`);
          await processAllPages(pagesDir, outputDir);
        }
      });

      server.watcher.on("unlink", async (removedPath) => {
        if (
          (removedPath.endsWith(".mdx") || removedPath.endsWith(".md")) &&
          removedPath.startsWith(pagesDir)
        ) {
          console.log(`[pages] Removed ${path.basename(removedPath)}`);
          await processAllPages(pagesDir, outputDir);
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

  const pages: PageMeta[] = [];

  for (const file of pageFiles) {
    const filePath = path.join(pagesDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const ext = path.extname(file);
    const id = path.basename(file, ext);

    const { frontmatter, markdown } = parseFrontmatter(content);

    pages.push({
      id,
      frontmatter,
      markdown,
    });
  }

  await generateManifest(pages, outputDir);
  console.log(`[pages] Done. Generated manifest with ${pages.length} pages`);
}

function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  markdown: string;
} {
  const frontmatter: Record<string, unknown> = {};
  let markdown = content;

  if (content.startsWith("---")) {
    const endIndex = content.indexOf("---", 3);
    if (endIndex !== -1) {
      const frontmatterStr = content.slice(3, endIndex).trim();
      markdown = content.slice(endIndex + 3).trim();

      // Parse YAML-like frontmatter
      for (const line of frontmatterStr.split("\n")) {
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;

        const key = line.slice(0, colonIndex).trim();
        let value: unknown = line.slice(colonIndex + 1).trim();

        // Remove quotes
        if (typeof value === "string") {
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          // Try to parse as number or boolean
          if (value === "true") value = true;
          else if (value === "false") value = false;
          else if (!isNaN(Number(value)) && value !== "") value = Number(value);
        }

        frontmatter[key] = value;
      }
    }
  }

  return { frontmatter, markdown };
}

async function generateManifest(
  pages: PageMeta[],
  outputDir: string
): Promise<void> {
  // Convert markdown to Plate JSON at build time
  const pagesWithValue = await Promise.all(
    pages.map(async (p) => {
      const value = await markdownToPlateValue(p.markdown);
      return { ...p, value };
    })
  );

  // Generate the manifest that exports page data and routes
  const manifest = `// Auto-generated pages manifest - DO NOT EDIT
import { route } from "rwsdk/router";
import { PageContent } from "./PageContent";

${pagesWithValue
  .map(
    (p) => `const ${sanitizeId(p.id)}Frontmatter = ${JSON.stringify(p.frontmatter)};
const ${sanitizeId(p.id)}Value = ${JSON.stringify(p.value)};`
  )
  .join("\n\n")}

// Page components that render Plate value via PlateStatic
${pagesWithValue
  .map(
    (p) => `function ${sanitizeId(p.id)}Page() {
  return <PageContent value={${sanitizeId(p.id)}Value} frontmatter={${sanitizeId(p.id)}Frontmatter} />;
}`
  )
  .join("\n\n")}

// Page metadata for lookups
export const pages = {
${pagesWithValue.map((p) => `  "${p.id}": { frontmatter: ${sanitizeId(p.id)}Frontmatter },`).join("\n")}
} as const;

export type PageId = keyof typeof pages;

// Routes for rwsdk render()
export const pageRoutes = [
${pagesWithValue.map((p) => `  route("/pages/${p.id}", ${sanitizeId(p.id)}Page),`).join("\n")}
] as const;
`;

  fs.writeFileSync(path.join(outputDir, "index.tsx"), manifest);

  // Generate PageContent component that renders pre-converted Plate value
  const pageContentComponent = `// Auto-generated - DO NOT EDIT
import { createSlateEditor } from "platejs";
import { PlateStatic } from "platejs/static";

interface PageContentProps {
  value: any[];
  frontmatter: Record<string, unknown>;
}

export function PageContent({ value, frontmatter }: PageContentProps) {
  const title = (frontmatter.title as string) || "Untitled";

  // Create a minimal static editor for rendering
  const editor = createSlateEditor({
    value,
  });

  return (
    <article className="prose prose-slate max-w-none">
      <h1>{title}</h1>
      <PlateStatic editor={editor} />
    </article>
  );
}
`;

  fs.writeFileSync(path.join(outputDir, "PageContent.tsx"), pageContentComponent);
}

/**
 * Convert markdown to Plate JSON value at build time
 * Uses the same code path as the editor
 */
async function markdownToPlateValue(markdown: string): Promise<unknown[]> {
  const { createSlateEditor } = await import("platejs");
  const { MarkdownPlugin } = await import("@platejs/markdown");
  const { BaseBasicMarksPlugin, BaseBasicBlocksPlugin } = await import("@platejs/basic-nodes");
  const remarkGfm = (await import("remark-gfm")).default;

  try {
    // Create a minimal headless editor with markdown support
    const editor = createSlateEditor({
      plugins: [
        BaseBasicBlocksPlugin,
        BaseBasicMarksPlugin,
        MarkdownPlugin.configure({
          options: {
            remarkPlugins: [remarkGfm],
          },
        }),
      ],
    });

    // Use the same API as the editor
    const value = editor.api.markdown.deserialize(markdown);
    return value;
  } catch (err) {
    console.error("[pages] Failed to convert markdown:", err);
    // Return a simple paragraph with the raw text
    return [{ type: "p", children: [{ text: markdown }] }];
  }
}

function sanitizeId(id: string): string {
  // Convert kebab-case to camelCase and ensure valid JS identifier
  return id
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/^(\d)/, "_$1");
}
