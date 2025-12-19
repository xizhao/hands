/**
 * AI tRPC Router
 *
 * Provides typed AI endpoints for text-to-sql and copilot completions.
 */

import { gateway } from "@ai-sdk/gateway";
import { initTRPC, TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { z } from "zod";

// Schema is passed from client (from manifest/useRuntimeState)
const tableSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
});

export interface AIContext {}  // No server-side deps needed

const t = initTRPC.context<AIContext>().create();

export const aiRouter = t.router({
  /**
   * Convert natural language to SQL query
   */
  textToSql: t.procedure
    .input(z.object({
      prompt: z.string().min(1),
      tables: z.array(tableSchema).min(1, "No tables in schema"),
    }))
    .mutation(async ({ input }) => {
      const { prompt, tables } = input;

      console.log('[ai.textToSql] Request received:', { prompt, tableCount: tables.length });

      const apiKey = process.env.HANDS_AI_API_KEY;
      if (!apiKey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "HANDS_AI_API_KEY not set",
        });
      }
      process.env.AI_GATEWAY_API_KEY = apiKey;

      // Build schema context from tables (columns are just names from manifest)
      const schemaContext = tables
        .map((t) => `${t.name}(${t.columns.join(", ")})`)
        .join("\n");

      const systemPrompt = `You are a SQL query generator. Given a natural language request and a database schema, output ONLY a valid SQL query.

## Rules
- Output ONLY the SQL query, nothing else.
- No markdown, no explanation, no backticks.
- Use only tables and columns from the provided schema.
- For counting, use COUNT(*).
- For single values, use appropriate aggregation (COUNT, SUM, AVG, MIN, MAX).
- Keep queries simple and efficient.`;

      const userPrompt = `## Schema
${schemaContext}

## Request
${prompt}

## SQL Query`;

      try {
        const result = await generateText({
          model: gateway("google/gemini-2.5-flash-lite"),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 200,
          temperature: 0,
          abortSignal: AbortSignal.timeout(10000),
        });

        let sql = result.text?.trim() || "";

        // Clean up any markdown if present
        if (sql.startsWith("```")) {
          sql = sql.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
        }

        if (!sql) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate SQL",
          });
        }

        console.log('[ai.textToSql] Generated SQL:', sql);
        return { sql };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "AI generation failed",
        });
      }
    }),

  /**
   * Generate MDX partial with LiveValue/LiveAction elements
   * Returns either:
   * - MDX with LiveValue/LiveAction for simple requests
   * - <Prompt text="..."> for complex requests needing a background agent
   */
  generateMdx: t.procedure
    .input(z.object({
      prompt: z.string().min(1),
      tables: z.array(tableSchema),
    }))
    .mutation(async ({ input }) => {
      const { prompt, tables } = input;

      console.log('[ai.generateMdx] Request received:', { prompt, tableCount: tables.length });

      const apiKey = process.env.HANDS_AI_API_KEY;
      if (!apiKey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "HANDS_AI_API_KEY not set",
        });
      }
      process.env.AI_GATEWAY_API_KEY = apiKey;

      const schemaContext = tables.length > 0
        ? tables.map((t) => `${t.name}(${t.columns.join(", ")})`).join("\n")
        : "(No tables available)";

      const systemPrompt = `You are an MDX generator for a data-driven document editor. Given a request and database schema, decide:

1. **Data display** → LiveValue with appropriate display mode
2. **Interactive action** → LiveAction with ActionButton
3. **Complex/multi-step** → \`<Prompt text="..." />\` to dispatch to background agent
4. **Non-data request** → Return the original prompt as plain text

## LiveValue Examples (data display)
- "count of users" → \`<LiveValue query="SELECT COUNT(*) FROM users" display="inline" />\`
- "list of products" → \`<LiveValue query="SELECT name FROM products" display="list" />\`
- "all orders" → \`<LiveValue query="SELECT * FROM orders LIMIT 20" display="table" />\`
- "current value" → \`<LiveValue query="SELECT value FROM counters WHERE id=1" display="inline" />\`

## LiveAction Examples (interactive buttons)
- "increment counter" → \`<LiveAction sql="UPDATE counters SET value = value + 1 WHERE id = 1"><ActionButton>+1</ActionButton></LiveAction>\`
- "delete item" → \`<LiveAction sql="DELETE FROM items WHERE id = 1"><ActionButton variant="destructive">Delete</ActionButton></LiveAction>\`
- "toggle status" → \`<LiveAction sql="UPDATE tasks SET done = NOT done WHERE id = 1"><ActionButton variant="outline">Toggle</ActionButton></LiveAction>\`

## Prompt Examples (complex - delegate to agent)
- "create a form for adding users" → \`<Prompt text="Create a form with fields for name, email, role that inserts into users table" />\`
- "build a dashboard" → \`<Prompt text="Create a dashboard showing key metrics from the database" />\`
- "add a chart" → \`<Prompt text="Create a chart visualization showing trends over time" />\`

## Plain Text (non-data requests)
If the request doesn't involve data queries or actions, return it as plain text:
- "hello world" → \`hello world\`
- "note to self" → \`note to self\`

## Rules
- Output ONLY valid MDX or plain text, no markdown code fences
- Use only tables/columns from the schema for SQL queries
- Simple data → LiveValue, Interactive → LiveAction, Complex → Prompt, Other → plain text
- ActionButton variants: default, outline, ghost, destructive
- Keep it concise (~300 chars max)`;

      const userPrompt = `## Schema
${schemaContext}

## Request
${prompt}

## MDX Output`;

      try {
        const result = await generateText({
          model: gateway("google/gemini-2.5-flash-lite"),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 300,
          temperature: 0.1,
          abortSignal: AbortSignal.timeout(10000),
        });

        let mdx = result.text?.trim() || "";

        // Clean up any markdown code fences if present
        if (mdx.startsWith("```")) {
          mdx = mdx.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
        }

        if (!mdx) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate MDX",
          });
        }

        console.log('[ai.generateMdx] Generated MDX:', mdx);
        return { mdx };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "AI generation failed",
        });
      }
    }),
});

export type AIRouter = typeof aiRouter;
