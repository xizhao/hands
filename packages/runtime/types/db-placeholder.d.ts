/**
 * Placeholder types for @hands/db/types
 * At runtime, Vite resolves this to the workbook's generated db.d.ts
 */

// Generic DB interface - actual tables are generated per-workbook
export interface DB {
  [table: string]: unknown;
}
