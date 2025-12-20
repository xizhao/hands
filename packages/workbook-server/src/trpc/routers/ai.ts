/**
 * AI tRPC Router
 *
 * Provides typed AI endpoints for text-to-sql and copilot completions.
 *
 * Autocomplete routing:
 * 1. generateMdx (fast) - simple completions or returns <Prompt reasoning="low|mid|high">
 * 2. generateMdxBlock (medium) - full MDX docs, higher token budget, optional thinking
 * 3. OpenHands agent (heavy) - delegated via client for reasoning="high"
 */

import { gateway } from "@ai-sdk/gateway";
import { initTRPC, TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { z } from "zod";

// MDX Component Documentation for Block Builder
// (Inlined to avoid circular dependency with @hands/agent)

const MDX_COMPONENT_DOCS = `
## LiveValue - Data Display

Display SQL query results with auto-selected or explicit display mode.

\`\`\`mdx
<!-- Auto-select based on data shape -->
<LiveValue query="SELECT COUNT(*) FROM users" />

<!-- Explicit display modes -->
<LiveValue query="SELECT COUNT(*) FROM orders" display="inline" />  <!-- single value in text -->
<LiveValue query="SELECT name FROM users" display="list" />          <!-- bullet list -->
<LiveValue query="SELECT * FROM orders" display="table" />           <!-- HTML table -->
\`\`\`

## LiveAction - Write Operations

Wraps interactive content that triggers SQL mutations.

\`\`\`mdx
<LiveAction sql="UPDATE counters SET value = value + 1 WHERE id = 1">
  <Button>+1</Button>
</LiveAction>

<!-- With form fields using {{fieldName}} bindings -->
<LiveAction sql="INSERT INTO users (name, email) VALUES ({{name}}, {{email}})">
  <Input name="name" placeholder="Name">Name</Input>
  <Input name="email" type="email" placeholder="Email">Email</Input>
  <Button>Submit</Button>
</LiveAction>
\`\`\`

## Form Controls (inside LiveAction)

Form controls register with parent LiveAction. Use {{fieldName}} in SQL for substitution.

### Input - Text input
\`\`\`mdx
<Input name="fieldName" type="text|email|number|password" placeholder="..." required>Label Text</Input>
\`\`\`

### Select - Dropdown
\`\`\`mdx
<Select name="fieldName" options={[{value: "a", label: "A"}, {value: "b", label: "B"}]} placeholder="Choose...">Label</Select>
\`\`\`

### Checkbox - Boolean toggle
\`\`\`mdx
<Checkbox name="fieldName" defaultChecked>Label text</Checkbox>
\`\`\`

### Textarea - Multi-line input
\`\`\`mdx
<Textarea name="fieldName" placeholder="..." rows={4}>Label</Textarea>
\`\`\`

### Button - Submit trigger
\`\`\`mdx
<Button variant="default|outline|ghost|destructive">Click me</Button>
\`\`\`

## Card - Layout Container

Cards group related content with visual styling.

\`\`\`mdx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Main content here...
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
\`\`\`

## Complete Form Example

\`\`\`mdx
<Card>
  <CardHeader>
    <CardTitle>Add Customer</CardTitle>
  </CardHeader>
  <CardContent>
    <LiveAction sql="INSERT INTO customers (name, email, tier) VALUES ({{name}}, {{email}}, {{tier}})">
      <Input name="name" placeholder="Full name" required>Name</Input>
      <Input name="email" type="email" placeholder="email@example.com">Email</Input>
      <Select name="tier" options={[{value: "free", label: "Free"}, {value: "pro", label: "Pro"}]} defaultValue="free">Tier</Select>
      <Button>Create</Button>
    </LiveAction>
  </CardContent>
</Card>
\`\`\`
`.trim();

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

      const systemPrompt = `You are an MDX router/generator for a data-driven document editor. Either generate simple MDX directly, or route to a more capable generator.

## 1. Simple - Generate directly (fits in ~300 tokens)

### LiveValue - Data display
- "count of users" → \`<LiveValue query="SELECT COUNT(*) FROM users" display="inline" />\`
- "list of products" → \`<LiveValue query="SELECT name FROM products" display="list" />\`
- "all orders" → \`<LiveValue query="SELECT * FROM orders LIMIT 20" display="table" />\`

### LiveAction - Single mutation
- "increment counter" → \`<LiveAction sql="UPDATE counters SET value = value + 1 WHERE id = 1"><Button>+1</Button></LiveAction>\`
- "delete item" → \`<LiveAction sql="DELETE FROM items WHERE id = 1"><Button variant="destructive">Delete</Button></LiveAction>\`

### Plain text
- "hello world" → \`hello world\`

## 2. Route to Block Builder - Use <Prompt reasoning="low|mid">

When the request needs MULTIPLE elements, forms, or ~300-2000 tokens of output:
- \`reasoning="low"\` - straightforward multi-element output (forms, cards, simple layouts)
- \`reasoning="mid"\` - needs some planning/thinking (complex forms, conditional logic)

Examples:
- "a form to add users" → \`<Prompt reasoning="low" text="Create a form with name, email fields that inserts into users table" />\`
- "a card showing user stats" → \`<Prompt reasoning="low" text="Create a Card with user count and recent signups" />\`
- "a form with validation for orders" → \`<Prompt reasoning="mid" text="Create an order form with customer selection, product list, quantity validation" />\`

## 3. Route to Agent - Use <Prompt reasoning="high">

When the request needs iteration, data fetching, complex reasoning, or would exceed 2000 tokens:
- "build a full dashboard" → \`<Prompt reasoning="high" text="Create a comprehensive dashboard with multiple charts and metrics" />\`
- "create a chart" → \`<Prompt reasoning="high" text="Create a chart visualization" />\` (charts need agent)

## Decision Flow
1. Single element, fits in ~300 tokens? → Generate directly
2. Multi-element, ~300-2000 tokens, straightforward? → \`<Prompt reasoning="low" text="..." />\`
3. Multi-element, needs planning? → \`<Prompt reasoning="mid" text="..." />\`
4. Complex, iterative, or charts? → \`<Prompt reasoning="high" text="..." />\`

## Rules
- Output ONLY valid MDX, no markdown code fences
- For Prompt, include a clear text description of what to build
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

      // Use comprehensive MDX component docs
      const componentDocs = MDX_COMPONENT_DOCS;

      const systemPrompt = `You are an MDX generator for a data-driven document editor. Generate complete, valid MDX using the available components.

## Available Database Schema
${schemaContext}

## MDX Component Reference
${componentDocs}

## Rules
- Output ONLY valid MDX, no markdown code fences or explanations
- Use the exact component syntax from the reference
- For forms, use Input/Select/Checkbox/Textarea inside LiveAction with {{fieldName}} bindings
- For data display, use LiveValue with appropriate display mode
- For layouts, use Card components to group related content
- Use tables/columns from the schema for SQL queries`;

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
