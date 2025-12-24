/**
 * Live Query Module
 *
 * Reactive SQL queries using TanStack DB with SSE-based sync.
 * Provides useLiveQuery hook for real-time data binding in the editor.
 */

export { useLiveQuery, type UseLiveQueryOptions, type LiveQueryResult } from "./use-live-query";
export { createSqlCollection, type SqlCollection } from "./collection";
export { LiveQueryProvider, useLiveQueryContext } from "./provider";
export type { LiveQueryConfig } from "./provider";
