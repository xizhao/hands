#!/usr/bin/env bun

/**
 * CLI for source management
 *
 * Usage:
 *   hands-sources add --name=<name> --from=<postgres://...> --tables=<t1,t2> [--where=<clause>]
 *   hands-sources add --name=<name> --local
 *   hands-sources list-remote --from=<postgres://...>
 *
 * Called by Tauri and can be used standalone.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createSource, listRemoteTables } from "./create.js";

interface ParsedArgs {
  command: string;
  name?: string;
  from?: string;
  tables?: string[];
  where?: string;
  description?: string;
  local?: boolean;
  workbookDir: string;
  json?: boolean;
}

function parseArgs(): ParsedArgs {
  const args: Record<string, string | boolean> = {};
  let command = "";

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      args[key.replace(/-/g, "_")] = value ?? true;
    } else if (!command) {
      command = arg;
    }
  }

  return {
    command,
    name: args.name as string | undefined,
    from: args.from as string | undefined,
    tables: args.tables ? (args.tables as string).split(",").map((t) => t.trim()) : undefined,
    where: args.where as string | undefined,
    description: args.description as string | undefined,
    local: args.local === true,
    workbookDir: (args.workbook_dir as string) || process.cwd(),
    json: args.json === true,
  };
}

function output(data: unknown, json: boolean) {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    if (obj.error) {
      console.error(`Error: ${obj.error}`);
    } else if (obj.success) {
      console.log("✓", obj.message || "Success");
      if (obj.tables && Array.isArray(obj.tables)) {
        for (const t of obj.tables) {
          console.log(`  - ${(t as { name: string }).name}`);
        }
      }
    }
  }
}

async function main() {
  const parsed = parseArgs();
  const { command, json } = parsed;

  // Resolve workbook directory
  const workbookDir = resolve(parsed.workbookDir);

  // Check workbook exists
  const pkgJsonPath = join(workbookDir, "package.json");
  if (!existsSync(pkgJsonPath) && command !== "help") {
    output({ success: false, error: `No package.json found in ${workbookDir}` }, json ?? false);
    process.exit(1);
  }

  switch (command) {
    case "add": {
      const { name, from, tables, where, description, local } = parsed;

      if (!name) {
        output({ success: false, error: "Missing --name" }, json ?? false);
        process.exit(1);
      }

      if (!from && !local) {
        output(
          { success: false, error: "Must specify either --from=<postgres://...> or --local" },
          json ?? false,
        );
        process.exit(1);
      }

      if (from && (!tables || tables.length === 0)) {
        output({ success: false, error: "Must specify --tables when using --from" }, json ?? false);
        process.exit(1);
      }

      // Initialize PGlite for the workbook
      const dbPath = join(workbookDir, ".hands", "db");
      const db = new PGlite(dbPath);

      try {
        const result = await createSource(workbookDir, db, {
          name,
          from,
          tables,
          where,
          description,
        });

        if (result.success) {
          output(
            {
              success: true,
              message: `Source '${name}' created at ${result.sourcePath}`,
              tables: result.tables,
            },
            json ?? false,
          );
        } else {
          output({ success: false, error: result.error }, json ?? false);
          process.exit(1);
        }
      } finally {
        await db.close();
      }
      break;
    }

    case "list-remote": {
      const { from } = parsed;

      if (!from) {
        output({ success: false, error: "Missing --from=<postgres://...>" }, json ?? false);
        process.exit(1);
      }

      const result = await listRemoteTables(from);

      if (result.success) {
        if (json) {
          output({ success: true, tables: result.tables }, true);
        } else {
          console.log("Tables in remote database:");
          for (const table of result.tables ?? []) {
            console.log(`  - ${table}`);
          }
        }
      } else {
        output({ success: false, error: result.error }, json ?? false);
        process.exit(1);
      }
      break;
    }
    default: {
      console.log(`
hands-sources - Source management CLI

Commands:
  add           Create a new source
  list-remote   List tables in a remote Postgres database

Usage:
  # Add source from remote Postgres with Electric-SQL sync
  hands-sources add --name=crm --from=postgres://user:pass@host/db --tables=users,orders

  # Add source with WHERE filter for shapes
  hands-sources add --name=crm --from=postgres://... --tables=orders --where="status = 'active'"

  # Add local-only source (no remote sync)
  hands-sources add --name=scratch --local

  # List tables in remote database
  hands-sources list-remote --from=postgres://user:pass@host/db

Options:
  --name=<name>           Source name (required for add)
  --from=<url>            Remote Postgres connection string
  --tables=<t1,t2,...>    Comma-separated table names
  --where=<clause>        WHERE clause for Electric-SQL shape filter
  --description=<text>    Source description
  --local                 Create local-only source (no remote)
  --workbook-dir=<path>   Workbook directory (default: current directory)
  --json                  Output as JSON
`);
      if (command !== "help") {
        process.exit(1);
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
