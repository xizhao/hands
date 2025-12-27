/**
 * Actions Module
 *
 * Handles action discovery, execution, and schema validation.
 */

// Routes (dev mode HTTP endpoints)
export { actionRoutes } from "./routes";

// Context builder (direct DB access for dev)
export { buildActionContext, createRunMeta } from "./context";

// Context builder (production CF Workflows)
export { buildWorkflowContext } from "./workflow-context";

// Schema utilities
export { validateSchema, assertSchemaValid } from "./schema";
export { generateCreateTable, generateCreateTables } from "./schema/ddl";
