/**
 * Parse wrangler.toml to extract configuration, routes, crons, and vars
 */

import { existsSync } from "fs";
import { join } from "path";
import { parse as parseToml } from "toml";
import type { WranglerConfig } from "../types";

interface WranglerToml {
  name?: string;
  vars?: Record<string, string>;
  triggers?: {
    crons?: string[];
  };
  [key: string]: unknown;
}

/**
 * Parse routes from source files by looking for Hono route definitions
 */
async function parseRoutesFromSource(workbookDir: string): Promise<{ method: string; path: string }[]> {
  const indexPath = join(workbookDir, "src/index.ts");
  const indexTsxPath = join(workbookDir, "src/index.tsx");

  const filePath = existsSync(indexTsxPath) ? indexTsxPath : indexPath;

  if (!existsSync(filePath)) {
    return [];
  }

  const content = await Bun.file(filePath).text();
  const routes: { method: string; path: string }[] = [];

  // Match patterns like: app.get("/path", ...) or app.post("/api/foo", ...)
  const routePattern = /app\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/gi;

  let match;
  while ((match = routePattern.exec(content)) !== null) {
    routes.push({
      method: match[1].toUpperCase(),
      path: match[2],
    });
  }

  return routes;
}

/**
 * Parse wrangler.toml and extract full configuration
 */
export async function parseWranglerConfig(workbookDir: string): Promise<WranglerConfig | null> {
  const wranglerPath = join(workbookDir, "wrangler.toml");

  if (!existsSync(wranglerPath)) {
    return null;
  }

  try {
    const content = await Bun.file(wranglerPath).text();
    const config = parseToml(content) as WranglerToml;

    // Parse routes from source code
    const routes = await parseRoutesFromSource(workbookDir);

    // Parse crons from triggers section
    const crons = (config.triggers?.crons ?? []).map((schedule) => ({
      schedule,
      handler: "scheduled", // Default handler name
    }));

    return {
      name: config.name ?? "unnamed",
      routes,
      crons,
      vars: config.vars ?? {},
    };
  } catch (error) {
    console.error("Failed to parse wrangler.toml:", error);
    return null;
  }
}

