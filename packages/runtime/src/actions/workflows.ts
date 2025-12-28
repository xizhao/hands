/**
 * Workflow Exports
 *
 * This module re-exports workflow bindings for the CF worker.
 *
 * Architecture:
 * - Dev mode: exports empty bindings from workflows-dev.ts
 * - Production: vite-plugin-workbook generates @hands/actions/workflows
 *   with real WorkflowEntrypoint classes, but this local module is used
 *   by the runtime package itself to avoid circular resolution.
 *
 * Why not use @hands/actions/workflows directly?
 * The CF worker's CustomModuleRunner doesn't use Vite's alias system.
 * It resolves modules from disk using Node-style resolution. By using
 * a local relative import, we ensure the module is always found.
 */

export * from "./workflows-dev";
