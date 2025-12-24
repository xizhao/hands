import type { Env } from "../../types";
import { getDb } from "../../lib/db";
import { usageDaily } from "../../schema/usage";
import { sql } from "drizzle-orm";
import type { AIGatewayLogEntry } from "./types";

interface AIGatewayLogsResponse {
  result: AIGatewayLogEntry[];
  success: boolean;
  errors?: Array<{ message: string }>;
}

// Cost per 1K tokens (in cents) by model
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-3-opus": { input: 1.5, output: 7.5 },
  "claude-3-sonnet": { input: 0.3, output: 1.5 },
  "claude-3-haiku": { input: 0.025, output: 0.125 },
  "claude-sonnet-4": { input: 0.3, output: 1.5 },
  "claude-opus-4": { input: 1.5, output: 7.5 },
  "gpt-4": { input: 3.0, output: 6.0 },
  "gpt-4-turbo": { input: 1.0, output: 3.0 },
  "gpt-3.5-turbo": { input: 0.05, output: 0.15 },
  default: { input: 0.1, output: 0.3 },
};

function estimateCost(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model ?? "default"] ?? MODEL_COSTS.default;
  const inputCost = (inputTokens / 1000) * costs.input;
  const outputCost = (outputTokens / 1000) * costs.output;
  return Math.round(inputCost + outputCost);
}

async function fetchAIGatewayLogs(
  env: Env,
  startTime: Date,
  endTime: Date
): Promise<AIGatewayLogEntry[]> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    console.warn("CF_ACCOUNT_ID or CF_API_TOKEN not configured, skipping usage aggregation");
    return [];
  }

  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai-gateway/gateways/${env.AI_GATEWAY_ID}/logs`
  );

  url.searchParams.set("start", startTime.toISOString());
  url.searchParams.set("end", endTime.toISOString());
  url.searchParams.set("per_page", "1000");

  const allLogs: AIGatewayLogEntry[] = [];
  let page = 1;

  while (true) {
    url.searchParams.set("page", String(page));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to fetch AI Gateway logs: ${error}`);
      break;
    }

    const data = (await response.json()) as AIGatewayLogsResponse;

    if (!data.success || !data.result) {
      console.error("AI Gateway API returned error:", data.errors);
      break;
    }

    allLogs.push(...data.result);

    if (data.result.length < 1000) break;

    page++;
    if (page > 1000) {
      console.warn("Reached page limit for AI Gateway logs");
      break;
    }
  }

  return allLogs;
}

interface AggregatedUsage {
  userId: string;
  date: string;
  tokensInput: number;
  tokensOutput: number;
  requests: number;
  costCents: number;
}

function aggregateLogs(logs: AIGatewayLogEntry[]): Map<string, AggregatedUsage> {
  const aggregates = new Map<string, AggregatedUsage>();

  for (const log of logs) {
    const userId = log.metadata?.userId;
    if (!userId) continue;

    const date = log.timestamp
      ? new Date(log.timestamp).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    const key = `${userId}:${date}`;
    const existing = aggregates.get(key);

    const inputTokens = log.request_tokens ?? 0;
    const outputTokens = log.response_tokens ?? 0;
    const cost = estimateCost(log.model, inputTokens, outputTokens);

    if (existing) {
      existing.tokensInput += inputTokens;
      existing.tokensOutput += outputTokens;
      existing.requests += 1;
      existing.costCents += cost;
    } else {
      aggregates.set(key, {
        userId,
        date,
        tokensInput: inputTokens,
        tokensOutput: outputTokens,
        requests: 1,
        costCents: cost,
      });
    }
  }

  return aggregates;
}

async function upsertUsageData(
  env: Env,
  aggregates: Map<string, AggregatedUsage>
): Promise<void> {
  const db = getDb(env.DB);

  for (const data of aggregates.values()) {
    await db
      .insert(usageDaily)
      .values({
        userId: data.userId,
        date: data.date,
        tokensInput: data.tokensInput,
        tokensOutput: data.tokensOutput,
        requests: data.requests,
        costCents: data.costCents,
      })
      .onConflictDoUpdate({
        target: [usageDaily.userId, usageDaily.date],
        set: {
          tokensInput: sql`${usageDaily.tokensInput} + ${data.tokensInput}`,
          tokensOutput: sql`${usageDaily.tokensOutput} + ${data.tokensOutput}`,
          requests: sql`${usageDaily.requests} + ${data.requests}`,
          costCents: sql`${usageDaily.costCents} + ${data.costCents}`,
        },
      });
  }
}

/**
 * Main aggregation function - called by scheduled trigger
 */
export async function aggregateUsage(env: Env): Promise<void> {
  console.log("Starting usage aggregation...");

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 70 * 60 * 1000); // 70 minutes ago

  try {
    const logs = await fetchAIGatewayLogs(env, startTime, endTime);
    console.log(`Fetched ${logs.length} logs from AI Gateway`);

    if (logs.length === 0) {
      console.log("No logs to process");
      return;
    }

    const aggregates = aggregateLogs(logs);
    console.log(`Aggregated into ${aggregates.size} user-date combinations`);

    await upsertUsageData(env, aggregates);
    console.log("Usage data upserted successfully");
  } catch (error) {
    console.error("Usage aggregation failed:", error);
    throw error;
  }
}
