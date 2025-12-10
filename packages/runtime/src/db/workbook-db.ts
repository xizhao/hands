/**
 * Workbook database management
 *
 * Handles:
 * - Loading DB from workbook/db.tar.gz (git-tracked)
 * - Saving DB to workbook/db.tar.gz
 * - Auto-generating .hands/schema.ts (gitignored, derived)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { PGlite } from "@electric-sql/pglite"
import { generateSchema } from "./schema-gen.js"
import { createDbContext, type DbContext } from "./sql.js"

export interface WorkbookDb {
  db: PGlite
  ctx: DbContext
  save: () => Promise<void>
  regenerateSchema: () => Promise<void>
  close: () => Promise<void>
}

/**
 * Initialize workbook database
 *
 * - Loads from db.tar.gz at workbook root (git-tracked)
 * - Generates .hands/schema.ts (gitignored)
 */
export async function initWorkbookDb(workbookDir: string): Promise<WorkbookDb> {
  const dbBackupPath = join(workbookDir, "db.tar.gz")
  const handsDir = join(workbookDir, ".hands")
  const schemaPath = join(handsDir, "schema.ts")

  // Ensure .hands/ exists (gitignored)
  if (!existsSync(handsDir)) {
    mkdirSync(handsDir, { recursive: true })
  }

  // Load or create database
  let db: PGlite

  if (existsSync(dbBackupPath)) {
    console.log(`[db] Loading from ${dbBackupPath}`)
    const data = readFileSync(dbBackupPath)
    // Wrap Buffer in Blob for Bun compatibility (PGlite expects arrayBuffer() method)
    const blob = new Blob([data])
    db = new PGlite({
      loadDataDir: blob,
    })
  } else {
    console.log("[db] Creating fresh database")
    db = new PGlite()
  }

  await db.waitReady
  console.log("[db] Database ready")

  const ctx = createDbContext(db)

  // Generate schema (derived, gitignored)
  const schemaTs = await generateSchema(db)
  writeFileSync(schemaPath, schemaTs)
  console.log(`[db] Schema written to ${schemaPath}`)

  return {
    db,
    ctx,

    /**
     * Save database to workbook/db.tar.gz (git-tracked)
     */
    async save() {
      console.log("[db] Saving database...")
      const data = await db.dumpDataDir("gzip")

      // dumpDataDir returns File | Blob, need to convert to Buffer
      const buffer = Buffer.from(await data.arrayBuffer())
      writeFileSync(dbBackupPath, buffer)
      console.log(`[db] Saved to ${dbBackupPath}`)
    },

    /**
     * Regenerate schema.ts from current DB state
     */
    async regenerateSchema() {
      const schemaTs = await generateSchema(db)
      writeFileSync(schemaPath, schemaTs)
      console.log(`[db] Schema regenerated`)
    },

    /**
     * Close database connection
     */
    async close() {
      await db.close()
    },
  }
}
