/**
 * Live Query Module
 *
 * Reactive SQL queries using TanStack DB with SSE-based sync.
 * Provides useLiveQuery hook for real-time data binding in the editor.
 */

export { createSqlCollection, type SqlCollection } from "./collection";
export type { LiveQueryConfig } from "./provider";
export { LiveQueryProvider, useLiveQueryContext } from "./provider";
export { type LiveQueryResult, type UseLiveQueryOptions, useLiveQuery } from "./use-live-query";
