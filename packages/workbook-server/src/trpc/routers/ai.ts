/**
 * AI tRPC Router
 *
 * Provides typed AI endpoints for copilot completions.
 *
 * Autocomplete routing:
 * 1. generateMdx (fast) - simple completions or returns <Prompt reasoning="low|mid|high">
 * 2. generateMdxBlock (medium) - full MDX docs, charts, forms, higher token budget
 * 3. Agent (heavy) - reasoning="high" only for iteration/analysis tasks
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { initTRPC, TRPCError } from "@trpc/server";
import { generateObject, generateText, type LanguageModel } from "ai";

// OpenRouter model mappings
const MODELS = {
  fast: "google/gemini-2.5-flash-lite", // Quick MDX generation
  vision: "google/gemini-2.5-flash", // Vision/screenshot analysis
} as const;

// Create OpenRouter provider
function getOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "OPENROUTER_API_KEY not set",
    });
  }
  return createOpenRouter({ apiKey });
}

// Helper to get model
function getModel(modelId: string): LanguageModel {
  const openrouter = getOpenRouter();
  return openrouter(modelId) as LanguageModel;
}

import { STDLIB_DOCS, STDLIB_QUICK_REF } from "@hands/core/docs";
import { type ValidationContext, validateMdxContent } from "@hands/core/validation";
import { z } from "zod";

// Schema is passed from client (from manifest/useRuntimeState)
const tableSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
});

export type AIContext = {}; // No server-side deps needed

const t = initTRPC.context<AIContext>().create();

export const aiRouter = t.router({
  /**
   * Generate MDX partial with LiveValue/LiveAction elements
   * Returns either:
   * - MDX with LiveValue/LiveAction for simple requests
   * - <Prompt text="..."> for complex requests needing a background agent
   */
  generateMdx: t.procedure
    .input(
      z.object({
        prompt: z.string().min(1),
        tables: z.array(tableSchema),
        errors: z.array(z.string()).optional(), // Previous errors for retry context
        previousGenerations: z.array(z.string()).optional(), // Previous failed outputs
        // Page context (like copilot)
        prefix: z.string().optional(), // Markdown content before cursor
        suffix: z.string().optional(), // Markdown content after cursor
        title: z.string().optional(), // Page title from frontmatter
        description: z.string().optional(), // Page description from frontmatter
      }),
    )
    .mutation(async ({ input }) => {
      const { prompt, tables, errors, previousGenerations, prefix, suffix, title, description } =
        input;

      console.log("[ai.generateMdx] Request received:", {
        prompt,
        tableCount: tables.length,
        errorCount: errors?.length ?? 0,
        previousGenCount: previousGenerations?.length ?? 0,
        hasContext: !!(prefix || suffix),
      });

      const schemaContext =
        tables.length > 0
          ? tables.map((t) => `${t.name}(${t.columns.join(", ")})`).join("\n")
          : "(No tables available)";

      const systemPrompt = `You are an MDX generator. Use ONLY components from the stdlib below - do not invent new ones. For plain text, write directly without wrapper components.
${STDLIB_QUICK_REF}
## Generate Directly - Single Component Examples

### Data Display
- "count of users" → \`<LiveValue query="SELECT COUNT(*) FROM users" display="inline" />\`
- "list of products" → \`<LiveValue query="SELECT name FROM products" display="list" />\`
- "users table" → \`<LiveValue query="SELECT * FROM users" display="table" />\`

### Charts (use LiveValue wrapper for SQL data)
- "bar chart of sales" → \`<LiveValue query="SELECT month, revenue FROM sales"><BarChart xKey="month" yKey="revenue" /></LiveValue>\`
- "line chart of signups" → \`<LiveValue query="SELECT date, count FROM signups"><LineChart xKey="date" yKey="count" /></LiveValue>\`
- "pie chart of categories" → \`<LiveValue query="SELECT category, amount FROM expenses"><PieChart nameKey="category" valueKey="amount" /></LiveValue>\`

### Metrics & Status
- "total revenue metric" → \`<LiveValue query="SELECT SUM(amount) as total FROM orders"><Metric label="Revenue" value={{total}} prefix="$" /></LiveValue>\`
- "active badge" → \`<Badge variant="success">Active</Badge>\`
- "warning alert" → \`<Alert variant="warning">Check your settings</Alert>\`
- "75% progress" → \`<Progress value={75} showValue />\`

### Actions
- "delete button" → \`<LiveAction sql="DELETE FROM items WHERE id = 1"><Button variant="destructive">Delete</Button></LiveAction>\`
- "increment counter" → \`<LiveAction sql="UPDATE counters SET value = value + 1 WHERE id = 1"><Button>+1</Button></LiveAction>\`

## Route to Block Builder - <Prompt reasoning="low|mid">
Only for MULTIPLE elements together:
- "a form to add users" → \`<Prompt reasoning="low" text="a form to add users" />\`
- "dashboard with 3 metrics" → \`<Prompt reasoning="low" text="dashboard with 3 metrics" />\`
- "complex multi-section layout" → \`<Prompt reasoning="mid" text="complex multi-section layout" />\`

## Route to Agent - <Prompt reasoning="high">
Only for multi-file or multi-iteration tasks:
- "analyze my data and create a report" → \`<Prompt reasoning="high" text="..." />\`
- "build a full app with multiple pages" → \`<Prompt reasoning="high" text="..." />\`

## Rules
- Output ONLY valid MDX, no markdown code fences
- Generate single components DIRECTLY - do not route unless multiple elements needed
- Wrap charts in LiveValue to provide SQL data
- Use tables/columns from schema for SQL`;

      // Include retry context (previous failed attempts and their errors)
      let retryContext = "";
      if (previousGenerations?.length && errors?.length) {
        retryContext = "\n\n## Previous Attempts (DO NOT repeat these - they failed)\n";
        for (let i = 0; i < previousGenerations.length; i++) {
          retryContext += `\nAttempt ${i + 1}:\n\`\`\`\n${previousGenerations[i]}\n\`\`\`\nError: ${errors[i] || "Unknown error"}\n`;
        }
        retryContext += "\nGenerate DIFFERENT, valid MDX that avoids these issues.";
      } else if (errors?.length) {
        retryContext = `\n\n## Previous Errors (fix these issues)\n${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;
      }

      // Build page context section
      const pageContext =
        title || description
          ? `## Page Context\n${title ? `Title: ${title}\n` : ""}${description ? `Description: ${description}\n` : ""}`
          : "";

      // Build document context (prefix/suffix around cursor)
      const documentContext =
        prefix || suffix
          ? `## Document Context\n<prefix>\n${prefix?.slice(-1500) || "(start of document)"}\n</prefix>\n[CURSOR - INSERT HERE]\n<suffix>\n${suffix?.slice(0, 500) || "(end of document)"}\n</suffix>`
          : "";

      const userPrompt = `## Schema
${schemaContext}
${pageContext}${documentContext}
## Request
${prompt}${retryContext}

## MDX Output`;

      try {
        const result = await generateText({
          model: getModel(MODELS.fast),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 300,
          temperature: 0.1,
          abortSignal: AbortSignal.timeout(10000),
        });

        const rawText = result.text || "";
        console.log("[ai.generateMdx] RAW response:", JSON.stringify(rawText));

        let mdx = rawText.trim();

        // Clean up any markdown code fences if present
        if (mdx.startsWith("```")) {
          mdx = mdx.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
          console.log("[ai.generateMdx] After fence cleanup:", JSON.stringify(mdx));
        }

        if (!mdx) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate MDX",
          });
        }

        // Validate the generated MDX
        const validationCtx: ValidationContext = {
          pageRefs: [],
          schema: tables.map((t) => ({ name: t.name, columns: t.columns })),
        };
        const validationErrors = validateMdxContent(mdx, validationCtx);
        const errorMsgs = validationErrors
          .filter((e) => e.severity === "error")
          .map((e) => `${e.component}: ${e.message}`);

        console.log("[ai.generateMdx] Final MDX:", mdx);
        console.log("[ai.generateMdx] Validation errors:", errorMsgs);

        // Return MDX with any validation errors (caller can retry)
        return {
          mdx,
          errors: errorMsgs.length > 0 ? errorMsgs : undefined,
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "AI generation failed",
        });
      }
    }),

  /**
   * Generate MDX block with full component documentation
   * Called when generateMdx returns <Prompt reasoning="low|mid">
   *
   * - reasoning="low": No thinking, just docs + higher token budget
   * - reasoning="mid": Enable thinking for more complex generation
   */
  generateMdxBlock: t.procedure
    .input(
      z.object({
        prompt: z.string().min(1),
        tables: z.array(tableSchema),
        reasoning: z.enum(["low", "mid"]).default("low"),
        // Page context
        prefix: z.string().optional(),
        suffix: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { prompt, tables, reasoning, prefix, suffix, title, description } = input;

      console.log("[ai.generateMdxBlock] Request:", {
        prompt,
        tableCount: tables.length,
        reasoning,
      });

      const schemaContext =
        tables.length > 0
          ? tables.map((t) => `${t.name}(${t.columns.join(", ")})`).join("\n")
          : "(No tables available)";

      const systemPrompt = `You are an MDX generator. Use ONLY components from the reference below - do not invent new ones. For plain text, write directly without wrapper components.

## Database Schema
${schemaContext}

## Component Reference
${STDLIB_DOCS}

## Rules
- Output ONLY valid MDX, no code fences
- Use ONLY components from the reference above
- Form controls (Button, Input, Select, Checkbox, Textarea) must be inside LiveAction
- Use tables/columns from schema for SQL`;

      // Build page context
      const pageContext =
        title || description
          ? `\n## Page Context\nTitle: ${title || "(untitled)"}\n${description ? `Description: ${description}` : ""}`
          : "";

      const documentContext =
        prefix || suffix
          ? `\n## Document Context\n<prefix>\n${prefix?.slice(-1500) || "(start)"}\n</prefix>\n[INSERT HERE]\n<suffix>\n${suffix?.slice(0, 500) || "(end)"}\n</suffix>`
          : "";

      const userPrompt = `${pageContext}${documentContext}

## Request
${prompt}

## MDX Output`;

      try {
        const result = await generateText({
          model: getModel(MODELS.fast),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 2000,
          temperature: reasoning === "mid" ? 0.3 : 0.1,
          abortSignal: AbortSignal.timeout(30000), // Longer timeout for block generation
        });

        const rawText = result.text || "";
        console.log("[ai.generateMdxBlock] RAW response:", JSON.stringify(rawText.slice(0, 500)));

        let mdx = rawText.trim();

        // Clean up markdown code fences if present
        if (mdx.startsWith("```")) {
          mdx = mdx.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
        }

        if (!mdx) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate MDX block",
          });
        }

        // Validate the generated MDX
        const validationCtx: ValidationContext = {
          pageRefs: [],
          schema: tables.map((t) => ({ name: t.name, columns: t.columns })),
        };
        const validationErrors = validateMdxContent(mdx, validationCtx);
        const errorMsgs = validationErrors
          .filter((e) => e.severity === "error")
          .map((e) => `${e.component}: ${e.message}`);

        console.log(
          "[ai.generateMdxBlock] Final MDX:",
          mdx.slice(0, 200) + (mdx.length > 200 ? "..." : ""),
        );
        console.log("[ai.generateMdxBlock] Validation errors:", errorMsgs);

        // Return MDX with any validation errors (caller can retry)
        return {
          mdx,
          errors: errorMsgs.length > 0 ? errorMsgs : undefined,
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "AI generation failed",
        });
      }
    }),
  /**
   * Generate plain English hint for technical content (SQL, operations)
   * Uses content hashing for deduplication and caching
   */
  generateHint: t.procedure
    .input(
      z.object({
        content: z.string().min(1).max(2000),
        context: z
          .object({
            tables: z.array(z.string()).optional(),
            operation: z.string().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { content, context } = input;

      // Generate cache key from content hash
      const cacheKey = await hashContent(content);

      // Check cache first
      const cached = hintCache.get(cacheKey);
      if (cached) {
        return { hint: cached, cached: true };
      }

      if (!process.env.OPENROUTER_API_KEY) {
        // No API key - return raw content as fallback
        return { hint: content, cached: false };
      }

      const contextStr = context?.tables?.length
        ? `Tables involved: ${context.tables.join(", ")}. `
        : "";

      const systemPrompt = `Convert technical SQL/database operations into plain English summaries.
- Be concise (one sentence, max 15 words)
- Include table and column names when relevant
- Use action verbs (filters, joins, groups, inserts, updates, deletes)
- Don't start with "This"

Examples:
- "SELECT * FROM users WHERE status = 'active'" → "Gets all active users"
- "INSERT INTO orders (user_id, total)" → "Adds a new order with user and total"
- "UPDATE products SET price = price * 1.1" → "Increases all product prices by 10%"
- "SELECT COUNT(*) FROM orders GROUP BY customer_id" → "Counts orders per customer"`;

      try {
        const result = await generateText({
          model: getModel(MODELS.fast),
          system: systemPrompt,
          prompt: `${contextStr}${content}`,
          maxOutputTokens: 50,
          temperature: 0,
          abortSignal: AbortSignal.timeout(5000),
        });

        const hint = result.text?.trim() || content;

        // Cache the result
        hintCache.set(cacheKey, hint);

        return { hint, cached: false };
      } catch (err) {
        console.error("[ai.generateHint] Error:", err);
        // Return raw content on error
        return { hint: content, cached: false };
      }
    }),

  /**
   * Batch generate hints for multiple content strings
   * More efficient than multiple single calls
   */
  generateHintsBatch: t.procedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              content: z.string().min(1).max(2000),
              context: z
                .object({
                  tables: z.array(z.string()).optional(),
                  operation: z.string().optional(),
                })
                .optional(),
            }),
          )
          .max(20),
      }),
    )
    .mutation(async ({ input }) => {
      const { items } = input;

      // Compute hashes and check cache
      const results: Array<{ content: string; hint: string; cached: boolean }> = [];
      const uncachedItems: Array<{
        idx: number;
        content: string;
        context?: { tables?: string[]; operation?: string };
      }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const cacheKey = await hashContent(item.content);
        const cached = hintCache.get(cacheKey);

        if (cached) {
          results[i] = { content: item.content, hint: cached, cached: true };
        } else {
          uncachedItems.push({ idx: i, content: item.content, context: item.context });
        }
      }

      // If all cached, return early
      if (uncachedItems.length === 0) {
        return { hints: results };
      }

      if (!process.env.OPENROUTER_API_KEY) {
        // No API key - return raw content as fallback
        for (const item of uncachedItems) {
          results[item.idx] = { content: item.content, hint: item.content, cached: false };
        }
        return { hints: results };
      }

      // Build batch prompt
      const batchPrompt = uncachedItems.map((item, i) => `[${i + 1}] ${item.content}`).join("\n");

      const systemPrompt = `Convert each numbered SQL/database operation into a plain English summary.
- One sentence per item, max 15 words each
- Include table and column names when relevant
- Use action verbs (filters, joins, groups, inserts, updates, deletes)
- Format: [1] summary\\n[2] summary\\n...`;

      try {
        const result = await generateText({
          model: getModel(MODELS.fast),
          system: systemPrompt,
          prompt: batchPrompt,
          maxOutputTokens: 50 * uncachedItems.length,
          temperature: 0,
          abortSignal: AbortSignal.timeout(10000),
        });

        // Parse batch response
        const lines = (result.text || "").split("\n").filter((l) => l.trim());
        const hintMap = new Map<number, string>();

        for (const line of lines) {
          const match = line.match(/^\[(\d+)\]\s*(.+)$/);
          if (match) {
            hintMap.set(parseInt(match[1], 10), match[2].trim());
          }
        }

        // Fill in results and cache
        for (let i = 0; i < uncachedItems.length; i++) {
          const item = uncachedItems[i];
          const hint = hintMap.get(i + 1) || item.content;
          const cacheKey = await hashContent(item.content);

          hintCache.set(cacheKey, hint);
          results[item.idx] = { content: item.content, hint, cached: false };
        }

        return { hints: results };
      } catch (err) {
        console.error("[ai.generateHintsBatch] Error:", err);
        // Return raw content on error
        for (const item of uncachedItems) {
          results[item.idx] = { content: item.content, hint: item.content, cached: false };
        }
        return { hints: results };
      }
    }),
  /**
   * Analyze a screenshot and suggest actions
   * Uses Gemini 3 Flash for vision capabilities
   *
   * Returns structured action suggestions:
   * - get_data: When there's a visible data source (URL, API, spreadsheet, etc.)
   * - set_up_sync: When something could be synced periodically
   *
   * If nothing actionable, returns empty actions with a brief/playful comment.
   */
  analyzeScreenshot: t.procedure
    .input(
      z.object({
        imagePath: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { imagePath } = input;

      console.log("[ai.analyzeScreenshot] Analyzing:", imagePath);

      // Define schema for structured output
      const screenshotAnalysisSchema = z.object({
        response: z
          .string()
          .describe(
            "Respond in first person (use 'I can...' or 'I found...'). Describe the data opportunity briefly. Don't reference 'the image' or 'screenshot'. If nothing actionable, respond playfully. 1-2 sentences max.",
          ),
        suggestedActions: z
          .array(
            z.union([
              z.object({
                type: z.literal("get_data"),
                label: z.string().describe("2-4 word action trigger, e.g. 'Import S3 Data'"),
                prompt: z
                  .string()
                  .describe(
                    "Full prompt with all context needed to execute: data source details, credentials, URLs, table names, etc.",
                  ),
              }),
              z.object({
                type: z.literal("set_up_sync"),
                label: z.string().describe("2-4 word action trigger, e.g. 'Sync Daily Metrics'"),
                prompt: z
                  .string()
                  .describe(
                    "Full prompt with all context needed: what to sync, source details, frequency, any credentials or endpoints visible.",
                  ),
              }),
              z.object({
                type: z.literal("custom"),
                label: z.string().describe("2-4 word action trigger"),
                prompt: z
                  .string()
                  .describe("Full prompt with all context needed to execute the action."),
              }),
            ]),
          )
          .max(3)
          .describe("Data actions based on screenshot. Empty array if nothing actionable."),
      });

      try {
        // Read image file and convert to base64
        const fs = await import("node:fs/promises");
        const imageBuffer = await fs.readFile(imagePath);
        const base64Image = imageBuffer.toString("base64");
        const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

        const result = await generateObject({
          model: getModel(MODELS.vision),
          schema: screenshotAnalysisSchema,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  image: `data:${mimeType};base64,${base64Image}`,
                },
                {
                  type: "text",
                  text: `You're a data assistant. Respond in first person. If there's data that could be imported or synced (tables, APIs, credentials, dashboards, etc.), describe what you can do with it and suggest up to 3 actions. If nothing data-related, respond playfully. Never reference "the image/screenshot" directly.`,
                },
              ],
            },
          ],
          maxOutputTokens: 4000,
          temperature: 0.3,
          abortSignal: AbortSignal.timeout(20000),
        });

        console.log("[ai.analyzeScreenshot] Raw result:", JSON.stringify(result.object, null, 2));

        const response = {
          summary: result.object.response || "What would you like me to do with this?",
          actions: result.object.suggestedActions || [],
        };

        console.log("[ai.analyzeScreenshot] Returning:", JSON.stringify(response, null, 2));
        return response;
      } catch (err) {
        console.error("[ai.analyzeScreenshot] Error:", err);
        console.error(
          "[ai.analyzeScreenshot] Error details:",
          JSON.stringify(err, Object.getOwnPropertyNames(err), 2),
        );
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Screenshot analysis failed",
        });
      }
    }),
});

// ============================================================================
// Hint Cache (in-memory, content-addressed)
// ============================================================================

const hintCache = new Map<string, string>();

/**
 * Hash content for cache key
 */
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type AIRouter = typeof aiRouter;
