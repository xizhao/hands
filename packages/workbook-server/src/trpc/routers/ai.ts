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

import { gateway } from "@ai-sdk/gateway";
import { initTRPC, TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { z } from "zod";
import { STDLIB_DOCS, STDLIB_QUICK_REF } from "@hands/core/docs";

// Schema is passed from client (from manifest/useRuntimeState)
const tableSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
});

export interface AIContext {}  // No server-side deps needed

const t = initTRPC.context<AIContext>().create();

export const aiRouter = t.router({
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
      previousGenerations: z.array(z.string()).optional(), // Previous failed outputs
      // Page context (like copilot)
      prefix: z.string().optional(), // Markdown content before cursor
      suffix: z.string().optional(), // Markdown content after cursor
      title: z.string().optional(),  // Page title from frontmatter
      description: z.string().optional(), // Page description from frontmatter
    }))
    .mutation(async ({ input }) => {
      const { prompt, tables, errors, previousGenerations, prefix, suffix, title, description } = input;

      console.log('[ai.generateMdx] Request received:', { prompt, tableCount: tables.length, errorCount: errors?.length ?? 0, previousGenCount: previousGenerations?.length ?? 0, hasContext: !!(prefix || suffix) });

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

      const systemPrompt = `You are an MDX generator for a data-driven document editor. Generate single stdlib components directly. Only route to other generators for multi-element layouts.
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
- "delete button" → \`<LiveAction sql="DELETE FROM items WHERE id = 1"><ActionButton variant="destructive">Delete</ActionButton></LiveAction>\`
- "increment counter" → \`<LiveAction sql="UPDATE counters SET value = value + 1 WHERE id = 1"><ActionButton>+1</ActionButton></LiveAction>\`

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
      let retryContext = '';
      if (previousGenerations?.length && errors?.length) {
        retryContext = '\n\n## Previous Attempts (DO NOT repeat these - they failed)\n';
        for (let i = 0; i < previousGenerations.length; i++) {
          retryContext += `\nAttempt ${i + 1}:\n\`\`\`\n${previousGenerations[i]}\n\`\`\`\nError: ${errors[i] || 'Unknown error'}\n`;
        }
        retryContext += '\nGenerate DIFFERENT, valid MDX that avoids these issues.';
      } else if (errors?.length) {
        retryContext = `\n\n## Previous Errors (fix these issues)\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
      }

      // Build page context section
      const pageContext = (title || description)
        ? `## Page Context\n${title ? `Title: ${title}\n` : ''}${description ? `Description: ${description}\n` : ''}`
        : '';

      // Build document context (prefix/suffix around cursor)
      const documentContext = (prefix || suffix)
        ? `## Document Context\n<prefix>\n${prefix?.slice(-1500) || '(start of document)'}\n</prefix>\n[CURSOR - INSERT HERE]\n<suffix>\n${suffix?.slice(0, 500) || '(end of document)'}\n</suffix>`
        : '';

      const userPrompt = `## Schema
${schemaContext}
${pageContext}${documentContext}
## Request
${prompt}${retryContext}

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

  /**
   * Generate MDX block with full component documentation
   * Called when generateMdx returns <Prompt reasoning="low|mid">
   *
   * - reasoning="low": No thinking, just docs + higher token budget
   * - reasoning="mid": Enable thinking for more complex generation
   */
  generateMdxBlock: t.procedure
    .input(z.object({
      prompt: z.string().min(1),
      tables: z.array(tableSchema),
      reasoning: z.enum(["low", "mid"]).default("low"),
      // Page context
      prefix: z.string().optional(),
      suffix: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { prompt, tables, reasoning, prefix, suffix, title, description } = input;

      console.log('[ai.generateMdxBlock] Request:', { prompt, tableCount: tables.length, reasoning });

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

      const systemPrompt = `You are an MDX generator for a data-driven document editor. Generate complete, valid MDX using the available components.

## Available Database Schema
${schemaContext}

## MDX Component Reference
${STDLIB_DOCS}

## Rules
- Output ONLY valid MDX, no markdown code fences or explanations
- Use the exact component syntax from the reference
- For forms, wrap form controls inside LiveAction with {{fieldName}} bindings in SQL
- For data display, use LiveValue with appropriate display mode (inline, list, table)
- Use tables/columns from the schema for SQL queries
- ActionButton, ActionInput, ActionSelect, ActionCheckbox, ActionTextarea must be inside LiveAction`;

      // Build page context
      const pageContext = (title || description)
        ? `\n## Page Context\nTitle: ${title || "(untitled)"}\n${description ? `Description: ${description}` : ''}`
        : '';

      const documentContext = (prefix || suffix)
        ? `\n## Document Context\n<prefix>\n${prefix?.slice(-1500) || '(start)'}\n</prefix>\n[INSERT HERE]\n<suffix>\n${suffix?.slice(0, 500) || '(end)'}\n</suffix>`
        : '';

      const userPrompt = `${pageContext}${documentContext}

## Request
${prompt}

## MDX Output`;

      try {
        const result = await generateText({
          model: gateway("google/gemini-2.5-flash-lite"),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 2000,
          temperature: reasoning === "mid" ? 0.3 : 0.1,
          // Enable thinking for "mid" reasoning
          providerOptions: reasoning === "mid" ? {
            google: { thinkingConfig: { thinkingBudget: 1024 } },
          } : undefined,
          abortSignal: AbortSignal.timeout(30000), // Longer timeout for block generation
        });

        const rawText = result.text || "";
        console.log('[ai.generateMdxBlock] RAW response:', JSON.stringify(rawText.slice(0, 500)));

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

        console.log('[ai.generateMdxBlock] Final MDX:', mdx.slice(0, 200) + (mdx.length > 200 ? '...' : ''));
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
