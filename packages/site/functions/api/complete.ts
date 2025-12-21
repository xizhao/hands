/**
 * AI Completion Edge Function
 *
 * Proxies MDX generation requests to Claude API.
 * Deployed as Cloudflare Worker or Vercel Edge Function.
 */

interface Env {
  ANTHROPIC_API_KEY: string;
}

interface GenerateMdxInput {
  prompt: string;
  tables?: Array<{ name: string; columns: string[] }>;
  errors?: string[];
  prefix?: string;
  suffix?: string;
  title?: string;
  description?: string;
  reasoning?: "low" | "mid" | "high";
}

interface GenerateMdxOutput {
  mdx: string;
}

export async function onRequest(
  context: EventContext<Env, string, unknown>
): Promise<Response> {
  // Handle CORS preflight
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (context.request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });
  }

  try {
    const input = (await context.request.json()) as GenerateMdxInput;

    const systemPrompt = buildSystemPrompt(input);
    const userPrompt = buildUserPrompt(input);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Anthropic API error:", error);
      return new Response(`AI API error: ${error}`, { status: 500 });
    }

    const data = await response.json();
    const content = data.content?.[0];

    if (content?.type !== "text") {
      return new Response("Unexpected response format", { status: 500 });
    }

    const result: GenerateMdxOutput = {
      mdx: content.text,
    };

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(`Internal error: ${error}`, { status: 500 });
  }
}

function buildSystemPrompt(input: GenerateMdxInput): string {
  let prompt = `You are an AI assistant that generates MDX content for a live data document editor.

The editor supports these special components:

1. LiveValue - Displays live SQL query results
   <LiveValue query="SELECT ..." />
   <LiveValue query="SELECT ..." label="Label" />
   <LiveValue query="SELECT ...">
     <BarChart xKey="..." yKey="..." />
   </LiveValue>

2. Chart types (children of LiveValue):
   - <BarChart xKey="column" yKey="column" />
   - <PieChart valueKey="column" labelKey="column" />
   - <LineChart xKey="column" yKey="column" />
   - <DataTable columns={["col1", "col2"]} />

3. LiveAction - Interactive forms that execute SQL
   <LiveAction sql="UPDATE ... SET status = {{status}} WHERE id = 1">
     <ActionSelect name="status" options={["option1", "option2"]} />
     <ActionButton>Submit</ActionButton>
   </LiveAction>

Generate clean, valid MDX that uses these components appropriately.`;

  if (input.tables && input.tables.length > 0) {
    prompt += "\n\nAvailable database tables:\n";
    for (const table of input.tables) {
      prompt += `- ${table.name}: ${table.columns.join(", ")}\n`;
    }
  }

  return prompt;
}

function buildUserPrompt(input: GenerateMdxInput): string {
  let prompt = input.prompt;

  if (input.prefix) {
    prompt = `Context before cursor:\n${input.prefix}\n\n${prompt}`;
  }

  if (input.suffix) {
    prompt = `${prompt}\n\nContext after cursor:\n${input.suffix}`;
  }

  if (input.errors && input.errors.length > 0) {
    prompt += `\n\nPrevious errors to fix:\n${input.errors.join("\n")}`;
  }

  return prompt;
}

// Export for Vercel Edge Functions
export const config = {
  runtime: "edge",
};
