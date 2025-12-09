// Re-export all components
export * from "./components/ui";
export * from "./components/data";
export * from "./components/charts";
export * from "./components/static";

// Export utils
export { cn } from "./lib/utils";

// Export checks
export {
  checkTypescript,
  formatCode,
  checkFormat,
  findUnused,
} from "./checks/index.js";

// Export registry for programmatic access
export { default as registry } from "./registry.json";
