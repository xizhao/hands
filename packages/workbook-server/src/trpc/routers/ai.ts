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
});

export type AIRouter = typeof aiRouter;
