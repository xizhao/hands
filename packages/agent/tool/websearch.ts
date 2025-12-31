import { tool } from "@opencode-ai/plugin";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Parse DuckDuckGo HTML search results
 * DuckDuckGo serves results in a specific HTML structure that we can parse
 */
function parseSearchResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo wraps results in elements with class "result__a" for links
  // and "result__snippet" for descriptions

  // Match result blocks - DuckDuckGo uses data-testid="result" or class="result"
  const resultPattern =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  const snippetPattern = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]+)/gi;

  // Simpler approach: look for the actual result structure
  // DuckDuckGo Lite (lite.duckduckgo.com) has a cleaner structure
  const linkMatches = [...html.matchAll(/<a[^>]*rel="nofollow"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi)];
  const snippetMatches = [...html.matchAll(/<td[^>]*class="result-snippet"[^>]*>([^<]+)/gi)];

  // Alternative: Match the standard DuckDuckGo result format
  const altPattern =
    /<a[^>]*class="[^"]*result__url[^"]*"[^>]*href="\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)[^"]*"[^>]*>/gi;
  const titlePattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([^<]+)<\/a>/gi;

  // Most reliable: extract from JSON data if present
  const jsonMatch = html.match(/DDG\.pageLayout\.load\('d',(\[.*?\])\)/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      for (const item of data) {
        if (item.u && item.t) {
          results.push({
            title: item.t,
            url: item.u,
            snippet: item.a || "",
          });
        }
      }
      return results;
    } catch {
      // Fall through to HTML parsing
    }
  }

  // Parse using regex patterns for standard HTML results
  // Look for result divs with links and snippets
  const blocks = html.split(/<div[^>]*class="[^"]*result[^"]*"[^>]*>/i).slice(1);

  for (const block of blocks) {
    // Extract URL - look for uddg parameter (DuckDuckGo's redirect)
    const urlMatch = block.match(/uddg=([^&"]+)/);
    const directUrlMatch = block.match(/href="(https?:\/\/[^"]+)"/);

    // Extract title
    const titleMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([^<]+)<\/a>/i);
    const altTitleMatch = block.match(/<h2[^>]*>([^<]+)<\/h2>/i);

    // Extract snippet
    const snippetMatch = block.match(
      /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]+)/i
    );
    const altSnippetMatch = block.match(
      /<span[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]+)/i
    );

    const url = urlMatch
      ? decodeURIComponent(urlMatch[1])
      : directUrlMatch
        ? directUrlMatch[1]
        : null;
    const title = titleMatch?.[1] || altTitleMatch?.[1];
    const snippet = snippetMatch?.[1] || altSnippetMatch?.[1] || "";

    if (url && title) {
      results.push({
        title: decodeHtmlEntities(title.trim()),
        url: url,
        snippet: decodeHtmlEntities(snippet.trim()),
      });
    }
  }

  return results;
}

/**
 * Decode HTML entities in text
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Perform a web search using DuckDuckGo
 */
async function search(query: string, maxResults = 10): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);

  // Use DuckDuckGo HTML search (no API key required)
  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const results = parseSearchResults(html);

  return results.slice(0, maxResults);
}

const websearch = tool({
  description: `Search the web using DuckDuckGo. Supports parallel batch queries.

Returns search results with titles, URLs, and snippets. No API key required.

**Single query:**
\`\`\`
websearch query="rust error handling"
\`\`\`

**Parallel batch queries (up to 10 at once):**
\`\`\`
websearch queries=["rust anyhow vs thiserror", "rust error handling best practices 2024", "rust ? operator tutorial"]
\`\`\`

Use batch queries for:
- Exploring a topic from multiple angles simultaneously
- Comparing different approaches or technologies
- Deep research with query variations
- Finding diverse sources quickly

Tips:
- Use specific search queries for better results
- Include relevant keywords (e.g., "rust async tutorial 2024")
- Use site: operator to search specific domains (e.g., "site:docs.rs tokio")
- For deep research, use 5-10 query variations in parallel`,

  args: {
    query: tool.schema.string().optional().describe("Single search query (use this OR queries, not both)"),
    queries: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Multiple search queries to run in parallel (max 10). Use for deep research with query variations."),
    max_results: tool.schema
      .number()
      .optional()
      .describe("Maximum results per query (default: 10 for single, 5 for batch)"),
  },

  async execute(args, _ctx) {
    const { query, queries, max_results } = args;

    // Validate input - need either query or queries
    if (!query && (!queries || queries.length === 0)) {
      return `Error: Provide either 'query' for a single search or 'queries' for parallel batch searches.

Examples:
  Single: websearch query="rust error handling"
  Batch:  websearch queries=["query1", "query2", "query3"]`;
    }

    // Single query mode
    if (query && !queries) {
      const maxResults = Math.min(max_results ?? 10, 30);

      try {
        const results = await search(query, maxResults);

        if (results.length === 0) {
          return `No results found for: "${query}"

Try:
- Using different keywords
- Being more specific
- Checking spelling`;
        }

        const formattedResults = results
          .map(
            (r, i) =>
              `${i + 1}. **${r.title}**
   ${r.url}
   ${r.snippet || "(no description)"}`
          )
          .join("\n\n");

        return `Found ${results.length} results for "${query}":\n\n${formattedResults}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Search failed: ${message}`;
      }
    }

    // Batch parallel query mode
    const queryList = queries!.slice(0, 10); // Max 10 parallel queries
    const maxResultsPerQuery = Math.min(max_results ?? 5, 15);

    // Execute all searches in parallel
    const searchPromises = queryList.map(async (q) => {
      try {
        const results = await search(q, maxResultsPerQuery);
        return { query: q, results, error: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { query: q, results: [] as SearchResult[], error: message };
      }
    });

    const allResults = await Promise.all(searchPromises);

    // Format batch results
    const sections = allResults.map(({ query: q, results, error }) => {
      if (error) {
        return `## "${q}"\n**Error:** ${error}`;
      }

      if (results.length === 0) {
        return `## "${q}"\nNo results found.`;
      }

      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. **${r.title}**
   ${r.url}
   ${r.snippet || "(no description)"}`
        )
        .join("\n\n");

      return `## "${q}"\nFound ${results.length} results:\n\n${formatted}`;
    });

    const totalResults = allResults.reduce((sum, r) => sum + r.results.length, 0);
    const successfulQueries = allResults.filter((r) => !r.error).length;

    return `# Parallel Search Results

**${successfulQueries}/${queryList.length} queries successful, ${totalResults} total results**

${sections.join("\n\n---\n\n")}`;
  },
});

export default websearch;
