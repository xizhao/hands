/**
 * Vite plugin for dev-mode file API
 *
 * Provides REST endpoints for reading/writing workbook files:
 * - GET  /api/source/block/:id → read blocks/:id.tsx
 * - POST /api/source/block/:id → write blocks/:id.tsx
 * - GET  /api/source/page/:id  → read pages/:id.mdx
 * - POST /api/source/page/:id  → write pages/:id.mdx
 */

import fs from "node:fs";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";

interface DevApiOptions {
  workbookPath: string;
}

export function devApiPlugin(options: DevApiOptions): Plugin {
  const { workbookPath } = options;

  return {
    name: "hands-dev-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";

        // Only handle /api/source/* routes
        if (!url.startsWith("/api/source/")) {
          return next();
        }

        // Parse route: /api/source/:type/:id
        const match = url.match(/^\/api\/source\/(block|page)\/([^?]+)/);
        if (!match) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "Invalid source route" }));
          return;
        }

        const [, type, id] = match;
        const ext = type === "block" ? ".tsx" : ".mdx";
        const dir = type === "block" ? "blocks" : "pages";
        const filePath = path.join(workbookPath, dir, `${id}${ext}`);

        // Handle CORS preflight
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.statusCode = 204;
          res.end();
          return;
        }

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");

        try {
          if (req.method === "GET") {
            // Read source file
            if (!fs.existsSync(filePath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: `${type} "${id}" not found` }));
              return;
            }
            const source = fs.readFileSync(filePath, "utf-8");
            res.end(JSON.stringify({ id, type, source }));
          } else if (req.method === "POST") {
            // Write source file
            let body = "";
            for await (const chunk of req) {
              body += chunk;
            }
            const { source } = JSON.parse(body);
            if (typeof source !== "string") {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Missing source in body" }));
              return;
            }

            // Ensure directory exists
            const dirPath = path.dirname(filePath);
            if (!fs.existsSync(dirPath)) {
              fs.mkdirSync(dirPath, { recursive: true });
            }

            fs.writeFileSync(filePath, source, "utf-8");
            res.end(JSON.stringify({ id, type, success: true }));
          } else {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed" }));
          }
        } catch (err) {
          console.error("[dev-api] Error:", err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}
