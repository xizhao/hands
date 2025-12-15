/**
 * Vite plugin for MDX support in pages
 *
 * Pre-compiles MDX files to TSX in .hands/pages/ so rwsdk can pick them up.
 * Generates a route manifest for the pages router.
 */

import { compile } from "@mdx-js/mdx";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import fs from "fs";
import path from "path";
import type { Plugin } from "vite";

interface MdxPluginOptions {
  workbookPath: string;
  componentsPath: string;
}

export function mdxPlugin(options: MdxPluginOptions): Plugin {
  const { workbookPath, componentsPath } = options;
  const pagesDir = path.join(workbookPath, "pages");
  const outputDir = path.join(workbookPath, ".hands/pages");

  return {
    name: "hands-mdx",
    enforce: "pre",

    async buildStart() {
      await compileAllMdx(pagesDir, outputDir, componentsPath);
    },

    configureServer(server) {
      // Watch for MDX file changes
      server.watcher.add(path.join(pagesDir, "**/*.mdx"));

      server.watcher.on("change", async (changedPath) => {
        if (changedPath.endsWith(".mdx") && changedPath.startsWith(pagesDir)) {
          console.log(`[mdx] Recompiling ${path.basename(changedPath)}...`);
          await compileMdxFile(changedPath, pagesDir, outputDir);
          await generateRouteManifest(pagesDir, outputDir, componentsPath);
        }
      });

      server.watcher.on("add", async (addedPath) => {
        if (addedPath.endsWith(".mdx") && addedPath.startsWith(pagesDir)) {
          console.log(`[mdx] Compiling new file ${path.basename(addedPath)}...`);
          await compileMdxFile(addedPath, pagesDir, outputDir);
          await generateRouteManifest(pagesDir, outputDir, componentsPath);
        }
      });

      server.watcher.on("unlink", async (removedPath) => {
        if (removedPath.endsWith(".mdx") && removedPath.startsWith(pagesDir)) {
          const pageId = path.basename(removedPath, ".mdx");
          const outputFile = path.join(outputDir, `${pageId}.tsx`);
          if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
            console.log(`[mdx] Removed ${pageId}.tsx`);
          }
          await generateRouteManifest(pagesDir, outputDir, componentsPath);
        }
      });
    },
  };
}

async function compileAllMdx(
  pagesDir: string,
  outputDir: string,
  componentsPath: string
): Promise<void> {
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  if (!fs.existsSync(pagesDir)) {
    console.log("[mdx] No pages directory found, skipping MDX compilation");
    await generateRouteManifest(pagesDir, outputDir);
    return;
  }

  const mdxFiles = fs
    .readdirSync(pagesDir)
    .filter((f) => f.endsWith(".mdx"));

  console.log(`[mdx] Compiling ${mdxFiles.length} MDX files...`);

  for (const file of mdxFiles) {
    const filePath = path.join(pagesDir, file);
    await compileMdxFile(filePath, pagesDir, outputDir);
  }

  await generateRouteManifest(pagesDir, outputDir, componentsPath);
  console.log(`[mdx] Done. Output: ${outputDir}`);
}

async function compileMdxFile(
  filePath: string,
  pagesDir: string,
  outputDir: string
): Promise<void> {
  const content = fs.readFileSync(filePath, "utf-8");
  const pageId = path.basename(filePath, ".mdx");
  const outputFile = path.join(outputDir, `${pageId}.tsx`);

  try {
    const compiled = await compile(content, {
      remarkPlugins: [
        remarkFrontmatter,
        [remarkMdxFrontmatter, { name: "frontmatter" }],
      ],
      jsxRuntime: "automatic",
      jsxImportSource: "react",
      outputFormat: "program",
      development: process.env.NODE_ENV !== "production",
    });

    // Output the compiled MDX as-is
    // The manifest will handle wrapping with components
    const tsxContent = `// Auto-generated from ${pageId}.mdx - DO NOT EDIT
${String(compiled)}
`;

    fs.writeFileSync(outputFile, tsxContent);
  } catch (err) {
    console.error(`[mdx] Failed to compile ${pageId}.mdx:`, err);
  }
}

async function generateRouteManifest(
  pagesDir: string,
  outputDir: string,
  componentsPath?: string
): Promise<void> {
  const tsxFiles = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir).filter((f) => f.endsWith(".tsx") && f !== "index.tsx")
    : [];

  const pages = tsxFiles.map((f) => path.basename(f, ".tsx"));

  const manifest = `// Auto-generated route manifest - DO NOT EDIT
import React from "react";
import { route } from "rwsdk/router";
${componentsPath ? `import { components } from "${componentsPath}";` : "const components = {};"}
${pages.map((p) => `import ${sanitizeId(p)}Content, { frontmatter as ${sanitizeId(p)}Frontmatter } from "./${p}.tsx";`).join("\n")}

// Wrap MDX content with components and frontmatter
${pages.map((p) => `function ${sanitizeId(p)}Page(props: any) {
  return React.createElement(${sanitizeId(p)}Content, { components, frontmatter: ${sanitizeId(p)}Frontmatter, ...props });
}`).join("\n\n")}

// Page metadata for lookups
export const pages = {
${pages.map((p) => `  "${p}": { component: ${sanitizeId(p)}Page, frontmatter: ${sanitizeId(p)}Frontmatter },`).join("\n")}
} as const;

export type PageId = keyof typeof pages;

// Routes for rwsdk render()
export const pageRoutes = [
${pages.map((p) => `  route("/pages/${p}", ${sanitizeId(p)}Page),`).join("\n")}
] as const;
`;

  fs.writeFileSync(path.join(outputDir, "index.tsx"), manifest);
}

function sanitizeId(id: string): string {
  // Convert kebab-case to camelCase and ensure valid JS identifier
  return id
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/^(\d)/, "_$1");
}
