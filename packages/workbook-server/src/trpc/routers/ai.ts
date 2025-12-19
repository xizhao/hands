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

1. **Simple request** → Output MDX directly using LiveValue/LiveAction components
2. **Complex request** → Output \`<Prompt text="detailed task description" />\` to dispatch to a background agent

## Simple Request Examples (output MDX directly)
- "count of users" → \`<LiveValue query="SELECT COUNT(*) FROM users" display="inline" />\`
- "list of features" → \`<LiveValue query="SELECT name FROM features" display="list" />\`
- "table of orders" → \`<LiveValue query="SELECT * FROM orders LIMIT 20" display="table" />\`
- "increment counter" → \`<LiveAction sql="UPDATE counters SET value = value + 1"><ActionButton>+1</ActionButton></LiveAction>\`

## Complex Request Examples (output <Prompt>)
- "create a form for adding users" → \`<Prompt text="Create a form with fields for name, email, and role that inserts into the users table" />\`
- "build a dashboard" → \`<Prompt text="Create a dashboard with key metrics and charts" />\`
- "add a chart showing trends" → \`<Prompt text="Create a chart visualization showing data trends over time" />\`

## Components

### LiveValue - Display SQL query results
\`\`\`mdx
<LiveValue query="SELECT COUNT(*) FROM users" display="inline" />
<LiveValue query="SELECT name FROM users" display="list" />
<LiveValue query="SELECT * FROM users LIMIT 10" display="table" />
\`\`\`

### LiveAction - Interactive write operations
\`\`\`mdx
<LiveAction sql="UPDATE counters SET value = value + 1">
  <ActionButton>Increment</ActionButton>
</LiveAction>
\`\`\`

### Prompt - Delegate to background agent
\`\`\`mdx
<Prompt text="detailed description of what needs to be built" />
\`\`\`

## Rules
- Output ONLY valid MDX, no explanation or markdown code fences
- Use only tables/columns from the schema for SQL queries
- Simple data queries/displays → use LiveValue/LiveAction directly
- Complex UI (forms, charts, dashboards, multi-step) → use Prompt
- Keep it concise - you have ~300 chars max`;

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
