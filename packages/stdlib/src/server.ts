/**
 * Server entry point for @hands/stdlib
 *
 * Re-exports everything from registry. "use client" components work fine
 * in RSC - they serialize as client references that hydrate on the client.
 *
 * Import like: import { Button, BarChart } from "@hands/stdlib/server"
 */

// All components and registry utilities from single source of truth
export * from "./registry/index.js";

// Source utilities (v2 - table containers)
export { defineSourceV2 } from "./sources/types.js";
// Core types
export * from "./types/index.js";
