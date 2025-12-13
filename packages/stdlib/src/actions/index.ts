/**
 * Actions Module
 *
 * Provides the defineAction helper and all action-related types.
 */

export * from "./types.js";

import type { ActionDefinition } from "./types.js";

/**
 * Define an action (serverless compute function)
 *
 * @example
 * ```typescript
 * import { defineAction } from "@hands/stdlib";
 * import { z } from "zod";
 *
 * export default defineAction({
 *   name: "sync-hackernews",
 *   description: "Sync top stories from Hacker News",
 *   schedule: "0 * * * *", // Every hour
 *   triggers: ["manual", "webhook"],
 *   secrets: ["HN_API_KEY"],
 *   input: z.object({
 *     limit: z.number().min(1).max(500).default(100),
 *     type: z.enum(["top", "new", "best"]).default("top"),
 *   }),
 *   async run(input, ctx) {
 *     ctx.log.info("Starting sync", { limit: input.limit, type: input.type });
 *
 *     // Fetch data
 *     const response = await fetch(`https://hn.algolia.com/api/v1/search?tags=${input.type}`);
 *     const data = await response.json();
 *
 *     // Write to database
 *     const stories = data.hits.slice(0, input.limit).map(hit => ({
 *       id: hit.objectID,
 *       title: hit.title,
 *       url: hit.url,
 *       points: hit.points,
 *       created_at: new Date().toISOString(),
 *     }));
 *
 *     await ctx.sources.hn.stories.upsert(stories, ["id"]);
 *
 *     ctx.log.info("Sync complete", { count: stories.length });
 *     return { synced: stories.length, type: input.type };
 *   },
 * });
 * ```
 */
export function defineAction<TInput, TOutput>(
  config: ActionDefinition<TInput, TOutput>,
): ActionDefinition<TInput, TOutput> {
  return config;
}
