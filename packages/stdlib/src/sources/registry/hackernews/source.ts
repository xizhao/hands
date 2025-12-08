import { z } from "zod"
import { defineSource, type SourceContext } from "../../types.js"

/**
 * Hacker News Source
 *
 * Syncs stories from Hacker News using the official Firebase API.
 * No authentication required - great for testing.
 *
 * Streams:
 * - top: Top stories
 * - new: Newest stories
 * - best: Best stories
 * - ask: Ask HN posts
 * - show: Show HN posts
 * - jobs: Job postings
 */

const HN_API = "https://hacker-news.firebaseio.com/v0"

// No secrets required for HN
const secrets = z.object({})

// Story record schema
export interface HNStory {
  id: number
  type: "story" | "job" | "poll"
  by: string
  time: number
  title: string
  url?: string
  text?: string
  score: number
  descendants?: number
  synced_at: string
  stream: string
}

export const config = {
  name: "hackernews",
  title: "Hacker News",
  description: "Sync stories from Hacker News (top, new, best, ask, show, jobs)",
  schedule: "0 * * * *", // hourly
  secrets,
  streams: ["top", "new", "best", "ask", "show", "jobs"] as const,
  primaryKey: "id",
}

// Configurable options (user can modify after copying)
export const options = {
  /** Which streams to sync */
  streams: ["top", "new"] as (typeof config.streams)[number][],
  /** Max stories per stream per sync */
  limit: 100,
  /** Batch size for fetching story details */
  batchSize: 20,
}

async function getStoryIds(stream: string): Promise<number[]> {
  const endpoint = stream === "top" ? "topstories" :
                   stream === "new" ? "newstories" :
                   stream === "best" ? "beststories" :
                   stream === "ask" ? "askstories" :
                   stream === "show" ? "showstories" :
                   "jobstories"

  const res = await globalThis.fetch(`${HN_API}/${endpoint}.json`)
  if (!res.ok) throw new Error(`Failed to fetch ${stream}: ${res.status}`)
  return res.json()
}

async function getStory(id: number): Promise<HNStory | null> {
  const res = await globalThis.fetch(`${HN_API}/item/${id}.json`)
  if (!res.ok) return null
  const item = await res.json()
  if (!item || item.deleted || item.dead) return null

  return {
    id: item.id,
    type: item.type,
    by: item.by || "unknown",
    time: item.time,
    title: item.title || "",
    url: item.url,
    text: item.text,
    score: item.score || 0,
    descendants: item.descendants,
    synced_at: new Date().toISOString(),
    stream: "", // Set by caller
  }
}

async function getStoriesBatch(ids: number[]): Promise<HNStory[]> {
  const results = await Promise.allSettled(ids.map(getStory))
  return results
    .filter((r): r is PromiseFulfilledResult<HNStory | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((s): s is HNStory => s !== null)
}

async function* fetchData(ctx: SourceContext<typeof secrets>): AsyncGenerator<HNStory[]> {
  const syncedAt = new Date().toISOString()

  for (const stream of options.streams) {
    ctx.log(`[hackernews] Fetching ${stream} stories...`)

    try {
      const allIds = await getStoryIds(stream)
      const ids = allIds.slice(0, options.limit)

      ctx.log(`[hackernews] Found ${allIds.length} ${stream} stories, syncing ${ids.length}`)

      // Fetch in batches to avoid overwhelming the API
      for (let i = 0; i < ids.length; i += options.batchSize) {
        const batchIds = ids.slice(i, i + options.batchSize)
        const stories = await getStoriesBatch(batchIds)

        // Add stream and synced_at to each story
        const enriched = stories.map((s) => ({
          ...s,
          stream,
          synced_at: syncedAt,
        }))

        if (enriched.length > 0) {
          yield enriched
        }

        // Small delay between batches to be nice to the API
        if (i + options.batchSize < ids.length) {
          await new Promise((r) => setTimeout(r, 100))
        }
      }
    } catch (error) {
      ctx.log(`[hackernews] Error fetching ${stream}:`, error)
      // Continue with other streams
    }
  }

  ctx.log(`[hackernews] Sync complete`)
}

// Export the full source definition
export default defineSource(config, fetchData)

// Also export the handler directly for use in custom workers
export { fetchData as fetch }
