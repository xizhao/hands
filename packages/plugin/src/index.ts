import type { Plugin } from "@opencode-ai/plugin"
import { sqlTool } from "./tools/sql.js"

/**
 * Hands plugin for opencode
 *
 * Adds tools for building data apps with Cloudflare Workers:
 * - sql: Run SQL queries against embedded postgres
 */
export const handsPlugin: Plugin = async (input) => {
  const { directory } = input

  // Check if this is a hands project (has wrangler.toml)
  const wranglerPath = `${directory}/wrangler.toml`
  const isHandsProject = await Bun.file(wranglerPath).exists()

  if (!isHandsProject) {
    // Not a hands project, don't add tools
    return {}
  }

  return {
    tool: {
      hands_sql: sqlTool,
    },
  }
}

export default handsPlugin
