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
      errors: z.array(z.string()).optional(), // Previous errors for retry context
    }))
    .mutation(async ({ input }) => {
      const { prompt, tables, errors } = input;

      console.log('[ai.generateMdx] Request received:', { prompt, tableCount: tables.length, errorCount: errors?.length ?? 0 });

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

      const systemPrompt = `You are an MDX generator for a data-driven document editor. Classify requests and output the appropriate MDX:

## 1. LiveValue - Simple data display (single query)
Use for: showing data, counts, lists, tables
- "count of users" → \`<LiveValue query="SELECT COUNT(*) FROM users" display="inline" />\`
- "list of products" → \`<LiveValue query="SELECT name FROM products" display="list" />\`
- "all orders" → \`<LiveValue query="SELECT * FROM orders LIMIT 20" display="table" />\`
- "feature count" → \`<LiveValue query="SELECT COUNT(*) FROM features" display="inline" />\`

## 2. LiveAction - Single database mutation with button
Use for: simple actions like increment, delete, toggle
- "increment counter" → \`<LiveAction sql="UPDATE counters SET value = value + 1 WHERE id = 1"><ActionButton>+1</ActionButton></LiveAction>\`
- "delete item" → \`<LiveAction sql="DELETE FROM items WHERE id = 1"><ActionButton variant="destructive">Delete</ActionButton></LiveAction>\`

## 3. Prompt - Delegate complex requests to background agent
Use when the proper response would be TOO COMPLEX to fit in ~300 tokens (forms, dashboards, charts, multi-component UI):
- "create a form for features" → \`<Prompt text="Create a form with fields for title, description, priority, status that inserts into features table" />\`
- "build a dashboard" → \`<Prompt text="Create a dashboard showing key metrics" />\`
- "add a chart" → \`<Prompt text="Create a chart visualization" />\`

## 4. Plain text - Literal text content
- "hello world" → \`hello world\`
- "note: remember to..." → \`note: remember to...\`

## Decision Logic
1. Can the full response fit in ~300 tokens? If NO → use Prompt to delegate
2. Is it a data query? → LiveValue
3. Is it a single mutation? → LiveAction
4. Otherwise → plain text

## Rules
- Output ONLY valid MDX, no markdown code fences
- Use tables/columns from schema for SQL
- If generating the full UI would exceed token budget, use Prompt instead`;

      // Include error context if this is a retry
      const errorContext = errors?.length
        ? `\n\n## Previous Errors (fix these issues)\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
        : '';

      const userPrompt = `## Schema
${schemaContext}

## Request
${prompt}${errorContext}

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

        const rawText = result.text || "";
        console.log('[ai.generateMdx] RAW response:', JSON.stringify(rawText));

        let mdx = rawText.trim();

        // Clean up any markdown code fences if present
        if (mdx.startsWith("```")) {
          mdx = mdx.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
          console.log('[ai.generateMdx] After fence cleanup:', JSON.stringify(mdx));
        }

        if (!mdx) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate MDX",
          });
        }

        console.log('[ai.generateMdx] Final MDX:', mdx);
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
