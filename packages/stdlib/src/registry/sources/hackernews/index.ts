/**
 * Hacker News Source
 *
 * Syncs top stories from Hacker News API.
 * No secrets required - uses the public API.
 */

import { defineSource } from "@hands/stdlib/sources"

// Story type from HN API
interface HNStory {
  id: number
  title: string
  url?: string
  score: number
  by: string
  time: number
  descendants?: number
  type: string
}

export default defineSource(
  {
    name: "hackernews",
    title: "Hacker News",
    description: "Sync top stories from Hacker News",
    schedule: "0 */6 * * *", // Every 6 hours (for orchestrator reference)
    secrets: [] as const, // No secrets needed
  },
  async (ctx) => {
    const HN_API = "https://hacker-news.firebaseio.com/v0"

    ctx.log("Fetching top stories...")

    // Get top story IDs
    const topStoriesRes = await fetch(`${HN_API}/topstories.json`)
    const topStoryIds = (await topStoriesRes.json()) as number[]

    // Limit to top 100
    const storyIds = topStoryIds.slice(0, 100)
    ctx.log(`Found ${storyIds.length} stories`)

    // Ensure table exists
    await ctx.db.sql`
      CREATE TABLE IF NOT EXISTS hackernews_stories (
        id BIGINT PRIMARY KEY,
        title TEXT,
        url TEXT,
        score INTEGER,
        author TEXT,
        created_at TIMESTAMP,
        comments INTEGER,
        synced_at TIMESTAMP DEFAULT NOW()
      )
    `

    // Fetch stories in batches of 10
    const batchSize = 10
    let totalSynced = 0

    for (let i = 0; i < storyIds.length; i += batchSize) {
      const batch = storyIds.slice(i, i + batchSize)

      for (const id of batch) {
        try {
          const res = await fetch(`${HN_API}/item/${id}.json`)
          const story = (await res.json()) as HNStory

          if (story && story.type === "story") {
            const createdAt = new Date(story.time * 1000).toISOString()
            const url = story.url || null
            const comments = story.descendants || 0

            await ctx.db.sql`
              INSERT INTO hackernews_stories (id, title, url, score, author, created_at, comments, synced_at)
              VALUES (${story.id}, ${story.title}, ${url}, ${story.score}, ${story.by}, ${createdAt}, ${comments}, NOW())
              ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                url = EXCLUDED.url,
                score = EXCLUDED.score,
                comments = EXCLUDED.comments,
                synced_at = NOW()
            `
            totalSynced++
          }
        } catch (err) {
          ctx.log(`Failed to fetch story ${id}:`, err)
        }
      }
    }

    ctx.log(`Sync complete: ${totalSynced} stories`)
    return { synced: totalSynced }
  }
)
