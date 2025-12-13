// v2 - Table Containers (Sources are now table containers with optional Electric-SQL subscriptions)

export {
  createMockContext,
  expectQuery,
  expectQueryCount,
  type MockDbContext,
  type MockSourceContext,
  type RecordedQuery,
} from "./testing.js";
export {
  type DiscoveredSource,
  type DiscoveredTable,
  defineSourceV2,
  type SourceDefinitionV2,
  type SourcePermissions,
  type SourceRole,
  type SubscriptionStatus,
  type TableColumn,
  type TableDefinition,
  type TableIndex,
  type TableSchema,
  type TableSubscription,
} from "./types.js";
