/**
 * Core types for the Hands runtime
 */

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  code?: string;
  severity: "error" | "warning";
}

export interface BlockRefError {
  page: string;
  src: string;
  available: string[];
}
